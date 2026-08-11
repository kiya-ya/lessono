path = r'D:\姐妹团看板系统\backend\app.py'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 删除第 406-408 行（0-based 405-407）：重复的 decorators
del lines[405:408]

# 现在旧函数体在第 430-449 行（0-based 429-448），需要删除
# 先重新读取确认位置
with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 删除从 "    \"\"\"返回近N周的周级留存率...\"\"\"\n    weeks = int..." 到 "return jsonify...\n\n@app.route"
# 的旧代码块
import re

old_block = '''    return jsonify({'dates': dates, 'retention': retention, 'dissolution': dissolution, 'new_teams': new_teams})
    """返回近N周的周级留存率/解散率/新成团数（基于 weekly_report，与KPI卡片一致）"""
    weeks = int(request.args.get('weeks', 10))
    hall = request.args.get('hall', 'all')
    conn = get_db_conn()
    cursor = conn.execute('''
        SELECT week_label, week_start, retention_rate, dissolution_rate, new_team_count
        FROM weekly_report
        WHERE hall_name = ?
        ORDER BY week_start DESC LIMIT ?
    ''', (hall, weeks))
    rows = cursor.fetchall()
    conn.close()
    
    rows = list(reversed(rows))
    dates = [r['week_label'] for r in rows]
    retention = [round(r['retention_rate'] or 0, 1) for r in rows]
    dissolution = [round(r['dissolution_rate'] or 0, 1) for r in rows]
    new_teams = [r['new_team_count'] or 0 for r in rows]
    
    return jsonify({'dates': dates, 'retention': retention, 'dissolution': dissolution, 'new_teams': new_teams})

@app.route('/api/weekly-report')'''

new_block = '''    return jsonify({'dates': dates, 'retention': retention, 'dissolution': dissolution, 'new_teams': new_teams})

@app.route('/api/weekly-report')'''

if old_block in content:
    content = content.replace(old_block, new_block)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('OK')
else:
    print('BLOCK NOT FOUND')
