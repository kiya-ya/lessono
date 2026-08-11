path = r'D:\姐妹团看板系统\frontend\index.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old = '''<div class="toolbar">
  <label>📅 时间:</label>
  <select id="week-select" onchange="onWeekChange()"></select>
  <button onclick="refreshData()">🔄 刷新</button>
  <button onclick="exportData()">📤 导出CSV</button>
  <button onclick="exportPDF()">📄 导出PDF</button>
</div>'''

new = '''<div class="toolbar">
  <label>📅 时间:</label>
  <select id="week-select" onchange="onWeekChange()"></select>
  <label>🏠 大厅:</label>
  <select id="hall-select" onchange="onHallChange()"></select>
  <button onclick="refreshData()">🔄 刷新</button>
  <button onclick="exportData()">📤 导出CSV</button>
  <button onclick="exportPDF()">📄 导出PDF</button>
</div>'''

if old in content:
    content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('OK')
else:
    print('NOT FOUND')
