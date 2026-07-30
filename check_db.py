import sqlite3
conn = sqlite3.connect('D:/姐妹团看板系统/data/stats.db')

# 检查 stats_daily 最新日期
cursor = conn.execute("SELECT MAX(date_str) FROM stats_daily")
max_date = cursor.fetchone()[0]
print(f'stats_daily 最新日期: {max_date}')

# 检查 team_detail 最新快照日期
cursor = conn.execute("SELECT MAX(snapshot_date) FROM team_detail")
max_detail = cursor.fetchone()[0]
print(f'team_detail 最新快照: {max_detail}')

# 检查 stats_daily 最近3条记录
cursor = conn.execute("SELECT date_str, new_team_count, active_team_count FROM stats_daily WHERE hall_name='全部' ORDER BY date_str DESC LIMIT 3")
rows = cursor.fetchall()
print(f'stats_daily 最近3条:')
for r in rows:
    print(f'  {r[0]}: 新成团={r[1]}, 进行中={r[2]}')

# 检查 weekly_report 最新周
cursor = conn.execute("SELECT MAX(week_end) FROM weekly_report WHERE hall_name='all'")
max_week = cursor.fetchone()[0]
print(f'weekly_report 最新周结束: {max_week}')

conn.close()
