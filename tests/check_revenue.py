import sqlite3

conn = sqlite3.connect(r'D:/姐妹团看板系统/data/sisters_data.db')
conn.row_factory = sqlite3.Row

# 先统计总行数
c = conn.execute('SELECT COUNT(*) as cnt FROM team_detail')
print('team_detail 总行数:', c.fetchone()['cnt'])

# 查看最新快照日期
c = conn.execute('SELECT MAX(snapshot_date) as max_date FROM team_detail')
print('最新快照日期:', c.fetchone()['max_date'])

# 查看所有数据的前10条（不管 dissolve_date）
c = conn.execute('''
    SELECT sister_uid, sister_nickname, sister_uid2, sister_nickname2, 
           sister_revenue, reward_amount, dissolve_date, hall_name, snapshot_date
    FROM team_detail
    ORDER BY snapshot_date DESC
    LIMIT 10
''')

for row in c.fetchall():
    print(f"UID:{row['sister_uid']} {row['sister_nickname']} | "
          f"妹:{row['sister_uid2']} | "
          f"流水:{row['sister_revenue']} | 奖励:{row['reward_amount']} | "
          f"状态:{'已解散' if row['dissolve_date'] else '进行中'} | "
          f"日期:{row['snapshot_date']}")

conn.close()
