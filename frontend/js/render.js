async function initCompareChart() {
  try {
    const res = await fetch(API_BASE + '/api/weekly-report?limit=all' + getHallParam());
    const result = await res.json();
    const data = result.data;
    let lastWeek = null, thisWeek = null;
    if (data && data.length > 0) {
      const validData = data.filter(d => d.week_start && d.week_start.startsWith('2026'));
      // Filter by selected week if applicable
      let filteredData = validData;
      if (currentWeek && currentWeek.includes('|')) {
        const selectedEnd = currentWeek.split('|')[1];
        filteredData = validData.filter(d => d.week_end <= selectedEnd);
      }
      // Take last two records as 上周 and 本周
      lastWeek = filteredData.length >= 2 ? filteredData[filteredData.length - 2] : null;
      thisWeek = filteredData.length >= 1 ? filteredData[filteredData.length - 1] : null;
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
        return `<tr><td>${m.name}</td><td class="num">${fmt(b)}</td><td class="num">${fmt(a)}</td><td class="kpi-change num ${trendClass}">${arrow}${Math.abs(changePct).toFixed(1)}%</td><td>${trend}</td></tr>`;
      }).join('');
    }
    const insEl = document.getElementById('compare-table-insight');
    if (insEl && thisWeek) {
      const retD = Math.round(((thisWeek.retention_rate || 0) - (lastWeek ? (lastWeek.retention_rate || 0) : 0)) * 10) / 10;
      insEl.innerHTML = `本周留存率 <b>${thisWeek.retention_rate ?? '—'}%</b>（上周 ${lastWeek ? lastWeek.retention_rate ?? '—' : '—'}%），新成团 ${thisWeek.new_team_count ?? 0} 个、解散 ${thisWeek.dissolved_count ?? 0} 个。`;
    }
    try {
      const hallParam = currentHall === 'all' ? '&hall=all' : '';
      const hallRes = await fetch(API_BASE + '/api/hall-stats?limit=999' + hallParam);
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
      const dualEl = document.getElementById('chart-compare-dual');
      const dualVisible = dualEl && dualEl.offsetHeight > 0;
      if (!dualVisible) {
        if (charts.compareDual) { charts.compareDual.dispose(); charts.compareDual = null; }
      } else if (!charts.compareDual) {
        charts.compareDual = echarts.init(dualEl);
      }
      if (charts.compareDual) charts.compareDual.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, backgroundColor: 'rgba(26,29,38,.92)', borderWidth: 0, textStyle: { color: '#fff' } },
        legend: { data: ['新成团数', '解散数'], top: 5 },
        grid: { left: 50, right: 50, top: 40, bottom: 50 },
        xAxis: { type: 'category', data: labels, axisLabel: { rotate: 45, fontSize: 10 } },
        yAxis: [
          { type: 'value', name: '新成团(个)', position: 'left', axisLine: { lineStyle: { color: '#7C5CFF' } } },
          { type: 'value', name: '解散(个)', position: 'right', axisLine: { lineStyle: { color: '#D56060' } } }
        ],
        series: [
          { name: '新成团数', type: 'bar', data: newTeams, barWidth: '40%',
            itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#7C5CFF' }, { offset: 1, color: '#8F7BFF' }]), borderRadius: [4,4,0,0] } },
          { name: '解散数', type: 'line', yAxisIndex: 1, data: dissolved, smooth: true,
            lineStyle: { color: '#D56060', width: 2.5 },
            itemStyle: { color: '#D56060' },
            areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(213,96,96,.24)' }, { offset: 1, color: 'rgba(213,96,96,0)' }]) } }
        ]
      }, true);
      const insEl = document.getElementById('compare-dual-insight');
      if (insEl && newTeams.length) {
        const n = newTeams[newTeams.length - 1];
        const dd = dissolved[dissolved.length - 1];
        insEl.innerHTML = `最新一周新成团 <b>${n}</b> 个 vs 解散 <b>${dd}</b> 个，净${n >= dd ? '增' : '减'} <b>${Math.abs(n - dd)}</b> 个。`;
      }
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
    active_count:    { label: '进行中团数', unit: '个', color: '#7C5CFF', grad: '#8F7BFF' },
    team_count:      { label: '总团数',     unit: '个', color: '#3D9A6C', grad: '#6BC48E' },
    dissolved_count: { label: '解散数',     unit: '个', color: '#D56060', grad: '#F0A0A0' },
    total_revenue:   { label: '礼物奖励金额',     unit: '元', color: '#C98A2D', grad: '#E5C87E' },
  };
  const cfg = metricConfig[hallCompareSortField] || metricConfig.active_count;

  if (pageData.length > 0) {
    const hallNames = pageData.map(d => d.hall_name);
    const values = pageData.map(d => d[hallCompareSortField] || 0);
    const maxVal = Math.max(...values);
    const xMax = Math.ceil(maxVal * 1.2) || 1;

    const hallEl = document.getElementById('chart-hall-compare');
    const hallVisible = hallEl && hallEl.offsetHeight > 0;
    if (!hallVisible) {
      if (charts.hallCompare) { charts.hallCompare.dispose(); charts.hallCompare = null; }
    } else if (!charts.hallCompare) {
      charts.hallCompare = echarts.init(hallEl);
      charts.hallCompare.on('click', function(params) {
        // 联动大厅筛选：明细表和存活分析都按点击的大厅过滤
        const sel = document.getElementById('hall-select');
        if (sel && [...sel.options].some(o => o.value === params.name)) {
          sel.value = params.name;
          currentHall = params.name;
          localStorage.setItem('wb_hall', params.name);
          document.getElementById('detail-search').value = '';
        } else {
          // 不在当前可选范围（如厅运营看全平台时），退回搜索框过滤
          currentHall = params.name;  // 存活分析等联动模块跟随点击的大厅
          document.getElementById('detail-search').value = params.name;
        }
        switchTab('details');
        loadDetailTable(1);
      });
    }
    if (charts.hallCompare) {
      charts.hallCompare.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(26,29,38,.92)', borderWidth: 0, textStyle: { color: '#fff' }, formatter: `{b}<br/>${cfg.label}: {c}${cfg.unit}` },
        grid: { left: 160, right: 40, top: 20, bottom: 30 },
        xAxis: { type: 'value', max: xMax, minInterval: 1 },
        yAxis: { type: 'category', data: hallNames.reverse(), axisLabel: { fontSize: 11 } },
        series: [{ name: cfg.label, type: 'bar', data: values.reverse(), barMaxWidth: 30,
          itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: cfg.color }, { offset: 1, color: cfg.grad }]), borderRadius: [0,4,4,0] },
          label: { show: true, position: 'right', fontSize: 10, color: '#6B7280', formatter: p => cfg.unit === '元' ? wbFmtMoney(p.value) : p.value + cfg.unit }
        }]
      });
    }
  } else {
    // 无数据时清空图表
    if (charts.hallCompare) {
      charts.hallCompare.setOption({ yAxis: { data: [] }, series: [{ data: [] }] });
    }
  }

  let html = `<span style="font-size:13px;color:#666;margin-right:12px;">共 ${total} 个大厅 · 第 ${hallComparePage + 1}/${totalPages || 1} 页</span>`;
  if (hallComparePage > 0) html += `<button onclick="hallComparePage--;renderHallComparePage();">上一页</button>`;
  pagerRange(hallComparePage, totalPages).forEach(i => {
    html += i === '...'
      ? '<span class="pager-dots">…</span>'
      : `<button class="${i === hallComparePage ? 'active' : ''}" onclick="hallComparePage=${i};renderHallComparePage();">${i + 1}</button>`;
  });
  if (hallComparePage < totalPages - 1) html += `<button onclick="hallComparePage++;renderHallComparePage();">下一页</button>`;
  document.getElementById('hall-compare-pagination').innerHTML = html;
  const insEl = document.getElementById('hall-compare-insight');
  if (insEl && hallCompareData.length) {
    const byRev = [...hallCompareData].sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0))[0];
    const byAct = [...hallCompareData].sort((a, b) => (b.active_count || 0) - (a.active_count || 0))[0];
    insEl.innerHTML = `流水最高「${byRev.hall_name}」${wbFmtMoney(byRev.total_revenue)}，进行中团最多「${byAct.hall_name}」${byAct.active_count} 个。`;
  }
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

  const statusColor = t.status === '进行中' ? '#3D9A6C' : '#D56060';
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
    const statusColor = t.status === '进行中' ? '#3D9A6C' : '#D56060';
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
  const colors = ['#7C5CFF', '#3D9A6C', '#C98A2D', '#D56060', '#13c2c2', '#722ed1'];
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

/* ═══════════════ 自选对比：任选两厅逐项对比 ═══════════════ */
let cmpHalls = [];
let _cmpCharts = {};

async function openCompareModal() {
  const modal = document.getElementById('compare-modal');
  if (!modal) return;
  modal.classList.add('active');
  try {
    const res = await fetch(API_BASE + '/api/hall-stats?limit=999');
    const d = await res.json();
    cmpHalls = (d.data || []).slice().sort((a, b) => b.team_count - a.team_count);
    const selA = document.getElementById('cmp-hall-a');
    const selB = document.getElementById('cmp-hall-b');
    if (cmpHalls.length < 2) {
      selA.innerHTML = '<option>可选大厅不足</option>';
      document.getElementById('cmp-cards').innerHTML = '<div class="kpi-note">当前范围可用大厅不足两个，无法对比。</div>';
      return;
    }
    selA.innerHTML = cmpHalls.map((h, i) => `<option value="${i}">${h.hall_name}</option>`).join('');
    selB.innerHTML = cmpHalls.map((h, i) => `<option value="${i}">${h.hall_name}</option>`).join('');
    selB.value = '1';
    runHallCompare();
  } catch (e) { console.error('自选对比加载失败:', e); }
}

function closeCompareModal() {
  const modal = document.getElementById('compare-modal');
  if (modal) modal.classList.remove('active');
}

function swapCmpHalls() {
  const a = document.getElementById('cmp-hall-a');
  const b = document.getElementById('cmp-hall-b');
  const t = a.value; a.value = b.value; b.value = t;
  runHallCompare();
}

async function runHallCompare() {
  const selA = document.getElementById('cmp-hall-a');
  const selB = document.getElementById('cmp-hall-b');
  if (!selA || !selB) return;
  const a = cmpHalls[+selA.value];
  const b = cmpHalls[+selB.value];
  if (!a || !b || a.hall_name === b.hall_name) { alert('请选择两个不同的厅'); return; }
  document.getElementById('cmp-title').textContent = `「${a.hall_name}」 vs 「${b.hall_name}」`;
  try {
    // 当前周快照：直接从已加载的 cmpHalls 取（hall-stats 接口对 admin 忽略单厅参数）
    const sa = cmpHalls.find(h => h.hall_name === a.hall_name) || {};
    const sb = cmpHalls.find(h => h.hall_name === b.hall_name) || {};
    // 趋势：两厅各自周报
    const [wa, wb] = await Promise.all([
      fetch(API_BASE + '/api/weekly-report?limit=all&hall=' + encodeURIComponent(a.hall_name)).then(r => r.json()),
      fetch(API_BASE + '/api/weekly-report?limit=all&hall=' + encodeURIComponent(b.hall_name)).then(r => r.json()),
    ]);
    renderCmpCards(a, b, sa, sb, wa.data || [], wb.data || []);
    renderCmpMetricsChart(a, b, sa, sb);
    renderCmpTrend('cmp-chart-ret', a.hall_name, b.hall_name, wa.data || [], wb.data || [], 'retention_rate', 'pct');
    renderCmpTrend('cmp-chart-rev', a.hall_name, b.hall_name, wa.data || [], wb.data || [], 'total_reward', 'money');
  } catch (e) { console.error('自选对比渲染失败:', e); }
}

function renderCmpCards(a, b, sa, sb, wa, wb) {
  const lastOf = (arr, key) => { const l = arr[arr.length - 1]; return l ? l[key] : null; };
  const metrics = [
    { label: '🏠 进行中团数', va: sa.active_count, vb: sb.active_count, unit: ' 个', goodHigher: true, accent: 'acc-green' },
    { label: '🧱 总团数', va: sa.team_count, vb: sb.team_count, unit: ' 个', goodHigher: true, accent: 'acc-violet' },
    { label: '💥 解散数', va: sa.dissolved_count, vb: sb.dissolved_count, unit: ' 个', goodHigher: false, accent: 'acc-red' },
    { label: '💰 礼物流水', va: sa.total_revenue, vb: sb.total_revenue, money: true, goodHigher: true, accent: 'acc-gold' },
    { label: '💯 留存率（最近周）', va: lastOf(wa, 'retention_rate'), vb: lastOf(wb, 'retention_rate'), pct: true, goodHigher: true, accent: 'acc-green' },
    { label: '🚫 解散率（最近周）', va: lastOf(wa, 'dissolution_rate'), vb: lastOf(wb, 'dissolution_rate'), pct: true, goodHigher: false, accent: 'acc-red' },
  ];
  document.getElementById('cmp-cards').innerHTML = metrics.map(m => {
    const hasA = m.va !== null && m.va !== undefined && !Number.isNaN(m.va);
    const hasB = m.vb !== null && m.vb !== undefined && !Number.isNaN(m.vb);
    const fmt = v => m.money ? '¥' + Number(v).toFixed(0) : m.pct ? Number(v) + '%' : Number(v) + (m.unit || '');
    let diffHtml = '<span class="chip flat">—</span>';
    if (hasA && hasB) {
      const d = m.vb - m.va;
      const good = m.goodHigher ? d > 0 : d < 0;
      const cls = d === 0 ? 'flat' : good ? 'up' : 'down';
      const t = m.pct ? (d > 0 ? '+' : '') + d + 'pp' : (d > 0 ? '+' : '') + Number(d).toFixed(0) + (m.money ? ' 元' : '');
      diffHtml = `<span class="chip ${cls}">B−A ${t}</span>`;
    }
    return `<div class="kpi-card ${m.accent}">
      <div class="kpi-label">${m.label}</div>
      <div class="kpi-value cmp-two"><span class="cmp-a">${hasA ? fmt(m.va) : '—'}</span><span class="cmp-sep">vs</span><span class="cmp-b">${hasB ? fmt(m.vb) : '—'}</span></div>
      <div class="policy-delta">${diffHtml}<span class="cmp-name">${a.hall_name} / ${b.hall_name}</span></div>
    </div>`;
  }).join('');
}

function renderCmpMetricsChart(a, b, sa, sb) {
  const el = document.getElementById('cmp-chart-metrics');
  if (!el) return;
  const cats = ['进行中团数', '总团数', '解散数'];
  const keys = ['active_count', 'team_count', 'dissolved_count'];
  const va = keys.map(k => sa[k] || 0);
  const vb = keys.map(k => sb[k] || 0);
  if (_cmpCharts.metrics) _cmpCharts.metrics.dispose();
  _cmpCharts.metrics = echarts.init(el);
  _cmpCharts.metrics.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(26,29,38,.92)', borderWidth: 0, textStyle: { color: '#fff' } },
    legend: { data: [a.hall_name, b.hall_name], top: 5, type: 'scroll' },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: cats },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      { name: a.hall_name, type: 'bar', data: va, barWidth: '32%',
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#8F7BFF' }, { offset: 1, color: '#7C5CFF' }]), borderRadius: [4, 4, 0, 0] } },
      { name: b.hall_name, type: 'bar', data: vb, barWidth: '32%',
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#6BC48E' }, { offset: 1, color: '#3D9A6C' }]), borderRadius: [4, 4, 0, 0] } },
    ],
  }, true);
  setTimeout(() => { if (_cmpCharts.metrics) _cmpCharts.metrics.resize(); }, 0);
}

function renderCmpTrend(id, nameA, nameB, wa, wb, key, kind) {
  const el = document.getElementById(id);
  if (!el) return;
  const ma = {}, mb = {}; const weekSet = new Set();
  (wa || []).forEach(r => { ma[r.week_label] = r; weekSet.add(r.week_label); });
  (wb || []).forEach(r => { mb[r.week_label] = r; weekSet.add(r.week_label); });
  const labels = [...weekSet].sort();
  const da = labels.map(l => ma[l] ? ma[l][key] : null);
  const db = labels.map(l => mb[l] ? mb[l][key] : null);
  const fmt = v => kind === 'money' ? wbFmtMoney(v) : (v == null ? '—' : v + '%');
  if (_cmpCharts[id]) _cmpCharts[id].dispose();
  _cmpCharts[id] = echarts.init(el);
  _cmpCharts[id].setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(26,29,38,.92)', borderWidth: 0, textStyle: { color: '#fff' },
      formatter: ps => { let h = ps[0].axisValue + '<br/>'; ps.forEach(p => { h += p.marker + ' ' + p.seriesName + ': ' + fmt(p.value) + '<br/>'; }); return h; } },
    legend: { data: [nameA, nameB], top: 5, type: 'scroll' },
    grid: { left: kind === 'money' ? 70 : 45, right: 20, top: 40, bottom: 32 },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, rotate: 30 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => kind === 'money' ? wbFmtMoney(v) : v } },
    series: [
      { name: nameA, type: 'line', data: da, smooth: true, connectNulls: true, lineStyle: { color: '#7C5CFF', width: 2.5 }, itemStyle: { color: '#7C5CFF' }, symbolSize: 5 },
      { name: nameB, type: 'line', data: db, smooth: true, connectNulls: true, lineStyle: { color: '#3D9A6C', width: 2.5 }, itemStyle: { color: '#3D9A6C' }, symbolSize: 5 },
    ],
  }, true);
  setTimeout(() => { if (_cmpCharts[id]) _cmpCharts[id].resize(); }, 0);
}
