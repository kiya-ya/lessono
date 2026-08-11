import sqlite3
conn = sqlite3.connect(r'D:\姐妹团看板系统\data\stats.db')
c = conn.cursor()

try:
    c.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in c.fetchall()]
    print('Tables:', tables)
except Exception as e:
    print('Error:', e)

conn.close()
