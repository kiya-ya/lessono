#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Flask后端API"""
import os
import sys
import sqlite3
import json
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS

# 将crawler目录加入路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'crawler'))
from db import get_db

# UID查询模块（可选，内网环境才可用）
_uid_crawler_available = False
try:
    from uid_crawler import UIDCrawler, get_mock_uid_data, CAPTAIN_TYPES
    _uid_crawler_available = True
except Exception as e:
    print(f'[WARN] UID爬虫模块加载失败: {e}')
    from uid_crawler import get_mock_uid_data, CAPTAIN_TYPES

# 验证 Mock 数据是否包含 team_info
_test_mock = get_mock_uid_data('test', 'game')
print(f'[BOOT] Mock data keys: {list(_test_mock.keys())}')
print(f'[BOOT] Has team_info: {"team_info" in _test_mock}')

app = Flask(__name__)
CORS(app)

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(PROJECT_ROOT, 'data', 'stats.db')


def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d


def get_db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = dict_factory
    return conn


# ========== API路由 ==========

@app.route('/api/halls')
def api_halls():
    """返回所有大厅列表"""
    conn = get_db_conn()
    cursor = conn.execute('''
        SELECT DISTINCT hall_name FROM team_detail
        WHERE hall_name IS NOT NULL AND hall_name != ''
        ORDER BY hall_name
    ''')
    rows = cursor.fetchall()
    conn.close()
    return jsonify({'data': [r['hall_name'] for r in rows]})


@app.route('/api/kpi')
def api_kpi():
    """KPI概览数据（8项核心指标），支持按大厅和周过滤"""
    hall = request.args.get('hall', 'all')
    week = request.args.get('week', '')
    conn = get_db_conn()
    
    
    if week and '|' in week:
        ws, we = week.split('|')
        cursor = conn.execute("""
            SELECT week_label, week_start, week_end, new_team_count, active_team_count_end,
                   dissolved_count, active_dissolved_count, retention_rate, dissolution_rate,
                   total_reward, activity_index
            FROM weekly_report WHERE hall_name = 'all' AND week_start = ? AND week_end = ?
        """, (ws, we))
        this_row = cursor.fetchone()
        if not this_row:
            conn.close()
            return jsonify({'error': '该周暂无数据'}), 404
        cursor = conn.execute("""
            SELECT * FROM weekly_report WHERE hall_name = 'all' AND week_start < ?
            ORDER BY week_start DESC LIMIT 1
        """, (ws,))
        prev_row = cursor.fetchone()
        # 先不 close，还需要查询成就数据
        def calc_pct(curr, prev):
            if prev == 0: return 0
            return round((curr - prev) / prev * 100, 2)
        def getv(row, key, default=0):
            return row[key] if row else default
        
        # 从 stats_daily 聚合该周的成就数据
        cursor = conn.execute("""
            SELECT SUM(level_achievement_count) as lvl, SUM(revenue_achievement_count) as rev,
                   SUM(active_team_count) as active
            FROM stats_daily WHERE hall_name = '全部' AND date_str >= ? AND date_str <= ?
        """, (ws, we))
        achieve_row = cursor.fetchone()
        achieve_total = (achieve_row['lvl'] or 0) + (achieve_row['rev'] or 0)
        achieve_rate = round(achieve_total / achieve_row['active'] * 100, 1) if achieve_row['active'] else 0
        
        # 前一周成就（用于环比）
        pws = getv(prev_row, 'week_start', '')
        pwe = getv(prev_row, 'week_end', '')
        prev_achieve_rate = 0
        if pws and pwe:
            cursor = conn.execute("""
                SELECT SUM(level_achievement_count) as lvl, SUM(revenue_achievement_count) as rev,
                       SUM(active_team_count) as active
                FROM stats_daily WHERE hall_name = '全部' AND date_str >= ? AND date_str <= ?
            """, (pws, pwe))
            prev_achieve = cursor.fetchone()
            pat = (prev_achieve['lvl'] or 0) + (prev_achieve['rev'] or 0)
            prev_achieve_rate = round(pat / prev_achieve['active'] * 100, 1) if prev_achieve['active'] else 0
        
        conn.close()
        
        kpis = {
            'new_team':      {'value': this_row['new_team_count'],      'change': calc_pct(this_row['new_team_count'], getv(prev_row, 'new_team_count')),      'unit': '个'},
            'active_team':   {'value': this_row['active_team_count_end'],'change': calc_pct(this_row['active_team_count_end'], getv(prev_row, 'active_team_count_end')), 'unit': '个'},
            'retention':     {'value': min(100, this_row['retention_rate']),      'change': round(min(100, this_row['retention_rate']) - min(100, getv(prev_row, 'retention_rate')), 2),     'unit': '%'},
            'dissolution':   {'value': this_row['dissolution_rate'],    'change': round(this_row['dissolution_rate'] - getv(prev_row, 'dissolution_rate'), 2),   'unit': '%', 'reverse': True},
            'revenue':       {'value': round(this_row['total_reward'], 1), 'change': calc_pct(this_row['total_reward'], getv(prev_row, 'total_reward')), 'unit': '元'},
            'activity':      {'value': this_row['activity_index'],      'change': round(this_row['activity_index'] - getv(prev_row, 'activity_index'), 2),      'unit': ''},
            'achievement':   {'value': achieve_rate, 'change': round(achieve_rate - prev_achieve_rate, 2), 'unit': '%'},
            'active_dissolved_pct': {'value': round((this_row['active_dissolved_count'] / this_row['dissolved_count'] * 100) if this_row['dissolved_count'] > 0 else 0, 1), 'change': round(((this_row['active_dissolved_count'] / this_row['dissolved_count'] * 100) if this_row['dissolved_count'] > 0 else 0) - ((prev_row['active_dissolved_count'] / prev_row['dissolved_count'] * 100) if prev_row and prev_row['dissolved_count'] > 0 else 0), 2), 'unit': '%', 'reverse': True},
        }
        return jsonify({'data': kpis, 'date': this_row['week_start'], 'week': this_row['week_label']})
    
    cursor = conn.execute('''
        SELECT cycle, new_team_count, active_team_count, dissolved_count, active_dissolved_count,
               reward_amount, level_achievement_count, revenue_achievement_count
        FROM stats_daily WHERE hall_name = '全部' ORDER BY cycle DESC LIMIT 2
    ''')
    daily_rows = cursor.fetchall()
    
    cursor = conn.execute('''
        SELECT week_label, retention_rate, dissolution_rate, total_reward, activity_index
        FROM weekly_report WHERE hall_name = 'all' ORDER BY week_start DESC LIMIT 2
    ''')
    weekly_rows = cursor.fetchall()
    conn.close()
    
    if len(daily_rows) < 2 or len(weekly_rows) < 2:
        return jsonify({'error': '数据不足'}), 400
    
    today = daily_rows[0]
    yesterday = daily_rows[1]
    this_week = weekly_rows[0]
    last_week = weekly_rows[1]
    
    def calc_pct(curr, prev):
        if prev == 0:
            return 0
        return round((curr - prev) / prev * 100, 2)
    
    today_achieve = today['level_achievement_count'] + today['revenue_achievement_count']
    yesterday_achieve = yesterday['level_achievement_count'] + yesterday['revenue_achievement_count']
    today_achieve_rate = (today_achieve / today['active_team_count'] * 100) if today['active_team_count'] > 0 else 0
    yesterday_achieve_rate = (yesterday_achieve / yesterday['active_team_count'] * 100) if yesterday['active_team_count'] > 0 else 0
    
    today_active_pct = (today['active_dissolved_count'] / today['dissolved_count'] * 100) if today['dissolved_count'] > 0 else 0
    yesterday_active_pct = (yesterday['active_dissolved_count'] / yesterday['dissolved_count'] * 100) if yesterday['dissolved_count'] > 0 else 0
    
    kpis = {
        'new_team':      {'value': today['new_team_count'],      'change': calc_pct(today['new_team_count'], yesterday['new_team_count']),      'unit': '个'},
        'active_team':   {'value': today['active_team_count'],   'change': calc_pct(today['active_team_count'], yesterday['active_team_count']),   'unit': '个'},
        'retention':     {'value': min(100, this_week['retention_rate']),  'change': round(min(100, this_week['retention_rate']) - min(100, last_week['retention_rate']), 2),    'unit': '%'},
        'dissolution':   {'value': this_week['dissolution_rate'],'change': round(this_week['dissolution_rate'] - last_week['dissolution_rate'], 2),  'unit': '%', 'reverse': True},
        'revenue':       {'value': round(this_week['total_reward'], 1), 'change': calc_pct(this_week['total_reward'], last_week['total_reward']), 'unit': '元'},
        'activity':      {'value': this_week['activity_index'],  'change': round(this_week['activity_index'] - last_week['activity_index'], 2),     'unit': ''},
        'achievement':   {'value': round(today_achieve_rate, 1), 'change': round(today_achieve_rate - yesterday_achieve_rate, 2),                    'unit': '%'},
        'active_dissolved_pct': {'value': round(today_active_pct, 1), 'change': round(today_active_pct - yesterday_active_pct, 2), 'unit': '%', 'reverse': True},
    }
    
    return jsonify({'data': kpis, 'date': today['cycle'], 'week': this_week['week_label']})


@app.route('/api/trends')
def api_trends():
    metric = request.args.get('metric', 'new_team_count')
    date_type = int(request.args.get('date_type', 1))
    
    conn = get_db_conn()
    cursor = conn.execute('''
        SELECT date_label, value FROM trend_data 
        WHERE metric_name = ? AND date_type = ? AND hall_name = 'all'
        ORDER BY date_label
    ''', (metric, date_type))
    rows = cursor.fetchall()
    conn.close()
    
    dates = [r['date_label'] for r in rows]
    values = [r['value'] for r in rows]
    
    return jsonify({'dates': dates, 'values': values, 'metric': metric})


@app.route('/api/daily-retention')
def api_daily_retention():
    """返回近N天的日级留存率/解散率（基于 stats_daily 聚合计算）"""
    days = int(request.args.get('days', 14))
    conn = get_db_conn()
    cursor = conn.execute('''
        SELECT date_str, active_team_count, dissolved_count
        FROM stats_daily
        WHERE hall_name = '全部' AND date_str IS NOT NULL
        ORDER BY date_str DESC LIMIT ?
    ''', (days,))
    rows = cursor.fetchall()
    conn.close()
    
    rows = list(reversed(rows))
    dates = [r['date_str'] for r in rows]
    retention = []
    dissolution = []
    for r in rows:
        active = r['active_team_count'] or 0
        dissolved = r['dissolved_count'] or 0
        total = active + dissolved
        if total > 0:
            ret = round(active / total * 100, 1)
            dis = round(dissolved / total * 100, 1)
        else:
            ret = dis = 0
        retention.append(min(100, ret))
        dissolution.append(dis)
    
    return jsonify({'dates': dates, 'retention': retention, 'dissolution': dissolution})


@app.route('/api/weekly-report')


@app.route('/api/weekly-report')
def api_weekly_report():
    limit = request.args.get('limit', 'all')
    conn = get_db_conn()
    
    if limit == 'all':
        cursor = conn.execute('''
            SELECT * FROM weekly_report WHERE hall_name = 'all'
            ORDER BY week_start
        ''')
    else:
        cursor = conn.execute('''
            SELECT * FROM weekly_report WHERE hall_name = 'all'
            ORDER BY week_start DESC LIMIT ?
        ''', (int(limit),))
    
    rows = cursor.fetchall()
    conn.close()
    
    return jsonify({'data': rows})


@app.route('/api/detail-table')
def api_detail_table():
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 20))
    search = request.args.get('search', '')
    hall = request.args.get('hall', 'all')
    
    conn = get_db_conn()
    
    conditions = []
    params = []
    if search:
        conditions.append('(sister_nickname LIKE ? OR sister_nickname2 LIKE ? OR CAST(team_id AS TEXT) LIKE ?)')
        params = [f'%{search}%', f'%{search}%', f'%{search}%']
    if hall != 'all':
        conditions.append('hall_name = ?')
        params.append(hall)
    
    where_clause = 'WHERE ' + ' AND '.join(conditions) if conditions else ''
    
    cursor = conn.execute(f'SELECT COUNT(*) as total FROM team_detail {where_clause}', params)
    total = cursor.fetchone()['total']
    
    offset = (page - 1) * per_page
    cursor = conn.execute(f'''
        SELECT * FROM team_detail {where_clause}
        ORDER BY snapshot_date DESC, team_id DESC
        LIMIT ? OFFSET ?
    ''', params + [per_page, offset])
    rows = cursor.fetchall()
    conn.close()
    
    return jsonify({
        'data': rows,
        'total': total,
        'page': page,
        'per_page': per_page
    })


@app.route('/api/hall-stats')
def api_hall_stats():
    limit = int(request.args.get('limit', 10))
    
    conn = get_db_conn()
    cursor = conn.execute(
        "SELECT hall_name, team_count, active_count, dissolved_count, total_revenue "
        "FROM hall_stats "
        "WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM hall_stats) "
        "ORDER BY team_count DESC LIMIT ?",
        (limit,)
    )
    rows = cursor.fetchall()
    conn.close()
    
    return jsonify({'data': rows})


@app.route('/api/alerts')
def api_alerts():
    """返回预警列表，支持按周过滤"""
    week = request.args.get('week', '')
    conn = get_db_conn()
    if week:
        cursor = conn.execute('''
            SELECT alert_type, severity, title, description, metric_value, week_label, created_at
            FROM alerts
            WHERE week_label = ?
            ORDER BY severity DESC, created_at DESC
            LIMIT 20
        ''', (week,))
    else:
        from datetime import datetime, timedelta
        week_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        cursor = conn.execute('''
            SELECT alert_type, severity, title, description, metric_value, week_label, created_at
            FROM alerts
            WHERE is_resolved = 0 AND created_at >= ?
            ORDER BY severity DESC, created_at DESC
            LIMIT 20
        ''', (week_ago,))
    rows = cursor.fetchall()
    conn.close()
    alerts = []
    for row in rows:
        alerts.append({
            'severity': row['severity'],
            'title': row['title'],
            'message': row['description'],
            'metric_value': row['metric_value'],
            'week_label': row['week_label'],
            'created_at': row['created_at'],
        })
    return jsonify({'data': alerts})

@app.route('/api/export/weekly')
def api_export_weekly():
    conn = get_db_conn()
    cursor = conn.execute('''
        SELECT week_label, week_start, week_end, new_team_count, active_team_count_end,
               dissolved_count, retention_rate, dissolution_rate, total_reward, activity_index
        FROM weekly_report WHERE hall_name = 'all' ORDER BY week_start
    ''')
    rows = cursor.fetchall()
    conn.close()
    
    import io, csv
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['周标签', '开始日期', '结束日期', '新成团数', '进行中团数', '解散数', '留存率(%)', '解散率(%)', '总流水(元)', '活跃度'])
    for r in rows:
        writer.writerow([r['week_label'], r['week_start'], r['week_end'], r['new_team_count'],
                         r['active_team_count_end'], r['dissolved_count'], r['retention_rate'],
                         r['dissolution_rate'], r['total_reward'], r['activity_index']])
    
    csv_bytes = output.getvalue().encode('utf-8-sig')
    return Response(csv_bytes, mimetype='text/csv; charset=utf-8-sig',
                    headers={'Content-Disposition': 'attachment; filename=weekly_report.csv'})


@app.route('/api/export/detail')
def api_export_detail():
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()
    where = ''
    params = []
    if hall != 'all':
        where = 'WHERE hall_name = ?'
        params = [hall]
    cursor = conn.execute(f'''
        SELECT team_id, form_date, hall_name, sister_nickname, sister_uid,
               sister_nickname2, sister_uid2, sister_revenue, reward_amount, dissolve_date
        FROM team_detail {where} ORDER BY snapshot_date DESC, team_id DESC
    ''', params)
    rows = cursor.fetchall()
    conn.close()
    
    import io, csv
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['姐妹团ID', '成团日期', '大厅', '姐姐昵称', '姐姐UID', '妹妹昵称', '妹妹UID', '累计流水', '奖励金额', '解散日期'])
    for r in rows:
        writer.writerow([r['team_id'], r['form_date'], r['hall_name'], r['sister_nickname'],
                         r['sister_uid'], r['sister_nickname2'], r['sister_uid2'],
                         r['sister_revenue'], r['reward_amount'], r['dissolve_date']])
    
    csv_bytes = output.getvalue().encode('utf-8-sig')
    return Response(csv_bytes, mimetype='text/csv; charset=utf-8-sig',
                    headers={'Content-Disposition': 'attachment; filename=team_detail.csv'})


# ═══════════════════════════════════════════════════════
#  UID 查询接口
# ═══════════════════════════════════════════════════════

def _get_team_info_by_uid(uid: str) -> dict:
    """从 team_detail 表查询 UID 所在的姐妹团信息"""
    try:
        conn = get_db_conn()
        cursor = conn.execute('''
            SELECT team_id, form_date, hall_name,
                   sister_nickname, sister_uid,
                   sister_nickname2, sister_uid2,
                   sister_revenue, reward_amount, dissolve_date
            FROM team_detail
            WHERE sister_uid = ? OR sister_uid2 = ?
            ORDER BY snapshot_date DESC LIMIT 1
        ''', (uid, uid))
        row = cursor.fetchone()
        conn.close()
        if row:
            return {
                'team_id': row['team_id'],
                'hall_name': row['hall_name'],
                'form_date': row['form_date'],
                'sister_nickname': row['sister_nickname'],
                'sister_uid': row['sister_uid'],
                'sister_nickname2': row['sister_nickname2'],
                'sister_uid2': row['sister_uid2'],
                'total_revenue': row['sister_revenue'],
                'reward_amount': row['reward_amount'],
                'status': '已解散' if row['dissolve_date'] else '进行中',
                'dissolve_date': row['dissolve_date'],
            }
    except Exception as e:
        print(f'[WARN] 查询姐妹团明细失败: {e}')
    return None


@app.route('/api/uid-query', methods=['POST'])
def api_uid_query():
    """
    UID查询 + 本周vs上周对比 + 姐妹团参与明细
    请求体: { uid: string, captain_type?: string, mock?: boolean }
    返回: { uid, nickname, this_week, last_week, compare, team_info? }
    """
    body = request.get_json() or {}
    uid = str(body.get('uid', '')).strip()
    captain_type = body.get('captain_type', 'game')
    use_mock = body.get('mock', False)

    if not uid:
        return jsonify({'error': 'UID不能为空'}), 400

    result = None

    # Mock 模式（前端开发测试用，无需内网）
    if use_mock:
        result = get_mock_uid_data(uid, captain_type)
    else:
        # 真实查询模式（需要内网连接 + 有效Cookie）
        if not _uid_crawler_available:
            return jsonify({
                'error': 'UID爬虫模块未加载，请检查 crawler/uid_crawler.py 是否存在',
                'hint': '可设置 mock=true 使用模拟数据测试前端'
            }), 500

        try:
            crawler = UIDCrawler()
            result = crawler.query_with_compare(uid, captain_type)
        except Exception as e:
            error_msg = str(e)
            if 'Cookie' in error_msg or '过期' in error_msg:
                return jsonify({
                    'error': error_msg,
                    'hint': '请更新 crawler/uid_crawler.py 顶部的 UID_COOKIE_STR，然后重启后端',
                    'suggest_mock': True
                }), 503
            if '无法连接' in error_msg or 'ConnectionError' in error_msg:
                return jsonify({
                    'error': error_msg,
                    'hint': '请确认已连接内网/VPN',
                    'suggest_mock': True
                }), 503
            return jsonify({'error': error_msg}), 500

    # 附加姐妹团信息（从本地 SQLite，无论 Mock/真实都尝试查询）
    team_info = _get_team_info_by_uid(uid)
    if team_info:
        result['team_info'] = team_info

    return jsonify(result)
@app.route('/api/uid-query/types')
def api_uid_types():
    """返回支持的UID查询类型分类"""
    return jsonify({'types': [
        {'key': 'game', 'label': '新队长-游戏'},
        {'key': 'karaoke', 'label': '新队长-歌房'},
        {'key': 'werewolf', 'label': '新队长-狼人杀'},
        {'key': 'live', 'label': '实时-乐园杀'},
    ]})


# ═══════════════════════════════════════════════════════
#  Cookie 管理接口
# ═══════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════
#  Cookie 管理接口（支持两种 Cookie 分别管理）
#  - data/cookie.json        → UID 查询（server1.tuwan.com:10010）
#  - data/cookie_bigdata.json → 数据抓取（bigdata.tuwan.com）
# ═══════════════════════════════════════════════════════

COOKIE_FILE_UID = os.path.join(PROJECT_ROOT, 'data', 'cookie.json')
COOKIE_FILE_BIGDATA = os.path.join(PROJECT_ROOT, 'data', 'cookie_bigdata.json')


def _check_cookie_status(path: str, required_fields: list) -> dict:
    """通用 Cookie 状态检测"""
    try:
        with open(path, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
        cookie_str = cfg.get('cookie_str', '')
        checks = {field: field in cookie_str for field in required_fields}
        all_ok = all(checks.values())
        return {
            'status': 'valid' if all_ok else 'invalid',
            'updated_at': cfg.get('updated_at', ''),
            'length': len(cookie_str),
            'checks': checks,
        }
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


@app.route('/api/cookie', methods=['GET'])
def api_cookie_get():
    """获取 UID 查询 Cookie 状态"""
    return jsonify(_check_cookie_status(COOKIE_FILE_UID, ['PHPSESSID', 'DedeUserID']))


@app.route('/api/cookie', methods=['POST'])
def api_cookie_update():
    """更新 UID 查询 Cookie
    请求体: { cookie_str: string, basic_auth?: string }
    """
    body = request.get_json() or {}
    cookie_str = body.get('cookie_str', '').strip()
    basic_auth = body.get('basic_auth', '').strip()

    if not cookie_str:
        return jsonify({'error': 'Cookie 不能为空'}), 400
    if 'PHPSESSID' not in cookie_str:
        return jsonify({'error': 'Cookie 格式不正确，缺少 PHPSESSID'}), 400

    try:
        cfg = {
            'cookie_str': cookie_str,
            'basic_auth': basic_auth or 'MjAxODoyMDE4dHV3YW50ZW5nZmVp',
            'updated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'source': 'frontend',
        }
        with open(COOKIE_FILE_UID, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)

        os.environ['UID_QUERY_COOKIE'] = cookie_str
        if basic_auth:
            os.environ['UID_BASIC_AUTH'] = basic_auth

        return jsonify({
            'success': True,
            'message': 'UID 查询 Cookie 更新成功',
            'updated_at': cfg['updated_at'],
            'length': len(cookie_str),
        })
    except Exception as e:
        return jsonify({'error': f'保存失败: {e}'}), 500


@app.route('/api/cookie/bigdata', methods=['GET'])
def api_cookie_bigdata_get():
    """获取 bigdata 抓取 Cookie 状态"""
    return jsonify(_check_cookie_status(COOKIE_FILE_BIGDATA, ['PHPSESSID', 'Tuwan_Passport']))


@app.route('/api/cookie/bigdata', methods=['POST'])
def api_cookie_bigdata_update():
    """更新 bigdata 抓取 Cookie
    请求体: { cookie_str: string }
    """
    body = request.get_json() or {}
    cookie_str = body.get('cookie_str', '').strip()

    if not cookie_str:
        return jsonify({'error': 'Cookie 不能为空'}), 400
    if 'PHPSESSID' not in cookie_str:
        return jsonify({
            'error': 'Cookie 格式不正确，缺少 PHPSESSID',
            'hint': '请从浏览器访问 bigdata.tuwan.com/sisters/tj，F12 → Network → 复制 Cookie'
        }), 400

    try:
        cfg = {
            'cookie_str': cookie_str,
            'updated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'source': 'frontend',
        }
        with open(COOKIE_FILE_BIGDATA, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)

        return jsonify({
            'success': True,
            'message': '数据抓取 Cookie 更新成功',
            'updated_at': cfg['updated_at'],
            'length': len(cookie_str),
        })
    except Exception as e:
        return jsonify({'error': f'保存失败: {e}'}), 500





@app.route('/api/last-update')
def api_last_update():
    """返回上次数据更新时间"""
    try:
        with open(os.path.join(PROJECT_ROOT, 'data', 'last_update.json'), 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception:
        return jsonify({'last_update': '从未更新', 'status': 'unknown'})

# ========== 静态文件服务 ==========


# ========== 静态文件服务 ==========
@app.route('/')
def index():
    response = send_from_directory(os.path.join(PROJECT_ROOT, 'frontend'), 'index.html')
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@app.route('/<path:path>')
def static_files(path):
    response = send_from_directory(os.path.join(PROJECT_ROOT, 'frontend'), path)
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
