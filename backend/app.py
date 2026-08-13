#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Flask后端API"""
import os
import sys
import sqlite3
import json
import random
import string
import base64
import io
from datetime import datetime, timedelta

from flask import Flask, jsonify, request, send_from_directory, Response, session
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont

# Windows 控制台默认 GBK 编码，打印含 emoji/特殊符号的昵称（如 ❍）会抛
# UnicodeEncodeError，导致 UID 查询等接口 500。改为容错模式，无法编码的字符替换输出。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors='replace')
    except Exception:
        pass

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
app.secret_key = os.environ.get('SECRET_KEY', 'sisters-dashboard-secret-key-2026')
app.config['SESSION_TYPE'] = 'filesystem'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=10)
CORS(app, supports_credentials=True)

# 使用 Flask session
from functools import wraps

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user_uid = request.cookies.get('auth_uid')
        if not user_uid:
            return jsonify({'error': '未登录', 'login_url': '/login.html'}), 401
        return f(*args, **kwargs)
    return decorated

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(PROJECT_ROOT, 'data', 'stats.db')


def init_auth_db():
    """启动时自动创建 users 表并插入白名单 UID（支持 Docker 首次启动）"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                uid TEXT PRIMARY KEY,
                nickname TEXT,
                role TEXT DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        conn.execute('''
            INSERT OR IGNORE INTO users (uid, nickname, role) VALUES (?, ?, ?)
        ''', ('34315471', '管理员', 'admin'))

        # users 表补充 hall_name 列（管理的厅名，从 hall_managers 同步，便于直接查看）
        try:
            conn.execute('ALTER TABLE users ADD COLUMN hall_name TEXT')
        except Exception:
            pass  # 列已存在
        try:
            conn.execute('''
                UPDATE users SET hall_name = (
                    SELECT GROUP_CONCAT(hm.hall_name, '、') FROM hall_managers hm WHERE hm.uid = users.uid
                )
            ''')
        except Exception:
            pass  # hall_managers 表尚未创建时跳过
        # 中文身份视图：直接浏览数据库时只看 UID / 管理的厅名 / 身份
        conn.execute('''
            CREATE VIEW IF NOT EXISTS users_simple AS
            SELECT uid AS 'UID',
                   COALESCE(hall_name, '—') AS '管理的厅名',
                   CASE WHEN role = 'admin' THEN '管理员' ELSE '运营' END AS '身份'
            FROM users
        ''')
        conn.commit()
        conn.close()
        print('[BOOT] 用户认证表初始化完成')
    except Exception as e:
        print(f'[WARN] 用户认证表初始化失败: {e}')


# 启动时执行
init_auth_db()


# Cookie 保活：启动 60 秒后先跑一次，之后每 30 分钟保活一次（防 session 因不活跃过期）
def _start_keepalive():
    import threading
    import time

    def loop():
        time.sleep(60)
        while True:
            try:
                from cookie_keepalive import run_keepalive
                run_keepalive()
            except Exception as e:
                print(f'[Keepalive] 运行失败: {e}')
            time.sleep(1800)

    threading.Thread(target=loop, daemon=True).start()


_start_keepalive()


def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d


def get_db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = dict_factory
    return conn


# 解散原因归一化（供「解散原因分布」「趋势结论层」复用）
DISSOLVE_REASON_CASE = """
    CASE
      WHEN dissolve_reason LIKE '%手动%' THEN '手动解散'
      WHEN dissolve_reason LIKE '%未完成%' THEN '任务未完成自动解散'
      WHEN dissolve_reason LIKE '%一个月%' THEN '满月自动解散'
      WHEN dissolve_reason LIKE '%铜牌%' THEN '等级自动解散'
      WHEN dissolve_reason LIKE '%注销%' THEN '注销'
      WHEN dissolve_reason LIKE '%离职%' THEN '离职'
      ELSE '其他'
    END
"""


# ========== API路由 ==========

@app.route('/api/search-suggest')
@login_required
def api_search_suggest():
    """模糊搜索建议：根据输入关键词返回匹配的昵称/UID/大厅名"""
    keyword = request.args.get('keyword', '').strip()
    if not keyword:
        return jsonify({'data': []})
    
    conn = get_db_conn()
    # 模糊匹配 sister_nickname、sister_nickname2、UID、hall_name、team_id
    like = f'%{keyword}%'
    cursor = conn.execute('''
        SELECT DISTINCT 
            sister_nickname as name,
            sister_uid as uid,
            hall_name,
            '姐姐' as role
        FROM team_detail
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
          AND (sister_nickname LIKE ? OR sister_uid LIKE ? OR hall_name LIKE ? OR CAST(team_id AS TEXT) LIKE ?)
          AND (sister_nickname IS NOT NULL AND sister_nickname != '')
        LIMIT 5
    ''', (like, like, like, like))
    rows1 = cursor.fetchall()
    
    cursor = conn.execute('''
        SELECT DISTINCT 
            sister_nickname2 as name,
            sister_uid2 as uid,
            hall_name,
            '妹妹' as role
        FROM team_detail
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
          AND (sister_nickname2 LIKE ? OR sister_uid2 LIKE ? OR hall_name LIKE ? OR CAST(team_id AS TEXT) LIKE ?)
          AND (sister_nickname2 IS NOT NULL AND sister_nickname2 != '')
        LIMIT 5
    ''', (like, like, like, like))
    rows2 = cursor.fetchall()
    conn.close()
    
    seen = set()
    suggestions = []
    for r in rows1 + rows2:
        key = f"{r['name']}|{r['uid']}"
        if key in seen or not r['name']:
            continue
        seen.add(key)
        suggestions.append({
            'name': r['name'],
            'uid': r['uid'] or '',
            'hall': r['hall_name'] or '',
            'role': r['role']
        })
    
    # 再补充大厅名建议（去重）
    conn = get_db_conn()
    cursor = conn.execute('''
        SELECT DISTINCT hall_name
        FROM team_detail
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
          AND hall_name LIKE ?
        LIMIT 3
    ''', (like,))
    hall_rows = cursor.fetchall()
    conn.close()
    
    for h in hall_rows:
        if h['hall_name'] and h['hall_name'] not in seen:
            seen.add(h['hall_name'])
            suggestions.append({
                'name': h['hall_name'],
                'uid': '',
                'hall': h['hall_name'],
                'role': '大厅'
            })
    
    return jsonify({'data': suggestions[:10]})


@app.route('/api/halls')
@login_required
def api_halls():
    """返回大厅列表，根据用户角色过滤"""
    user_uid = request.cookies.get('auth_uid')
    conn = get_db_conn()
    cursor = conn.execute('SELECT role FROM users WHERE uid = ?', (user_uid,))
    user = cursor.fetchone()
    role = user['role'] if user else 'admin'
    
    if role == 'admin':
        cursor = conn.execute('''
            SELECT DISTINCT hall_name FROM team_detail
            WHERE hall_name IS NOT NULL AND hall_name != ''
            ORDER BY hall_name
        ''')
        halls = [r['hall_name'] for r in cursor.fetchall()]
    else:
        # hall_manager：只返回管理的厅
        cursor = conn.execute('''
            SELECT hall_name FROM hall_managers WHERE uid = ? ORDER BY hall_name
        ''', (user_uid,))
        halls = [r['hall_name'] for r in cursor.fetchall()]
    
    conn.close()
    return jsonify({'data': halls, 'role': role})


@app.route('/api/hall-overview')
@login_required
def api_hall_overview():
    """工作台：当前用户可见大厅的近N周周报数据（厅运营=管理的厅，管理员=全部厅）"""
    user_uid = request.cookies.get('auth_uid')
    weeks = int(request.args.get('weeks', 7))
    conn = get_db_conn()
    row = conn.execute('SELECT role FROM users WHERE uid = ?', (user_uid,)).fetchone()
    role = row['role'] if row else 'admin'
    if role == 'admin':
        halls = [r['hall_name'] for r in conn.execute(
            "SELECT DISTINCT hall_name FROM weekly_report WHERE hall_name != 'all' ORDER BY hall_name"
        ).fetchall()]
    else:
        halls = [r['hall_name'] for r in conn.execute(
            'SELECT hall_name FROM hall_managers WHERE uid = ? ORDER BY hall_name', (user_uid,)
        ).fetchall()]
    data = []
    # hall_revenue_daily 表可能尚未建立（首次部署/未抓取时），先探测一次
    has_hall_rev = conn.execute(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='hall_revenue_daily'"
    ).fetchone()['c'] > 0
    # 本月起始日期（用于厅排行榜「本周/本月」切换）
    month_start = datetime.now().date().replace(day=1).isoformat()
    # 姐妹团周流水（姐姐+妹妹当周礼物总流水合计，来自 team_sister_revenue 批量查询）
    has_sister_rev = conn.execute(
        "SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='team_sister_revenue'"
    ).fetchone()['c'] > 0
    latest_sw = None
    prev_sw = None
    if has_sister_rev:
        latest_sw = conn.execute('SELECT MAX(week_start) AS w FROM team_sister_revenue').fetchone()['w']
        prev_sw = conn.execute(
            'SELECT MAX(week_start) AS w FROM team_sister_revenue WHERE week_start < ?', (latest_sw,)
        ).fetchone()['w']
    for h in halls:
        rows = conn.execute('''
            SELECT week_start, week_end, new_team_count, active_team_count_start, active_team_count_end,
                   dissolved_count, active_dissolved_count, retention_rate, dissolution_rate, total_reward
            FROM weekly_report WHERE hall_name = ? ORDER BY week_start DESC LIMIT ?
        ''', (h, weeks)).fetchall()
        if rows:
            week_list = [dict(r) for r in reversed(rows)]
            # 合并真实厅周流水（hall_revenue_daily 按周区间求和；无数据为 None）
            for w in week_list:
                w['hall_revenue'] = None
                w['hall_revenue_days'] = 0
                if has_hall_rev:
                    rev = conn.execute(
                        'SELECT SUM(hall_revenue) AS s, COUNT(*) AS n FROM hall_revenue_daily WHERE hall_name = ? AND date >= ? AND date <= ?',
                        (h, w['week_start'], w['week_end'])).fetchone()
                    if rev['n']:
                        w['hall_revenue'] = round(rev['s'], 1)
                        w['hall_revenue_days'] = rev['n']
            # 本月汇总（厅月流水 / 姐妹团月流水 / 月新成团）
            month = {'revenue': None, 'sis_revenue': None, 'new_teams': 0}
            if has_hall_rev:
                mrev = conn.execute(
                    'SELECT SUM(hall_revenue) AS s, COUNT(*) AS n FROM hall_revenue_daily WHERE hall_name = ? AND date >= ?',
                    (h, month_start)).fetchone()
                if mrev['n']:
                    month['revenue'] = round(mrev['s'], 1)
            mwk = conn.execute(
                'SELECT SUM(total_reward) AS s, SUM(new_team_count) AS n FROM weekly_report WHERE hall_name = ? AND week_start >= ?',
                (h, month_start)).fetchone()
            if mwk['s'] is not None:
                month['sis_revenue'] = round(mwk['s'] or 0, 1)
            if mwk['n'] is not None:
                month['new_teams'] = int(mwk['n'] or 0)
            # 姐妹团周/月流水（真·流水 = 姐姐+妹妹当周礼物总流水合计）
            sister_weekly = None
            sister_monthly = None
            sister_prev_weekly = None
            if has_sister_rev:
                if latest_sw:
                    sw = conn.execute(
                        'SELECT SUM(total_revenue) AS s FROM team_sister_revenue WHERE hall_name = ? AND week_start = ?',
                        (h, latest_sw)).fetchone()
                    if sw and sw['s'] is not None:
                        sister_weekly = round(sw['s'], 1)
                if prev_sw:
                    sp = conn.execute(
                        'SELECT SUM(total_revenue) AS s FROM team_sister_revenue WHERE hall_name = ? AND week_start = ?',
                        (h, prev_sw)).fetchone()
                    if sp and sp['s'] is not None:
                        sister_prev_weekly = round(sp['s'], 1)
                sm = conn.execute(
                    'SELECT SUM(total_revenue) AS s FROM team_sister_revenue WHERE hall_name = ? AND week_start >= ?',
                    (h, month_start)).fetchone()
                if sm and sm['s'] is not None:
                    sister_monthly = round(sm['s'], 1)
            data.append({'hall_name': h, 'weeks': week_list, 'month': month,
                         'sister_weekly_revenue': sister_weekly, 'sister_monthly_revenue': sister_monthly,
                         'sister_prev_weekly_revenue': sister_prev_weekly})
    conn.close()
    return jsonify({'role': role, 'data': data})


@app.route('/api/kpi')
@login_required
def api_kpi():
    """KPI概览数据（8项核心指标），支持按大厅和周过滤"""
    hall = request.args.get('hall', 'all')
    week = request.args.get('week', '')
    conn = get_db_conn()

    # 指定大厅但未指定周时，默认取该厅最新一周
    if not (week and '|' in week) and hall != 'all':
        latest = conn.execute(
            "SELECT week_start, week_end FROM weekly_report WHERE hall_name = ? ORDER BY week_start DESC LIMIT 1",
            (hall,)
        ).fetchone()
        if latest:
            week = latest['week_start'] + '|' + latest['week_end']

    if week and '|' in week:
        ws, we = week.split('|')
        cursor = conn.execute("""
            SELECT week_label, week_start, week_end, new_team_count, active_team_count_start, active_team_count_end,
                   dissolved_count, active_dissolved_count, retention_rate, dissolution_rate,
                   total_reward, activity_index
            FROM weekly_report WHERE hall_name = ? AND week_start = ? AND week_end = ?
        """, (hall, ws, we))
        this_row = cursor.fetchone()
        if not this_row:
            # 所选周无数据（如本周仍在收集中），回退到最新一周
            latest = conn.execute(
                "SELECT week_start, week_end FROM weekly_report WHERE hall_name = ? ORDER BY week_start DESC LIMIT 1",
                (hall,)
            ).fetchone()
            if latest:
                ws, we = latest['week_start'], latest['week_end']
                cursor = conn.execute("""
                    SELECT week_label, week_start, week_end, new_team_count, active_team_count_start, active_team_count_end,
                           dissolved_count, active_dissolved_count, retention_rate, dissolution_rate,
                           total_reward, activity_index
                    FROM weekly_report WHERE hall_name = ? AND week_start = ? AND week_end = ?
                """, (hall, ws, we))
                this_row = cursor.fetchone()
        if not this_row:
            conn.close()
            return jsonify({'error': '该周暂无数据'}), 404
        cursor = conn.execute("""
            SELECT * FROM weekly_report WHERE hall_name = ? AND week_start < ?
            ORDER BY week_start DESC LIMIT 1
        """, (hall, ws))
        prev_row = cursor.fetchone()
        # 先不 close，还需要查询成就数据
        def calc_pct(curr, prev):
            if prev == 0: return 0
            return round((curr - prev) / prev * 100, 2)
        def getv(row, key, default=0):
            return row[key] if row else default
        
        # 从 stats_daily 聚合该周的成就数据（仅有全平台数据，单厅无此维度）
        achieve_rate = 0
        if hall == 'all':
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
        if hall == 'all' and pws and pwe:
            cursor = conn.execute("""
                SELECT SUM(level_achievement_count) as lvl, SUM(revenue_achievement_count) as rev,
                       SUM(active_team_count) as active
                FROM stats_daily WHERE hall_name = '全部' AND date_str >= ? AND date_str <= ?
            """, (pws, pwe))
            prev_achieve = cursor.fetchone()
            pat = (prev_achieve['lvl'] or 0) + (prev_achieve['rev'] or 0)
            prev_achieve_rate = round(pat / prev_achieve['active'] * 100, 1) if prev_achieve['active'] else 0
        
        conn.close()
        
        def calc_retention(row):
            if not row:
                return 0
            start = row.get('active_team_count_start', 0) or 0
            end = row.get('active_team_count_end', 0) or 0
            new = row.get('new_team_count', 0) or 0
            if start <= 0:
                return 0
            return min(100, round((end - new) / start * 100, 2))
        
        this_retention = calc_retention(this_row)
        prev_retention = calc_retention(prev_row)
        
        kpis = {
            'new_team':      {'value': this_row['new_team_count'],      'change': calc_pct(this_row['new_team_count'], getv(prev_row, 'new_team_count')),      'unit': '个'},
            'active_team':   {'value': this_row['active_team_count_end'],'change': calc_pct(this_row['active_team_count_end'], getv(prev_row, 'active_team_count_end')), 'unit': '个'},
            'retention':     {'value': this_retention,                  'change': round(this_retention - prev_retention, 2),                                   'unit': '%'},
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
        FROM stats_daily WHERE hall_name = '全部' ORDER BY date_str DESC LIMIT 2
    ''')
    daily_rows = cursor.fetchall()
    
    cursor = conn.execute('''
        SELECT week_label, active_team_count_start, active_team_count_end, new_team_count,
               retention_rate, dissolution_rate, total_reward, activity_index
        FROM weekly_report WHERE hall_name = 'all' ORDER BY week_start DESC LIMIT 2
    ''')
    weekly_rows = cursor.fetchall()
    conn.close()
    
    if len(daily_rows) < 1 and len(weekly_rows) < 1:
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
    
    def calc_retention(row):
        if not row:
            return 0
        start = row.get('active_team_count_start', 0) or 0
        end = row.get('active_team_count_end', 0) or 0
        new = row.get('new_team_count', 0) or 0
        if start <= 0:
            return 0
        return min(100, round((end - new) / start * 100, 2))
    
    this_retention = calc_retention(this_week)
    last_retention = calc_retention(last_week)
    
    kpis = {
        'new_team':      {'value': today['new_team_count'],      'change': calc_pct(today['new_team_count'], yesterday['new_team_count']),      'unit': '个'},
        'active_team':   {'value': today['active_team_count'],   'change': calc_pct(today['active_team_count'], yesterday['active_team_count']),   'unit': '个'},
        'retention':     {'value': this_retention,               'change': round(this_retention - last_retention, 2),                             'unit': '%'},
        'dissolution':   {'value': this_week['dissolution_rate'],'change': round(this_week['dissolution_rate'] - last_week['dissolution_rate'], 2),  'unit': '%', 'reverse': True},
        'revenue':       {'value': round(this_week['total_reward'], 1), 'change': calc_pct(this_week['total_reward'], last_week['total_reward']), 'unit': '元'},
        'activity':      {'value': this_week['activity_index'],  'change': round(this_week['activity_index'] - last_week['activity_index'], 2),     'unit': ''},
        'achievement':   {'value': round(today_achieve_rate, 1), 'change': round(today_achieve_rate - yesterday_achieve_rate, 2),                    'unit': '%'},
        'active_dissolved_pct': {'value': round(today_active_pct, 1), 'change': round(today_active_pct - yesterday_active_pct, 2), 'unit': '%', 'reverse': True},
    }
    
    return jsonify({'data': kpis, 'date': today['cycle'], 'week': this_week['week_label']})


@app.route('/api/trends')
@login_required
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


@app.route('/api/daily-events')
@login_required
def api_daily_events():
    """日级成团/解散事件数（基于 team_detail 最新快照的 form_date / dissolve_date）"""
    hall = request.args.get('hall', 'all')
    days = min(int(request.args.get('days', 14)), 60)
    conn = get_db_conn()
    sql = """SELECT form_date, dissolve_date FROM team_detail
             WHERE rowid IN (SELECT MAX(rowid) FROM team_detail
                             WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                             GROUP BY team_id)"""
    params = []
    if hall != 'all':
        sql += ' AND hall_name = ?'
        params.append(hall)
    rows = conn.execute(sql, params).fetchall()
    ref = conn.execute('SELECT MAX(snapshot_date) AS ref FROM team_detail').fetchone()['ref']
    conn.close()
    if not ref:
        return jsonify({'dates': [], 'new_teams': [], 'dissolved': []})
    ref_date = datetime.strptime(ref, '%Y-%m-%d').date()
    new_map, diss_map = {}, {}
    for r in rows:
        fd = (r['form_date'] or '')[:10]
        dd = (r['dissolve_date'] or '')[:10]
        if fd:
            new_map[fd] = new_map.get(fd, 0) + 1
        if dd:
            diss_map[dd] = diss_map.get(dd, 0) + 1
    dates, new_teams, dissolved = [], [], []
    for i in range(days - 1, -1, -1):
        d = (ref_date - timedelta(days=i)).isoformat()
        dates.append(d)
        new_teams.append(new_map.get(d, 0))
        dissolved.append(diss_map.get(d, 0))
    return jsonify({'ref_date': ref, 'dates': dates, 'new_teams': new_teams, 'dissolved': dissolved})


@app.route('/api/survival')
@login_required
def api_survival():
    """姐妹团存活分析（最新快照）：进行中团天数分布 + 7/14/30日存活率 + 政策前后对比"""
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()
    sql = """SELECT form_date, dissolve_date, days_since_formed FROM team_detail
             WHERE rowid IN (SELECT MAX(rowid) FROM team_detail
                             WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                             GROUP BY team_id)"""
    params = []
    if hall != 'all':
        sql += ' AND hall_name = ?'
        params.append(hall)
    rows = conn.execute(sql, params).fetchall()
    ref = conn.execute('SELECT MAX(snapshot_date) AS ref FROM team_detail').fetchone()['ref']
    conn.close()
    if not rows or not ref:
        return jsonify({'error': '暂无数据'}), 404
    ref_date = datetime.strptime(ref, '%Y-%m-%d').date()
    policy_date = datetime(2026, 7, 17).date()

    def parse_d(s):
        s = (s or '')[:10]
        try:
            return datetime.strptime(s, '%Y-%m-%d').date()
        except Exception:
            return None

    # 进行中团的已成团天数分布
    bins = [('0-3天', 0, 3), ('4-7天', 4, 7), ('8-14天', 8, 14), ('15-30天', 15, 30), ('30天以上', 31, 10 ** 9)]
    hist = [0] * len(bins)
    active = 0
    for r in rows:
        if not (r['dissolve_date'] or '').strip():
            active += 1
            d = r['days_since_formed'] or 0
            for i, (_, lo, hi) in enumerate(bins):
                if lo <= d <= hi:
                    hist[i] += 1
                    break

    # T日存活率：成团已满T天的团中，存活达到T天的比例
    def survival(t, formed_after=None, formed_before=None):
        eligible = survived = 0
        for r in rows:
            fd = parse_d(r['form_date'])
            if not fd:
                continue
            if formed_after and fd < formed_after:
                continue
            if formed_before and fd >= formed_before:
                continue
            if (ref_date - fd).days < t:
                continue  # 尚未满T天，不纳入统计
            eligible += 1
            dd = parse_d(r['dissolve_date'])
            if not dd or (dd - fd).days >= t:
                survived += 1
        return {'rate': round(survived / eligible * 100, 1) if eligible else None, 'total': eligible}

    return jsonify({
        'ref_date': ref,
        'active_count': active,
        'hist_labels': [b[0] for b in bins],
        'hist_values': hist,
        'survival': {
            'd7': survival(7),
            'd14': survival(14),
            'd30': survival(30),
            'policy_pre_d7': survival(7, formed_before=policy_date),
            'policy_post_d7': survival(7, formed_after=policy_date),
        },
    })


# 政策后第一个完整周（07-17 在政策周 07-13~07-19 内，从下一周起算）
POLICY_WEEK_START = '2026-07-20'


@app.route('/api/policy-impact')
@login_required
def api_policy_impact():
    """政策效果评估：政策前4周 vs 政策后4周均值对比 + 分厅响应度排名"""
    hall = request.args.get('hall', 'all')
    user_uid = request.cookies.get('auth_uid')
    conn = get_db_conn()
    row = conn.execute('SELECT role FROM users WHERE uid = ?', (user_uid,)).fetchone()
    role = row['role'] if row else 'admin'

    def agg(h, direction):
        """direction: pre=政策前最近4周, post=政策后最早4周"""
        op = '<' if direction == 'pre' else '>='
        order = 'DESC' if direction == 'pre' else 'ASC'
        return conn.execute(f"""
            SELECT AVG(retention_rate) AS ret, AVG(dissolution_rate) AS dis,
                   AVG(total_reward) AS rev, AVG(new_team_count) AS nt, COUNT(*) AS n
            FROM (SELECT retention_rate, dissolution_rate, total_reward, new_team_count
                  FROM weekly_report WHERE hall_name = ? AND week_start {op} ?
                  ORDER BY week_start {order} LIMIT 4)
        """, (h, POLICY_WEEK_START)).fetchone()

    def pack(h):
        pre, post = agg(h, 'pre'), agg(h, 'post')
        if not pre['n'] or not post['n']:
            return None
        rev_delta_pct = round((post['rev'] - pre['rev']) / pre['rev'] * 100, 1) if pre['rev'] else None
        nt_delta_pct = round((post['nt'] - pre['nt']) / pre['nt'] * 100, 1) if pre['nt'] else None
        return {
            'ret_pre': round(pre['ret'], 1), 'ret_post': round(post['ret'], 1),
            'ret_delta': round(post['ret'] - pre['ret'], 1),
            'dis_pre': round(pre['dis'], 1), 'dis_post': round(post['dis'], 1),
            'dis_delta': round(post['dis'] - pre['dis'], 1),
            'rev_pre': round(pre['rev'], 1), 'rev_post': round(post['rev'], 1),
            'rev_delta_pct': rev_delta_pct,
            'nt_pre': round(pre['nt'], 1), 'nt_post': round(post['nt'], 1),
            'nt_delta_pct': nt_delta_pct,
        }

    # 当前筛选范围的总体对比
    overall = pack(hall)

    # 分厅响应度排名
    if role == 'admin':
        halls = [r['hall_name'] for r in conn.execute(
            "SELECT DISTINCT hall_name FROM weekly_report WHERE hall_name != 'all'").fetchall()]
    else:
        halls = [r['hall_name'] for r in conn.execute(
            'SELECT hall_name FROM hall_managers WHERE uid = ?', (user_uid,)).fetchall()]
    ranking = []
    for h in halls:
        p = pack(h)
        if p:
            ranking.append({'hall_name': h, **p})
    ranking.sort(key=lambda x: x['ret_delta'], reverse=True)
    conn.close()

    return jsonify({
        'policy_week_start': POLICY_WEEK_START,
        'hall': hall,
        'overall': overall,
        'ranking': ranking,
    })


@app.route('/api/captains')
@login_required
def api_captains():
    """姐姐（团长）维度：带团数/当日奖励/团存活率排行 + 各厅头牌依赖度"""
    hall = request.args.get('hall', 'all')
    limit = min(int(request.args.get('limit', 50)), 200)
    conn = get_db_conn()
    ref = conn.execute('SELECT MAX(snapshot_date) AS ref FROM team_detail').fetchone()['ref']
    period = request.args.get('period', 'day')  # day=快照当日 / week=本周累计 / month=本月累计

    if period in ('week', 'month'):
        # 周/月口径：跨快照按 (team_id, snapshot_date) 去重后累计奖励
        ref_d = datetime.strptime(ref, '%Y-%m-%d').date()
        start = (ref_d - timedelta(days=ref_d.weekday())) if period == 'week' else ref_d.replace(day=1)
        hall_cond = "AND s.hall_name = ?" if hall != 'all' else ''
        params = [start.isoformat(), ref]
        if hall != 'all':
            params.append(hall)
        params.append(limit)
        rows = conn.execute(f"""
            WITH snap AS (
              SELECT * FROM team_detail
              WHERE rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id, snapshot_date)
                AND snapshot_date >= ? AND snapshot_date <= ?
            ),
            latest AS (
              SELECT * FROM team_detail
              WHERE rowid IN (SELECT MAX(rowid) FROM team_detail
                              WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                              GROUP BY team_id)
            )
            SELECT s.sister_uid,
                   MAX(s.sister_nickname) AS nickname,
                   GROUP_CONCAT(DISTINCT s.hall_name) AS halls,
                   COUNT(DISTINCT s.team_id) AS team_count,
                   (SELECT COUNT(*) FROM latest l WHERE l.sister_uid = s.sister_uid
                     AND (l.dissolve_date = '' OR l.dissolve_date IS NULL)) AS active_count,
                   SUM(s.reward_amount) AS total_reward
            FROM snap s
            WHERE s.sister_uid IS NOT NULL AND s.sister_uid != '' {hall_cond}
            GROUP BY s.sister_uid ORDER BY total_reward DESC LIMIT ?
        """, params).fetchall()
    else:
        # 当日口径：最新快照
        sql = """SELECT sister_uid, MAX(sister_nickname) AS nickname,
                        GROUP_CONCAT(DISTINCT hall_name) AS halls,
                        COUNT(*) AS team_count,
                        SUM(CASE WHEN dissolve_date = '' OR dissolve_date IS NULL THEN 1 ELSE 0 END) AS active_count,
                        SUM(reward_amount) AS total_reward
                 FROM team_detail
                 WHERE rowid IN (SELECT MAX(rowid) FROM team_detail
                                 WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                                 GROUP BY team_id)
                   AND sister_uid IS NOT NULL AND sister_uid != ''"""
        params = []
        if hall != 'all':
            sql += ' AND hall_name = ?'
            params.append(hall)
        sql += ' GROUP BY sister_uid ORDER BY total_reward DESC LIMIT ?'
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
    captains = [{
        'uid': r['sister_uid'],
        'nickname': r['nickname'] or r['sister_uid'],
        'halls': r['halls'] or '',
        'team_count': r['team_count'],
        'active_count': r['active_count'],
        'survival_rate': round(r['active_count'] / r['team_count'] * 100, 1) if r['team_count'] else 0,
        'total_reward': round(r['total_reward'] or 0, 1),
    } for r in rows]

    # 头牌依赖度：各厅 TOP1 姐姐当日奖励占比
    dep_rows = conn.execute("""
        WITH per_captain AS (
          SELECT hall_name, sister_uid, MAX(sister_nickname) AS nickname, SUM(reward_amount) AS rev
          FROM team_detail
          WHERE rowid IN (SELECT MAX(rowid) FROM team_detail
                          WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                          GROUP BY team_id)
            AND sister_uid IS NOT NULL AND sister_uid != ''
          GROUP BY hall_name, sister_uid
        ),
        hall_total AS (
          SELECT hall_name, SUM(rev) AS total_rev, MAX(rev) AS top_rev
          FROM per_captain GROUP BY hall_name
        )
        SELECT p.hall_name, p.sister_uid, p.nickname, p.rev, h.total_rev
        FROM per_captain p JOIN hall_total h ON p.hall_name = h.hall_name AND p.rev = h.top_rev
        WHERE h.total_rev > 0
        ORDER BY (p.rev * 1.0 / h.total_rev) DESC
    """).fetchall()
    dependency = [{
        'hall_name': r['hall_name'],
        'top_captain': r['nickname'] or r['sister_uid'],
        'top_uid': r['sister_uid'],
        'share': round(r['rev'] / r['total_rev'] * 100, 1),
        'captain_rev': round(r['rev'], 1),
        'hall_rev': round(r['total_rev'], 1),
    } for r in dep_rows]
    conn.close()

    return jsonify({'data': captains, 'dependency': dependency, 'ref_date': ref, 'period': period, 'metric_note': 'reward_amount 为快照当日发放的礼物奖励金额，非累计总流水；累计总流水请在 UID 查询中查看'})


@app.route('/api/trend-insights')
@login_required
def api_trend_insights():
    """趋势图结论层：为工作台4张周级趋势图提供点名式结论（哪个厅 / 什么原因 / 找谁）"""
    hall = request.args.get('hall', 'all')
    week_param = request.args.get('week', '')  # 'YYYY-MM-DD|YYYY-MM-DD'
    conn = get_db_conn()

    # 最新快照日期 + 所选周区间（缺省用最新快照所在周）
    ref = conn.execute('SELECT MAX(snapshot_date) AS ref FROM team_detail').fetchone()['ref']
    ref_d = datetime.strptime(ref, '%Y-%m-%d').date()
    if week_param and '|' in week_param:
        ws, we = week_param.split('|')[0], week_param.split('|')[1]
    else:
        ws = (ref_d - timedelta(days=ref_d.weekday())).isoformat()
        we = (ref_d - timedelta(days=ref_d.weekday() - 6)).isoformat()

    hall_cond = '' if hall == 'all' else 'AND hall_name = ?'
    hp = [] if hall == 'all' else [hall]
    latest_teams = 'rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)'

    out = {}

    # ── 1) 解散：本周解散团数 + 主因 + 集中厅 ──
    diss_count = conn.execute(
        f"SELECT COUNT(*) AS c FROM team_detail WHERE {latest_teams} AND date(dissolve_date) BETWEEN ? AND ? {hall_cond}",
        [ws, we] + hp).fetchone()['c']
    reason_row = hall_row = None
    if diss_count:
        reason_row = conn.execute(
            f"SELECT {DISSOLVE_REASON_CASE} AS reason, COUNT(*) AS c FROM team_detail WHERE {latest_teams} AND date(dissolve_date) BETWEEN ? AND ? {hall_cond} GROUP BY reason ORDER BY c DESC LIMIT 1",
            [ws, we] + hp).fetchone()
        hall_row = conn.execute(
            f"SELECT hall_name, COUNT(*) AS c FROM team_detail WHERE {latest_teams} AND date(dissolve_date) BETWEEN ? AND ? {hall_cond} GROUP BY hall_name ORDER BY c DESC LIMIT 1",
            [ws, we] + hp).fetchone()
    out['dissolution'] = {
        'count': diss_count,
        'top_reason': reason_row['reason'] if reason_row else '',
        'top_reason_count': reason_row['c'] if reason_row else 0,
        'top_hall': hall_row['hall_name'] if hall_row else '',
        'top_hall_count': hall_row['c'] if hall_row else 0,
    }

    # ── 2) 流水：本周 TOP 姐姐（team_sister_revenue 姐姐周流水，与厅排行榜口径一致） ──
    out['revenue'] = None
    sw = conn.execute('SELECT MAX(week_start) AS w FROM team_sister_revenue WHERE week_start <= ?', (we,)).fetchone()['w']
    if sw and sw == ws:
        r = conn.execute(f"""
            SELECT sister_uid, SUM(sister_revenue) AS rev, GROUP_CONCAT(DISTINCT hall_name) AS halls
            FROM team_sister_revenue
            WHERE week_start = ? AND sister_revenue > 0 {hall_cond}
            GROUP BY sister_uid ORDER BY rev DESC LIMIT 1
        """, [sw] + hp).fetchone()
        if r:
            nick = conn.execute('SELECT MAX(sister_nickname) AS n FROM team_detail WHERE sister_uid = ?', (r['sister_uid'],)).fetchone()['n']
            total = conn.execute(
                f"SELECT SUM(total_revenue) AS t FROM team_sister_revenue WHERE week_start = ? {hall_cond}",
                [sw] + hp).fetchone()['t'] or 0
            out['revenue'] = {
                'top_sister': nick or str(r['sister_uid']),
                'top_sister_uid': r['sister_uid'],
                'top_sister_rev': round(r['rev'] or 0, 1),
                'share': round((r['rev'] or 0) / total * 100, 1) if total else 0,
                'top_sister_hall': r['halls'],
            }

    # ── 3) 任务活跃度：TOP 姐姐（最新快照任务合计） ──
    r = conn.execute(f"""
        SELECT sister_uid, MAX(sister_nickname) AS nickname,
               SUM(drive_task_count + accompany_task_count + gift_task_count) AS tasks
        FROM team_detail
        WHERE rowid IN (SELECT MAX(rowid) FROM team_detail
                        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                        GROUP BY team_id)
          AND sister_uid IS NOT NULL AND sister_uid != '' {hall_cond}
        GROUP BY sister_uid ORDER BY tasks DESC LIMIT 1
    """, hp).fetchone()
    out['activity'] = {
        'top_sister': r['nickname'] if r else None,
        'tasks': round(r['tasks'] or 0) if r else 0,
    } if r and r['tasks'] else None

    # ── 4) 留存：最好/最差厅（或单厅 vs 平台均值） ──
    if hall == 'all':
        best = conn.execute(
            "SELECT hall_name, retention_rate FROM weekly_report WHERE hall_name != 'all' AND week_start = ? AND week_end = ? AND retention_rate IS NOT NULL ORDER BY retention_rate DESC LIMIT 1",
            [ws, we]).fetchone()
        worst = conn.execute(
            "SELECT hall_name, retention_rate FROM weekly_report WHERE hall_name != 'all' AND week_start = ? AND week_end = ? AND retention_rate IS NOT NULL ORDER BY retention_rate ASC LIMIT 1",
            [ws, we]).fetchone()
        out['retention'] = {
            'best_hall': best['hall_name'] if best else '',
            'best_rate': round(best['retention_rate'] or 0, 1) if best else None,
            'worst_hall': worst['hall_name'] if worst else '',
            'worst_rate': round(worst['retention_rate'] or 0, 1) if worst else None,
        }
    else:
        own = conn.execute(
            "SELECT retention_rate FROM weekly_report WHERE hall_name = ? AND week_start = ? AND week_end = ?",
            [hall, ws, we]).fetchone()
        avg = conn.execute(
            "SELECT AVG(retention_rate) AS a FROM weekly_report WHERE hall_name != 'all' AND week_start = ? AND week_end = ?",
            [ws, we]).fetchone()['a']
        out['retention'] = {
            'rate': round(own['retention_rate'] or 0, 1) if own else None,
            'avg': round(avg or 0, 1) if avg else None,
        }

    conn.close()
    return jsonify({'week_start': ws, 'week_end': we, 'ref_date': ref, **out})


@app.route('/api/dissolve-reasons')
@login_required
def api_dissolve_reasons():
    """解散原因分布：已解散姐妹团按归一化原因统计（支持按大厅过滤）"""
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()
    ref = conn.execute('SELECT MAX(snapshot_date) AS ref FROM team_detail').fetchone()['ref']
    hall_cond = '' if hall == 'all' else 'AND hall_name = ?'
    hp = [] if hall == 'all' else [hall]
    latest_teams = 'rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)'
    rows = conn.execute(f"""
        SELECT {DISSOLVE_REASON_CASE} AS reason, COUNT(*) AS c
        FROM team_detail
        WHERE {latest_teams} AND dissolve_date IS NOT NULL AND dissolve_date != ''
          {hall_cond}
        GROUP BY reason ORDER BY c DESC
    """, hp).fetchall()
    total = sum(r['c'] for r in rows)
    reasons = [{
        'reason': r['reason'],
        'count': r['c'],
        'share': round(r['c'] / total * 100, 1) if total else 0,
    } for r in rows]
    conn.close()
    return jsonify({'ref_date': ref, 'total': total, 'reasons': reasons})


@app.route('/api/lying-flat')
@login_required
def api_lying_flat():
    """躺平预警名单：进行中团里连续多日零任务（三类任务全为0）的团，接近自动解散"""
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()
    dates = [r['snapshot_date'] for r in conn.execute('SELECT DISTINCT snapshot_date FROM team_detail ORDER BY snapshot_date').fetchall()]
    if len(dates) < 2:
        conn.close()
        return jsonify({'ref_date': dates[-1] if dates else '', 'prev_date': '', 'total': 0, 'coverage': 0, 'list': []})
    latest, prev = dates[-1], dates[-2]
    hall_cond = '' if hall == 'all' else 'AND hall_name = ?'
    hp = [] if hall == 'all' else [hall]
    active_rows = conn.execute(f"""
        SELECT team_id, hall_name, sister_nickname, sister_uid, days_since_formed
        FROM team_detail
        WHERE rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)
          AND (dissolve_date IS NULL OR dissolve_date = '')
          {hall_cond}
    """, hp).fetchall()
    # 每个团在每个快照日是否做过任意任务（同日多行取 MAX）
    tm = {}
    for r in conn.execute("""
            SELECT team_id, snapshot_date,
                   MAX(drive_task_count > 0 OR accompany_task_count > 0 OR gift_task_count > 0) AS a
            FROM team_detail GROUP BY team_id, snapshot_date
        """).fetchall():
        tm[(r['team_id'], r['snapshot_date'])] = r['a']
    lst = []
    for t in active_rows:
        tid = t['team_id']
        streak, i = 0, len(dates) - 1
        while i >= 0 and not tm.get((tid, dates[i]), 0):
            streak += 1
            i -= 1
        if streak < 1:
            continue
        lst.append({
            'team_id': tid,
            'hall_name': t['hall_name'],
            'sister_nickname': t['sister_nickname'],
            'sister_uid': t['sister_uid'],
            'days_since_formed': t['days_since_formed'],
            'zero_streak': streak,
            'last_active': dates[i] if i >= 0 else None,
            'level': 'lying' if streak >= 2 else 'warning',
        })
    lst.sort(key=lambda x: (-x['zero_streak'], x['days_since_formed'] or 0))
    cov = conn.execute("""
        SELECT COUNT(*) total, SUM(drive_task_count > 0 OR accompany_task_count > 0 OR gift_task_count > 0) a
        FROM team_detail WHERE rowid IN (SELECT MAX(rowid) FROM team_detail GROUP BY team_id)
    """).fetchone()
    coverage = round(cov['a'] / cov['total'] * 100, 1) if cov['total'] else 0
    conn.close()
    return jsonify({'ref_date': latest, 'prev_date': prev, 'total': len(lst), 'coverage': coverage, 'list': lst})


@app.route('/api/alerts-center')
@login_required
def api_alerts_center():
    """预警中心：alerts 表历史记录（支持按严重级别/处理状态过滤）"""
    severity = request.args.get('severity', 'all')
    resolved = request.args.get('resolved', 'all')  # all / 0 / 1
    limit = min(int(request.args.get('limit', 100)), 500)
    conn = get_db_conn()
    conditions, params = [], []
    if severity != 'all':
        conditions.append('severity = ?')
        params.append(severity)
    if resolved in ('0', '1'):
        conditions.append('is_resolved = ?')
        params.append(int(resolved))
    where = ('WHERE ' + ' AND '.join(conditions)) if conditions else ''
    rows = conn.execute(
        f'SELECT * FROM alerts {where} ORDER BY created_at DESC, id DESC LIMIT ?', params + [limit]
    ).fetchall()
    unresolved = conn.execute('SELECT COUNT(*) AS c FROM alerts WHERE is_resolved = 0').fetchone()['c']
    conn.close()
    return jsonify({'data': [dict(r) for r in rows], 'unresolved': unresolved})


@app.route('/api/alerts/<int:alert_id>/resolve', methods=['POST'])
@login_required
def api_alert_resolve(alert_id):
    """标记预警为已处理/未处理"""
    body = request.get_json(silent=True) or {}
    resolved = 1 if body.get('resolved', True) else 0
    conn = get_db_conn()
    conn.execute('UPDATE alerts SET is_resolved = ? WHERE id = ?', (resolved, alert_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})


@app.route('/api/daily-retention')
@login_required
def api_daily_retention():
    """返回近N周的周级留存率/解散率/新成团数（基于 weekly_report，与KPI卡片一致）"""
    weeks = int(request.args.get('weeks', 10))
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()
    cursor = conn.execute('''
        SELECT week_label, week_start, retention_rate, dissolution_rate, new_team_count
        FROM weekly_report
        WHERE hall_name = ?
        ORDER BY week_start DESC LIMIT ?
    ''', (hall, weeks))
    rows = cursor.fetchall()
    conn.close()
    
    rows = list(reversed(rows))
    dates = [r['week_label'] for r in rows]
    retention = [round(r['retention_rate'] or 0, 1) for r in rows]
    dissolution = [round(r['dissolution_rate'] or 0, 1) for r in rows]
    new_teams = [r['new_team_count'] or 0 for r in rows]
    
    return jsonify({'dates': dates, 'retention': retention, 'dissolution': dissolution, 'new_teams': new_teams})

@app.route('/api/weekly-report')
@login_required
def api_weekly_report():
    limit = request.args.get('limit', 'all')
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()
    
    if hall == 'all':
        hall_filter = "hall_name = 'all'"
        params = ()
    else:
        hall_filter = 'hall_name = ?'
        params = (hall,)
    
    if limit == 'all':
        cursor = conn.execute(f'''
            SELECT * FROM weekly_report WHERE {hall_filter}
            ORDER BY week_start
        ''', params)
    else:
        cursor = conn.execute(f'''
            SELECT * FROM weekly_report WHERE {hall_filter}
            ORDER BY week_start DESC LIMIT ?
        ''', params + (int(limit),))
    
    rows = cursor.fetchall()
    conn.close()
    
    return jsonify({'data': rows})
@app.route('/api/detail-table')
@login_required
def api_detail_table():
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 20))
    search = request.args.get('search', '')
    hall = request.args.get('hall', 'all')
    status = request.args.get('status', 'all')
    sort_field = request.args.get('sort_field', 'team_id')
    sort_order = request.args.get('sort_order', 'asc')
    
    # 允许的排序字段白名单
    allowed_fields = ['team_id', 'form_date', 'hall_name', 'days_since_formed', 
                      'sister_revenue', 'reward_amount', 'dissolve_date']
    if sort_field not in allowed_fields:
        sort_field = 'team_id'
    order_sql = 'ASC' if sort_order == 'asc' else 'DESC'
    
    conn = get_db_conn()
    
    conditions = []
    params = []
    # 只显示最新快照的数据，避免历史快照重复；同一快照内按 team_id 去重（防御重复抓取）
    conditions.append('''rowid IN (SELECT MAX(rowid) FROM team_detail
        WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail) GROUP BY team_id)''')
    if search:
        conditions.append('(sister_nickname LIKE ? OR sister_nickname2 LIKE ? OR CAST(team_id AS TEXT) LIKE ? OR hall_name LIKE ?)')
        params = [f'%{search}%', f'%{search}%', f'%{search}%', f'%{search}%']
    if hall != 'all':
        conditions.append('hall_name = ?')
        params.append(hall)
    if status == 'active':
        conditions.append("(dissolve_date = '' OR dissolve_date IS NULL)")
    elif status == 'dissolved':
        conditions.append("dissolve_date != '' AND dissolve_date IS NOT NULL")
    
    where_clause = 'WHERE ' + ' AND '.join(conditions) if conditions else ''
    
    cursor = conn.execute(f'SELECT COUNT(*) as total FROM team_detail {where_clause}', params)
    total = cursor.fetchone()['total']
    
    offset = (page - 1) * per_page
    cursor = conn.execute(f'SELECT * FROM team_detail {where_clause} ORDER BY {sort_field} {order_sql} LIMIT ? OFFSET ?', params + [per_page, offset])
    rows = cursor.fetchall()
    conn.close()
    
    return jsonify({
        'data': rows,
        'total': total,
        'page': page,
        'per_page': per_page
    })
@app.route('/api/hall-stats')
@login_required
def api_hall_stats():
    limit = int(request.args.get('limit', 10))
    hall = request.args.get('hall', '')
    
    user_uid = request.cookies.get('auth_uid')
    conn = get_db_conn()
    cursor = conn.execute('SELECT role FROM users WHERE uid = ?', (user_uid,))
    user = cursor.fetchone()
    role = user['role'] if user else 'admin'
    
    if role == 'admin' or hall == 'all':
        # 管理员或显式请求所有大厅
        cursor = conn.execute(
            "SELECT hall_name, team_count, active_count, dissolved_count, total_revenue "
            "FROM hall_stats "
            "WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM hall_stats) "
            "ORDER BY team_count DESC LIMIT ?",
            (limit,)
        )
    else:
        # 厅运营：只返回管理的厅
        managed = [r['hall_name'] for r in conn.execute(
            'SELECT hall_name FROM hall_managers WHERE uid = ?', (user_uid,)
        ).fetchall()]
        if managed:
            placeholders = ','.join('?' * len(managed))
            cursor = conn.execute(
                f"SELECT hall_name, team_count, active_count, dissolved_count, total_revenue "
                f"FROM hall_stats "
                f"WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM hall_stats) "
                f"AND hall_name IN ({placeholders}) "
                f"ORDER BY team_count DESC",
                tuple(managed)
            )
        else:
            cursor = conn.execute(
                "SELECT hall_name, team_count, active_count, dissolved_count, total_revenue "
                "FROM hall_stats WHERE 1=0"
            )
    
    rows = cursor.fetchall()
    conn.close()
    
    return jsonify({'data': rows})
@login_required
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
@login_required
def api_alerts():
    """动态生成预警列表，支持按指定周或最近3周对比"""
    week = request.args.get('week', '')
    conn = get_db_conn()
    
    if week and '|' in week:
        ws, we = week.split('|')
        # 查询指定周
        cursor = conn.execute('''
            SELECT week_label, week_start, week_end, new_team_count, active_team_count_end,
                   dissolved_count, active_dissolved_count, retention_rate, dissolution_rate,
                   total_reward, activity_index
            FROM weekly_report WHERE hall_name = 'all' AND week_start = ? AND week_end = ?
        ''', (ws, we))
        this_week = cursor.fetchone()
        if not this_week:
            conn.close()
            return jsonify({'data': []})
        # 查询前两周（用于环比和连续趋势）
        cursor = conn.execute('''
            SELECT week_label, week_start, week_end, new_team_count, active_team_count_end,
                   dissolved_count, active_dissolved_count, retention_rate, dissolution_rate,
                   total_reward, activity_index
            FROM weekly_report WHERE hall_name = 'all' AND week_end < ?
            ORDER BY week_end DESC LIMIT 2
        ''', (ws,))
        prev_rows = cursor.fetchall()
        conn.close()
        rows = [this_week] + list(prev_rows)
    else:
        cursor = conn.execute('''
            SELECT week_label, week_start, week_end, new_team_count, active_team_count_end,
                   dissolved_count, active_dissolved_count, retention_rate, dissolution_rate,
                   total_reward, activity_index
            FROM weekly_report WHERE hall_name = 'all'
            ORDER BY week_start DESC LIMIT 3
        ''')
        rows = cursor.fetchall()
        conn.close()
    
    alerts = []
    if len(rows) < 2:
        return jsonify({'data': alerts})
    
    this_week = rows[0]
    last_week = rows[1]
    week_label = this_week['week_label']
    
    # 环比计算
    new_team_change = 0
    if last_week['new_team_count'] and last_week['new_team_count'] > 0:
        new_team_change = (this_week['new_team_count'] - last_week['new_team_count']) / last_week['new_team_count'] * 100
    
    diss_change = 0
    if last_week['dissolved_count'] and last_week['dissolved_count'] > 0:
        diss_change = (this_week['dissolved_count'] - last_week['dissolved_count']) / last_week['dissolved_count'] * 100
    
    revenue_change = 0
    if last_week['total_reward'] and last_week['total_reward'] > 0:
        revenue_change = (this_week['total_reward'] - last_week['total_reward']) / last_week['total_reward'] * 100
    
    # 1. 新成团数骤降 (>30%)
    if new_team_change < -30:
        alerts.append({
            'severity': 'high',
            'title': '新成团数骤降',
            'message': f'本周新成团{this_week["new_team_count"]}个，环比下降{abs(new_team_change):.1f}%',
            'metric_value': f'{this_week["new_team_count"]}个',
            'week_label': week_label,
            'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        })
    
    # 2. 解散数突增 (>20%)
    if diss_change > 20:
        alerts.append({
            'severity': 'high',
            'title': '解散率突增',
            'message': f'本周解散{this_week["dissolved_count"]}个，环比上升{diss_change:.1f}%',
            'metric_value': f'{this_week["dissolved_count"]}个',
            'week_label': week_label,
            'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        })
    
    # 3. 流水大幅下降 (>25%)
    if revenue_change < -25:
        alerts.append({
            'severity': 'high',
            'title': '流水大幅下降',
            'message': f'本周流水¥{this_week["total_reward"]:.0f}，环比下降{abs(revenue_change):.1f}%',
            'metric_value': f'¥{this_week["total_reward"]:.0f}',
            'week_label': week_label,
            'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        })
    
    # 4. 新成团数连续下降（需要3周数据）
    if len(rows) >= 3:
        week3 = rows[2]
        if this_week['new_team_count'] < last_week['new_team_count'] < week3['new_team_count']:
            alerts.append({
                'severity': 'medium',
                'title': '新成团数连续下降',
                'message': f'连续2周下降：{week3["new_team_count"]} → {last_week["new_team_count"]} → {this_week["new_team_count"]}',
                'metric_value': f'{this_week["new_team_count"]}个',
                'week_label': week_label,
                'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            })
    
    # 5. 解散率连续上升（需要3周数据）
    if len(rows) >= 3:
        week3 = rows[2]
        if this_week['dissolution_rate'] > last_week['dissolution_rate'] > week3['dissolution_rate']:
            alerts.append({
                'severity': 'medium',
                'title': '解散率连续上升',
                'message': f'连续2周上升：{week3["dissolution_rate"]:.1f}% → {last_week["dissolution_rate"]:.1f}% → {this_week["dissolution_rate"]:.1f}%',
                'metric_value': f'{this_week["dissolution_rate"]:.1f}%',
                'week_label': week_label,
                'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            })
    
    # 无预警时显示正常
    if not alerts:
        alerts.append({
            'severity': 'low',
            'title': '本周运营正常',
            'message': '核心指标无异常波动',
            'metric_value': '—',
            'week_label': week_label,
            'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        })
    
    return jsonify({'data': alerts})

@app.route('/api/export/weekly')
@login_required
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
    writer.writerow(['周标签', '开始日期', '结束日期', '新成团数', '进行中团数', '解散数', '留存率(%)', '解散率(%)', '礼物奖励金额(元)', '活跃度'])
    for r in rows:
        writer.writerow([r['week_label'], r['week_start'], r['week_end'], r['new_team_count'],
                         r['active_team_count_end'], r['dissolved_count'], r['retention_rate'],
                         r['dissolution_rate'], r['total_reward'], r['activity_index']])
    
    csv_bytes = output.getvalue().encode('utf-8-sig')
    return Response(csv_bytes, mimetype='text/csv; charset=utf-8-sig',
                    headers={'Content-Disposition': 'attachment; filename=weekly_report.csv'})


@app.route('/api/export/pdf-report')
@login_required
def api_export_pdf_report():
    """导出周报概览+核心趋势+预警PDF报表"""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.graphics.shapes import Drawing, Line, String, Rect
    from reportlab.graphics.charts.linecharts import HorizontalLineChart
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics import renderPDF
    import io, os
    
    week = request.args.get('week', '')
    conn = get_db_conn()
    
    # 查询周报数据
    if week and '|' in week:
        ws, we = week.split('|')
        cursor = conn.execute('''
            SELECT week_label, week_start, week_end, new_team_count, active_team_count_start, active_team_count_end,
                   dissolved_count, active_dissolved_count, retention_rate, dissolution_rate,
                   total_reward, activity_index
            FROM weekly_report WHERE hall_name = 'all' AND week_start = ? AND week_end = ?
        ''', (ws, we))
        week_row = cursor.fetchone()
        # 前两周（用于环比和连续趋势）
        cursor = conn.execute('''
            SELECT week_label, week_start, week_end, new_team_count, active_team_count_start, active_team_count_end,
                   dissolved_count, retention_rate, dissolution_rate, total_reward, activity_index
            FROM weekly_report WHERE hall_name = 'all' AND week_end < ?
            ORDER BY week_end DESC LIMIT 2
        ''', (ws,))
        prev_rows = cursor.fetchall()
        prev_row = prev_rows[0] if prev_rows else None
        week3_row = prev_rows[1] if len(prev_rows) > 1 else None
    else:
        cursor = conn.execute('''
            SELECT week_label, week_start, week_end, new_team_count, active_team_count_start, active_team_count_end,
                   dissolved_count, retention_rate, dissolution_rate, total_reward, activity_index
            FROM weekly_report WHERE hall_name = 'all'
            ORDER BY week_start DESC LIMIT 3
        ''')
        rows = cursor.fetchall()
        week_row = rows[0] if rows else None
        prev_row = rows[1] if len(rows) > 1 else None
        week3_row = rows[2] if len(rows) > 2 else None
    
    # 查询近12周趋势数据（用于图表）
    cursor = conn.execute('''
        SELECT week_label, new_team_count, active_team_count_end, dissolved_count,
               retention_rate, dissolution_rate, total_reward, activity_index
        FROM weekly_report WHERE hall_name = 'all'
        ORDER BY week_start DESC LIMIT 12
    ''')
    trend_rows = list(cursor.fetchall())
    trend_rows.reverse()  # 从早到晚
    conn.close()
    
    # PDF生成
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            rightMargin=40, leftMargin=40,
                            topMargin=40, bottomMargin=30)
    styles = getSampleStyleSheet()
    story = []
    
    # 注册中文字体
    font_name = 'Helvetica'
    for fp, subidx in [('C:/Windows/Fonts/simhei.ttf', None), ('C:/Windows/Fonts/msyh.ttc', 0), ('C:/Windows/Fonts/simsun.ttc', 0)]:
        if os.path.exists(fp):
            try:
                if subidx is not None:
                    pdfmetrics.registerFont(TTFont('CN', fp, subfontIndex=subidx))
                else:
                    pdfmetrics.registerFont(TTFont('CN', fp))
                font_name = 'CN'
                break
            except Exception:
                pass
    
    # 设置所有样式字体
    for style_name in ['Heading1', 'Heading2', 'Heading3', 'Normal', 'BodyText']:
        if style_name in styles:
            styles[style_name].fontName = font_name
    
    # ===== 标题区 =====
    title_style = styles['Heading1']
    story.append(Paragraph('姐妹团数据统计报表', title_style))
    if week_row:
        story.append(Paragraph(f"统计周期：{week_row['week_start']} ~ {week_row['week_end']} ({week_row['week_label']})", styles['Normal']))
    story.append(Paragraph(f"生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
    story.append(Spacer(1, 12))
    
    # ===== 一、KPI概览 =====
    story.append(Paragraph('一、周报概览（KPI）', styles['Heading2']))
    if week_row:
        def calc_pct(curr, prev):
            if not prev or prev == 0: return '—'
            return f"{round((curr - prev) / prev * 100, 1)}%"
        
        # 使用修正后的留存率公式
        def calc_retention(row):
            if not row: return 0
            start = row.get('active_team_count_start', 0) or 0
            end = row.get('active_team_count_end', 0) or 0
            new = row.get('new_team_count', 0) or 0
            if start <= 0: return 0
            return min(100, round((end - new) / start * 100, 2))
        
        this_ret = calc_retention(week_row)
        prev_ret = calc_retention(prev_row)
        
        kpi_data = [
            ['指标', '本周值', '上周值', '环比变化'],
            ['新成团数', week_row['new_team_count'], prev_row['new_team_count'] if prev_row else '—', calc_pct(week_row['new_team_count'], prev_row['new_team_count'] if prev_row else None)],
            ['进行中姐妹团', week_row['active_team_count_end'], prev_row['active_team_count_end'] if prev_row else '—', calc_pct(week_row['active_team_count_end'], prev_row['active_team_count_end'] if prev_row else None)],
            ['留存率(%)', this_ret, prev_ret if prev_row else '—', f"{round(this_ret - prev_ret, 1)}%" if prev_row else '—'],
            ['解散率(%)', week_row['dissolution_rate'], prev_row['dissolution_rate'] if prev_row else '—', calc_pct(week_row['dissolution_rate'], prev_row['dissolution_rate'] if prev_row else None)],
            ['礼物奖励金额(元)', round(week_row['total_reward'], 1), round(prev_row['total_reward'], 1) if prev_row else '—', calc_pct(week_row['total_reward'], prev_row['total_reward'] if prev_row else None)],
            ['活跃度', week_row['activity_index'], prev_row['activity_index'] if prev_row else '—', calc_pct(week_row['activity_index'], prev_row['activity_index'] if prev_row else None)],
        ]
        table = Table(kpi_data, colWidths=[110, 90, 90, 90])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#667eea')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, -1), font_name),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
        ]))
        story.append(table)
    story.append(Spacer(1, 16))
    
    # ===== 二、本周预警 =====
    story.append(Paragraph('二、本周预警', styles['Heading2']))
    if week_row and prev_row:
        alerts = []
        nt_change = 0
        if prev_row['new_team_count'] and prev_row['new_team_count'] > 0:
            nt_change = (week_row['new_team_count'] - prev_row['new_team_count']) / prev_row['new_team_count'] * 100
        diss_change = 0
        if prev_row['dissolved_count'] and prev_row['dissolved_count'] > 0:
            diss_change = (week_row['dissolved_count'] - prev_row['dissolved_count']) / prev_row['dissolved_count'] * 100
        rev_change = 0
        if prev_row['total_reward'] and prev_row['total_reward'] > 0:
            rev_change = (week_row['total_reward'] - prev_row['total_reward']) / prev_row['total_reward'] * 100
        
        if nt_change < -30:
            alerts.append(['🔴 高', '新成团数骤降', f"本周新成团{week_row['new_team_count']}个，环比下降{abs(nt_change):.1f}%"])
        if diss_change > 20:
            alerts.append(['🔴 高', '解散率突增', f"本周解散{week_row['dissolved_count']}个，环比上升{diss_change:.1f}%"])
        if rev_change < -25:
            alerts.append(['🔴 高', '流水大幅下降', f"本周流水¥{week_row['total_reward']:.0f}，环比下降{abs(rev_change):.1f}%"])
        if week3_row:
            if week_row['new_team_count'] < prev_row['new_team_count'] < week3_row['new_team_count']:
                alerts.append(['🟡 中', '新成团数连续下降', f"连续2周下降：{week3_row['new_team_count']} → {prev_row['new_team_count']} → {week_row['new_team_count']}"])
            if week_row['dissolution_rate'] > prev_row['dissolution_rate'] > week3_row['dissolution_rate']:
                alerts.append(['🟡 中', '解散率连续上升', f"连续2周上升：{week3_row['dissolution_rate']:.1f}% → {prev_row['dissolution_rate']:.1f}% → {week_row['dissolution_rate']:.1f}%"])
        if not alerts:
            alerts.append(['🟢 低', '本周运营正常', '核心指标无异常波动'])
        
        alert_data = [['严重程度', '预警项', '详情']]
        for a in alerts:
            alert_data.append(a)
        table = Table(alert_data, colWidths=[60, 110, 260])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#ff4d4f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, -1), font_name),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(table)
    story.append(Spacer(1, 16))
    
    # ===== 三、趋势图表 =====
    if len(trend_rows) >= 2:
        story.append(Paragraph('三、核心趋势图表', styles['Heading2']))
        
        # 1. 新成团数趋势图（柱状图）
        story.append(Paragraph('1. 新成团数趋势', styles['Heading3']))
        labels = [r['week_label'] for r in trend_rows]
        values = [r['new_team_count'] for r in trend_rows]
        
        drawing = Drawing(460, 160)
        bc = VerticalBarChart()
        bc.x = 40
        bc.y = 30
        bc.height = 110
        bc.width = 380
        bc.data = [values]
        bc.categoryAxis.categoryNames = labels
        bc.categoryAxis.labels.fontName = font_name
        bc.categoryAxis.labels.fontSize = 7
        bc.valueAxis.valueMin = 0
        bc.bars[0].fillColor = colors.HexColor('#667eea')
        drawing.add(bc)
        story.append(drawing)
        story.append(Spacer(1, 8))
        
        # 2. 留存率 & 解散率趋势图（双折线）
        story.append(Paragraph('2. 留存率 & 解散率趋势', styles['Heading3']))
        ret_values = [r['retention_rate'] for r in trend_rows]
        diss_values = [r['dissolution_rate'] for r in trend_rows]
        
        drawing2 = Drawing(460, 160)
        lc = HorizontalLineChart()
        lc.x = 40
        lc.y = 30
        lc.height = 110
        lc.width = 380
        lc.data = [ret_values, diss_values]
        lc.categoryAxis.categoryNames = labels
        lc.categoryAxis.labels.fontName = font_name
        lc.categoryAxis.labels.fontSize = 7
        lc.lines[0].strokeColor = colors.HexColor('#52c41a')
        lc.lines[1].strokeColor = colors.HexColor('#ff4d4f')
        drawing2.add(lc)
        story.append(drawing2)
        story.append(Spacer(1, 8))
        
        # 3. 礼物奖励金额趋势图（柱状图）
        story.append(Paragraph('3. 礼物奖励金额趋势', styles['Heading3']))
        rev_values = [round(r['total_reward'], 1) for r in trend_rows]
        
        drawing3 = Drawing(460, 160)
        bc2 = VerticalBarChart()
        bc2.x = 40
        bc2.y = 30
        bc2.height = 110
        bc2.width = 380
        bc2.data = [rev_values]
        bc2.categoryAxis.categoryNames = labels
        bc2.categoryAxis.labels.fontName = font_name
        bc2.categoryAxis.labels.fontSize = 7
        bc2.valueAxis.valueMin = 0
        bc2.bars[0].fillColor = colors.HexColor('#faad14')
        drawing3.add(bc2)
        story.append(drawing3)
        story.append(Spacer(1, 8))
    
    # ===== 四、核心趋势明细表 =====
    story.append(Paragraph('四、核心趋势明细（近12周）', styles['Heading2']))
    if trend_rows:
        trend_data = [['周期', '新成团', '进行中', '解散', '留存率%', '解散率%', '礼物奖励金额', '活跃度']]
        for r in trend_rows:
            trend_data.append([r['week_label'], r['new_team_count'], r['active_team_count_end'], r['dissolved_count'],
                               r['retention_rate'], r['dissolution_rate'], round(r['total_reward'], 1), r['activity_index']])
        table = Table(trend_data)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#667eea')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, -1), font_name),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
        ]))
        story.append(table)
    
    doc.build(story)
    pdf_bytes = buf.getvalue()
    buf.close()
    return Response(pdf_bytes, mimetype='application/pdf',
                    headers={'Content-Disposition': 'attachment; filename=sister_report.pdf'})
@app.route('/api/export/detail')
@login_required
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

def _get_team_info_by_uid(uid: str, team_id: str = None) -> dict:
    """从 team_detail 表查询 UID 所在的姐妹团信息
    team_id: 如果提供了 team_id，则精确匹配该团
    """
    try:
        conn = get_db_conn()
        if team_id:
            # 精确匹配团ID（从明细表跳转时使用）
            cursor = conn.execute('''
                SELECT team_id, form_date, hall_name,
                       sister_nickname, sister_uid,
                       sister_nickname2, sister_uid2,
                       sister_revenue, reward_amount, dissolve_date
                FROM team_detail
                WHERE team_id = ?
                  AND snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                LIMIT 1
            ''', (team_id,))
        else:
            # 模糊匹配：返回最新快照中包含该UID的团
            cursor = conn.execute('''
                SELECT team_id, form_date, hall_name,
                       sister_nickname, sister_uid,
                       sister_nickname2, sister_uid2,
                       sister_revenue, reward_amount, dissolve_date
                FROM team_detail
                WHERE (sister_uid = ? OR sister_uid2 = ?)
                  AND snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                ORDER BY form_date DESC LIMIT 1
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


def _get_bound_sisters(uid: str) -> list:
    """
    获取某UID作为姐姐时绑定的所有妹妹。
    一个姐姐可能同时绑定多个妹妹（多对姐妹团）。
    """
    try:
        conn = get_db_conn()
        cursor = conn.execute('''
            SELECT team_id, form_date, hall_name,
                   sister_nickname, sister_uid,
                   sister_nickname2, sister_uid2,
                   sister_revenue, reward_amount, dissolve_date
            FROM team_detail
            WHERE sister_uid = ?
              AND snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
              AND (dissolve_date = '' OR dissolve_date IS NULL)
            ORDER BY form_date DESC
        ''', (uid,))
        rows = cursor.fetchall()
        conn.close()
        sisters = []
        seen_uids = set()
        for row in rows:
            sister_uid2 = row['sister_uid2']
            if not sister_uid2 or sister_uid2 in seen_uids:
                continue
            seen_uids.add(sister_uid2)
            sisters.append({
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
            })
        return sisters
    except Exception as e:
        print(f'[WARN] 查询绑定妹妹失败: {e}')
    return []


@app.route('/api/uid-query', methods=['POST'])
@login_required
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

    # 先查询本地姐妹团信息（用于用团总流水覆盖个人累计流水）
    team_id = body.get('team_id')
    team_info = _get_team_info_by_uid(uid, team_id)

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
                    'hint': '请在页面右上角「Cookie 管理」中更新 UID 查询 Cookie（保存后立即生效，无需重启）',
                    'suggest_mock': True
                }), 503
            if '无法连接' in error_msg or 'ConnectionError' in error_msg:
                return jsonify({
                    'error': error_msg,
                    'hint': '请确认已连接内网/VPN',
                    'suggest_mock': True
                }), 503
            return jsonify({'error': error_msg}), 500

    # 附加姐妹团信息
    if team_info:
        result['team_info'] = team_info

    # 查询绑定的妹妹（如果该UID是姐姐）
    bound_teams = _get_bound_sisters(uid)
    if bound_teams:
        result['bound_sisters'] = []
        for team in bound_teams:
            sister_uid = team.get('sister_uid2')
            sister_nickname = team.get('sister_nickname2', '')
            if not sister_uid:
                continue
            # 尝试查询妹妹的 UID 数据
            sister_data = None
            if _uid_crawler_available and not use_mock:
                try:
                    c = UIDCrawler()
                    sister_data = c.query_with_compare(str(sister_uid), captain_type)
                except Exception as e:
                    print(f'[WARN] 查询妹妹UID {sister_uid} 失败: {e}')
            result['bound_sisters'].append({
                'uid': sister_uid,
                'nickname': sister_nickname,
                'team_info': team,
                'uid_data': sister_data,
            })

    # 计算姐妹团累计流水 = 姐姐累计 + 所有绑定妹妹累计（数据来源 server1.tuwan.com:10010）
    team_total_revenue = 0.0
    crawled_uids = set()

    # 1. 当前查询UID的累计流水
    if result.get('this_week', {}).get('data', {}).get('total_revenue'):
        team_total_revenue += float(result['this_week']['data']['total_revenue'])
        crawled_uids.add(uid)

    # 2. 绑定妹妹的累计流水（当前UID是姐姐的情况）
    if result.get('bound_sisters'):
        for sister in result['bound_sisters']:
            s_uid = str(sister.get('uid', ''))
            if s_uid in crawled_uids:
                continue
            crawled_uids.add(s_uid)
            sister_uid_data = sister.get('uid_data', {})
            if sister_uid_data and sister_uid_data.get('this_week', {}).get('data', {}).get('total_revenue'):
                team_total_revenue += float(sister_uid_data['this_week']['data']['total_revenue'])

    # 3. 如果当前UID是妹妹，额外查询姐姐的累计流水
    if team_info and str(team_info.get('sister_uid2')) == uid:
        captain_uid = team_info.get('sister_uid')
        if captain_uid and str(captain_uid) not in crawled_uids and _uid_crawler_available and not use_mock:
            try:
                c = UIDCrawler()
                captain_data = c.query_with_compare(str(captain_uid), captain_type)
                if captain_data.get('this_week', {}).get('data', {}).get('total_revenue'):
                    team_total_revenue += float(captain_data['this_week']['data']['total_revenue'])
                    print(f'[UID-API] 妹妹视角: 追加姐姐UID {captain_uid} 累计流水')
            except Exception as e:
                print(f'[WARN] 查询姐姐UID {captain_uid} 失败: {e}')

    result['team_total_revenue'] = round(team_total_revenue, 2)

    return jsonify(result)
@app.route('/api/uid-query/types')
@login_required
def api_uid_types():
    """返回支持的UID查询类型分类"""
    return jsonify({'types': [
        {'key': 'game', 'label': '新队长-游戏'},
        {'key': 'karaoke', 'label': '新队长-歌房'},
        {'key': 'werewolf', 'label': '新队长-狼人杀'},
        {'key': 'live', 'label': '实时-乐园杀'},
    ]})


# ═══════════════════════════════════════════════════════
#  登录鉴权接口
# ═══════════════════════════════════════════════════════

def generate_captcha_code(length=4):
    """生成随机字母验证码"""
    letters = string.ascii_uppercase + string.digits
    return ''.join(random.choices(letters, k=length))

def generate_captcha_image(code):
    """生成验证码图片，返回 base64 字符串"""
    width, height = 120, 44
    img = Image.new('RGB', (width, height), color=(31, 31, 31))
    draw = ImageDraw.Draw(img)

    # 绘制干扰线
    for _ in range(5):
        x1, y1 = random.randint(0, width), random.randint(0, height)
        x2, y2 = random.randint(0, width), random.randint(0, height)
        draw.line([(x1, y1), (x2, y2)], fill=(80, 80, 80), width=1)

    # 绘制干扰点
    for _ in range(30):
        x, y = random.randint(0, width), random.randint(0, height)
        draw.point((x, y), fill=(100, 100, 100))

    # 绘制文字
    font_paths = [
        'C:/Windows/Fonts/arialbd.ttf',
        'C:/Windows/Fonts/arial.ttf',
    ]
    font = None
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                font = ImageFont.truetype(fp, 26)
                break
            except Exception:
                pass
    if font is None:
        font = ImageFont.load_default()

    # 每个字符 slightly different position
    for i, ch in enumerate(code):
        x = 15 + i * 24 + random.randint(-3, 3)
        y = 8 + random.randint(-4, 4)
        # 随机颜色（亮色）
        color = random.choice([
            (167, 139, 250),  # 紫
            (96, 165, 250),   # 蓝
            (250, 204, 21),   # 黄
            (251, 146, 60),   # 橙
        ])
        draw.text((x, y), ch, font=font, fill=color)

    # 输出 base64
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode('utf-8')


@app.route('/api/captcha', methods=['GET'])
def api_captcha():
    """获取验证码图片"""
    code = generate_captcha_code(4)
    session['captcha_code'] = code
    session.permanent = True
    img_b64 = generate_captcha_image(code)
    return jsonify({
        'image': f'data:image/png;base64,{img_b64}',
        'length': len(code)
    })


@app.route('/api/login', methods=['POST'])
def api_login():
    """登录：验证 UID 白名单 + 验证码"""
    body = request.get_json() or {}
    uid = str(body.get('uid', '')).strip()
    captcha = str(body.get('captcha', '')).strip().upper()

    if not uid:
        return jsonify({'error': 'UID 不能为空'}), 400
    if not captcha:
        return jsonify({'error': '验证码不能为空'}), 400

    # 验证码校验（不区分大小写）
    expected = (session.get('captcha_code') or '').upper()
    if not expected or captcha != expected:
        return jsonify({'error': '验证码错误'}), 401

    # 白名单校验
    conn = get_db_conn()
    cursor = conn.execute('SELECT uid, nickname, role FROM users WHERE uid = ?', (uid,))
    user = cursor.fetchone()
    conn.close()

    if not user:
        return jsonify({'error': '该 UID 不在白名单中，请联系管理员添加'}), 403

    # 设置 Cookie，7 天有效期
    resp = jsonify({
        'success': True,
        'uid': user['uid'],
        'nickname': user['nickname'],
        'role': user['role']
    })
    expires = datetime.now() + timedelta(days=7)
    resp.set_cookie(
        'auth_uid', user['uid'],
        expires=expires,
        httponly=True,
        samesite='Lax',
        path='/'
    )
    return resp


@app.route('/api/logout', methods=['POST'])
def api_logout():
    """退出登录，清除 Cookie"""
    resp = jsonify({'success': True})
    resp.set_cookie('auth_uid', '', expires=0, path='/')
    session.pop('captcha_code', None)
    return resp


@app.route('/logout', methods=['GET'])
def page_logout():
    """页面级退出：清除 Cookie 并重定向到登录页"""
    resp = send_from_directory(os.path.join(PROJECT_ROOT, 'frontend'), 'login.html')
    resp.set_cookie('auth_uid', '', expires=0, path='/')
    session.pop('captcha_code', None)
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return resp


@app.route('/api/check-auth', methods=['GET'])
def api_check_auth():
    """检查登录状态"""
    uid = request.cookies.get('auth_uid')
    if not uid:
        return jsonify({'logged_in': False}), 200

    conn = get_db_conn()
    cursor = conn.execute('SELECT uid, nickname, role FROM users WHERE uid = ?', (uid,))
    user = cursor.fetchone()
    conn.close()

    if not user:
        resp = jsonify({'logged_in': False})
        resp.set_cookie('auth_uid', '', expires=0, path='/')
        return resp

    return jsonify({
        'logged_in': True,
        'uid': user['uid'],
        'nickname': user['nickname'],
        'role': user['role']
    })


# ═══════════════════════════════════════════════════════
#  Cookie 管理接口


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
@login_required
def api_cookie_get():
    """获取 UID 查询 Cookie 状态"""
    return jsonify(_check_cookie_status(COOKIE_FILE_UID, ['PHPSESSID', 'DedeUserID']))


@app.route('/api/cookie', methods=['POST'])
@login_required
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
@login_required
def api_cookie_bigdata_get():
    """获取 bigdata 抓取 Cookie 状态"""
    return jsonify(_check_cookie_status(COOKIE_FILE_BIGDATA, ['PHPSESSID', 'Tuwan_Passport']))


@app.route('/api/cookie/bigdata', methods=['POST'])
@login_required
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
@login_required
def api_last_update():
    """返回上次数据更新时间"""
    try:
        with open(os.path.join(PROJECT_ROOT, 'data', 'last_update.json'), 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify(data)
    except Exception:
        return jsonify({'last_update': '从未更新', 'status': 'unknown'})


@app.route('/api/keepalive-status')
@login_required
def api_keepalive_status():
    """Cookie 保活状态（由后台保活线程每30分钟写入）"""
    try:
        with open(os.path.join(PROJECT_ROOT, 'data', 'keepalive_status.json'), 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    except Exception:
        return jsonify({'last_run': None, 'uid': None, 'bigdata': None})

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


# 全局响应拦截：所有响应强制禁用浏览器缓存
@app.after_request
def add_no_cache_headers(response):
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
