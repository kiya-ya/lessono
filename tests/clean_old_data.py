import sqlite3

conn = sqlite3.connect(r'D:/姐妹团看板系统/data/stats.db')

# 删除2025年的旧数据（保留2026年的数据）
c = conn.execute("DELETE FROM stats_daily WHERE date_str < '2026-01-01'")
print(f'Deleted {c.rowcount} old rows (before 2026-01-01)')

# 同时清理 team_detail 中过旧的快照（保留最近30天）
c = conn.execute('''
    DELETE FROM team_detail 
    WHERE snapshot_date < date('now', '-30 days')
''')
print(f'Deleted {c.rowcount} old team_detail rows')

conn.commit()

# 验证剩余数据
print('\nRemaining stats_daily count:', end=' ')
c = conn.execute('SELECT COUNT(*) FROM stats_daily')
print(c.fetchone()[0])

print('Date range:')
c = conn.execute('SELECT MIN(date_str), MAX(date_str) FROM stats_daily')
row = c.fetchone()
print(f'  {row[0]} ~ {row[1]}')

conn.close()
