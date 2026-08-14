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
let wbInsights = null;        // 趋势图点名式结论（/api/trend-insights）

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

function wbScrollTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.style.animation = 'none';
  requestAnimationFrame(() => { el.style.animation = ''; });
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

let wbRankPeriod = 'week';  // week / month
let wbRankSort = { key: 'sisRev', dir: 'desc' };  // 排行榜排序

function wbSortRank(key) {
  if (wbRankSort.key === key) wbRankSort.dir = wbRankSort.dir === 'desc' ? 'asc' : 'desc';
  else { wbRankSort.key = key; wbRankSort.dir = 'desc'; }
  wbRenderRank();
}

function setRankPeriod(p) {
  wbRankPeriod = p;
  const w = document.getElementById('rank-week'), m = document.getElementById('rank-month');
  if (w) w.classList.toggle('on', p === 'week');
  if (m) m.classList.toggle('on', p === 'month');
  const title = document.getElementById('wb-rank-title');
  if (title) title.textContent = '厅排行榜 · ' + (p === 'week' ? '本周' : '本月');
  const hint = document.getElementById('wb-rank-hint');
  if (hint) hint.textContent = p === 'week'
    ? '按姐妹团周流水排名 · 位次为较上周变化 · 姐妹团周流水=姐姐+妹妹当周礼物总流水'
    : '按姐妹团月流水排名 · 姐妹团月流水=姐姐+妹妹当月礼物总流水';
  wbRenderRank();
}

function wbRenderRank() {
  const month = wbRankPeriod === 'month';
  // 按姐妹团流水排名（本周/本月），并计算较上周位次变化
  const items = wbOverview.data.filter(d => d.weeks.length >= 1).map(d => {
    const last = d.weeks[d.weeks.length - 1];
    const prev = d.weeks.length > 1 ? d.weeks[d.weeks.length - 2] : null;
    const m = d.month || {};
    return {
      name: d.hall_name,
      sisRev: month ? d.sister_monthly_revenue : d.sister_weekly_revenue,
      sisPrev: d.sister_prev_weekly_revenue,
      active: last.active_team_count_end || 0,
      ret: last.retention_rate || 0,
      newTeams: month ? (m.new_teams || 0) : (last.new_team_count || 0),
      prevRet: month ? null : (prev ? (prev.retention_rate || 0) : null),
    };
  });
  const rankOf = (key) => {
    const sorted = [...items].sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1));
    const map = {};
    sorted.forEach((it, idx) => { map[it.name] = idx + 1; });
    return map;
  };
  const sisRank = rankOf('sisRev'), sisPrevRank = rankOf('sisPrev');
  const retRank = rankOf('ret'), retPrevRank = rankOf('prevRet');
  const move = m => {
    if (m === null || m === undefined) return '<span class="move same">—</span>';
    return m > 0 ? `<span class="move up">↑${m}</span>` : m < 0 ? `<span class="move down">↓${-m}</span>` : '<span class="move same">—</span>';
  };
  const { key, dir } = wbRankSort;
  const mul = dir === 'asc' ? 1 : -1;
  const top = items.sort((a, b) => {
    const va = a[key] ?? -Infinity, vb = b[key] ?? -Infinity;
    return va === vb ? 0 : (va > vb ? 1 : -1) * mul;
  }).slice(0, 20);
  const sisLabel = month ? '姐妹团月流水' : '姐妹团周流水';
  const newLabel = month ? '月新成团' : '周新成团';
  const sortArrow = k => wbRankSort.key === k ? `<span class="sort-arrow">${wbRankSort.dir === 'asc' ? '▲' : '▼'}</span>` : '';
  const thSort = k => ` class="sortable" onclick="wbSortRank('${k}')"`;
  document.getElementById('wb-rank-table').innerHTML = `
    <tr><th>#</th><th>大厅</th><th${thSort('active')}>进行中姐妹团${sortArrow('active')}</th><th${thSort('sisRev')}>${sisLabel}${sortArrow('sisRev')}</th><th>流水位次</th><th${thSort('ret')}>留存率${sortArrow('ret')}</th><th>留存位次</th><th${thSort('newTeams')}>${newLabel}${sortArrow('newTeams')}</th></tr>
    ${top.map((it, idx) => `<tr>
      <td class="rank-no ${idx < 3 ? 'top' : ''}">${idx + 1}</td>
      <td>${it.name}</td>
      <td>${it.active}</td>
      <td>${it.sisRev != null ? wbFmtMoney(it.sisRev) : '—'}</td>
      <td>${month || it.sisPrev == null ? '<span class="move same">—</span>' : move(sisPrevRank[it.name] - sisRank[it.name])}</td>
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
    const qs = (getHallParam() + getWeekParam()).replace(/^&/, '');
    const [kpiRes, weekRes, platRes, insJson] = await Promise.all([
      fetch(API_BASE + '/api/kpi?' + getHallParam() + getWeekParam()),
      fetch(API_BASE + '/api/weekly-report?limit=all' + getHallParam()),
      // 平台均值参考线数据（仅取一次并缓存）
      wbPlatformWeekly ? Promise.resolve(null) : fetch(API_BASE + '/api/weekly-report?limit=all&hall=all'),
      // 点名式结论（失败不阻塞主流程）
      fetch(API_BASE + '/api/trend-insights' + (qs ? '?' + qs : '')).then(r => r.ok ? r.json() : null).catch(() => null)
    ]);
    const kpiJson = await kpiRes.json();
    wbKpi = kpiJson.data || null;
    wbKpiMeta = { week: kpiJson.week || '', date: kpiJson.date || '' };
    wbWeekly = ((await weekRes.json()).data) || [];
    if (platRes) wbPlatformWeekly = ((await platRes.json()).data) || [];
    wbInsights = insJson || null;
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
    { label: '💯 留存率', v: wbKpi.retention.value + '%', c: wbKpi.retention.change, suf: 'pp', note: '越高越好', spark: sparkOf('retention_rate').map(x => Math.min(100, x)), target: 'wb-c-retention' },
    { label: '🚫 解散率', v: wbKpi.dissolution.value + '%', c: -wbKpi.dissolution.change, suf: 'pp', note: '越低越好', spark: sparkOf('dissolution_rate'), target: 'wb-c-dissolution' },
    { label: '💰 礼物奖励金额', v: wbFmtMoney(wbKpi.revenue.value), c: wbKpi.revenue.change, suf: '%', note: '越高越好', spark: sparkOf('total_reward'), target: 'wb-c-revenue' },
  ];
  document.getElementById('wb-kpi-hero').innerHTML = heroes.map(k => `
    <div class="kpi-card" onclick="wbScrollTo('${k.target}')" title="点击查看趋势图">
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
    ['wb-insight-retention', 'wb-insight-dissolution', 'wb-insight-revenue', 'wb-insight-activity'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
    return;
  }
  const labels = data.map(d => (d.week_start || '').slice(5));
  const policyIdx = data.findIndex(d => d.week_start >= WB_POLICY_DATE || d.week_end >= WB_POLICY_DATE);
  const mark = policyIdx >= 0 ? {
    silent: true, symbol: 'none',
    data: [{ xAxis: labels[policyIdx], label: { formatter: '政策上线', fontSize: 10, color: '#4F5BD5' }, lineStyle: { color: '#4F5BD5', type: 'dashed', width: 1 } }]
  } : null;
  const base = {
    tooltip: { trigger: 'axis', textStyle: { fontSize: 12 } },
    grid: { left: 16, right: 16, top: 30, bottom: 42, containLabel: true },
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
      series: [{ name: '留存率', type: 'line', smooth: true, data: data.map(d => Math.min(100, d.retention_rate || 0)), lineStyle: { color: '#3D9A6C', width: 2 }, itemStyle: { color: '#3D9A6C' }, areaStyle: { color: 'rgba(22,163,74,.06)' }, markLine: mark },
        ...(platOf ? [platSeries('retention_rate')] : [])] },
    'wb-dissolution': { ...base,
      legend: platOf ? legendOpt : undefined,
      series: [{ name: '解散率', type: 'bar', data: data.map(d => d.dissolution_rate || 0), itemStyle: { color: 'rgba(220,38,38,.55)', borderRadius: [3, 3, 0, 0] }, barWidth: '50%', markLine: mark },
        ...(platOf ? [platSeries('dissolution_rate')] : [])] },
    'wb-revenue': { ...base, series: [{ name: '流水', type: 'bar', data: data.map(d => d.total_reward || 0), itemStyle: { color: '#C98A2D', borderRadius: [3, 3, 0, 0] }, barWidth: '50%', markLine: mark }] },
    'wb-activity': {
      ...base,
      legend: { top: 0, right: 0, itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 10, color: '#6B7280' } },
      series: [
        { name: '开车', type: 'bar', stack: 't', data: data.map(d => d.total_drive_tasks || 0), itemStyle: { color: '#4F5BD5' } },
        { name: '陪档', type: 'bar', stack: 't', data: data.map(d => d.total_accompany_tasks || 0), itemStyle: { color: '#3D9A6C' } },
        { name: '收送礼', type: 'bar', stack: 't', data: data.map(d => d.total_gift_tasks || 0), itemStyle: { color: '#C98A2D' } },
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
  wbRenderInsights(data);
}

function wbRenderInsights(data) {
  const last = data[data.length - 1];
  const prev = data.length > 1 ? data[data.length - 2] : null;
  const setInsight = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };
  const dPct = (cur, pv) => Math.round((cur - pv) * 10) / 10;
  const ins = wbInsights || {};
  // 留存率（越高越好）
  const ret = last.retention_rate || 0, retP = prev ? (prev.retention_rate || 0) : ret;
  const retD = dPct(ret, retP);
  const retTag = ret >= 60 ? '🟢 健康' : ret >= 40 ? '🟡 一般' : '🔴 偏低';
  let retHtml = `本周 <b>${Math.round(ret)}%</b>（较上周 ${retD >= 0 ? '+' : ''}${retD}pp）· ${retTag}`;
  if (ins.retention) {
    if (ins.retention.best_hall) {
      retHtml += ` · 最高「${ins.retention.best_hall}」${ins.retention.best_rate}%，最低「${ins.retention.worst_hall}」${ins.retention.worst_rate}%`;
    } else if (ins.retention.rate != null) {
      retHtml += ` · 该厅 ${ins.retention.rate}%` + (ins.retention.avg != null ? `（平台均值 ${ins.retention.avg}%）` : '');
    }
  }
  setInsight('wb-insight-retention', retHtml);
  // 解散率（越低越好）
  const dis = last.dissolution_rate || 0, disP = prev ? (prev.dissolution_rate || 0) : dis;
  const disD = dPct(dis, disP);
  const disTag = dis <= 20 ? '🟢 低位' : dis <= 30 ? '🟡 正常' : '🔴 偏高';
  let disHtml = `本周 <b>${dis}%</b>（较上周 ${disD >= 0 ? '+' : ''}${disD}pp）· ${disTag}`;
  if (ins.dissolution && ins.dissolution.count) {
    disHtml += ` · 解散 ${ins.dissolution.count} 个，主因「${ins.dissolution.top_reason}」${ins.dissolution.top_reason_count} 个`;
    if (ins.dissolution.top_hall) disHtml += `，集中在「${ins.dissolution.top_hall}」`;
  }
  setInsight('wb-insight-dissolution', disHtml);
  // 礼物奖励金额（越高越好）
  const rev = last.total_reward || 0, revP = prev ? (prev.total_reward || 0) : 0;
  const revC = revP > 0 ? Math.round((rev - revP) / revP * 100) : 0;
  let revHtml = `本周 <b>${wbFmtMoney(rev)}</b>（环比 ${revC >= 0 ? '+' : ''}${revC}%）· ${revC >= 0 ? '📈 增长' : '📉 下降'}`;
  if (ins.revenue) {
    revHtml += ` · 流水 TOP 姐姐「<a href="javascript:void(0)" onclick="openSisterDetail('${ins.revenue.top_sister_uid || ''}')">${ins.revenue.top_sister}</a>」${wbFmtMoney(ins.revenue.top_sister_rev)}，占 ${ins.revenue.share}%`;
  }
  setInsight('wb-insight-revenue', revHtml);
  // 任务活跃度
  const act = last.activity_index || 0, actP = prev ? (prev.activity_index || 0) : act;
  const actD = Math.round((act - actP) * 100) / 100;
  let actHtml = `本周 <b>${act}</b>（较上周 ${actD >= 0 ? '+' : ''}${actD}）· ${actD >= 0 ? '📈 上升' : '📉 下降'}`;
  if (ins.activity) {
    actHtml += ` · 任务最多「<a href="javascript:void(0)" onclick="openSisterDetail('${ins.activity.top_sister_uid || ''}')">${ins.activity.top_sister}</a>」${ins.activity.tasks} 次`;
  }
  setInsight('wb-insight-activity', actHtml);
}

function wbResizeCharts() {
  ['wb-retention', 'wb-dissolution', 'wb-revenue', 'wb-activity'].forEach(k => charts[k] && charts[k].resize());
}

/* ─────────────── 初始化 ─────────────── */

async function initWorkbench() {
  // 看板导览：首次收起后记住，不再显示
  if (localStorage.getItem('wb_guide_hidden') === '1') {
    const g = document.getElementById('wb-guide');
    if (g) g.style.display = 'none';
  }
  await loadWorkbenchOverview(true);
  await refreshWorkbench();
  if (typeof maybeLoadDailyOverlay === 'function') maybeLoadDailyOverlay();
}

function closeWbGuide() {
  const g = document.getElementById('wb-guide');
  if (g) g.style.display = 'none';
  localStorage.setItem('wb_guide_hidden', '1');
}


/* ═══════════════ 第二期：留存分布 / 日级叠加 / 存活分析 ═══════════════ */

/* ── 厅留存率分布直方图（对比分析页） ──
   各厅本周留存率按分段计数，红→绿渐变，一眼看清整体水位 */
async function initRetentionDist() {
  const el = document.getElementById('chart-retention-dist');
  if (!el) return;
  if (!wbOverview) await loadWorkbenchOverview();
  if (!wbOverview || !wbOverview.data) return;
  const bins = [['0-20%', 0, 20], ['20-40%', 20, 40], ['40-60%', 40, 60], ['60-80%', 60, 80], ['80-100%', 80, 101]];
  const counts = bins.map(() => 0);
  wbOverview.data.forEach(d => {
    const last = d.weeks[d.weeks.length - 1];
    const ret = Math.min(100, Math.max(0, last.retention_rate || 0));
    for (let i = 0; i < bins.length; i++) {
      if (ret >= bins[i][1] && ret < bins[i][2]) { counts[i]++; break; }
    }
  });
  const colors = ['#D56060', '#E08A5A', '#C98A2D', '#8FA8C9', '#3D9A6C'];
  if (charts['retDist']) charts['retDist'].dispose();
  charts['retDist'] = echarts.init(el);
  charts['retDist'].setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => `${p[0].name}<br/>${p[0].value} 个厅` },
    grid: { left: 50, right: 30, top: 30, bottom: 36 },
    xAxis: { type: 'category', data: bins.map(b => b[0]), axisLabel: { fontSize: 12, color: '#6B7280' }, axisLine: { lineStyle: { color: '#E5E7EB' } } },
    yAxis: { type: 'value', name: '厅数', minInterval: 1, nameTextStyle: { fontSize: 11, color: '#9CA3AF' }, axisLabel: { fontSize: 10, color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
    series: [{
      type: 'bar', barWidth: '50%',
      data: counts.map((c, i) => ({ value: c, itemStyle: { color: colors[i], borderRadius: [4, 4, 0, 0] } })),
      label: { show: true, position: 'top', fontSize: 12, color: '#6B7280' }
    }]
  });
  const insEl = document.getElementById('retention-dist-insight');
  if (insEl) {
    const totalHalls = counts.reduce((a, b) => a + b, 0);
    const high = counts[3] + counts[4];
    insEl.innerHTML = totalHalls
      ? `共 <b>${totalHalls}</b> 个厅，留存率 ≥60% 的有 <b>${high}</b> 个（占 ${Math.round(high / totalHalls * 100)}%）。`
      : '暂无厅留存数据。';
  }
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
      grid: { left: 16, right: 16, top: 30, bottom: 30, containLabel: true },
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
    charts['dailyNew'].setOption(mk(d.new_teams.slice(7), d.new_teams.slice(0, 7), '#4F5BD5'));
    if (charts['dailyDiss']) charts['dailyDiss'].dispose();
    charts['dailyDiss'] = echarts.init(elDiss);
    charts['dailyDiss'].setOption(mk(d.dissolved.slice(7), d.dissolved.slice(0, 7), '#D56060'));
  } catch (e) { console.error('日级叠加图加载失败:', e); }
}

/* ── 日级叠加懒加载：首次滚入视口才请求，避免拖慢工作台首屏 ── */
let _dailyOverlaySeen = false;
let _dailyOverlayObserver = null;

function maybeLoadDailyOverlay() {
  if (_dailyOverlaySeen) { loadDailyOverlay(); return; }
  const el = document.getElementById('chart-daily-new');
  if (!el || !('IntersectionObserver' in window)) {
    _dailyOverlaySeen = true;
    loadDailyOverlay();
    return;
  }
  if (_dailyOverlayObserver) return;  // 已在等待滚入视口
  _dailyOverlayObserver = new IntersectionObserver((entries) => {
    if (entries.some(e => e.isIntersecting)) {
      _dailyOverlaySeen = true;
      _dailyOverlayObserver.disconnect();
      _dailyOverlayObserver = null;
      loadDailyOverlay();
    }
  }, { rootMargin: '300px 0px' });
  _dailyOverlayObserver.observe(el);
}

/* ── 存活分析（明细数据页） ── */
async function loadSurvival() {
  const chipsEl = document.getElementById('survival-chips');
  const el = document.getElementById('chart-survival');
  if (!chipsEl || !el) return;
  try {
    const hall = currentHall !== 'all' ? currentHall : '';
    const res = await fetch(API_BASE + '/api/survival' + (hall ? '?hall=' + encodeURIComponent(hall) : ''));
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
    // 过滤掉「30天以上」分段（功能上线未满30天，恒为0）
    const histPairs = d.hist_labels.map((l, i) => [l, d.hist_values[i]]).filter(p => p[0] !== '30天以上');
    charts['survival'].setOption({
      tooltip: { trigger: 'axis', textStyle: { fontSize: 12 } },
      grid: { left: 46, right: 20, top: 16, bottom: 30 },
      xAxis: { type: 'category', data: histPairs.map(p => p[0]), axisLabel: { fontSize: 11, color: '#6B7280' }, axisLine: { lineStyle: { color: '#E5E7EB' } } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
      series: [{ name: '进行中团数', type: 'bar', data: histPairs.map(p => p[1]), barWidth: '45%', itemStyle: { color: '#3D9A6C', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', fontSize: 11, color: '#6B7280' } }]
    });
    const insEl = document.getElementById('survival-insight');
    if (insEl) {
      const d7 = s.d7 && s.d7.rate != null ? s.d7.rate : null;
      const d30 = s.d30 && s.d30.rate != null ? s.d30.rate : null;
      insEl.innerHTML = (d7 != null && d30 != null)
        ? `7日存活 <b>${d7}%</b>，30日存活 <b>${d30}%</b>——成团后 30 日内约流失 ${Math.max(0, d7 - d30)}pp。`
        : '存活数据不足。';
    }
  } catch (e) { console.error('存活分析加载失败:', e); }
}

/* ── 解散原因分布（明细数据页） ── */
async function loadDissolveReasons() {
  const el = document.getElementById('chart-dissolve-reasons');
  if (!el) return;
  const src = document.getElementById('dissolve-reasons-src');
  try {
    const hall = currentHall !== 'all' ? currentHall : '';
    const res = await fetch(API_BASE + '/api/dissolve-reasons' + (hall ? '?hall=' + encodeURIComponent(hall) : ''));
    const d = await res.json();
    if (d.error || !d.reasons || !d.reasons.length) {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--wb-text-3);font-size:12px;">暂无解散数据</div>';
      if (src) src.textContent = '暂无解散数据';
      return;
    }
    const colors = { '手动解散': '#D56060', '任务未完成自动解散': '#C98A2D', '满月自动解散': '#4F5BD5', '等级自动解散': '#8FA8C9', '注销': '#9CA3AF', '离职': '#E08A5A', '其他': '#C0C4CC' };
    if (src) src.textContent = `快照日期 ${d.ref_date} · 累计解散 ${d.total} 个团${hall ? '（大厅：' + hall + '）' : ''}`;
    if (charts['dissolveReasons']) charts['dissolveReasons'].dispose();
    charts['dissolveReasons'] = echarts.init(el);
    charts['dissolveReasons'].setOption({
      tooltip: { trigger: 'item', formatter: p => `${p.name}<br/>${p.value} 个（${p.percent}%）` },
      legend: { orient: 'vertical', right: 0, top: 'middle', textStyle: { fontSize: 11, color: '#6B7280' } },
      series: [{
        type: 'pie', radius: ['45%', '72%'], center: ['38%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, formatter: '{b}\n{c}个', fontSize: 10, color: '#6B7280' },
        data: d.reasons.map(r => ({ name: r.reason, value: r.count, itemStyle: { color: colors[r.reason] || '#C0C4CC' } })),
      }]
    });
    const insEl = document.getElementById('dissolve-reasons-insight');
    if (insEl) {
      const top = d.reasons[0];
      insEl.innerHTML = `累计解散 <b>${d.total}</b> 个团，主因「${top.reason}」${top.count} 个（占 ${top.share}%）。`;
    }
  } catch (e) { console.error('解散原因分布加载失败:', e); }
}

/* ── 躺平预警名单（明细数据页） ── */
async function loadLyingFlat() {
  const listEl = document.getElementById('lying-flat-list');
  if (!listEl) return;
  const src = document.getElementById('lying-flat-src');
  try {
    const hall = currentHall !== 'all' ? currentHall : '';
    const res = await fetch(API_BASE + '/api/lying-flat' + (hall ? '?hall=' + encodeURIComponent(hall) : ''));
    const d = await res.json();
    if (d.error) return;
    if (src) src.textContent = `快照 ${d.ref_date}（对比 ${d.prev_date}）· 连续零任务 ${d.total} 个团 · 任务数据覆盖率约 ${d.coverage}%`;
    if (!d.list || !d.list.length) {
      listEl.innerHTML = '<div style="color:var(--wb-text-3);font-size:12px;padding:12px;">暂无躺平/预警团 🎉</div>';
      return;
    }
    const rows = d.list.map(t => {
      const lv = t.level === 'lying'
        ? `<span class="chip down">躺平${t.zero_streak}天</span>`
        : `<span class="chip flat">预警</span>`;
      return `<tr>
        <td><a href="javascript:void(0)" onclick="openLyingDetail('${t.team_id}', '${t.sister_uid || ''}')">${t.sister_nickname || '-'}</a></td>
        <td>${t.hall_name || '-'}</td>
        <td>${t.team_id}</td>
        <td>${t.days_since_formed ?? '-'}天</td>
        <td>${t.last_active || '从未'}</td>
        <td>${lv}</td>
      </tr>`;
    }).join('');
    listEl.innerHTML = `<div class="lying-note">⚠️ 任务数据未全覆盖，零任务可能含「未采集」而非真躺平，下发名单前请人工核对</div>
      <div class="rank-scroll" style="max-height:380px;">
      <table class="rank-table">
        <thead><tr><th>姐姐</th><th>大厅</th><th>团ID</th><th>成团</th><th>最近有任务</th><th>状态</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>`;
    const insEl = document.getElementById('lying-flat-insight');
    if (insEl) {
      const lying = (d.list || []).filter(x => x.level === 'lying').length;
      insEl.innerHTML = `共 <b>${d.total}</b> 个躺平/预警团，其中躺平（连续≥2天零任务）<b>${lying}</b> 个；任务覆盖率约 ${d.coverage}%，下发前请人工核对。`;
    }
  } catch (e) { console.error('躺平名单加载失败:', e); }
}

/* ── 躺平下钻：逐日任务完成明细 ── */
let lyingTeamId = '';
let lyingSisterUid = '';

async function openLyingDetail(teamId, sisterUid) {
  lyingTeamId = teamId || '';
  lyingSisterUid = sisterUid || '';
  const modal = document.getElementById('lying-detail-modal');
  if (!modal) return;
  modal.classList.add('active');
  document.getElementById('ld-name').textContent = '加载中...';
  document.getElementById('ld-chips').innerHTML = '';
  document.getElementById('ld-table').innerHTML = '';
  try {
    const res = await fetch(API_BASE + '/api/lying-detail?team_id=' + encodeURIComponent(teamId));
    const d = await res.json();
    if (d.error) { document.getElementById('ld-name').textContent = '未找到该团'; return; }
    document.getElementById('ld-name').textContent = `${d.sister_nickname || '-'}（${d.hall_name || '-'} · 团 ${d.team_id}）`;
    const daily = d.daily || [];
    // 从最新快照往前数连续零任务天数（与名单判定口径一致）
    let streak = 0;
    for (let i = daily.length - 1; i >= 0; i--) { if (daily[i].total === 0) streak++; else break; }
    const zeroDays = daily.filter(x => x.total === 0).length;
    document.getElementById('ld-chips').innerHTML = `
      <span class="survival-chip">成团 <strong>${d.days_since_formed ?? '-'}</strong>天</span>
      <span class="survival-chip">快照 <strong>${daily.length}</strong>天</span>
      <span class="survival-chip">零任务 <strong>${zeroDays}</strong>天</span>
      <span class="survival-chip">连续零任务 <strong>${streak}</strong>天</span>`;
    document.getElementById('ld-table').innerHTML = `
      <tr><th>快照日</th><th>开车</th><th>陪档</th><th>收送礼</th><th>合计</th><th>状态</th></tr>
      ${daily.map(x => {
        const zero = x.total === 0;
        const st = zero ? '<span class="chip warn">零任务</span>' : '<span class="chip up">有任务</span>';
        return `<tr${zero ? ' style="background:rgba(217,119,6,.06);"' : ''}><td>${x.date}</td><td>${x.drive}</td><td>${x.accompany}</td><td>${x.gift}</td><td>${x.total}</td><td>${st}</td></tr>`;
      }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--wb-text-3);padding:16px;">暂无任务记录</td></tr>'}`;
  } catch (e) { console.error('躺平明细加载失败:', e); document.getElementById('ld-name').textContent = '加载失败'; }
}

function closeLyingDetail() {
  const modal = document.getElementById('lying-detail-modal');
  if (modal) modal.classList.remove('active');
}

function ldGoUID() {
  if (lyingSisterUid) { closeLyingDetail(); jumpToUID(lyingSisterUid); }
}
