import sqlite3

conn = sqlite3.connect(r'D:/姐妹团看板系统/data/stats.db')
conn.row_factory = sqlite3.Row

# 查询 14828704
c = conn.execute('''
    SELECT sister_uid, sister_nickname, sister_revenue, reward_amount, 
           dissolve_date, snapshot_date, hall_name
    FROM team_detail WHERE sister_uid = ? OR sister_uid2 = ?
    ORDER BY snapshot_date DESC LIMIT 5
''', ('14828704', '14828704'))

rows = c.fetchall()
print(f'找到 {len(rows)} 条记录:')
for row in rows:
    print(f"  UID:{row['sister_uid']} 昵称:{row['sister_nickname']} | "
          f"流水:{row['sister_revenue']} | 奖励:{row['reward_amount']} | "
          f"解散:{row['dissolve_date']} | 日期:{row['snapshot_date']}")

conn.close()
