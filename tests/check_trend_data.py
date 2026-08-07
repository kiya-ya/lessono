import sqlite3

conn = sqlite3.connect(r'D:/姐妹团看板系统/data/stats.db')
conn.row_factory = sqlite3.Row

print('=== weekly_report 所有周级数据（全部大厅）===')
c = conn.execute('''
    SELECT week_label, week_start, week_end, 
           active_team_count_start, active_team_count_end,
           new_team_count, dissolved_count,
           retention_rate, dissolution_rate
    FROM weekly_report
    WHERE hall_name = 'all'
    ORDER BY week_start DESC
    LIMIT 10
''')
for row in c.fetchall():
    print(f"  {row['week_label']}: start={row['active_team_count_start']}, end={row['active_team_count_end']}, "
          f"new={row['new_team_count']}, dissolved={row['dissolved_count']}, "
          f"retention={row['retention_rate']}%, dissolution={row['dissolution_rate']}%")

print('\n=== stats_daily 近7天数据 ===')
c = conn.execute('''
    SELECT date_str, active_team_count, dissolved_count, new_team_count
    FROM stats_daily
    WHERE hall_name = '全部'
    ORDER BY date_str DESC
    LIMIT 7
''')
for row in c.fetchall():
    print(f"  {row['date_str']}: active={row['active_team_count']}, dissolved={row['dissolved_count']}, new={row['new_team_count']}")

conn.close()
