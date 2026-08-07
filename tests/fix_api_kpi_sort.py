path = r"D:\姐妹团看板系统\backend\app.py"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 修复 api_kpi: cycle DESC -> date_str DESC
content = content.replace(
    "FROM stats_daily WHERE hall_name = '全部' ORDER BY cycle DESC LIMIT 2",
    "FROM stats_daily WHERE hall_name = '全部' ORDER BY date_str DESC LIMIT 2"
)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Fixed api_kpi sort order")
