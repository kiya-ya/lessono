import sqlite3
conn = sqlite3.connect('data/stats.db')
conn.row_factory = sqlite3.Row

print('=== date_str 分布 ===')
cursor = conn.execute('SELECT date_str, cycle, new_team_count FROM stats_daily WHERE hall_name = "全部" ORDER BY date_str DESC LIMIT 15')
for row in cursor.fetchall():
    print(f'  {row["date_str"]} | {row["cycle"]} | 新成团:{row["new_team_count"]}')

print('\n=== date_str 范围 ===')
cursor = conn.execute('SELECT MIN(date_str) as min_d, MAX(date_str) as max_d FROM stats_daily WHERE hall_name = "全部"')
row = cursor.fetchone()
print(f'  最早: {row["min_d"]}  最晚: {row["max_d"]}')

print('\n=== 周报 ===')
cursor = conn.execute('SELECT * FROM weekly_report ORDER BY week_start DESC')
for row in cursor.fetchall():
    print(f'  {row["week_label"]} | 新成团:{row["new_team_count"]} | 留存率:{row["retention_rate"]}% | 解散率:{row["dissolution_rate"]}%')

conn.close()
