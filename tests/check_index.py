import sqlite3

conn = sqlite3.connect(r'D:/姐妹团看板系统/data/stats.db')
c = conn.execute("PRAGMA index_list(stats_daily)")
print('Indexes on stats_daily:')
for row in c.fetchall():
    print(f"  {row}")

# Check if there's a unique index
c = conn.execute("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='stats_daily'")
print('\nIndex definitions:')
for row in c.fetchall():
    print(f"  {row[0]}")

conn.close()
