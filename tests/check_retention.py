import sqlite3

conn = sqlite3.connect(r'D:/姐妹团看板系统/data/stats.db')
conn.row_factory = sqlite3.Row

# 查看 stats_daily 表的数据情况
c = conn.execute('''
    SELECT date_str, hall_name, active_team_count, dissolved_count, COUNT(*) as cnt
    FROM stats_daily
    GROUP BY date_str, hall_name
    HAVING cnt > 1
    ORDER BY date_str DESC
    LIMIT 20
''')

dups = c.fetchall()
print(f'有重复日期-大厅组合: {len(dups)} 条')
for row in dups:
    print(f"  {row['date_str']} {row['hall_name']}: {row['cnt']} 条")

# 查看全部大厅的数据
c = conn.execute('''
    SELECT date_str, active_team_count, dissolved_count
    FROM stats_daily
    WHERE hall_name = '全部'
    ORDER BY date_str DESC
    LIMIT 20
''')
print('\n全部大厅最近20条:')
for row in c.fetchall():
    print(f"  {row['date_str']}: active={row['active_team_count']}, dissolved={row['dissolved_count']}")

conn.close()
