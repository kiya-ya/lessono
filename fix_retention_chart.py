path = r'D:\姐妹团看板系统\frontend\index.html'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# 1. 在 alert-bar 后面添加留存/解散趋势图
old_html = '    <div class="alert-bar"><h3>⚠️ 本周预警</h3><div id="alert-list"></div></div>\n    <div class="chart-card"><h3>📈 新成团数趋势（近2周）</h3><div class="chart-container" id="chart-trend"></div></div>'
new_html = '    <div class="alert-bar"><h3>⚠️ 本周预警</h3><div id="alert-list"></div></div>\n    <div class="chart-card"><h3>💯 留存率 & 🚫 解散率趋势</h3><div class="chart-container" id="chart-overview-retention"></div></div>\n    <div class="chart-card"><h3>📈 新成团数趋势（近2周）</h3><div class="chart-container" id="chart-trend"></div></div>'
text = text.replace(old_html, new_html)

# 2. 在 initTrendChart 后面添加概览页留存/解散趋势图初始化函数
old_trend = """async function initTrendChart() {
  if (charts.trend) { charts.trend.resize(); return; }
  try {
    const res = await fetch(API_BASE + '/api/trends?metric=new_team_count&date_type=1');
    const data = await res.json();
    // 只取近2周（14天）
    const sliceSize = 14;
    const dates = data.dates.slice(-sliceSize);
    const values = data.values.slice(-sliceSize);
    const chart = echarts.init(document.getElementById('chart-trend'));
    charts.trend = chart;
    chart.setOption({ tooltip: { trigger: 'axis' }, grid: { left: 50, right: 30, top: 30, bottom: 40 }, xAxis: { type: 'category', data: dates, axisLabel: { rotate: 45, fontSize: 11 } }, yAxis: { type: 'value', name: '个' }, series: [{ name: '新成团数', type: 'line', data: values, smooth: true, lineStyle: { color: '#667eea', width: 2 }, itemStyle: { color: '#667eea' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(102,126,234,0.3)' }, { offset: 1, color: 'rgba(102,126,234,0.05)' }]) } }] });
  } catch (e) { console.error('趋势图加载失败:', e); }
}"""

new_trend = """async function initTrendChart() {
  if (charts.trend) { charts.trend.resize(); return; }
  try {
    const res = await fetch(API_BASE + '/api/trends?metric=new_team_count&date_type=1');
    const data = await res.json();
    // 只取近2周（14天）
    const sliceSize = 14;
    const dates = data.dates.slice(-sliceSize);
    const values = data.values.slice(-sliceSize);
    const chart = echarts.init(document.getElementById('chart-trend'));
    charts.trend = chart;
    chart.setOption({ tooltip: { trigger: 'axis' }, grid: { left: 50, right: 30, top: 30, bottom: 40 }, xAxis: { type: 'category', data: dates, axisLabel: { rotate: 45, fontSize: 11 } }, yAxis: { type: 'value', name: '个' }, series: [{ name: '新成团数', type: 'line', data: values, smooth: true, lineStyle: { color: '#667eea', width: 2 }, itemStyle: { color: '#667eea' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(102,126,234,0.3)' }, { offset: 1, color: 'rgba(102,126,234,0.05)' }]) } }] });
  } catch (e) { console.error('趋势图加载失败:', e); }
}

async function initOverviewRetentionChart() {
  if (charts.overviewRetention) { charts.overviewRetention.resize(); return; }
  try {
    const res = await fetch(API_BASE + '/api/weekly-report?limit=8');
    const result = await res.json();
    const data = result.data || [];
    if (data.length === 0) return;
    const labels = data.map(d => d.week_label);
    const retention = data.map(d => Math.min(100, d.retention_rate || 0));
    const dissolution = data.map(d => d.dissolution_rate || 0);
    const chart = echarts.init(document.getElementById('chart-overview-retention'));
    charts.overviewRetention = chart;
    chart.setOption({
      tooltip: { trigger: 'axis', formatter: function(p) { return p.map(i => `${i.seriesName}: ${i.value}%`).join('<br/>'); } },
      legend: { data: ['留存率', '解散率'], top: 5 },
      grid: { left: 50, right: 30, top: 40, bottom: 40 },
      xAxis: { type: 'category', data: labels, axisLabel: { rotate: 30, fontSize: 10 } },
      yAxis: { type: 'value', name: '%', max: 120 },
      series: [
        { name: '留存率', type: 'line', data: retention, smooth: true, lineStyle: { color: '#52c41a', width: 2 }, itemStyle: { color: '#52c41a' } },
        { name: '解散率', type: 'line', data: dissolution, smooth: true, lineStyle: { color: '#ff4d4f', width: 2 }, itemStyle: { color: '#ff4d4f' } }
      ]
    });
  } catch (e) { console.error('留存/解散趋势图加载失败:', e); }
}"""

text = text.replace(old_trend, new_trend)

# 3. 在 switchTab('overview') 时调用 initOverviewRetentionChart
old_switch = "if (tabName === 'overview') setTimeout(initTrendChart, 100);"
new_switch = "if (tabName === 'overview') { setTimeout(initTrendChart, 100); setTimeout(initOverviewRetentionChart, 150); }"
text = text.replace(old_switch, new_switch)

# 4. 在 DOMContentLoaded 中也调用
old_dom = "loadKPI(); loadAlerts(); initTrendChart(); loadDetailTable();"
new_dom = "loadKPI(); loadAlerts(); initTrendChart(); initOverviewRetentionChart(); loadDetailTable();"
text = text.replace(old_dom, new_dom)

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

print('index.html 概览页留存/解散趋势图添加完成')
