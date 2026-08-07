"""
清理 stats_daily 重复数据并重新生成 weekly_report
不依赖 pandas，使用纯 sqlite 操作
"""
import sqlite3
from datetime import datetime, timedelta

DB_PATH = r'D:/姐妹团看板系统/data/stats.db'
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

# 1. 查看重复数据详情
print('=== 重复数据详情 ===')
c = conn.execute('''
    SELECT date_str, cycle, hall_name, active_team_count, reward_amount
    FROM stats_daily
    WHERE date_str IN (
        SELECT date_str FROM stats_daily
        WHERE hall_name = '全部'
        GROUP BY date_str HAVING COUNT(*) > 1
    )
    AND hall_name = '全部'
    ORDER BY date_str, id
''')
for row in c.fetchall():
    print(f"  {row['date_str']} {row['cycle']}: active={row['active_team_count']}, reward={row['reward_amount']}")

# 2. 删除重复数据（保留 id 最小的那条，即最早抓取的）
print('\n=== 清理重复数据 ===')
c = conn.execute('''
    DELETE FROM stats_daily
    WHERE id NOT IN (
        SELECT MIN(id)
        FROM stats_daily
        GROUP BY date_str, hall_name
    )
''')
print(f'  删除了 {c.rowcount} 条重复记录')
conn.commit()

# 3. 验证清理结果
print('\n=== 验证清理后（最近10天）===')
c = conn.execute('''
    SELECT date_str, active_team_count, reward_amount
    FROM stats_daily
    WHERE hall_name = '全部'
    ORDER BY date_str DESC
    LIMIT 10
''')
for row in c.fetchall():
    print(f"  {row['date_str']}: active={row['active_team_count']}, reward={row['reward_amount']}")

# 4. 重新生成 weekly_report
print('\n=== 重新生成 weekly_report ===')
c = conn.execute("DELETE FROM weekly_report WHERE hall_name = 'all'")
print(f'  清空了 {c.rowcount} 条旧记录')
conn.commit()

# 获取所有有数据的周
c = conn.execute('''
    SELECT DISTINCT date_str FROM stats_daily
    WHERE hall_name = '全部' AND date_str IS NOT NULL
    ORDER BY date_str
''')
dates = [row['date_str'] for row in c.fetchall()]

# 按周分组
weeks = set()
for d in dates:
    dt = datetime.strptime(d, '%Y-%m-%d')
    monday = dt - timedelta(days=dt.weekday())
    weeks.add(monday.strftime('%Y-%m-%d'))

weeks = sorted(weeks)
print(f'  需要生成 {len(weeks)} 周的报告')

for ws in weeks:
    start_dt = datetime.strptime(ws, '%Y-%m-%d')
    end_dt = start_dt + timedelta(days=6)
    week_start = ws
    week_end = end_dt.strftime('%Y-%m-%d')
    week_label = f"{start_dt.strftime('%m-%d')}~{end_dt.strftime('%m-%d')}"
    
    # 查询本周7天数据
    c = conn.execute('''
        SELECT * FROM stats_daily
        WHERE date_str >= ? AND date_str <= ? AND hall_name = '全部'
        ORDER BY date_str
    ''', (week_start, week_end))
    rows = c.fetchall()
    
    if not rows:
        continue
    
    # 聚合指标
    new_team_count = sum(r['new_team_count'] or 0 for r in rows)
    dissolved_count = sum(r['dissolved_count'] or 0 for r in rows)
    active_dissolved = sum(r['active_dissolved_count'] or 0 for r in rows)
    system_dissolved = sum(r['system_dissolved_count'] or 0 for r in rows)
    total_reward = sum(r['reward_amount'] or 0 for r in rows)
    drive_tasks = sum(r['drive_task_count'] or 0 for r in rows)
    accompany_tasks = sum(r['accompany_task_count'] or 0 for r in rows)
    gift_tasks = sum(r['gift_task_count'] or 0 for r in rows)
    
    active_start = rows[0]['active_team_count'] or 0
    active_end = rows[-1]['active_team_count'] or 0
    
    # 留存率
    if active_start > 0:
        retention_rate = round(active_end / active_start * 100, 2)
    else:
        retention_rate = 0.0
    
    # 解散率
    avg_teams = (active_start + active_end) / 2
    if avg_teams > 0:
        dissolution_rate = round(dissolved_count / avg_teams * 100, 2)
    else:
        dissolution_rate = 0.0
    
    # 单团平均奖励
    if active_end > 0:
        avg_reward = round(total_reward / active_end, 2)
    else:
        avg_reward = 0.0
    
    # 活跃度
    total_tasks = drive_tasks + accompany_tasks + gift_tasks
    if active_end > 0:
        activity_index = round(total_tasks / active_end, 2)
    else:
        activity_index = 0.0
    
    # 插入 weekly_report
    conn.execute('''
        INSERT OR REPLACE INTO weekly_report
        (week_label, week_start, week_end, hall_name, new_team_count,
         active_team_count_end, active_team_count_start, dissolved_count,
         active_dissolved_count, system_dissolved_count, retention_rate,
         dissolution_rate, total_reward, avg_reward_per_team,
         total_drive_tasks, total_accompany_tasks, total_gift_tasks, activity_index)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        week_label, week_start, week_end, 'all', new_team_count,
        active_end, active_start, dissolved_count,
        active_dissolved, system_dissolved, retention_rate,
        dissolution_rate, total_reward, avg_reward,
        drive_tasks, accompany_tasks, gift_tasks, activity_index
    ))
    conn.commit()
    print(f"  ✓ {week_label}: active_end={active_end}, reward={total_reward:.1f}")

# 5. 验证最新周报
print('\n=== 验证最新周报 ===')
c = conn.execute('''
    SELECT week_label, active_team_count_end, new_team_count, dissolved_count, total_reward
    FROM weekly_report
    WHERE hall_name = 'all'
    ORDER BY week_start DESC
    LIMIT 5
''')
for row in c.fetchall():
    print(f"  {row['week_label']}: active_end={row['active_team_count_end']}, new={row['new_team_count']}, dissolved={row['dissolved_count']}, reward={row['total_reward']}")

conn.close()
print('\n完成！')
