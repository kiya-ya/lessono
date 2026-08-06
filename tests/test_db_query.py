import sqlite3, os

DB_PATH = r'D:/姐妹团看板系统/data/stats.db'

def get_db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def _get_team_info_by_uid(uid, team_id=None):
    try:
        conn = get_db_conn()
        if team_id:
            cursor = conn.execute('''
                SELECT team_id, form_date, hall_name,
                       sister_nickname, sister_uid,
                       sister_nickname2, sister_uid2,
                       sister_revenue, reward_amount, dissolve_date
                FROM team_detail
                WHERE team_id = ?
                  AND snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                LIMIT 1
            ''', (team_id,))
        else:
            cursor = conn.execute('''
                SELECT team_id, form_date, hall_name,
                       sister_nickname, sister_uid,
                       sister_nickname2, sister_uid2,
                       sister_revenue, reward_amount, dissolve_date
                FROM team_detail
                WHERE (sister_uid = ? OR sister_uid2 = ?)
                  AND snapshot_date = (SELECT MAX(snapshot_date) FROM team_detail)
                ORDER BY form_date DESC LIMIT 1
            ''', (uid, uid))
        row = cursor.fetchone()
        conn.close()
        if row:
            return {
                'team_id': row['team_id'],
                'hall_name': row['hall_name'],
                'form_date': row['form_date'],
                'sister_nickname': row['sister_nickname'],
                'sister_uid': row['sister_uid'],
                'sister_nickname2': row['sister_nickname2'],
                'sister_uid2': row['sister_uid2'],
                'total_revenue': row['sister_revenue'],
                'reward_amount': row['reward_amount'],
                'status': '已解散' if row['dissolve_date'] else '进行中',
                'dissolve_date': row['dissolve_date'],
            }
    except Exception as e:
        print(f'[WARN] 查询失败: {e}')
    return None

result = _get_team_info_by_uid('14828704')
print('查询结果:', result)
