import os

# 1. index.html: 删除 sister_revenue 表头
path = r"D:\姐妹团看板系统\frontend\index.html"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    '<th onclick="toggleSort(\'sister_revenue\')" style="cursor:pointer;">姐妹团累计流水 <span id="sort-sister_revenue">▲▼</span></th>\n',
    ''
)
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("index.html updated")

# 2. api.js: 删除 sister_revenue 列
path = r"D:\姐妹团看板系统\frontend\js\api.js"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    '<td>${row.days_since_formed || 0}</td><td>¥${(row.sister_revenue || 0).toFixed(1)}</td>',
    '<td>${row.days_since_formed || 0}</td>'
)
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("api.js updated")

# 3. app.js: 删除 sort 数组中的 sister_revenue
path = r"D:\姐妹团看板系统\frontend\js\app.js"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    "['team_id','form_date','hall_name','days_since_formed','sister_revenue','reward_amount','dissolve_date']",
    "['team_id','form_date','hall_name','days_since_formed','reward_amount','dissolve_date']"
)
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("app.js updated")

# 4. config.js: 默认排序改为 snapshot_date desc（最新在前）
path = r"D:\姐妹团看板系统\frontend\js\config.js"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    "let detailSortField = '';",
    "let detailSortField = 'snapshot_date';"
)
content = content.replace(
    "let detailSortOrder = 'asc';  // 'asc' 或 'desc'",
    "let detailSortOrder = 'desc';  // 默认倒序，最新在前"
)
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("config.js updated")
