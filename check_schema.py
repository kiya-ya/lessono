import sqlite3
conn = sqlite3.connect('data/stats.db')
cursor = conn.execute("SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN ('weekly_report','alerts','stats_daily','trend_data','team_detail')")
for row in cursor:
    print(f'=== {row[0]} ===')
    print(row[1])
    print()
conn.close()
