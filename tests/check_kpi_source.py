import sqlite3

conn = sqlite3.connect(r'D:/姐妹团看板系统/data/stats.db')
conn.row_factory = sqlite3.Row

print('=== stats_daily 按 cycle DESC 最新2条 ===')
c = conn.execute('''
    SELECT id, cycle, date_str, hall_name, active_team_count, new_team_count, dissolved_count
    FROM stats_daily
    WHERE hall_name = '全部'
    ORDER BY cycle DESC
    LIMIT 5
''')
for row in c.fetchall():
    print(f"  id={row['id']}, cycle='{row['cycle']}', date={row['date_str']}, active={row['active_team_count']}, new={row['new_team_count']}")

print('\n=== stats_daily 按 date_str DESC 最新2条 ===')
c = conn.execute('''
    SELECT id, cycle, date_str, hall_name, active_team_count, new_team_count, dissolved_count
    FROM stats_daily
    WHERE hall_name = '全部'
    ORDER BY date_str DESC
    LIMIT 5
''')
for row in c.fetchall():
    print(f"  id={row['id']}, cycle='{row['cycle']}', date={row['date_str']}, active={row['active_team_count']}, new={row['new_team_count']}")

print('\n=== weekly_report 最新2条 ===')
c = conn.execute('''
    SELECT week_label, week_start, week_end, active_team_count_end, new_team_count
    FROM weekly_report
    WHERE hall_name = 'all'
    ORDER BY week_start DESC
    LIMIT 2
''')
for row in c.fetchall():
    print(f"  {row['week_label']}: active_end={row['active_team_count_end']}, new={row['new_team_count']}")

conn.close()
