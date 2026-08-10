function getCurrentWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = d => String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return fmt(monday) + ' ~ ' + fmt(sunday);
}


async function loadKPI() {
  try {
    const res = await fetch(API_BASE + '/api/kpi?' + getHallParam() + getWeekParam());
    const result = await res.json();
    const d = result.data;
    document.getElementById('current-period').textContent = getCurrentWeekRange() || result.week || result.date || '--';
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
    const res = await fetch(API_BASE + '/api/daily-retention?weeks=10' + getHallParam());
    const data = await res.json();
    const sliceSize = 10;
    const dates = data.dates.slice(-sliceSize);
    const values = data.new_teams.slice(-sliceSize);
    const chart = echarts.init(document.getElementById('chart-trend'));
    charts.trend = chart;
    chart.setOption({ tooltip: { trigger: 'axis' }, grid: { left: 50, right: 30, top: 30, bottom: 40 }, xAxis: { type: 'category', data: dates, axisLabel: { rotate: 45, fontSize: 11 } }, yAxis: { type: 'value', name: '个' }, series: [{ name: '新成团数', type: 'line', data: values, smooth: true, lineStyle: { color: '#667eea', width: 2 }, itemStyle: { color: '#667eea' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(102,126,234,0.3)' }, { offset: 1, color: 'rgba(102,126,234,0.05)' }]) } }] });
  } catch (e) { console.error('趋势图加载失败:', e); }
}

async function initOverviewRetentionChart() {
  if (charts.overviewRetention) { charts.overviewRetention.resize(); return; }
  try {
    const res = await fetch(API_BASE + '/api/daily-retention?weeks=10' + getHallParam());
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
    const cutoffDate = '2026-07-01';
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
      tooltip: { trigger: 'axis', formatter: '{b}<br/>礼物奖励金额: ¥{c}' },
      grid: { left: 50, right: 30, top: 30, bottom: 50 },
      xAxis: { type: 'category', data: labels, axisLabel: { rotate: 45, fontSize: 10 } },
      yAxis: { type: 'value', name: '元' },
      series: [{
        name: '礼物奖励金额', type: 'bar', data: data.map(d => d.total_reward || 0),
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
      const validData = data.filter(d => d.week_start && d.week_start.startsWith('2026'));
      // Filter by selected week if applicable
      let filteredData = validData;
      if (currentWeek && currentWeek.includes('|')) {
        const selectedEnd = currentWeek.split('|')[1];
        filteredData = validData.filter(d => d.week_end <= selectedEnd);
      }
      // Take last two records as 上周 and 本周
      const lastWeek = filteredData.length >= 2 ? filteredData[filteredData.length - 2] : null;
      const thisWeek = filteredData.length >= 1 ? filteredData[filteredData.length - 1] : null;
      const metrics = [
        { name: '📦 周新成团数', key: 'new_team_count', unit: '个' },
        { name: '🔄 进行中团数', key: 'active_team_count_end', unit: '个' },
        { name: '💯 留存率', key: 'retention_rate', unit: '%', cap: 100 },
        { name: '🚫 解散率', key: 'dissolution_rate', unit: '%', reverse: true },
        { name: '💰 周礼物奖励金额', key: 'total_reward', unit: '元' },
        { name: '⚠️ 主动解散占比', unit: '%', reverse: true, calc: (d) => { const diss = d.dissolved_count || 0; const active = d.active_dissolved_count || 0; return diss > 0 ? active / diss * 100 : 0; } }
      ];
      const tbody = document.getElementById('compare-table-body');
      tbody.innerHTML = metrics.map(m => {
        const getVal = (weekData) => {
          if (!weekData) return 0;
          if (m.calc) return m.calc(weekData);
          let v = weekData[m.key] || 0;
          if (m.cap) v = Math.min(m.cap, v);
          return v;
        };
        const b = getVal(lastWeek);
        const a = getVal(thisWeek);
        let changePct = 0, arrow = '→', trend = '⚪', trendClass = 'flat';
        if (b > 0) { changePct = ((a - b) / b * 100); arrow = changePct > 0 ? '↑' : changePct < 0 ? '↓' : '→'; const isGood = m.reverse ? changePct < 0 : changePct > 0; trend = isGood ? '🟢' : changePct === 0 ? '⚪' : '🔴'; trendClass = isGood ? 'up' : changePct === 0 ? 'flat' : 'down'; }
        const fmt = (v) => {
          if (v === null || v === undefined || Number.isNaN(v)) return '—';
          const n = Number(v);
          if (!Number.isFinite(n)) return '—';
          if (m.unit === '元') return `¥${n.toFixed(0)}`;
          return `${n.toFixed(m.key === 'activity_index' ? 2 : 1)}${m.unit}`;
        };
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
      let validData = data.filter(d => d.week_start && d.week_start.startsWith('2026'));
      if (currentWeek && currentWeek.includes('|')) {
        const selectedEnd = currentWeek.split('|')[1];
        validData = validData.filter(d => d.week_end <= selectedEnd);
      }
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
      }, true);
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

  // 指标配置：标签、单位、颜色
  const metricConfig = {
    active_count:    { label: '进行中团数', unit: '个', color: '#667eea' },
    team_count:      { label: '总团数',     unit: '个', color: '#52c41a' },
    dissolved_count: { label: '解散数',     unit: '个', color: '#ff4d4f' },
    total_revenue:   { label: '礼物奖励金额',     unit: '元', color: '#faad14' },
  };
  const cfg = metricConfig[hallCompareSortField] || metricConfig.active_count;

  if (pageData.length > 0) {
    const hallNames = pageData.map(d => d.hall_name);
    const values = pageData.map(d => d[hallCompareSortField] || 0);
    const maxVal = Math.max(...values);
    const xMax = Math.ceil(maxVal * 1.2) || 1;

    if (!charts.hallCompare) {
      charts.hallCompare = echarts.init(document.getElementById('chart-hall-compare'));
      charts.hallCompare.on('click', function(params) {
        switchTab('details');
        document.getElementById('detail-search').value = params.name;
        loadDetailTable(1);
      });
    }
    charts.hallCompare.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: `{b}<br/>${cfg.label}: {c}${cfg.unit}` },
      grid: { left: 160, right: 30, top: 20, bottom: 30 },
      xAxis: { type: 'value', max: xMax, minInterval: 1 },
      yAxis: { type: 'category', data: hallNames.reverse(), axisLabel: { fontSize: 11 } },
      series: [{ name: cfg.label, type: 'bar', data: values.reverse(), barMaxWidth: 30, itemStyle: { color: cfg.color, borderRadius: [0,4,4,0] } }]
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

function renderUIDResult(data) {
  _lastUIDResult = data;
  const thisWeekLabel = data.this_week?.week_label || '本周';
  const lastWeekLabel = data.last_week?.week_label || '上周';
  document.getElementById('th-this-week').textContent = thisWeekLabel;
  document.getElementById('th-last-week').textContent = lastWeekLabel;
  document.getElementById('res-uid').textContent = data.uid;
  document.getElementById('res-nickname').textContent = data.nickname || '--';
  document.getElementById('res-type').textContent = data.type_label || '--';
  const cmp = data.compare || {};
  const thisData = data.this_week?.data || {};
  const lastData = data.last_week?.data || {};
  document.getElementById('res-hall').textContent = (cmp.hall?.this || thisData.schedule_hall || '--');
  document.getElementById('res-elite').textContent = (cmp.is_elite?.this || thisData.is_elite || '--');
  document.getElementById('res-protection').textContent = thisData.protection_end || '--';
  document.getElementById('res-total-revenue').textContent = '¥' + (data.team_total_revenue || 0).toLocaleString();
  document.getElementById('res-hist-level').textContent = thisData.hist_best_level || '--';

  const rows = [
    { key: 'week_level', label: '⭐ 当周队长等级', fmt: v => v || '--' },
    { key: 'week_schedule_days', label: '📅 当周排档天数', fmt: v => v + '天', isNum: true },
    { key: 'daily_task_count', label: '📋 每日任务完成', fmt: v => v + '次', isNum: true },
    { key: 'week_revenue', label: '💰 当周礼物流水', fmt: v => '¥' + v.toLocaleString(), isNum: true },
    { key: 'week_accompany_time', label: '⏱ 当周陪档时长', fmt: v => v + '分钟', isNum: true },
    { key: 'week_rank', label: '🏆 排行榜排名', fmt: v => v, isRank: true },
    { key: 'best_4week_level', label: '🏅 4周最高等级', fmt: v => v || '--' },
  ];

  const tbody = document.getElementById('uid-compare-body');
  let html = rows.map(r => {
    const c = cmp[r.key];
    if (!c) return '';
    let trendClass = c.trend || 'flat';
    let trendIcon = trendClass === 'up' ? '🟢' : trendClass === 'down' ? '🔴' : '⚪';
    let trendText = trendClass === 'up' ? '增长' : trendClass === 'down' ? '下降' : '持平';
    let thisVal, lastVal;
    if (r.isNum && !r.isRank) { thisVal = r.fmt(c.this); lastVal = r.fmt(c.last); }
    else if (r.isRank) { thisVal = c.this; lastVal = c.last; }
    else { thisVal = r.fmt(c.this); lastVal = r.fmt(c.last); }
    let changePct = c.change_pct !== undefined ? `+${c.change_pct}%` : '—';
    if (c.change_pct < 0) changePct = `${c.change_pct}%`;
    if (c.change_pct === 0 || c.change_pct === undefined) changePct = '—';
    return `<tr><td class="col-metric">${r.label}</td><td class="col-this">${thisVal}</td><td class="col-last">${lastVal}</td><td class="col-change ${trendClass}">${c.change || '—'}</td><td class="col-change ${trendClass}">${changePct}</td><td class="col-trend ${trendClass}">${trendIcon} ${trendText}</td></tr>`;
  }).join('');

  const hallThis = cmp.hall?.this || thisData.schedule_hall || thisData.auth_hall || '--';
  const hallLast = cmp.hall?.last || lastData.schedule_hall || lastData.auth_hall || '--';
  html += `<tr><td class="col-metric">👥 参与姐妹团</td><td class="col-this">${hallThis}</td><td class="col-last">${hallLast}</td><td class="col-change flat">—</td><td class="col-change flat">—</td><td class="col-trend flat">⚪ 持平</td></tr>`;
  tbody.innerHTML = html;
  renderTeamInfo(data);
  renderBoundSisters(data);
  renderPartnerCompare(data);
}

function renderTeamInfo(data) {
  const card = document.getElementById('team-info-card');
  const body = document.getElementById('team-info-body');
  const t = data.team_info;
  if (!t) { card.style.display = 'none'; return; }

  const statusColor = t.status === '进行中' ? '#52c41a' : '#ff4d4f';
  const statusIcon = t.status === '进行中' ? '✓' : '✗';

  let membersHtml = `
    <div class="team-member">
      <div class="member-badge">姐</div>
      <div class="member-info">
        <div class="member-name">${t.sister_nickname || '--'}</div>
        <div class="member-uid">UID: ${t.sister_uid || '--'}</div>
      </div>
    </div>`;

  const boundSisters = data.bound_sisters || [];
  if (boundSisters.length > 0) {
    for (let i = 0; i < boundSisters.length; i++) {
      const bs = boundSisters[i];
      membersHtml += `
        <div class="team-member">
          <div class="member-badge" style="background:#f6a6c1;">妹${i + 1}</div>
          <div class="member-info">
            <div class="member-name">${bs.nickname || bs.team_info?.sister_nickname2 || '--'}</div>
            <div class="member-uid">UID: ${bs.uid || bs.team_info?.sister_uid2 || '--'}</div>
          </div>
        </div>`;
    }
  } else if (t.sister_nickname2 || t.sister_uid2) {
    membersHtml += `
      <div class="team-member">
        <div class="member-badge" style="background:#f6a6c1;">妹</div>
        <div class="member-info">
          <div class="member-name">${t.sister_nickname2 || '--'}</div>
          <div class="member-uid">UID: ${t.sister_uid2 || '--'}</div>
        </div>
      </div>`;
  }

  body.innerHTML = `
    <div class="team-detail-grid">
      <div class="team-detail-item">
        <span class="team-detail-label">🏠 大厅名称</span>
        <span class="team-detail-value">${t.hall_name || '--'}</span>
      </div>
      <div class="team-detail-item">
        <span class="team-detail-label">📅 成团日期</span>
        <span class="team-detail-value">${t.form_date || '--'}</span>
      </div>
      <div class="team-detail-item">
        <span class="team-detail-label">💰 姐妹团累计流水</span>
        <span class="team-detail-value">¥${(data.team_total_revenue || t.total_revenue || 0).toLocaleString()}</span>
      </div>
      <div class="team-detail-item">
        <span class="team-detail-label">🎁 奖励金额</span>
        <span class="team-detail-value">¥${(t.reward_amount || 0).toLocaleString()}</span>
      </div>
      <div class="team-detail-item">
        <span class="team-detail-label">📊 状态</span>
        <span class="team-detail-value" style="color:${statusColor}; font-weight:600;">${statusIcon} ${t.status}${t.status === '已解散' && t.dissolve_date ? ' (' + t.dissolve_date + ')' : ''}</span>
      </div>
    </div>
    <div class="team-members">
      ${membersHtml}
    </div>
  `;
  card.style.display = 'block';
}

function renderBoundSisters(data) {
  const card = document.getElementById('bound-sisters-card');
  const body = document.getElementById('bound-sisters-body');
  const sisters = data.bound_sisters || [];
  if (!sisters.length) { card.style.display = 'none'; return; }

  let html = '<table class="compare-table"><thead><tr><th>妹妹昵称</th><th>UID</th><th>所在大厅</th><th>状态</th><th>成团日期</th><th>本周等级</th><th>本周流水</th></tr></thead><tbody>';
  for (const s of sisters) {
    const t = s.team_info || {};
    const u = s.uid_data || {};
    const thisData = u.this_week?.data || {};
    const level = thisData.week_level || '--';
    const revenue = thisData.week_revenue !== undefined ? '¥' + thisData.week_revenue.toLocaleString() : '--';
    const statusColor = t.status === '进行中' ? '#52c41a' : '#ff4d4f';
    html += `<tr>
      <td>${s.nickname || '--'}</td>
      <td>${s.uid || '--'}</td>
      <td>${t.hall_name || '--'}</td>
      <td style="color:${statusColor}; font-weight:600;">${t.status || '--'}</td>
      <td>${t.form_date || '--'}</td>
      <td>${level}</td>
      <td>${revenue}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  body.innerHTML = html;
  card.style.display = 'block';
}

let _partnerChart = null;

async function renderPartnerCompare(data) {
  const card = document.getElementById('partner-compare-card');
  const chartDiv = document.getElementById('partner-compare-chart');
  const tableDiv = document.getElementById('partner-compare-table');
  const t = data.team_info;

  if (!t || !t.sister_uid) {
    card.style.display = 'none';
    return;
  }

  const currentUid = String(data.uid);
  const sisterUid = String(t.sister_uid);
  const sisterUid2 = String(t.sister_uid2);

  const participants = [];
  const currentLabel = (currentUid === sisterUid) ? (t.sister_nickname || '姐姐') : (t.sister_nickname2 || '妹妹');
  participants.push({ label: currentLabel, data: data, isSelf: true });

  const boundSisters = data.bound_sisters || [];
  if (boundSisters.length > 0) {
    for (const bs of boundSisters) {
      if (bs.uid_data) {
        participants.push({
          label: bs.nickname || '妹妹',
          data: bs.uid_data,
          isSelf: false
        });
      }
    }
  } else if (currentUid === sisterUid2 && sisterUid) {
    const mockMode = document.getElementById('uid-mock').checked;
    const captainType = document.getElementById('uid-type').value;
    try {
      const resp = await fetch(API_BASE + '/api/uid-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: sisterUid, captain_type: captainType, mock: mockMode }),
      });
      const partnerData = await resp.json();
      if (!partnerData.error) {
        participants.push({
          label: t.sister_nickname || '姐姐',
          data: partnerData,
          isSelf: false
        });
      }
    } catch (e) {
      console.error('Partner compare error:', e);
    }
  }

  if (participants.length < 2) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  if (_partnerChart) { _partnerChart.dispose(); _partnerChart = null; }
  tableDiv.innerHTML = '';
  renderPartnerChartMulti(participants);
  renderPartnerTableMulti(participants);
}

function renderPartnerChartMulti(participants) {
  const chartDiv = document.getElementById('partner-compare-chart');
  const colors = ['#667eea', '#52c41a', '#faad14', '#ff4d4f', '#13c2c2', '#722ed1'];
  const levelOrder = { '无': 0, '铜牌': 1, '初级银牌': 2, '银牌': 3, '金牌': 4, '王牌': 5, '大神': 6 };
  const levelLabels = ['无', '铜牌', '初级银牌', '银牌', '金牌', '王牌', '大神'];

  const metricsLeft = [
    { key: 'week_level', name: '等级', isLevel: true },
    { key: 'week_schedule_days', name: '排档天数' },
    { key: 'daily_task_count', name: '任务完成' },
  ];
  const metricsCenter = [
    { key: 'week_revenue', name: '礼物流水' },
  ];
  const metricsRight = [
    { key: 'week_accompany_time', name: '陪档时长' },
  ];

  const series = [];
  participants.forEach((p, idx) => {
    const d = p.data.this_week?.data || {};
    const color = colors[idx % colors.length];

    series.push({
      name: p.label, type: 'bar', xAxisIndex: 0, yAxisIndex: 0,
      data: metricsLeft.map(m => m.isLevel ? (levelOrder[d[m.key]] ?? 0) : (d[m.key] || 0)),
      itemStyle: { color, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 20,
    });
    series.push({
      name: p.label, type: 'bar', xAxisIndex: 1, yAxisIndex: 1,
      data: [d.week_revenue || 0],
      itemStyle: { color, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 20,
    });
    series.push({
      name: p.label, type: 'bar', xAxisIndex: 2, yAxisIndex: 2,
      data: [d.week_accompany_time || 0],
      itemStyle: { color, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 20,
    });
  });

  if (!_partnerChart) {
    _partnerChart = echarts.init(chartDiv);
  }

  const hasAnyData = participants.some(p => {
    const d = p.data.this_week?.data || {};
    return (d.week_revenue || 0) > 0 || (d.week_schedule_days || 0) > 0 || (d.daily_task_count || 0) > 0;
  });
  if (!hasAnyData) {
    chartDiv.innerHTML = '<div style="padding:40px; text-align:center; color:#999;">⚠️ 对比数据为空（妹妹UID数据可能未成功加载）</div>';
    return;
  }

  _partnerChart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: function(params) {
        if (!params.length) return '';
        let html = '<strong>' + params[0].axisValue + '</strong><br/>';
        params.forEach(p => {
          let val = p.value;
          let unit = '';
          if (p.axisValue === '等级') {
            const levels = ['无', '铜牌', '初级银牌', '银牌', '金牌', '王牌', '大神'];
            val = levels[val] || val;
          } else if (p.axisValue === '礼物流水') unit = '元';
          else if (p.axisValue === '陪档时长') unit = '分钟';
          else if (p.axisValue === '任务完成') unit = '次';
          else if (p.axisValue === '排档天数') unit = '天';
          html += p.marker + ' ' + p.seriesName + ': ' + val + unit + '<br/>';
        });
        return html;
      }
    },
    legend: { data: participants.map(p => p.label), top: 5 },
    grid: [
      { left: '3%', width: '30%', top: 40, bottom: 30 },
      { left: '36%', width: '30%', top: 40, bottom: 30 },
      { left: '69%', width: '30%', top: 40, bottom: 30 },
    ],
    xAxis: [
      { type: 'category', data: metricsLeft.map(m => m.name), axisLabel: { fontSize: 11 }, gridIndex: 0 },
      { type: 'category', data: metricsCenter.map(m => m.name), axisLabel: { fontSize: 11 }, gridIndex: 1 },
      { type: 'category', data: metricsRight.map(m => m.name), axisLabel: { fontSize: 11 }, gridIndex: 2 },
    ],
    yAxis: [
      { type: 'value', min: 0, axisLabel: { fontSize: 10 }, gridIndex: 0, name: '基础指标', nameLocation: 'middle', nameGap: 25 },
      { type: 'value', axisLabel: { fontSize: 10 }, gridIndex: 1, name: '礼物流水(元)', nameLocation: 'middle', nameGap: 25 },
      { type: 'value', axisLabel: { fontSize: 10 }, gridIndex: 2, name: '陪档时长(分钟)', nameLocation: 'middle', nameGap: 25 },
    ],
    series: series,
  }, true);
  setTimeout(() => { if (_partnerChart) _partnerChart.resize(); }, 0);
}

function renderPartnerTableMulti(participants) {
  const tableDiv = document.getElementById('partner-compare-table');

  const rows = [
    { key: 'week_level', label: '当周队长等级', fmt: v => v || '--' },
    { key: 'week_schedule_days', label: '当周排档天数', fmt: v => (v || 0) + '天' },
    { key: 'daily_task_count', label: '每日任务完成', fmt: v => (v || 0) + '次' },
    { key: 'week_revenue', label: '当周礼物流水', fmt: v => '¥' + (v || 0).toLocaleString() },
    { key: 'week_accompany_time', label: '当周陪档时长', fmt: v => (v || 0) + '分钟' },
    { key: 'week_rank', label: '排行榜排名', fmt: v => v ? '第' + v + '名' : '未上榜' },
    { key: 'total_revenue', label: '累计流水', fmt: v => '¥' + (v || 0).toLocaleString() },
    { key: 'best_4week_level', label: '4周最高等级', fmt: v => v || '--' },
    { key: 'is_elite', label: '是否精英队长', fmt: v => v || '否' },
  ];

  let html = '<table class="compare-table"><thead><tr><th>指标</th>';
  participants.forEach(p => {
    html += '<th>' + p.label + '</th>';
  });
  html += '</tr></thead><tbody>';

  rows.forEach(r => {
    html += '<tr><td class="col-metric">' + r.label + '</td>';
    participants.forEach(p => {
      let rawVal;
      const d = p.data.this_week?.data || {};
      rawVal = d[r.key];
      const val = r.fmt(rawVal);
      const cls = p.isSelf ? 'col-this' : 'col-last';
      html += '<td class="' + cls + '">' + val + '</td>';
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  tableDiv.innerHTML = html;
}

function exportUIDResult() {
  if (!_lastUIDResult) { alert('请先进行UID查询'); return; }
  const d = _lastUIDResult;
  const cmp = d.compare || {};
  const thisLabel = d.this_week?.week_label || '本周';
  const lastLabel = d.last_week?.week_label || '上周';
  let csv = '\uFEFF';
  csv += `UID查询结果,${d.uid},${d.nickname},${d.type_label}\n`;
  csv += `指标,${thisLabel},${lastLabel},环比变化,变化率,趋势\n`;
  const rows = [
    { key: 'week_level', label: '当周队长等级' }, { key: 'week_schedule_days', label: '当周排档天数' },
    { key: 'daily_task_count', label: '每日任务完成次数' }, { key: 'week_revenue', label: '当周礼物流水' },
    { key: 'week_accompany_time', label: '当周陪档时长' }, { key: 'week_rank', label: '排行榜排名' },
    { key: 'best_4week_level', label: '4周最高等级' }, { key: 'hall', label: '参与姐妹团' },
  ];
  for (const r of rows) { const c = cmp[r.key]; if (!c) continue; const trendText = c.trend === 'up' ? '增长' : c.trend === 'down' ? '下降' : '持平'; const pct = c.change_pct !== undefined ? `${c.change_pct}%` : '—'; csv += `${r.label},${c.this},${c.last},${c.change || '—'},${pct},${trendText}\n`; }
  const thisData = d.this_week?.data || {};
  csv += `\n关联信息\n所属大厅,${cmp.hall?.this || thisData.schedule_hall || '—'}\n精英队长,${cmp.is_elite?.this || thisData.is_elite || '—'}\n保护期结束,${thisData.protection_end || '—'}\n累计流水,${cmp.total_revenue?.this || 0}\n历史最高等级,${thisData.hist_best_level || '—'}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `UID_${d.uid}_对比分析.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
