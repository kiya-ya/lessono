import sqlite3

conn = sqlite3.connect(r'D:/姐妹团看板系统/data/stats.db')
conn.row_factory = sqlite3.Row

# 重新计算解散率： dissolved_count / active_team_count_start
c = conn.execute('''
    SELECT id, active_team_count_start, dissolved_count
    FROM weekly_report WHERE hall_name = 'all'
''')

updated = 0
for row in c.fetchall():
    start = row['active_team_count_start'] or 0
    dissolved = row['dissolved_count'] or 0
    
    if start > 0:
        dissolution = round(dissolved / start * 100, 2)
    else:
        dissolution = 0.0
    
    conn.execute('''
        UPDATE weekly_report SET dissolution_rate = ? WHERE id = ?
    ''', (dissolution, row['id']))
    updated += 1

conn.commit()

print(f'Updated {updated} rows')
c = conn.execute('''
    SELECT week_label, retention_rate, dissolution_rate
    FROM weekly_report WHERE hall_name = 'all'
    ORDER BY week_start DESC LIMIT 5
''')
for row in c.fetchall():
    print(f"  {row['week_label']}: retention={row['retention_rate']}%, dissolution={row['dissolution_rate']}%")

conn.close()
