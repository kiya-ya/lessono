import sqlite3
import os

db_path = 'data/stats.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r['name'] for r in cursor.fetchall()]

print('=== 数据层完整性检查 ===\n')

for table in tables:
    cursor = conn.execute(f'SELECT COUNT(*) as cnt FROM {table}')
    count = cursor.fetchone()['cnt']
    print(f'  {table:20s}: {count:6d} 条记录')

print('\n--- stats_daily 时间范围 ---')
cursor = conn.execute('SELECT MIN(cycle) as min_d, MAX(cycle) as max_d FROM stats_daily')
row = cursor.fetchone()
print(f'  最早: {row["min_d"]}  最晚: {row["max_d"]}')

cursor = conn.execute('SELECT DISTINCT hall_name FROM stats_daily')
halls = [r['hall_name'] for r in cursor.fetchall()]
print(f'  大厅数: {len(halls)} ({", ".join(halls[:5])}{"..." if len(halls) > 5 else ""})')

print('\n--- weekly_report 周报 ---')
cursor = conn.execute('SELECT * FROM weekly_report ORDER BY week_start DESC')
reports = cursor.fetchall()
if reports:
    for r in reports:
        print(f'  {r["week_label"]}: 新成团{r["new_team_count"]}, 留存率{r["retention_rate"]}%, 解散率{r["dissolution_rate"]}%')
else:
    print('  (无周报数据)')

print('\n--- alerts 预警 ---')
cursor = conn.execute('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 5')
alerts = cursor.fetchall()
if alerts:
    for a in alerts:
        print(f'  [{a["severity"]}] {a["title"]}: {a["description"]}')
else:
    print('  (无预警记录)')

print('\n--- crawl_log 抓取日志 ---')
cursor = conn.execute('SELECT source, status, records_count, created_at FROM crawl_log ORDER BY created_at DESC')
for row in cursor.fetchall():
    print(f'  {row["created_at"]} | {row["source"]:15s} | {row["status"]:7s} | {row["records_count"]}条')

conn.close()
print('\n=== 检查完成 ===')
