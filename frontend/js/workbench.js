// workbench.js - 工作台（第一期改版）
// 数据来源：
//   /api/hall-overview  → 厅体检卡墙（厅运营）/ 厅排行榜（管理员）/ 预警横幅
//   /api/kpi            → KPI 大卡 + 小卡
//   /api/weekly-report  → 趋势图 + KPI 迷你趋势线

let wbOverview = null;  // { role, data: [{ hall_name, weeks: [...(升序)] }] }
let wbWeekly = [];      // 当前筛选大厅的周数据（升序，已按所选周截断）
let wbKpi = null;
let wbKpiMeta = { week: '', date: '' };
let wbPlatformWeekly = null;  // 平台（hall=all）周数据缓存，用于均值参考线

const WB_POLICY_DATE = '2026-07-17';
const WB_HEALTH_TXT = { red: '需关注', amber: '有波动', green: '健康' };

/* ─────────────── 小部件 ─────────────── */

function wbSpark(values, w = 180, h = 34) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1) * w).toFixed(1)},${(h - 3 - (v - min) / span * (h - 6)).toFixed(1)}`);
  const up = values[values.length - 1] >= values[0];
  const color = up ? 'var(--wb-up)' : 'var(--wb-down)';
  return `<svg class="spark" width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${w}" cy="${pts[pts.length - 1].split(',')[1]}" r="2.4" fill="${color}"/>
  </svg>`;
}

function wbChip(change, suffix = '%') {
  const v = Math.round(change * 10) / 10;
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  const arrow = v > 0 ? '↑' : v < 0 ? '↓' : '→';
  return `<span class="chip ${cls}">${arrow} ${Math.abs(v)}${suffix}</span>`;
}

function wbFmtMoney(v) {
  v = v || 0;
  return v >= 10000 ? '¥' + (v / 10000).toFixed(1) + 'w' : '¥' + Math.round(v).toLocaleString();
}

/* ─────────────── 健康度判定 ───────────────
   🔴 留存环比 ≤ -10pp，或流水环比 ≤ -20%，或连续2周新成团=0
   🟡 留存环比 -5~-10pp，或流水环比 -10%~-20%
   🟢 其余                                              */
function wbHealth(weeks) {
  if (!weeks || weeks.length < 2) return 'green';
  const prev = weeks[weeks.length - 2], last = weeks[weeks.length - 1];
  const ret = (last.retention_rate || 0) - (prev.retention_rate || 0);
  const revPrev = prev.total_reward || 0;
  const rev = revPrev > 0 ? ((last.total_reward || 0) - revPrev) / revPrev * 100 : 0;
  const zeroNew = !last.new_team_count && !prev.new_team_count;
  if (ret <= -10 || rev <= -20 || zeroNew) return 'red';
  if (ret <= -5 || rev <= -10) return 'amber';
  return 'green';
}

function wbHealthReason(weeks) {
  const prev = weeks[weeks.length - 2], last = weeks[weeks.length - 1];
  const ret = (last.retention_rate || 0) - (prev.retention_rate || 0);
  const revPrev = prev.total_reward || 0;
  const rev = revPrev > 0 ? ((last.total_reward || 0) - revPrev) / revPrev * 100 : 0;
  if (!last.new_team_count && !prev.new_team_count) return '连续2周新成团为 0';
  if (ret <= -10) return `留存率环比 ${Math.round(ret)}pp`;
  if (rev <= -20) return `流水环比 ${Math.round(rev)}%`;
  return '指标波动';
}

/* ─────────────── 卡墙 / 排行榜 / 横幅 ─────────────── */

async function loadWorkbenchOverview(initial = false) {
  try {
    const res = await fetch(API_BASE + '/api/hall-overview?weeks=7');
    wbOverview = await res.json();
  } catch (e) {
    console.error('大厅概览加载失败:', e);
    return;
  }
  // 首次加载时，若当前选中的厅没有周报数据，自动切到第一个有数据的厅
  if (initial && wbOverview.role !== 'admin' && wbOverview.data.length && currentHall !== 'all') {
    const hasData = wbOverview.data.some(d => d.hall_name === currentHall);
    if (!hasData) {
      currentHall = wbOverview.data[0].hall_name;
      const sel = document.getElementById('hall-select');
      if (sel) sel.value = currentHall;
      localStorage.setItem('wb_hall', currentHall);
    }
  }
  const isAdmin = wbOverview.role === 'admin';
  document.getElementById('wb-hall-wall').style.display = isAdmin ? 'none' : '';
  document.getElementById('wb-rank-board').style.display = isAdmin ? '' : 'none';
  if (isAdmin) wbRenderRank(); else wbRenderWall();
  wbRenderBanner();
}

function wbRenderWall() {
  const list = wbOverview.data
    .map(d => ({ d, s: wbHealth(d.weeks) }))
    .sort((a, b) => ({ red: 0, amber: 1, green: 2 }[a.s] - { red: 0, amber: 1, green: 2 }[b.s]));
  document.getElementById('wb-wall-title').textContent = `我的 ${list.length} 个厅`;
  document.getElementById('wb-hall-grid').innerHTML = list.map(({ d, s }) => {
    const weeks = d.weeks;
    const last = weeks[weeks.length - 1];
    const prev = weeks.length > 1 ? weeks[weeks.length - 2] : last;
    const retChange = (last.retention_rate || 0) - (prev.retention_rate || 0);
    const sparkVals = weeks.map(w => w.retention_rate || 0);
    return `<div class="hall-card ${d.hall_name === currentHall ? 'active' : ''}" tabindex="0"
      onclick="wbSelectHall('${d.hall_name.replace(/'/g, "\\'")}')"
      onkeydown="if(event.key==='Enter')wbSelectHall('${d.hall_name.replace(/'/g, "\\'")}')">
      <div class="hall-top"><span class="dot ${s}"></span><span class="hall-name">${d.hall_name}</span></div>
      <div class="hall-metric">
        <span class="hall-metric-label">留存率</span>
        <span class="hall-metric-value">${Math.round(last.retention_rate || 0)}%</span>
        ${wbChip(retChange, 'pp')}
      </div>
      ${wbSpark(sparkVals)}
      <div class="hall-sub">
        <span>新团 ${last.new_team_count || 0}</span>
        <span>流水 ${wbFmtMoney(last.total_reward)}</span>
        <span style="margin-left:auto;color:var(--wb-text-3)">${WB_HEALTH_TXT[s]}</span>
      </div>
    </div>`;
  }).join('');
}

function wbRenderRank() {
  // 按本周流水排名，并计算较上周位次变化
  const items = wbOverview.data.filter(d => d.weeks.length >= 1).map(d => {
    const last = d.weeks[d.weeks.length - 1];
    const prev = d.weeks.length > 1 ? d.weeks[d.weeks.length - 2] : null;
    return {
      name: d.hall_name,
      rev: last.total_reward || 0,
      ret: last.retention_rate || 0,
      newTeams: last.new_team_count || 0,
      prevRev: prev ? (prev.total_reward || 0) : null,
      prevRet: prev ? (prev.retention_rate || 0) : null,
    };
  });
  const rankOf = (key) => {
    const sorted = [...items].sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1));
    const map = {};
    sorted.forEach((it, idx) => { map[it.name] = idx + 1; });
    return map;
  };
  const revRank = rankOf('rev'), revPrevRank = rankOf('prevRev');
  const retRank = rankOf('ret'), retPrevRank = rankOf('prevRet');
  const move = m => {
    if (m === null || m === undefined) return '<span class="move same">—</span>';
    return m > 0 ? `<span class="move up">↑${m}</span>` : m < 0 ? `<span class="move down">↓${-m}</span>` : '<span class="move same">—</span>';
  };
  const top = items.sort((a, b) => b.rev - a.rev).slice(0, 20);
  document.getElementById('wb-rank-table').innerHTML = `
    <tr><th>#</th><th>大厅</th><th>周流水</th><th>流水位次</th><th>留存率</th><th>留存位次</th><th>新成团</th></tr>
    ${top.map((it, idx) => `<tr>
      <td class="rank-no ${idx < 3 ? 'top' : ''}">${idx + 1}</td>
      <td>${it.name}</td>
      <td>${wbFmtMoney(it.rev)}</td>
      <td>${move(it.prevRev === null ? null : revPrevRank[it.name] - revRank[it.name])}</td>
      <td>${Math.round(it.ret)}%</td>
      <td>${move(it.prevRet === null ? null : retPrevRank[it.name] - retRank[it.name])}</td>
      <td>${it.newTeams}</td>
    </tr>`).join('')}`;
}

function wbRenderBanner() {
  const banner = document.getElementById('wb-alert-banner');
  const bad = wbOverview.data.filter(d => wbHealth(d.weeks) === 'red');
  if (!bad.length) { banner.style.display = 'none'; return; }
  const shown = bad.slice(0, 3).map(d =>
    `<a href="javascript:void(0)" onclick="wbSelectHall('${d.hall_name.replace(/'/g, "\\'")}')">${d.hall_name} ${wbHealthReason(d.weeks)}</a>`
  ).join('、');
  const more = bad.length > 3 ? ` 等 ${bad.length} 个厅` : '';
  banner.innerHTML = `<span class="tag">需关注 ${bad.length}</span><span>${shown}${more}</span>
    <a href="javascript:void(0)" style="margin-left:auto" onclick="wbSelectHall('${bad[0].hall_name.replace(/'/g, "\\'")}')">查看 →</a>`;
  banner.style.display = '';
}

/* ─────────────── 联动 ─────────────── */

function wbSelectHall(hall) {
  const sel = document.getElementById('hall-select');
  if (sel) sel.value = hall;
  currentHall = hall;
  localStorage.setItem('wb_hall', hall);
  // 卡片选中态即时反馈
  document.querySelectorAll('#wb-hall-grid .hall-card').forEach(c => {
    c.classList.toggle('active', c.querySelector('.hall-name').textContent === hall);
  });
  refreshData();
}

/* ─────────────── KPI + 趋势 ─────────────── */

function wbFilteredWeekly() {
  let rows = wbWeekly.filter(d => d.week_start && d.week_start >= '2026-06-01');
  if (currentWeek && currentWeek.includes('|')) {
    const selectedEnd = currentWeek.split('|')[1];
    rows = rows.filter(d => d.week_end <= selectedEnd);
  }
  return rows.slice(-8);
}

async function refreshWorkbench() {
  try {
    const [kpiRes, weekRes, platRes] = await Promise.all([
      fetch(API_BASE + '/api/kpi?' + getHallParam() + getWeekParam()),
      fetch(API_BASE + '/api/weekly-report?limit=all' + getHallParam()),
      // 平台均值参考线数据（仅取一次并缓存）
      wbPlatformWeekly ? Promise.resolve(null) : fetch(API_BASE + '/api/weekly-report?limit=all&hall=all')
    ]);
    const kpiJson = await kpiRes.json();
    wbKpi = kpiJson.data || null;
    wbKpiMeta = { week: kpiJson.week || '', date: kpiJson.date || '' };
    wbWeekly = ((await weekRes.json()).data) || [];
    if (platRes) wbPlatformWeekly = ((await platRes.json()).data) || [];
    wbRenderKPI();
    wbRenderCharts();
  } catch (e) { console.error('工作台刷新失败:', e); }
}

function wbRenderKPI() {
  const hallLabel = currentHall === 'all' ? '全部大厅' : currentHall;
  document.getElementById('wb-kpi-title').textContent = '核心指标 · ' + hallLabel;
  document.getElementById('wb-kpi-subtitle').textContent = wbKpiMeta.week
    ? `数据周期 ${wbKpiMeta.week} · 对比上一周`
    : '本周 vs 上周';
  if (!wbKpi) {
    document.getElementById('wb-kpi-hero').innerHTML = ['💯 留存率', '🚫 解散率', '💰 礼物奖励金额']
      .map(l => `<div class="kpi-card"><div class="kpi-label">${l}</div><div class="kpi-value">--</div><div class="kpi-foot"><span class="kpi-note">该厅当前周期暂无数据</span></div></div>`).join('');
    document.getElementById('wb-kpi-sub').innerHTML = '';
    return;
  }
  const weeks = wbFilteredWeekly();
  const sparkOf = key => weeks.map(w => w[key] || 0);
  const heroes = [
    { label: '💯 留存率', v: wbKpi.retention.value + '%', c: wbKpi.retention.change, suf: 'pp', note: '(周末-新团)/周始', spark: sparkOf('retention_rate').map(x => Math.min(100, x)) },
    { label: '🚫 解散率', v: wbKpi.dissolution.value + '%', c: -wbKpi.dissolution.change, suf: 'pp', note: '下降为好', spark: sparkOf('dissolution_rate') },
    { label: '💰 礼物奖励金额', v: wbFmtMoney(wbKpi.revenue.value), c: wbKpi.revenue.change, suf: '%', note: '本周累计', spark: sparkOf('total_reward') },
  ];
  document.getElementById('wb-kpi-hero').innerHTML = heroes.map(k => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value">${k.v}</div>
      <div class="kpi-foot">${wbChip(k.c, k.suf)}<span class="kpi-note">${k.note}</span></div>
      ${wbSpark(k.spark)}
    </div>`).join('');
  const subs = [
    { label: '📦 新成团数', v: wbKpi.new_team.value + ' 个', c: wbKpi.new_team.change, suf: '%' },
    { label: '🔄 进行中姐妹团', v: wbKpi.active_team.value + ' 个', c: wbKpi.active_team.change, suf: '%' },
    { label: '⚠️ 主动解散占比', v: wbKpi.active_dissolved_pct.value + '%', c: -wbKpi.active_dissolved_pct.change, suf: 'pp' },
  ];
  document.getElementById('wb-kpi-sub').innerHTML = subs.map(k => `
    <div class="kpi-card small">
      <span class="kpi-label">${k.label}</span>
      <span class="kpi-value">${k.v}</span>
      ${wbChip(k.c, k.suf)}
    </div>`).join('');
}

function wbRenderCharts() {
  const data = wbFilteredWeekly();
  if (!data.length) {
    ['wb-retention', 'wb-dissolution', 'wb-revenue', 'wb-activity'].forEach(k => {
      const el = document.getElementById('wb-c-' + k.slice(3));
      if (charts[k]) { charts[k].dispose(); charts[k] = null; }
      if (el) el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--wb-text-3);font-size:12px;">该厅当前周期暂无数据</div>';
    });
    return;
  }
  const labels = data.map(d => (d.week_start || '').slice(5));
  const policyIdx = data.findIndex(d => d.week_start >= WB_POLICY_DATE || d.week_end >= WB_POLICY_DATE);
  const mark = policyIdx >= 0 ? {
    silent: true, symbol: 'none',
    data: [{ xAxis: labels[policyIdx], label: { formatter: '政策上线', fontSize: 10, color: '#7C5CFF' }, lineStyle: { color: '#7C5CFF', type: 'dashed', width: 1 } }]
  } : null;
  const base = {
    tooltip: { trigger: 'axis', textStyle: { fontSize: 12 } },
    grid: { left: 52, right: 20, top: 30, bottom: 42 },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, color: '#9CA3AF' }, axisLine: { lineStyle: { color: '#E5E7EB' } } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
  };
  // 选中具体厅时，叠加平台均值参考线（百分比类图表：留存率/解散率）
  let platOf = null;
  if (currentHall !== 'all' && wbPlatformWeekly && wbPlatformWeekly.length) {
    const map = {};
    wbPlatformWeekly.forEach(r => { map[r.week_start] = r; });
    platOf = key => data.map(d => (map[d.week_start] && map[d.week_start][key] != null) ? Math.round(map[d.week_start][key] * 10) / 10 : null);
  }
  const platSeries = (key) => ({
    name: '平台均值', type: 'line', data: platOf(key), symbol: 'none',
    lineStyle: { color: '#9CA3AF', type: 'dashed', width: 1.5 }, itemStyle: { color: '#9CA3AF' }
  });
  const legendOpt = { top: 0, right: 0, itemWidth: 14, itemHeight: 8, textStyle: { fontSize: 10, color: '#6B7280' } };
  const defs = {
    'wb-retention': { ...base,
      legend: platOf ? legendOpt : undefined,
      series: [{ name: '留存率', type: 'line', smooth: true, data: data.map(d => Math.min(100, d.retention_rate || 0)), lineStyle: { color: '#16A34A', width: 2 }, itemStyle: { color: '#16A34A' }, areaStyle: { color: 'rgba(22,163,74,.06)' }, markLine: mark },
        ...(platOf ? [platSeries('retention_rate')] : [])] },
    'wb-dissolution': { ...base,
      legend: platOf ? legendOpt : undefined,
      series: [{ name: '解散率', type: 'bar', data: data.map(d => d.dissolution_rate || 0), itemStyle: { color: 'rgba(220,38,38,.55)', borderRadius: [3, 3, 0, 0] }, barWidth: '50%', markLine: mark },
        ...(platOf ? [platSeries('dissolution_rate')] : [])] },
    'wb-revenue': { ...base, series: [{ name: '流水', type: 'bar', data: data.map(d => d.total_reward || 0), itemStyle: { color: '#D97706', borderRadius: [3, 3, 0, 0] }, barWidth: '50%', markLine: mark }] },
    'wb-activity': {
      ...base,
      legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 10, color: '#6B7280' } },
      series: [
        { name: '开车', type: 'bar', stack: 't', data: data.map(d => d.total_drive_tasks || 0), itemStyle: { color: '#7C5CFF' } },
        { name: '陪档', type: 'bar', stack: 't', data: data.map(d => d.total_accompany_tasks || 0), itemStyle: { color: '#16A34A' } },
        { name: '收送礼', type: 'bar', stack: 't', data: data.map(d => d.total_gift_tasks || 0), itemStyle: { color: '#D97706' } },
      ],
    },
  };
  for (const [key, opt] of Object.entries(defs)) {
    const el = document.getElementById('wb-c-' + key.slice(3));
    if (!el) continue;
    if (charts[key]) { charts[key].dispose(); charts[key] = null; }
    el.innerHTML = '';
    charts[key] = echarts.init(el);
    charts[key].setOption(opt);
  }
}

function wbResizeCharts() {
  ['wb-retention', 'wb-dissolution', 'wb-revenue', 'wb-activity'].forEach(k => charts[k] && charts[k].resize());
}

/* ─────────────── 初始化 ─────────────── */

async function initWorkbench() {
  await loadWorkbenchOverview(true);
  await refreshWorkbench();
}


/* ═══════════════ 第二期：四象限 / 日级叠加 / 存活分析 ═══════════════ */

/* ── 厅四象限散点图（对比分析页） ──
   横轴本周流水、纵轴留存率，中位数分界：
   🟢 明星厅（高流水高留存） 🔵 潜力厅（低流水高留存）
   🟠 风险厅（高流水低留存） 🔴 衰退厅（低流水低留存） */
async function initQuadrantChart() {
  const el = document.getElementById('chart-quadrant');
  if (!el) return;
  if (!wbOverview) await loadWorkbenchOverview();
  if (!wbOverview || !wbOverview.data) return;
  const pts = wbOverview.data.map(d => {
    const last = d.weeks[d.weeks.length - 1];
    return { name: d.hall_name, rev: last.total_reward || 0, ret: Math.min(100, last.retention_rate || 0) };
  });
  if (!pts.length) return;
  const median = arr => {
    const s = [...arr].sort((a, b) => a - b), n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  };
  const medRev = median(pts.map(p => p.rev));
  const medRet = median(pts.map(p => p.ret));
  const quadOf = p => p.rev >= medRev
    ? (p.ret >= medRet ? ['明星厅', '#16A34A'] : ['风险厅', '#D97706'])
    : (p.ret >= medRet ? ['潜力厅', '#7C5CFF'] : ['衰退厅', '#DC2626']);
  const groups = {};
  pts.forEach(p => {
    const [label, color] = quadOf(p);
    (groups[label] = groups[label] || { color, data: [] }).data.push({ name: p.name, value: [p.rev, p.ret] });
  });
  const series = Object.entries(groups).map(([label, g]) => ({
    name: label, type: 'scatter', symbolSize: 12,
    itemStyle: { color: g.color, opacity: 0.85 },
    data: g.data,
  }));
  // 象限底色 + 分界线
  const maxRev = Math.max(...pts.map(p => p.rev)) * 1.08;
  series.push({
    name: 'quad-bg', type: 'scatter', silent: true, data: [],
    markArea: {
      silent: true, label: { fontSize: 11, color: '#9CA3AF' },
      data: [
        [{ name: '明星厅', coord: [medRev, medRet], itemStyle: { color: 'rgba(22,163,74,.05)' }, label: { position: 'insideTopRight', color: '#16A34A' } }, { coord: [maxRev, '100'] }],
        [{ name: '潜力厅', coord: [0, medRet], itemStyle: { color: 'rgba(124,92,255,.05)' }, label: { position: 'insideTopLeft', color: '#7C5CFF' } }, { coord: [medRev, '100'] }],
        [{ name: '风险厅', coord: [medRev, 0], itemStyle: { color: 'rgba(217,119,6,.06)' }, label: { position: 'insideBottomRight', color: '#D97706' } }, { coord: [maxRev, medRet] }],
        [{ name: '衰退厅', coord: [0, 0], itemStyle: { color: 'rgba(220,38,38,.05)' }, label: { position: 'insideBottomLeft', color: '#DC2626' } }, { coord: [medRev, medRet] }],
      ]
    },
    markLine: {
      silent: true, symbol: 'none',
      lineStyle: { color: '#C9CED6', type: 'dashed', width: 1 },
      label: { fontSize: 10, color: '#9CA3AF' },
      data: [
        { xAxis: medRev, label: { formatter: '流水中位数 ' + wbFmtMoney(medRev), position: 'insideEndTop' } },
        { yAxis: Math.round(medRet * 10) / 10, label: { formatter: '留存中位数 ' + medRet.toFixed(0) + '%', position: 'insideStartTop' } },
      ]
    }
  });
  if (charts['quadrant']) { charts['quadrant'].dispose(); }
  charts['quadrant'] = echarts.init(el);
  charts['quadrant'].setOption({
    tooltip: {
      textStyle: { fontSize: 12 },
      formatter: p => p.seriesName === 'quad-bg' ? '' : `${p.data.name}<br/>周流水：${wbFmtMoney(p.value[0])}　留存率：${p.value[1].toFixed(1)}%<br/><span style="color:#9CA3AF">${p.seriesName} · 点击切换该厅</span>`
    },
    legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11, color: '#6B7280' }, data: ['明星厅', '潜力厅', '风险厅', '衰退厅'] },
    grid: { left: 70, right: 30, top: 36, bottom: 46 },
    xAxis: { type: 'value', name: '周流水', nameTextStyle: { fontSize: 11, color: '#9CA3AF' }, axisLabel: { fontSize: 10, color: '#9CA3AF', formatter: v => v >= 10000 ? (v / 10000) + 'w' : v }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
    yAxis: { type: 'value', name: '留存率%', max: 100, nameTextStyle: { fontSize: 11, color: '#9CA3AF' }, axisLabel: { fontSize: 10, color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
    series
  });
  charts['quadrant'].off('click');
  charts['quadrant'].on('click', p => { if (p.data && p.data.name) wbSelectHall(p.data.name); });
}

/* ── 日级叠加：本周 vs 上周（核心趋势页） ── */
async function loadDailyOverlay() {
  const elNew = document.getElementById('chart-daily-new');
  const elDiss = document.getElementById('chart-daily-diss');
  if (!elNew || !elDiss) return;
  try {
    const res = await fetch(API_BASE + '/api/daily-events?days=14' + getHallParam());
    const d = await res.json();
    if (!d.dates || d.dates.length < 14) return;
    const labels = d.dates.slice(7).map(s => '周' + '日一二三四五六'[new Date(s + 'T00:00:00').getDay()] + ' ' + s.slice(5));
    const base = {
      tooltip: { trigger: 'axis', textStyle: { fontSize: 12 } },
      legend: { top: 0, right: 0, itemWidth: 14, itemHeight: 8, textStyle: { fontSize: 10, color: '#6B7280' } },
      grid: { left: 46, right: 20, top: 30, bottom: 30 },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, color: '#9CA3AF' }, axisLine: { lineStyle: { color: '#E5E7EB' } } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
    };
    const mk = (thisData, lastData, color) => ({
      ...base,
      series: [
        { name: '本周', type: 'line', data: thisData, lineStyle: { color, width: 2 }, itemStyle: { color }, areaStyle: { color: color + '14' } },
        { name: '上周', type: 'line', data: lastData, symbol: 'none', lineStyle: { color: '#9CA3AF', type: 'dashed', width: 1.5 }, itemStyle: { color: '#9CA3AF' } },
      ]
    });
    if (charts['dailyNew']) charts['dailyNew'].dispose();
    charts['dailyNew'] = echarts.init(elNew);
    charts['dailyNew'].setOption(mk(d.new_teams.slice(7), d.new_teams.slice(0, 7), '#7C5CFF'));
    if (charts['dailyDiss']) charts['dailyDiss'].dispose();
    charts['dailyDiss'] = echarts.init(elDiss);
    charts['dailyDiss'].setOption(mk(d.dissolved.slice(7), d.dissolved.slice(0, 7), '#DC2626'));
  } catch (e) { console.error('日级叠加图加载失败:', e); }
}

/* ── 存活分析（明细数据页） ── */
async function loadSurvival() {
  const chipsEl = document.getElementById('survival-chips');
  const el = document.getElementById('chart-survival');
  if (!chipsEl || !el) return;
  try {
    const hallQ = getHallParam() ? '?' + getHallParam().substring(1) : '';
    const res = await fetch(API_BASE + '/api/survival' + hallQ);
    const d = await res.json();
    if (d.error) { chipsEl.innerHTML = '<span class="survival-chip">暂无数据</span>'; return; }
    const s = d.survival;
    const fmt = o => o && o.rate !== null ? `<strong>${o.rate}%</strong><span style="color:var(--wb-text-3)">（${o.total}个团）</span>` : '<strong>--</strong>';
    const pre = s.policy_pre_d7, post = s.policy_post_d7;
    let policyHtml = '';
    if (pre && pre.rate !== null && post && post.rate !== null) {
      const diff = Math.round((post.rate - pre.rate) * 10) / 10;
      const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      policyHtml = `<span class="survival-chip">政策前后7日存活：${pre.rate}% → ${post.rate}% <span class="chip ${cls}">${diff > 0 ? '↑' : diff < 0 ? '↓' : '→'} ${Math.abs(diff)}pp</span></span>`;
    }
    chipsEl.innerHTML = `
      <span class="survival-chip">进行中 <strong>${d.active_count}</strong> 个团</span>
      <span class="survival-chip">7日存活率 ${fmt(s.d7)}</span>
      <span class="survival-chip">14日存活率 ${fmt(s.d14)}</span>
      <span class="survival-chip">30日存活率 ${fmt(s.d30)}</span>
      ${policyHtml}`;
    document.getElementById('survival-src').textContent = `快照日期 ${d.ref_date} · 进行中团的已成团天数分布`;
    if (charts['survival']) charts['survival'].dispose();
    charts['survival'] = echarts.init(el);
    charts['survival'].setOption({
      tooltip: { trigger: 'axis', textStyle: { fontSize: 12 } },
      grid: { left: 46, right: 20, top: 16, bottom: 30 },
      xAxis: { type: 'category', data: d.hist_labels, axisLabel: { fontSize: 11, color: '#6B7280' }, axisLine: { lineStyle: { color: '#E5E7EB' } } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
      series: [{ name: '进行中团数', type: 'bar', data: d.hist_values, barWidth: '45%', itemStyle: { color: '#16A34A', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', fontSize: 11, color: '#6B7280' } }]
    });
  } catch (e) { console.error('存活分析加载失败:', e); }
}
