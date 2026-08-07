path = r"D:\姐妹团看板系统\backend\app.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_api = '''@app.route('/api/daily-retention')
def api_daily_retention():
    """返回近N天的日级留存率/解散率（基于 stats_daily 聚合计算）"""
    days = int(request.args.get('days', 14))
    hall = request.args.get('hall', '全部')
    conn = get_db_conn()
    cursor = conn.execute('''
        SELECT date_str,
               SUM(active_team_count) as active_team_count,
               SUM(dissolved_count) as dissolved_count,               SUM(new_team_count) as new_team_count
        FROM stats_daily
        WHERE hall_name = ? AND date_str IS NOT NULL
        GROUP BY date_str
        ORDER BY date_str DESC LIMIT ?
    ''', (hall, days))
    rows = cursor.fetchall()
    conn.close()
    
    rows = list(reversed(rows))
    dates = [r['date_str'] for r in rows]
    retention = []
    dissolution = []
    new_teams = []
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
        new_teams.append(r['new_team_count'] or 0)
    
    return jsonify({'dates': dates, 'retention': retention, 'dissolution': dissolution, 'new_teams': new_teams})'''

new_api = '''@app.route('/api/daily-retention')
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
    
    return jsonify({'dates': dates, 'retention': retention, 'dissolution': dissolution, 'new_teams': new_teams})'''

if old_api not in content:
    print("old_api not found")
else:
    content = content.replace(old_api, new_api)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("backend/app.py updated: daily-retention now uses weekly_report")
