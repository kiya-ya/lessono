import sqlite3

conn = sqlite3.connect(r'D:/姐妹团看板系统/data/stats.db')
conn.row_factory = sqlite3.Row

# Check duplicate rows for 2026-08-07
print('=== Duplicate rows for 2026-08-07 ===')
c = conn.execute('''
    SELECT id, cycle, date_str, hall_name, active_team_count, reward_amount, created_at
    FROM stats_daily
    WHERE date_str = '2026-08-07'
    ORDER BY id
''')
for row in c.fetchall():
    print(f"  id={row['id']}, cycle='{row['cycle']}', hall='{row['hall_name']}', active={row['active_team_count']}, reward={row['reward_amount']}, created={row['created_at']}")

# Check all dates with duplicates
print('\n=== All dates with multiple rows ===')
c = conn.execute('''
    SELECT date_str, hall_name, COUNT(*) as cnt
    FROM stats_daily
    GROUP BY date_str, hall_name
    HAVING cnt > 1
    ORDER BY date_str DESC
''')
for row in c.fetchall():
    print(f"  {row['date_str']} {row['hall_name']}: {row['cnt']} rows")

conn.close()
