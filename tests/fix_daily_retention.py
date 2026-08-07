path = r"D:\姐妹团看板系统\backend\app.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. 添加 new_teams = []
content = content.replace(
    "    dissolution = []\n    for r in rows:",
    "    dissolution = []\n    new_teams = []\n    for r in rows:"
)

# 2. 在循环中添加 new_teams.append
content = content.replace(
    "        retention.append(min(100, ret))\n        dissolution.append(dis)",
    "        retention.append(min(100, ret))\n        dissolution.append(dis)\n        new_teams.append(r['new_team_count'] or 0)"
)

# 3. 修改返回
content = content.replace(
    "    return jsonify({'dates': dates, 'retention': retention, 'dissolution': dissolution})",
    "    return jsonify({'dates': dates, 'retention': retention, 'dissolution': dissolution, 'new_teams': new_teams})"
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("backend/app.py updated")
