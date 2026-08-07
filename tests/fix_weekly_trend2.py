path = r"D:\姐妹团看板系统\backend\app.py"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# 找到 api_daily_retention 函数的起始和结束位置
start_idx = None
end_idx = None
for i, line in enumerate(lines):
    if "@app.route('/api/daily-retention')" in line:
        start_idx = i
    if start_idx is not None and "return jsonify({'dates': dates, 'retention': retention, 'dissolution': dissolution, 'new_teams': new_teams})" in line:
        end_idx = i
        break

if start_idx is None or end_idx is None:
    print(f"Could not find function boundaries: start={start_idx}, end={end_idx}")
else:
    print(f"Found function from line {start_idx+1} to {end_idx+1}")
    
    new_func = '''@app.route('/api/daily-retention')
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
'''
    
    new_lines = lines[:start_idx] + [new_func] + lines[end_idx+1:]
    with open(path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)
    print("backend/app.py updated")
