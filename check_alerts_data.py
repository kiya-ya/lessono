import sqlite3
conn = sqlite3.connect('D:/姐妹团看板系统/data/stats.db')

# 检查本周预警
print('=== alerts 表数据 ===')
cursor = conn.execute("SELECT alert_type, severity, title, description, week_label, created_at FROM alerts ORDER BY created_at DESC LIMIT 10")
for r in cursor.fetchall():
    print(f'  [{r[1]}] {r[2]} | 周:{r[4]} | 时间:{r[5]}')

# 检查本周实际KPI数据（用于对比预警是否准确）
print('\n=== 最近3周实际数据 ===')
cursor = conn.execute("""
    SELECT week_label, week_start, week_end, new_team_count, active_team_count_end, 
           dissolved_count, retention_rate, dissolution_rate, total_reward
    FROM weekly_report WHERE hall_name='all' ORDER BY week_start DESC LIMIT 3
""")
rows = cursor.fetchall()
for r in rows:
    print(f'  {r[0]} ({r[1]}~{r[2]}): 新成团={r[3]}, 进行中={r[4]}, 解散={r[5]}, 留存率={r[6]}%, 解散率={r[7]}%, 流水={r[8]}')

# 计算环比（预警判断依据）
if len(rows) >= 2:
    this_week = rows[0]
    last_week = rows[1]
    new_team_change = (this_week[3] - last_week[3]) / last_week[3] * 100 if last_week[3] else 0
    diss_change = (this_week[5] - last_week[5]) / last_week[5] * 100 if last_week[5] else 0
    print(f'\n=== 环比变化 ===')
    print(f'  新成团数: {last_week[3]} -> {this_week[3]} (变化 {new_team_change:+.1f}%)')
    print(f'  解散数: {last_week[5]} -> {this_week[5]} (变化 {diss_change:+.1f}%)')
    print(f'  留存率: {last_week[6]}% -> {this_week[6]}%')
    print(f'  解散率: {last_week[7]}% -> {this_week[7]}%')

conn.close()
