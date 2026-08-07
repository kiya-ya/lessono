import sys
sys.path.insert(0, 'crawler')
from metrics import calculate_weekly_metrics, save_weekly_report
import sqlite3

conn = sqlite3.connect(r'D:/姐妹团看板系统/data/stats.db')
c = conn.execute('''
    SELECT DISTINCT strftime('%Y-%m-%d', date_str, 'weekday 0', '-6 days') as ws
    FROM stats_daily WHERE hall_name = '全部' AND date_str IS NOT NULL ORDER BY ws
''')
weeks = [r[0] for r in c.fetchall()]
conn.close()

print(f'Regenerating {len(weeks)} weeks...')
for w in weeks:
    m = calculate_weekly_metrics('all', w)
    if m:
        save_weekly_report(m)
        print(f"  {m['week_label']}: retention={m['retention_rate']}%, dissolution={m['dissolution_rate']}%")
print('Done')
