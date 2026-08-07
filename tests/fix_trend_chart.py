path = r"D:\姐妹团看板系统\frontend\js\render.js"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 替换 initTrendChart 的 API 调用
content = content.replace(
    "const res = await fetch(API_BASE + '/api/trends?metric=new_team_count&date_type=1');",
    "const res = await fetch(API_BASE + '/api/daily-retention?days=14' + getHallParam());"
)

content = content.replace(
    "const dates = data.dates.slice(-sliceSize);\n    const values = data.values.slice(-sliceSize);",
    "const dates = data.dates.slice(-sliceSize);\n    const values = data.new_teams.slice(-sliceSize);"
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("frontend/js/render.js updated")
