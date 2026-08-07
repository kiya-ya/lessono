import sqlite3

conn = sqlite3.connect(r'D:/姐妹团看板系统/data/stats.db')
conn.row_factory = sqlite3.Row

# 直接用SQL重新计算留存率（修正后的公式）
c = conn.execute('''
    SELECT id, active_team_count_end, active_team_count_start, new_team_count
    FROM weekly_report WHERE hall_name = 'all'
''')

updated = 0
for row in c.fetchall():
    start = row['active_team_count_start'] or 0
    end = row['active_team_count_end'] or 0
    new = row['new_team_count'] or 0
    
    if start > 0:
        # 修正公式：(期末-新成团) / 期初
        retention = round((end - new) / start * 100, 2)
    else:
        retention = 0.0
    
    conn.execute('''
        UPDATE weekly_report SET retention_rate = ? WHERE id = ?
    ''', (retention, row['id']))
    updated += 1

conn.commit()

# 验证最新周
print(f'Updated {updated} rows')
c = conn.execute('''
    SELECT week_label, retention_rate, dissolution_rate
    FROM weekly_report WHERE hall_name = 'all'
    ORDER BY week_start DESC LIMIT 5
''')
for row in c.fetchall():
    print(f"  {row['week_label']}: retention={row['retention_rate']}%, dissolution={row['dissolution_rate']}%")

conn.close()
