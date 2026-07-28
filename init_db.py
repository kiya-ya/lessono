import os, sqlite3
root = os.path.dirname(os.path.abspath(__file__))
db_path = os.path.join(root, 'data', 'stats.db')
schema_path = os.path.join(root, 'data', 'schema.sql')

os.makedirs(os.path.dirname(db_path), exist_ok=True)

with open(schema_path, 'r', encoding='utf-8') as f:
    sql = f.read()

conn = sqlite3.connect(db_path)
conn.executescript(sql)
conn.commit()

# 验证
print('Tables created:')
cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
for row in cursor.fetchall():
    print(f'  - {row[0]}')

conn.close()
print(f'\n[OK] Database initialized at: {db_path}')
