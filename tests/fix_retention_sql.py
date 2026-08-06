path = r"D:\姐妹团看板系统\backend\app.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old_sql = """    cursor = conn.execute('''
        SELECT date_str, active_team_count, dissolved_count
        FROM stats_daily
        WHERE hall_name = ? AND date_str IS NOT NULL
        ORDER BY date_str DESC LIMIT ?
    ''', (hall, days))"""

new_sql = """    cursor = conn.execute('''
        SELECT date_str,
               SUM(active_team_count) as active_team_count,
               SUM(dissolved_count) as dissolved_count
        FROM stats_daily
        WHERE hall_name = ? AND date_str IS NOT NULL
        GROUP BY date_str
        ORDER BY date_str DESC LIMIT ?
    ''', (hall, days))"""

if old_sql not in content:
    print("old_sql not found!")
else:
    content = content.replace(old_sql, new_sql)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("app.py updated")
