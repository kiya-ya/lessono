path = r"D:\姐妹团看板系统\frontend\index.html"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

replacements = [
    ('<div class="kpi-card"><div class="kpi-label">📦 新成团数</div><div class="kpi-value" id="kpi-new">--</div><div class="kpi-change" id="kpi-new-change">--</div></div>',
     '<div class="kpi-card"><div class="kpi-label">📦 新成团数</div><div class="kpi-value" id="kpi-new">--</div><div class="kpi-change" id="kpi-new-change">--</div><div class="kpi-note">本周截至今天</div></div>'),
    ('<div class="kpi-card"><div class="kpi-label">🔄 进行中姐妹团</div><div class="kpi-value" id="kpi-active">--</div><div class="kpi-change" id="kpi-active-change">--</div></div>',
     '<div class="kpi-card"><div class="kpi-label">🔄 进行中姐妹团</div><div class="kpi-value" id="kpi-active">--</div><div class="kpi-change" id="kpi-active-change">--</div><div class="kpi-note">今天实时</div></div>'),
    ('<div class="kpi-card"><div class="kpi-label">📊 留存率</div><div class="kpi-value" id="kpi-retention">--</div><div class="kpi-change" id="kpi-retention-change">--</div></div>',
     '<div class="kpi-card"><div class="kpi-label">📊 留存率</div><div class="kpi-value" id="kpi-retention">--</div><div class="kpi-change" id="kpi-retention-change">--</div><div class="kpi-note">本周</div></div>'),
    ('<div class="kpi-card"><div class="kpi-label">🚫 解散率</div><div class="kpi-value" id="kpi-dissolution">--</div><div class="kpi-change" id="kpi-dissolution-change">--</div></div>',
     '<div class="kpi-card"><div class="kpi-label">🚫 解散率</div><div class="kpi-value" id="kpi-dissolution">--</div><div class="kpi-change" id="kpi-dissolution-change">--</div><div class="kpi-note">本周</div></div>'),
    ('<div class="kpi-card"><div class="kpi-label">💰 礼物奖励金额</div><div class="kpi-value" id="kpi-revenue">--</div><div class="kpi-change" id="kpi-revenue-change">--</div></div>',
     '<div class="kpi-card"><div class="kpi-label">💰 礼物奖励金额</div><div class="kpi-value" id="kpi-revenue">--</div><div class="kpi-change" id="kpi-revenue-change">--</div><div class="kpi-note">本周累计</div></div>'),
    ('<div class="kpi-card"><div class="kpi-label">⚠️ 主动解散占比</div><div class="kpi-value" id="kpi-active-dissolved">--</div><div class="kpi-change" id="kpi-active-dissolved-change">--</div></div>',
     '<div class="kpi-card"><div class="kpi-label">⚠️ 主动解散占比</div><div class="kpi-value" id="kpi-active-dissolved">--</div><div class="kpi-change" id="kpi-active-dissolved-change">--</div><div class="kpi-note">今天</div></div>'),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        print(f'Replaced: {old[:40]}...')
    else:
        print(f'Not found: {old[:40]}...')

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print('Done')
