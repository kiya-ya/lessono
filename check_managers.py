import sqlite3
conn = sqlite3.connect(r'D:\姐妹团看板系统\data\stats.db')
c = conn.cursor()

try:
    c.execute("PRAGMA table_info(hall_managers)")
    print('hall_managers columns:', [r[1] for r in c.fetchall()])
    c.execute("SELECT uid, hall_name FROM hall_managers LIMIT 10")
    print('hall_managers sample:', c.fetchall())
except Exception as e:
    print('Error:', e)

conn.close()
