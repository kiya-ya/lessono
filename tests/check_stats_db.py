import sqlite3

conn = sqlite3.connect(r'D:/姐妹团看板系统/data/stats.db')
conn.row_factory = sqlite3.Row

c = conn.execute('SELECT COUNT(*) as cnt FROM team_detail')
print('stats.db team_detail 行数:', c.fetchone()['cnt'])

c = conn.execute('SELECT COUNT(*) as cnt FROM stats_daily')
print('stats.db stats_daily 行数:', c.fetchone()['cnt'])

c = conn.execute('''
    SELECT sister_uid, sister_nickname, sister_revenue, snapshot_date
    FROM team_detail ORDER BY sister_revenue DESC LIMIT 5
''')
for row in c.fetchall():
    print(f"  {row['sister_uid']} {row['sister_nickname']}: {row['sister_revenue']} ({row['snapshot_date']})")

conn.close()
