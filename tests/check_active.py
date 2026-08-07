import sqlite3

conn = sqlite3.connect(r'D:/姐妹团看板系统/data/stats.db')
conn.row_factory = sqlite3.Row

# 查看 2026-08-07 的所有记录
print('=== 2026-08-07 所有记录 ===')
c = conn.execute('''
    SELECT date_str, hall_name, active_team_count, dissolved_count, reward_amount
    FROM stats_daily
    WHERE date_str = '2026-08-07'
    ORDER BY hall_name
''')
for row in c.fetchall():
    print(f"  {row['hall_name']}: active={row['active_team_count']}, dissolved={row['dissolved_count']}, reward={row['reward_amount']}")

# 查看 weekly_report 最新数据
print('\n=== 最新 weekly_report（全部大厅）===')
c = conn.execute('''
    SELECT week_label, week_start, week_end, active_team_count_end, new_team_count, dissolved_count, total_reward
    FROM weekly_report
    WHERE hall_name = 'all'
    ORDER BY week_start DESC
    LIMIT 2
''')
for row in c.fetchall():
    print(f"  {row['week_label']}: active_end={row['active_team_count_end']}, new={row['new_team_count']}, dissolved={row['dissolved_count']}, reward={row['total_reward']}")

conn.close()
