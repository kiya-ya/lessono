import sqlite3, os

path = r'D:/姐妹团看板系统/data/sisters.db'
print('db exists:', os.path.exists(path))

if os.path.exists(path):
    conn = sqlite3.connect(path)
    c = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = c.fetchall()
    print('tables:', [t[0] for t in tables])
    
    if 'team_detail' in [t[0] for t in tables]:
        c = conn.execute('PRAGMA table_info(team_detail)')
        for row in c.fetchall():
            print(row)
    conn.close()
