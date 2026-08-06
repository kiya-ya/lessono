path = r"D:\姐妹团看板系统\frontend\index.html"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# 第200行（0-based index 199）有重复内容，修复为正确格式
lines[199] = '          <span>成团累计流水：<strong id="res-total-revenue">--</strong></span>\n'

with open(path, "w", encoding="utf-8") as f:
    f.writelines(lines)

print("fixed line 200")
