path = r"D:\姐妹团看板系统\frontend\js\render.js"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 精确替换 renderTeamInfo 中的成团累计流水显示
# 从 t.total_revenue 改为 data.team_total_revenue || t.total_revenue
old_str = '''      <div class="team-detail-item">
        <span class="team-detail-label">💰 成团累计流水</span>
        <span class="team-detail-value">¥${(t.total_revenue || 0).toLocaleString()}</span>
      </div>'''

new_str = '''      <div class="team-detail-item">
        <span class="team-detail-label">💰 成团累计流水</span>
        <span class="team-detail-value">¥${(data.team_total_revenue || t.total_revenue || 0).toLocaleString()}</span>
      </div>'''

if old_str not in content:
    print("old_str not found!")
else:
    content = content.replace(old_str, new_str)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("render.js updated")
