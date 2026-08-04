async function loadKPI() {
  try {
    const res = await fetch(API_BASE + '/api/kpi?' + getHallParam() + getWeekParam());
    const result = await res.json();
    const d = result.data;
    document.getElementById('current-period').textContent = result.week || result.date || '--';
    document.getElementById('kpi-new').textContent = d.new_team.value + ' 个';
    setChange('kpi-new-change', d.new_team.change);
    document.getElementById('kpi-active').textContent = d.active_team.value + ' 个';
    setChange('kpi-active-change', d.active_team.change);
    document.getElementById('kpi-retention').textContent = d.retention.value + '%';
    setChange('kpi-retention-change', d.retention.change);
    document.getElementById('kpi-dissolution').textContent = d.dissolution.value + '%';
    setChange('kpi-dissolution-change', d.dissolution.change, true);
    document.getElementById('kpi-revenue').textContent = '¥' + d.revenue.value.toLocaleString();
    setChange('kpi-revenue-change', d.revenue.change);

    document.getElementById('kpi-active-dissolved').textContent = d.active_dissolved_pct.value + '%';
    setChange('kpi-active-dissolved-change', d.active_dissolved_pct.change, true);
  } catch (e) { console.error('KPI加载失败:', e); }
}

async function initTrendChart() {
  if (charts.trend) { charts.trend.resize(); return; }
  try {
    const res = await fetch(API_BASE + '/api/trends?metric=new_team_count&date_type=1');
    const data = await res.json();
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
    const res = await fetch(API_BASE + '/api/daily-retention?days=14' + getHallParam());
    const data = await res.json();
    const labels = data.dates || [];
    const retention = data.retention || [];
    const dissolution = data.dissolution || [];
    if (labels.length === 0) return;
    const chart = echarts.init(document.getElementById('chart-overview-retention'));
    charts.overviewRetention = chart;
    chart.setOption({
      tooltip: { trigger: 'axis', formatter: function(p) { return p.map(i => `${i.seriesName}: ${i.value}%`).join('<br/>'); } },
      legend: { data: ['留存率', '解散率'], top: 5 },
      grid: { left: 50, right: 30, top: 40, bottom: 40 },
      xAxis: { type: 'category', data: labels, axisLabel: { rotate: 45, fontSize: 10 } },
      yAxis: { type: 'value', name: '%', max: 120 },
      series: [
        { name: '留存率', type: 'line', data: retention, smooth: true, lineStyle: { color: '#52c41a', width: 2 }, itemStyle: { color: '#52c41a' } },
        { name: '解散率', type: 'line', data: dissolution, smooth: true, lineStyle: { color: '#ff4d4f', width: 2 }, itemStyle: { color: '#ff4d4f' } }
      ]
    });
  } catch (e) { console.error('留存/解散趋势图加载失败:', e); }
}

async function initTrendCharts() {
  try {
    const res = await fetch(API_BASE + '/api/weekly-report?limit=all' + getHallParam());
    const result = await res.json();
    let data = result.data;
    if (!data || data.length === 0) return;
    const cutoffDate = '2026-06-22';
    data = data.filter(d => d.week_start >= cutoffDate);
    if (currentWeek && currentWeek.includes('|')) {
      const selectedEnd = currentWeek.split('|')[1];
      data = data.filter(d => d.week_end <= selectedEnd);
    }
    if (data.length === 0) return;
    const labels = data.map(d => d.week_label);
    const policyDate = '2026-07-17';
    let policyIndex = data.findIndex(d => d.week_start >= policyDate);
    if (policyIndex < 0) policyIndex = data.findIndex(d => d.week_end >= policyDate);
    const markLineData = policyIndex >= 0 ? [{ xAxis: labels[policyIndex], label: { formatter: '政策上线' }, lineStyle: { color: '#ff4d4f', type: 'dashed' } }] : [];

    const retentionOption = {
      tooltip: { trigger: 'axis', formatter: '{b}<br/>留存率: {c}%' },
      grid: { left: 50, right: 30, top: 30, bottom: 50 },
      xAxis: { type: 'category', data: labels, axisLabel: { rotate: 45, fontSize: 10 } },
      yAxis: { type: 'value', name: '%', max: 100 },
      series: [{
        name: '留存率', type: 'line', data: data.map(d => Math.min(100, d.retention_rate || 0)),
        smooth: true, lineStyle: { color: '#52c41a', width: 2 }, itemStyle: { color: '#52c41a' },
        markLine: { silent: true, data: markLineData }
      }]
    };
    if (!charts.retention) { charts.retention = echarts.init(document.getElementById('chart-retention')); charts.retention.setOption(retentionOption); } else { charts.retention.resize(); }

    const dissolutionOption = {
      tooltip: { trigger: 'axis', formatter: function(p) { return p.map(i => `${i.seriesName}: ${i.value}%`).join('<br/>'); } },
      legend: { data: ['解散率(柱)', '解散率(线)'], top: 5 },
      grid: { left: 50, right: 30, top: 40, bottom: 50 },
      xAxis: { type: 'category', data: labels, axisLabel: { rotate: 45, fontSize: 10 } },
      yAxis: { type: 'value', name: '%' },
      series: [
        { name: '解散率(柱)', type: 'bar', data: data.map(d => d.dissolution_rate || 0), itemStyle: { color: 'rgba(255,77,79,0.6)' }, barWidth: '50%' },
        { name: '解散率(线)', type: 'line', data: data.map(d => d.dissolution_rate || 0), smooth: true, lineStyle: { color: '#ff4d4f', width: 2 }, itemStyle: { color: '#ff4d4f' }, markLine: { silent: true, data: markLineData } }
      ]
    };
    if (!charts.dissolution) { charts.dissolution = echarts.init(document.getElementById('chart-dissolution')); charts.dissolution.setOption(dissolutionOption); } else { charts.dissolution.resize(); }

    const revenueOption = {
      tooltip: { trigger: 'axis', formatter: '{b}<br/>流水: ¥{c}' },
      grid: { left: 50, right: 30, top: 30, bottom: 50 },
      xAxis: { type: 'category', data: labels, axisLabel: { rotate: 45, fontSize: 10 } },
      yAxis: { type: 'value', name: '元' },
      series: [{
        name: '流水', type: 'bar', data: data.map(d => d.total_reward || 0),
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#faad14' }, { offset: 1, color: '#ffc53d' }]), borderRadius: [4, 4, 0, 0] },
        barWidth: '50%', markLine: { silent: true, data: markLineData }
      }]
    };
    if (!charts.revenue) { charts.revenue = echarts.init(document.getElementById('chart-revenue')); charts.revenue.setOption(revenueOption); } else { charts.revenue.resize(); }

    const activityOption = {
      tooltip: { trigger: 'axis', formatter: function(p) { let s = p[0].axisValue; p.forEach(i => { s += `<br/>${i.marker} ${i.seriesName}: ${i.value}次`; }); return s; } },
      legend: { data: ['开车任务', '陪档任务', '收送礼任务'], top: 5 },
      grid: { left: 50, right: 30, top: 40, bottom: 50 },
      xAxis: { type: 'category', data: labels, axisLabel: { rotate: 45, fontSize: 10 } },
      yAxis: { type: 'value', name: '次数' },
      series: [
        { name: '开车任务', type: 'bar', stack: 'total', data: data.map(d => d.total_drive_tasks || 0), itemStyle: { color: '#1890ff' } },
        { name: '陪档任务', type: 'bar', stack: 'total', data: data.map(d => d.total_accompany_tasks || 0), itemStyle: { color: '#52c41a' } },
        { name: '收送礼任务', type: 'bar', stack: 'total', data: data.map(d => d.total_gift_tasks || 0), itemStyle: { color: '#faad14' } }
      ]
    };
    if (!charts.activity) { charts.activity = echarts.init(document.getElementById('chart-activity')); charts.activity.setOption(activityOption); } else { charts.activity.resize(); }
  } catch (e) { console.error('趋势图表加载失败:', e); }
}

async function initCompareChart() {
  try {
    const res = await fetch(API_BASE + '/api/weekly-report?limit=all' + getHallParam());
    const result = await res.json();
    const data = result.data;
    if (data && data.length > 0) {
      const policyDate = '2026-07-17';
      const validData = data.filter(d => d.week_start && d.week_start.startsWith('2026'));
      const before = validData.filter(d => d.week_end < policyDate);
      let after = validData.filter(d => d.week_start >= policyDate);
      if (currentWeek && currentWeek.includes('|')) {
        const selectedEnd = currentWeek.split('|')[1];
        after = after.filter(d => d.week_end <= selectedEnd);
      }
      const avg = (arr, key) => arr.length > 0 ? arr.reduce((s, d) => s + d[key], 0) / arr.length : 0;
      const metrics = [
        { name: '📦 周均新成团数', key: 'new_team_count', unit: '个' },
        { name: '🔄 进行中团数', key: 'active_team_count_end', unit: '个' },
        { name: '💯 平均留存率', key: 'retention_rate', unit: '%', cap: 100 },
        { name: '🚫 平均解散率', key: 'dissolution_rate', unit: '%', reverse: true },
        { name: '💰 周均总流水', key: 'total_reward', unit: '元' },
        { name: '📊 平均活跃度', key: 'activity_index', unit: '' },
        { name: '🏆 成就达成率', unit: '%', calc: (d) => { const total = (d.level_achievement_count || 0) + (d.revenue_achievement_count || 0); const active = d.active_team_count_end || 1; return total / active * 100; } },
        { name: '⚠️ 主动解散占比', unit: '%', reverse: true, calc: (d) => { const diss = d.dissolved_count || 0; const active = d.active_dissolved_count || 0; return diss > 0 ? active / diss * 100 : 0; } }
      ];
      const tbody = document.getElementById('compare-table-body');
      tbody.innerHTML = metrics.map(m => {
        const getVal = (arr) => {
          if (m.calc) return arr.reduce((s, d) => s + m.calc(d), 0) / arr.length;
          let v = arr.reduce((s, d) => s + (d[m.key] || 0), 0) / arr.length;
          if (m.cap) v = Math.min(m.cap, v);
          return v;
        };
        const b = getVal(before); const a = getVal(after);
        let changePct = 0, arrow = '→', trend = '⚪', trendClass = 'flat';
        if (b > 0) { changePct = ((a - b) / b * 100); arrow = changePct > 0 ? '↑' : changePct < 0 ? '↓' : '→'; const isGood = m.reverse ? changePct < 0 : changePct > 0; trend = isGood ? '🟢' : changePct === 0 ? '⚪' : '🔴'; trendClass = isGood ? 'up' : changePct === 0 ? 'flat' : 'down'; }
        const fmt = (v) => m.unit === '元' ? `¥${v.toFixed(0)}` : `${v.toFixed(m.key === 'activity_index' ? 2 : 1)}${m.unit}`;
        return `<tr><td>${m.name}</td><td>${fmt(b)}</td><td>${fmt(a)}</td><td class="kpi-change ${trendClass}">${arrow}${Math.abs(changePct).toFixed(1)}%</td><td>${trend}</td></tr>`;
      }).join('');
    }
    try {
      const hallRes = await fetch(API_BASE + '/api/hall-stats?limit=999');
      const hallResult = await hallRes.json();
      hallCompareData = hallResult.data || [];
      renderHallComparePage();
    } catch (e) { console.error('大厅排名加载失败:', e); }

    try {
      const validData = data.filter(d => d.week_start && d.week_start.startsWith('2026'));
      const labels = validData.map((d, i) => {
        const isLast = i === validData.length - 1;
        return isLast ? d.week_label + ' (收集中)' : d.week_label;
      });
      const newTeams = validData.map(d => d.new_team_count || 0);
      const dissolved = validData.map(d => d.dissolved_count || 0);
      if (!charts.compareDual) { charts.compareDual = echarts.init(document.getElementById('chart-compare-dual')); }
      charts.compareDual.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        legend: { data: ['新成团数', '解散数'], top: 5 },
        grid: { left: 50, right: 50, top: 40, bottom: 50 },
        xAxis: { type: 'category', data: labels, axisLabel: { rotate: 45, fontSize: 10 } },
        yAxis: [
          { type: 'value', name: '新成团(个)', position: 'left', axisLine: { lineStyle: { color: '#667eea' } } },
          { type: 'value', name: '解散(个)', position: 'right', axisLine: { lineStyle: { color: '#ff4d4f' } } }
        ],
        series: [
          { name: '新成团数', type: 'bar', data: newTeams, itemStyle: { color: '#667eea', borderRadius: [4,4,0,0] }, barWidth: '40%' },
          { name: '解散数', type: 'line', yAxisIndex: 1, data: dissolved, smooth: true, lineStyle: { color: '#ff4d4f', width: 2 }, itemStyle: { color: '#ff4d4f' } }
        ]
      });
    } catch (e) { console.error('双轴图加载失败:', e); }
    setTimeout(() => {
      if (charts.hallCompare) charts.hallCompare.resize();
      if (charts.compareDual) charts.compareDual.resize();
    }, 100);
  } catch (e) { console.error('对比分析加载失败:', e); }
}

let detailPerPage = 20;
let hallComparePage = 0;
let hallCompareData = [];
let detailStatus = 'all';

function renderHallComparePage() {
  // 搜索过滤
  let filtered = hallCompareData;
  if (hallCompareSearch) {
    const kw = hallCompareSearch.toLowerCase();
    filtered = hallCompareData.filter(d => d.hall_name && d.hall_name.toLowerCase().includes(kw));
  }

  // 排序
  filtered = filtered.slice().sort((a, b) => {
    const av = a[hallCompareSortField] || 0;
    const bv = b[hallCompareSortField] || 0;
    return hallCompareSortOrder === 'asc' ? av - bv : bv - av;
  });

  const perPage = 10;
  const total = filtered.length;
  const totalPages = Math.ceil(total / perPage);
  const start = hallComparePage * perPage;
  const end = Math.min(start + perPage, total);
  const pageData = filtered.slice(start, end);

  if (pageData.length > 0) {
    const hallNames = pageData.map(d => d.hall_name);
    const hallCounts = pageData.map(d => d.active_count);
    if (!charts.hallCompare) {
      charts.hallCompare = echarts.init(document.getElementById('chart-hall-compare'));
      charts.hallCompare.on('click', function(params) {
        switchTab('details');
        document.getElementById('detail-search').value = params.name;
        loadDetailTable(1);
      });
    }
    charts.hallCompare.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: '{b}<br/>进行中团数: {c}' },
      grid: { left: 160, right: 30, top: 20, bottom: 30 },
      xAxis: { type: 'value', max: 20, minInterval: 1 },
      yAxis: { type: 'category', data: hallNames.reverse(), axisLabel: { fontSize: 11 } },
      series: [{ name: '进行中团数', type: 'bar', data: hallCounts.reverse(), barMaxWidth: 30, itemStyle: { color: '#667eea', borderRadius: [0,4,4,0] } }]
    });
  } else {
    // 无数据时清空图表
    if (charts.hallCompare) {
      charts.hallCompare.setOption({ yAxis: { data: [] }, series: [{ data: [] }] });
    }
  }

  let html = `<span style="font-size:13px;color:#666;margin-right:12px;">共 ${total} 个大厅 · 第 ${hallComparePage + 1}/${totalPages || 1} 页</span>`;
  if (hallComparePage > 0) html += `<button onclick="hallComparePage--;renderHallComparePage();">上一页</button>`;
  for (let i = 0; i < totalPages; i++) {
    html += `<button class="${i === hallComparePage ? 'active' : ''}" onclick="hallComparePage=${i};renderHallComparePage();">${i + 1}</button>`;
  }
  if (hallComparePage < totalPages - 1) html += `<button onclick="hallComparePage++;renderHallComparePage();">下一页</button>`;
  document.getElementById('hall-compare-pagination').innerHTML = html;
}

