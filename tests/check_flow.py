import sqlite3

conn = sqlite3.connect(r'D:/姐妹团看板系统/data/stats.db')
conn.row_factory = sqlite3.Row

# 1. 查看 weekly_report 表字段
print('=== weekly_report 表 ===')
c = conn.execute('PRAGMA table_info(weekly_report)')
for row in c.fetchall():
    print(f"  {row[1]}: {row[2]}")

# 2. 查看最新周报数据
print('\n=== 最新周报数据（全部大厅）===')
c = conn.execute('''
    SELECT week_label, week_start, week_end, 
           total_reward, avg_reward_per_team, total_gift_tasks,
           new_team_count, active_team_count_end
    FROM weekly_report
    WHERE hall_name = 'all'
    ORDER BY week_start DESC
    LIMIT 3
''')
for row in c.fetchall():
    print(f"  {row['week_label']}: total_reward={row['total_reward']}, "
          f"avg={row['avg_reward_per_team']}, gifts={row['total_gift_tasks']}")

# 3. 查看 stats_daily 最新数据
print('\n=== 最新 stats_daily（全部大厅）===')
c = conn.execute('''
    SELECT date_str, revenue_achievement_count, gift_task_count, reward_amount
    FROM stats_daily
    WHERE hall_name = '全部'
    ORDER BY date_str DESC
    LIMIT 5
''')
for row in c.fetchall():
    print(f"  {row['date_str']}: rev_achieve={row['revenue_achievement_count']}, "
          f"gift_tasks={row['gift_task_count']}, reward={row['reward_amount']}")

# 4. 查看 hall_stats 表
print('\n=== hall_stats 表字段 ===')
c = conn.execute('PRAGMA table_info(hall_stats)')
for row in c.fetchall():
    print(f"  {row[1]}: {row[2]}")

print('\n=== 最新 hall_stats（全部大厅）===')
c = conn.execute('''
    SELECT snapshot_date, hall_name, team_count, active_count, total_revenue, total_reward
    FROM hall_stats
    WHERE hall_name = '全部'
    ORDER BY snapshot_date DESC
    LIMIT 3
''')
for row in c.fetchall():
    print(f"  {row['snapshot_date']}: total_revenue={row['total_revenue']}, total_reward={row['total_reward']}")

conn.close()
