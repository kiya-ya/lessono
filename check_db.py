import sqlite3
conn = sqlite3.connect('data/stats.db')
conn.row_factory = sqlite3.Row

print('=== stats_daily 表内容预览 ===')
cursor = conn.execute('SELECT cycle, hall_name, new_team_count, active_team_count, dissolved_count FROM stats_daily ORDER BY cycle DESC LIMIT 10')
for row in cursor.fetchall():
    print(dict(row))

print('\n=== 去重的大厅名 ===')
cursor = conn.execute('SELECT DISTINCT hall_name FROM stats_daily LIMIT 20')
for row in cursor.fetchall():
    print(row['hall_name'])

print('\n=== 数据条数 ===')
cursor = conn.execute('SELECT COUNT(*) as cnt FROM stats_daily')
print(f"stats_daily: {cursor.fetchone()['cnt']}")

conn.close()
