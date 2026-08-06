import sqlite3, os

for db_name in ['sisters.db', 'sisters_data.db', 'stats.db']:
    path = f'D:/姐妹团看板系统/data/{db_name}'
    print(f'\n=== {db_name} ===')
    print('exists:', os.path.exists(path))
    if os.path.exists(path):
        conn = sqlite3.connect(path)
        c = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [t[0] for t in c.fetchall()]
        print('tables:', tables)
        for t in tables:
            c = conn.execute(f'PRAGMA table_info({t})')
            cols = [row[1] for row in c.fetchall()]
            print(f'  {t}: {cols}')
        conn.close()
