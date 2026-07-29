import re

path = r'D:\姐妹团看板系统\backend\app.py'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. 删除重复的空行+@app.route('/api/kpi')
# 找到第一个 @app.route('/api/kpi')，如果下一行还是 @app.route('/api/kpi') 就删除前一个
for i in range(len(lines) - 1):
    if lines[i].strip() == "@app.route('/api/kpi')" and lines[i+1].strip() == "@app.route('/api/kpi')":
        del lines[i]  # 删除第一个重复的
        break

# 重新读入为字符串
text = ''.join(lines)

# 2. 替换整个 api_kpi 函数
old_kpi = '''@app.route('/api/kpi')
def api_kpi():
    """KPI概览数据（8项核心指标）"""
    conn = get_db_conn()
    
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
        'retention':     {'value': this_week['retention_rate'],  'change': round(this_week['retention_rate'] - last_week['retention_rate'], 2),    'unit': '%'},
        'dissolution':   {'value': this_week['dissolution_rate'],'change': round(this_week['dissolution_rate'] - last_week['dissolution_rate'], 2),  'unit': '%', 'reverse': True},
        'revenue':       {'value': round(this_week['total_reward'], 1), 'change': calc_pct(this_week['total_reward'], last_week['total_reward']), 'unit': '元'},
        'activity':      {'value': this_week['activity_index'],  'change': round(this_week['activity_index'] - last_week['activity_index'], 2),     'unit': ''},
        'achievement':   {'value': round(today_achieve_rate, 1), 'change': round(today_achieve_rate - yesterday_achieve_rate, 2),                    'unit': '%'},
        'active_dissolved_pct': {'value': round(today_active_pct, 1), 'change': round(today_active_pct - yesterday_active_pct, 2), 'unit': '%', 'reverse': True},
    }
    
    return jsonify({'data': kpis, 'date': today['cycle'], 'week': this_week['week_label']})'''

new_kpi = '''@app.route('/api/kpi')
def api_kpi():
    """KPI概览数据（8项核心指标），支持按大厅过滤"""
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()

    if hall == 'all':
        cursor = conn.execute("""
            SELECT cycle, new_team_count, active_team_count, dissolved_count, active_dissolved_count,
                   reward_amount, level_achievement_count, revenue_achievement_count
            FROM stats_daily WHERE hall_name = '全部' ORDER BY cycle DESC LIMIT 2
        """)
        daily_rows = cursor.fetchall()

        cursor = conn.execute("""
            SELECT week_label, retention_rate, dissolution_rate, total_reward, activity_index
            FROM weekly_report WHERE hall_name = 'all' ORDER BY week_start DESC LIMIT 2
        """)
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
            'retention':     {'value': this_week['retention_rate'],  'change': round(this_week['retention_rate'] - last_week['retention_rate'], 2),    'unit': '%'},
            'dissolution':   {'value': this_week['dissolution_rate'],'change': round(this_week['dissolution_rate'] - last_week['dissolution_rate'], 2),  'unit': '%', 'reverse': True},
            'revenue':       {'value': round(this_week['total_reward'], 1), 'change': calc_pct(this_week['total_reward'], last_week['total_reward']), 'unit': '元'},
            'activity':      {'value': this_week['activity_index'],  'change': round(this_week['activity_index'] - last_week['activity_index'], 2),     'unit': ''},
            'achievement':   {'value': round(today_achieve_rate, 1), 'change': round(today_achieve_rate - yesterday_achieve_rate, 2),                    'unit': '%'},
            'active_dissolved_pct': {'value': round(today_active_pct, 1), 'change': round(today_active_pct - yesterday_active_pct, 2), 'unit': '%', 'reverse': True},
        }
        return jsonify({'data': kpis, 'date': today['cycle'], 'week': this_week['week_label']})

    else:
        # 具体大厅：从 team_detail 实时聚合（无环比）
        from datetime import datetime, timedelta
        snapshot = conn.execute(
            "SELECT MAX(snapshot_date) as max_date FROM team_detail"
        ).fetchone()['max_date']
        if not snapshot:
            conn.close()
            return jsonify({'error': '该大厅暂无数据'}), 404

        cur = conn.execute("""
            SELECT
                COUNT(*) as team_count,
                SUM(CASE WHEN COALESCE(dissolve_date, '') = '' THEN 1 ELSE 0 END) as active_count,
                SUM(CASE WHEN COALESCE(dissolve_date, '') != '' THEN 1 ELSE 0 END) as dissolved_count,
                SUM(sister_revenue) as total_revenue,
                SUM(reward_amount) as total_reward
            FROM team_detail
            WHERE snapshot_date = ? AND hall_name = ?
        """, (snapshot, hall))
        row = cur.fetchone()

        week_ago = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        cur2 = conn.execute("""
            SELECT COUNT(*) as new_count FROM team_detail
            WHERE snapshot_date = ? AND hall_name = ? AND form_date >= ?
        """, (snapshot, hall, week_ago))
        new_count = cur2.fetchone()['new_count'] or 0
        conn.close()

        kpis = {
            'new_team':      {'value': new_count,                  'change': 0, 'unit': '个'},
            'active_team':   {'value': row['active_count'] or 0,   'change': 0, 'unit': '个'},
            'retention':     {'value': 0,                          'change': 0, 'unit': '%'},
            'dissolution':   {'value': 0,                          'change': 0, 'unit': '%', 'reverse': True},
            'revenue':       {'value': round(row['total_revenue'] or 0, 1), 'change': 0, 'unit': '元'},
            'activity':      {'value': 0,                          'change': 0, 'unit': ''},
            'achievement':   {'value': 0,                          'change': 0, 'unit': '%'},
            'active_dissolved_pct': {'value': 0,                   'change': 0, 'unit': '%', 'reverse': True},
        }
        return jsonify({'data': kpis, 'date': snapshot, 'week': hall})'''

text = text.replace(old_kpi, new_kpi)

# 3. 修改 detail-table 支持 hall 参数
old_detail = '''@app.route('/api/detail-table')
def api_detail_table():
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', 20))
    search = request.args.get('search', '')
    
    conn = get_db_conn()
    
    where_clause = ''
    params = []
    if search:
        where_clause = 'WHERE sister_nickname LIKE ? OR sister_nickname2 LIKE ? OR CAST(team_id AS TEXT) LIKE ?'
        params = [f'%{search}%', f'%{search}%', f'%{search}%']
    
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
    })'''

new_detail = '''@app.route('/api/detail-table')
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
    })'''

text = text.replace(old_detail, new_detail)

# 4. 修改 export/detail 支持 hall
old_export = '''@app.route('/api/export/detail')
def api_export_detail():
    conn = get_db_conn()
    cursor = conn.execute('''
        SELECT team_id, form_date, hall_name, sister_nickname, sister_uid,
               sister_nickname2, sister_uid2, sister_revenue, reward_amount, dissolve_date
        FROM team_detail ORDER BY snapshot_date DESC, team_id DESC
    ''')
    rows = cursor.fetchall()
    conn.close()'''

new_export = '''@app.route('/api/export/detail')
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
    conn.close()'''

text = text.replace(old_export, new_export)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('app.py 大厅过滤修改完成')
