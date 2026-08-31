async function initCompareChart() {
  try {
    const hallParam = currentHall === 'all' ? '&hall=all' : '';
    const hallWeekSel = document.getElementById('hall-week-select');
    const weekParam = hallWeekSel && hallWeekSel.value ? '&week=' + encodeURIComponent(hallWeekSel.value) : '';
    const hallRes = await fetch(API_BASE + '/api/hall-stats?limit=999' + hallParam + weekParam);
    const hallResult = await hallRes.json();
    hallCompareData = hallResult.data || [];
    renderHallComparePage();
    renderHallShare();
    renderHallRevenueTrend();
    // 跨页下钻：概览厅排行榜点行 → goPage 写入 state.pending，这里消费一次展开该厅分析
    if (state.pending && state.pending.hall && state.page === 'compare') {
      const hall = state.pending.hall;
      state.pending = null;
      openHallFocus(hall);
    }
  } catch (e) { console.error('大厅排名加载失败:', e); }
}

/* 周序列辅助：判断某周是否有业务数据（成团/解散/流水/在榜任一非零），用于裁掉两端空周 */
function wbWeekHasData(r) {
  if (!r) return false;
  return (r.new_team_count || 0) > 0 || (r.dissolved_count || 0) > 0
    || (r.total_reward || 0) > 0 || (r.active_team_count_end || 0) > 0
    || (r.active_team_count_start || 0) > 0;
}
function trimSeries(arr) {
  if (!arr || !arr.length) return arr || [];
  let s = 0, e = arr.length - 1;
  while (s <= e && !wbWeekHasData(arr[s])) s++;
  while (e >= s && !wbWeekHasData(arr[e])) e--;
  return arr.slice(s, e + 1);
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
    total_revenue:   { label: '本周流水',     unit: '元', color: '#C98A2D', grad: '#E5C87E' },
  };
  const cfg = metricConfig[hallCompareSortField] || metricConfig.active_count;

  if (pageData.length > 0) {
    const hallNames = pageData.map(d => d.hall_name);
    const values = pageData.map(d => d[hallCompareSortField] || 0);
    const maxVal = Math.max(...values);
    const xMax = Math.ceil(maxVal * 1.2) || 1;
    // 全量第一名（跨页唯一）：金色渐变 + 皇冠徽标；避免翻页后皇冠跳到别页
    const globalMax = Math.max(...filtered.map(d => d[hallCompareSortField] || 0));
    const isMoney = cfg.unit === '元';
    const dataObjs = values.map((v, i) => {
      const isTop = v === globalMax;
      const base = isTop
        ? { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: '#C98A2D' }, { offset: 1, color: '#E5B968' }]) }
        : { color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: cfg.color }, { offset: 1, color: cfg.grad }]) };
      base.borderRadius = [0, 4, 4, 0];
      const o = { value: v, itemStyle: base };
      if (isTop) {
        o.label = { show: true, position: 'right', fontSize: 11, color: '#B07A1F', fontWeight: 'bold', formatter: (isMoney ? wbFmtMoney(v) : v + cfg.unit) };
      }
      return o;
    });

    const hallEl = document.getElementById('chart-hall-compare');
    const hallVisible = hallEl && hallEl.offsetHeight > 0;
    if (!hallVisible) {
      if (charts.hallCompare) { charts.hallCompare.dispose(); charts.hallCompare = null; }
    } else if (!charts.hallCompare) {
      charts.hallCompare = echarts.init(hallEl);
      charts.hallCompare.on('click', function(params) {
        if (!params.name) return;
        // 普通点击 → 仅展开该厅分析（逛）；对比 A 由厅面板里「设为对比 A」显式触发
        openHallFocus(params.name);
      });
    }
    if (charts.hallCompare) {
      const hallNamesReversed = hallNames.reverse();
      charts.hallCompare.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(26,29,38,.92)', borderWidth: 0, textStyle: { color: '#fff' }, formatter: `{b}<br/>${cfg.label}: {c}${cfg.unit}` },
        grid: { left: 160, right: 40, top: 20, bottom: 30 },
        xAxis: { type: 'value', max: xMax, minInterval: 1 },
        yAxis: { type: 'category', data: hallNamesReversed, axisLabel: { fontSize: 11 } },
        series: [{ name: cfg.label, type: 'bar', data: dataObjs.reverse(), barMaxWidth: 30,
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
    let html = `流水最高「${byRev.hall_name}」${wbFmtMoney(byRev.total_revenue)}，进行中团最多「${byAct.hall_name}」${byAct.active_count} 个。`;
    // 就地预警：单厅解散率异常（从 _inlineAlerts 里按厅名匹配）
    const hallAlerts = (typeof _inlineAlerts !== 'undefined' && _inlineAlerts && _inlineAlerts.hall) || [];
    if (hallAlerts.length) {
      const names = new Set();
      hallAlerts.forEach(a => {
        const txt = (a.description || '') + (a.title || '');
        hallCompareData.forEach(h => { if (h.hall_name && txt.includes(h.hall_name)) names.add(h.hall_name); });
      });
      if (names.size) {
        const arr = [...names];
        const shown = arr.slice(0, 5).join('、') + (arr.length > 5 ? ` 等 ${arr.length} 个厅` : '');
        html = `<span style="color:#D56060;">近期解散率异常：${shown}</span><br>` + html;
      }
    }
    insEl.innerHTML = html;
  }
}

/* 厅分析揭示：点击大厅 → 该厅 KPI + 趋势 + 本周vs上周 */
let hfHall = '';

async function openHallFocus(hallName) {
  hfHall = hallName || '';
  const panel = document.getElementById('hall-focus');
  if (!panel) return;
  const hall = (hallCompareData || []).find(h => h.hall_name === hallName) || {};
  let trend = [];
  try {
    const res = await fetch(API_BASE + '/api/weekly-report?limit=all&hall=' + encodeURIComponent(hallName));
    trend = (await res.json()).data || [];
  } catch (e) { console.error('厅趋势加载失败:', e); }
  document.getElementById('hf-title').textContent = hallName;
  document.getElementById('hf-src').textContent =
    `${hallName} · 当前快照 + 近 ${trend.length} 周趋势${trend.length ? ' · 最近周 ' + trend[trend.length - 1].week_label : ''} · 下方「去明细」可下钻`;
  const drill = document.getElementById('hf-week-drill');
  if (drill) drill.style.display = 'none';
  renderHfCards(hall, trend);
  renderHfTrend('hf-chart-ret', trend, 'retention_rate', 'pct', hallName);
  renderHfTrend('hf-chart-rev', trend, 'total_reward', 'money', hallName);
  renderHfWeekTable(trend);
  renderHfDissolve(hallName);
  panel.style.display = '';
  setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

function closeHallFocus() {
  const panel = document.getElementById('hall-focus');
  if (panel) panel.style.display = 'none';
  const drill = document.getElementById('hf-week-drill');
  if (drill) drill.style.display = 'none';
  ['hf-chart-ret', 'hf-chart-rev', 'hf-diss'].forEach(id => {
    if (charts[id]) { charts[id].dispose(); charts[id] = null; }
  });
}

function drillHallFocus() {
  if (!hfHall) return;
  if (typeof drillToHall === 'function') drillToHall(hfHall);
}

function renderHfCards(hall, trend) {
  const el = document.getElementById('hf-cards');
  if (!el) return;
  const last = trend[trend.length - 1] || {};
  const metrics = [
    { label: '进行中团数', v: hall.active_count, unit: ' 个', accent: 'acc-green' },
    { label: '总团数', v: hall.team_count, unit: ' 个', accent: 'acc-violet' },
    { label: '解散数', v: hall.dissolved_count, unit: ' 个', accent: 'acc-red' },
    { label: '本周流水', v: hall.total_revenue, money: true, accent: 'acc-gold' },
    { label: '留存率（最近周）', v: last.retention_rate, pct: true, accent: 'acc-green' },
    { label: '新成团（最近周）', v: last.new_team_count, unit: ' 个', accent: 'acc-violet' },
  ];
  el.innerHTML = metrics.map(m => {
    const has = m.v !== null && m.v !== undefined && !Number.isNaN(m.v);
    const fmt = v => m.money ? '¥' + Number(v).toFixed(0) : m.pct ? Number(v) + '%' : Number(v) + (m.unit || '');
    return `<div class="kpi-card ${m.accent}">
      <div class="kpi-label">${m.label}</div>
      <div class="kpi-value hf-val">${has ? fmt(m.v) : '—'}</div>
      <div class="policy-delta"></div>
    </div>`;
  }).join('');
}

function renderHfTrend(id, trend, key, kind, name) {
  const el = document.getElementById(id);
  if (!el) return;
  const t = trimSeries(trend);
  const labels = t.map(r => r.week_label);
  const values = t.map(r => (r[key] ?? null));
  const fmt = v => kind === 'money' ? wbFmtMoney(v) : (v == null ? '—' : v + '%');
  if (charts[id]) charts[id].dispose();
  charts[id] = echarts.init(el);
  charts[id].setOption({
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(26,29,38,.92)', borderWidth: 0, textStyle: { color: '#fff' },
      formatter: ps => { const p = ps[0]; return p.name + '<br/>' + p.marker + ' ' + name + ': ' + fmt(p.value); } },
    grid: { left: kind === 'money' ? 70 : 45, right: 20, top: 16, bottom: 32 },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, rotate: 30 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => kind === 'money' ? wbFmtMoney(v) : v } },
    series: [{
      name: name, type: 'line', data: values, smooth: true, connectNulls: true, symbolSize: 5,
      lineStyle: { color: kind === 'money' ? '#C98A2D' : '#7C5CFF', width: 2.5 },
      itemStyle: { color: kind === 'money' ? '#C98A2D' : '#7C5CFF' },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: kind === 'money' ? 'rgba(201,138,45,.18)' : 'rgba(124,92,255,.18)' },
        { offset: 1, color: 'rgba(0,0,0,0)' }]) },
    }],
  }, true);
  // 趋势点下钻：点击某周数据点 → 揭示该周该厅团明细
  charts[id].off('click');
  charts[id].on('click', function(params) {
    if (!params.name) return;
    const w = trend.find(r => r.week_label === params.name);
    if (w) openWeekDrill(name, w.week_start, w.week_end, w.week_label);
  });
  setTimeout(() => { if (charts[id]) charts[id].resize(); }, 0);
}

/* 趋势点下钻：该厅该周的新成团 / 该周解散（含原因）/ 周存活数 */
async function openWeekDrill(hallName, weekStart, weekEnd, weekLabel) {
  const drill = document.getElementById('hf-week-drill');
  if (!drill) return;
  drill.style.display = '';
  drill.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
    <b>${hallName} · ${weekLabel} 周团明细</b>
    <span style="font-size:12px;color:var(--wb-text-3);">点趋势图任一周数据点查看该周情况</span>
  </div>`;
  try {
    const res = await fetch(`${API_BASE}/api/weekly-team-detail?hall=${encodeURIComponent(hallName)}&week_start=${weekStart}&week_end=${weekEnd}`);
    const d = await res.json();
    if (d.error) { drill.innerHTML += `<div class="kpi-note">${d.error}</div>`; return; }
    const newL = d.new_teams || [], dissL = d.dissolved_teams || [];
    const row = t => `<tr><td>${t.sister_nickname || '—'}</td><td class="num">${t.form_date || '—'}</td></tr>`;
    const dissRow = t => `<tr><td>${t.sister_nickname || '—'}</td><td class="num">${t.dissolve_date || '—'}</td><td><span class="chip ${t.reason === '手动解散' ? 'down' : 'warn'}">${t.reason || '其他'}</span></td></tr>`;
    drill.innerHTML += `
      <div style="display:flex;align-items:center;gap:12px;margin:10px 0 4px;flex-wrap:wrap;">
        <span class="chip up">该周新成团 ${newL.length} 个</span>
        <span class="chip down">该周解散 ${dissL.length} 个</span>
        <span class="chip flat">周末存活 ${d.active_end ?? '—'} 个</span>
      </div>
      <div class="chart-grid" style="margin-top:6px;">
        <div class="chart-card"><h3>该周新成团</h3><table class="data-table"><thead><tr><th>团长昵称</th><th class="num">成团日</th></tr></thead><tbody>${
          newL.length ? newL.map(row).join('') : '<tr><td colspan="2" style="text-align:center;color:var(--wb-text-3);padding:12px;">本周无新成团</td></tr>'
        }</tbody></table></div>
        <div class="chart-card"><h3>该周解散（含原因）</h3><table class="data-table"><thead><tr><th>团长昵称</th><th class="num">解散日</th><th>原因</th></tr></thead><tbody>${
          dissL.length ? dissL.map(dissRow).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--wb-text-3);padding:12px;">本周无解散团</td></tr>'
        }</tbody></table></div>
      </div>`;
  } catch (e) {
    console.error('周明细下钻失败:', e);
    drill.innerHTML += `<div class="kpi-note">该周明细加载失败</div>`;
  }
}

function renderHfWeekTable(trend) {
  const el = document.getElementById('hf-table');
  if (!el) return;
  if (trend.length < 1) {
    el.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--wb-text-3);padding:14px;">暂无该厅周报数据</td></tr>';
    return;
  }
  const b = trend.length >= 2 ? trend[trend.length - 2] : null;
  const a = trend[trend.length - 1];
  const metrics = [
    { name: '留存率', key: 'retention_rate', unit: '%' },
    { name: '解散率', key: 'dissolution_rate', unit: '%', reverse: true },
    { name: '新成团数', key: 'new_team_count', unit: ' 个' },
    { name: '解散数', key: 'dissolved_count', unit: ' 个', reverse: true },
    { name: '进行中团数', key: 'active_team_count_end', unit: ' 个' },
    { name: '周礼物流水', key: 'total_reward', unit: ' 元' },
  ];
  const getVal = (w, m) => { if (!w) return 0; let v = w[m.key] || 0; return v; };
  const fmt = (v, m) => m.unit === ' 元' ? '¥' + Number(v).toFixed(0) : Number(v).toFixed(m.unit === '%' ? 1 : 0) + m.unit;
  el.innerHTML = metrics.map(m => {
    const bv = getVal(b, m), av = getVal(a, m);
    let diff = '—', cls = 'flat', trendIcon = '<span class="dot" style="background:var(--wb-text-3)"></span>';
    if (b) {
      const d = av - bv;
      diff = (d > 0 ? '+' : '') + (m.unit === ' 元' ? '¥' + Number(d).toFixed(0) : Number(d).toFixed(m.unit === '%' ? 1 : 0) + m.unit);
      const good = m.reverse ? d < 0 : d > 0;
      cls = d === 0 ? 'flat' : good ? 'up' : 'down';
      trendIcon = d === 0 ? '<span class="dot" style="background:var(--wb-text-3)"></span>' : good ? '<span class="dot green"></span>' : '<span class="dot red"></span>';
    }
    return `<tr><td>${m.name}</td><td class="num">${fmt(bv, m)}</td><td class="num">${fmt(av, m)}</td><td class="num dt-diff ${cls}">${diff}</td><td>${trendIcon}</td></tr>`;
  }).join('');
}

/* ── 各厅进行中团占比（TOP5 + 其他 · 点扇区钻取单厅） ── */
function renderHallShare() {
  const el = document.getElementById('hall-share');
  const ins = document.getElementById('hall-share-insight');
  if (!el) return;
  const data = (hallCompareData || []).slice().sort((a, b) => (b.active_count || 0) - (a.active_count || 0));
  if (!data.length) { if (ins) ins.textContent = '暂无大厅数据'; return; }
  const top = data.slice(0, 5);
  const restCount = data.slice(5).reduce((s, d) => s + (d.active_count || 0), 0);
  const total = data.reduce((s, d) => s + (d.active_count || 0), 0);
  const pieData = top.map(d => ({ name: d.hall_name, value: d.active_count || 0 }));
  if (restCount > 0) pieData.push({ name: '其他厅', value: restCount });
  const palette = ['#7C5CFF', '#3D9A6C', '#C98A2D', '#D56060', '#E08A5A', '#C0C4CC'];
  if (charts['hallShare']) charts['hallShare'].dispose();
  charts['hallShare'] = echarts.init(el);
  charts['hallShare'].setOption({
    tooltip: { trigger: 'item', formatter: p => `${p.name}<br/>${p.value} 个（${p.percent}%）` },
    legend: { orient: 'vertical', right: 0, top: 'middle', textStyle: { fontSize: 11, color: '#6B7280' } },
    series: [{
      type: 'pie', radius: ['45%', '72%'], center: ['38%', '50%'],
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      data: pieData.map((d, i) => ({ ...d, itemStyle: { color: palette[i % palette.length] } })),
    }],
  });
  charts['hallShare'].off('click');
  charts['hallShare'].on('click', function (params) {
    if (params.name && params.name !== '其他厅' && typeof openHallFocus === 'function') openHallFocus(params.name);
  });
  if (ins) {
    const t1 = top[0], t2 = top[1];
    const share = total ? Math.round(((t1.active_count || 0) + (t2.active_count || 0)) / total * 100) : 0;
    ins.innerHTML = `${t1.hall_name} + ${t2.hall_name} 两家合计 <b>${share}%</b>，头部集中明显。`;
  }
}

/* ── 各厅礼物流水周趋势（TOP5 厅 · 近 8 周 · 多线） ── */
async function renderHallRevenueTrend() {
  const el = document.getElementById('hall-trend');
  const ins = document.getElementById('hall-trend-insight');
  if (!el) return;
  const tops = (hallCompareData || []).slice().sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0)).slice(0, 5);
  if (!tops.length) { if (ins) ins.textContent = '暂无大厅流水数据'; return; }
  const palette = ['#7C5CFF', '#3D9A6C', '#C98A2D', '#D56060', '#E08A5A'];
  const series = [];
  let labels = [];
  for (let i = 0; i < tops.length; i++) {
    const h = tops[i];
    let trend = [];
    try {
      const res = await fetch(API_BASE + '/api/weekly-report?limit=all&hall=' + encodeURIComponent(h.hall_name));
      const d = await res.json();
      trend = (d.data || []).slice(-8);
    } catch (e) { /* 单厅趋势失败则留空 */ }
    if (!labels.length) labels = trend.map(r => r.week_label);
    series.push({
      name: h.hall_name, type: 'line', smooth: true, connectNulls: true, symbolSize: 5,
      data: trend.map(r => (r.total_reward ?? null)),
      lineStyle: { color: palette[i], width: 2 }, itemStyle: { color: palette[i] },
    });
  }
  if (charts['hallTrend']) charts['hallTrend'].dispose();
  charts['hallTrend'] = echarts.init(el);
  charts['hallTrend'].setOption({
    tooltip: {
      trigger: 'axis', backgroundColor: 'rgba(26,29,38,.92)', borderWidth: 0, textStyle: { color: '#fff' },
      formatter: ps => {
        let s = ps[0].name;
        ps.forEach(p => { s += `<br/>${p.marker}${p.seriesName}: ${p.value == null ? '—' : wbFmtMoney(p.value)}`; });
        return s;
      },
    },
    legend: { top: 0, textStyle: { fontSize: 10, color: '#6B7280' } },
    grid: { left: 70, right: 20, top: 32, bottom: 32 },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, rotate: 30 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: v => wbFmtMoney(v) } },
    series,
  });
  charts['hallTrend'].off('click');
  charts['hallTrend'].on('click', function (params) {
    if (params.seriesName && typeof openHallFocus === 'function') openHallFocus(params.seriesName);
  });
  if (ins) {
    ins.innerHTML = `${tops[0].hall_name} 流水居首，点折线/图例钻取对应厅。`;
  }
}

/* ── 厅揭示面板 · 解散原因构成（该厅已解散团 · 环形占比） ── */
async function renderHfDissolve(hallName) {
  const el = document.getElementById('hf-diss');
  const src = document.getElementById('hf-diss-src');
  const ins = document.getElementById('hf-diss-insight');
  if (!el) return;
  try {
    const res = await fetch(API_BASE + '/api/dissolve-reasons?hall=' + encodeURIComponent(hallName));
    const d = await res.json();
    if (d.error || !d.reasons || !d.reasons.length) {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--wb-text-3);font-size:12px;">该厅暂无解散数据</div>';
      if (src) src.textContent = '该厅暂无解散数据';
      return;
    }
    const colors = { '手动解散': '#D56060', '任务未完成自动解散': '#C98A2D', '生态违规': '#E11D48', '等级低于铜牌': '#9333EA', '毕业': '#16A34A', '注销': '#9CA3AF', '离职': '#E08A5A', '其他': '#C0C4CC' };
    if (src) src.textContent = `快照日期 ${d.ref_date} · 该厅累计解散 ${d.total} 个团 · 环形占比`;
    if (charts['hfDiss']) charts['hfDiss'].dispose();
    charts['hfDiss'] = echarts.init(el);
    charts['hfDiss'].setOption({
      tooltip: { trigger: 'item', formatter: p => `${p.name}<br/>${p.value} 个（${p.percent}%）` },
      legend: { orient: 'vertical', right: 0, top: 'middle', textStyle: { fontSize: 11, color: '#6B7280' } },
      series: [{
        type: 'pie', radius: ['45%', '72%'], center: ['38%', '50%'],
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, formatter: '{b}\n{c}个', fontSize: 10, color: '#6B7280' },
        data: d.reasons.map(r => ({ name: r.reason, value: r.count, itemStyle: { color: colors[r.reason] || '#C0C4CC' } })),
      }],
    });
    charts['hfDiss'].off('click');
    charts['hfDiss'].on('click', function (params) {
      if (params.name && typeof drillToReason === 'function') drillToReason(params.name);
    });
    if (ins) {
      const top = d.reasons[0];
      ins.innerHTML = `该厅累计结束 <b>${d.total}</b> 个团，主因「${top.reason}」${top.count} 个（占 ${top.share}%）。近 8 周各原因趋势待后端补按周序列后落地。`;
    }
  } catch (e) { console.error('解散原因构成加载失败:', e); }
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
    { key: 'week_level', label: '当周队长等级', fmt: v => v || '--' },
    { key: 'week_schedule_days', label: '当周排档天数', fmt: v => v + '天', isNum: true },
    { key: 'daily_task_count', label: '每日任务完成', fmt: v => v + '次', isNum: true },
    { key: 'week_revenue', label: '当周礼物流水', fmt: v => '¥' + v.toLocaleString(), isNum: true },
    { key: 'week_accompany_time', label: '当周陪档时长', fmt: v => v + '分钟', isNum: true },
    { key: 'week_rank', label: '排行榜排名', fmt: v => v, isRank: true },
    { key: 'best_4week_level', label: '4周最高等级', fmt: v => v || '--' },
  ];

  const tbody = document.getElementById('uid-compare-body');
  let html = rows.map(r => {
    const c = cmp[r.key];
    if (!c) return '';
    let trendClass = c.trend || 'flat';
    let trendIcon = trendClass === 'up' ? '<span class="dot green"></span>' : trendClass === 'down' ? '<span class="dot red"></span>' : '<span class="dot" style="background:var(--wb-text-3)"></span>';
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
  html += `<tr><td class="col-metric">参与姐妹团</td><td class="col-this">${hallThis}</td><td class="col-last">${hallLast}</td><td class="col-change flat">—</td><td class="col-change flat">—</td><td class="col-trend flat"><span class="dot" style="background:var(--wb-text-3)"></span> 持平</td></tr>`;
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
        <div class="member-uid">UID: ${t.sister_uid ? `<a href="javascript:void(0)" onclick="jumpToUID('${t.sister_uid}')" style="color:#7C5CFF;text-decoration:none;">${t.sister_uid}</a>` : '--'}</div>
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
            <div class="member-uid">UID: ${(() => { const u = bs.uid || bs.team_info?.sister_uid2; return u ? `<a href="javascript:void(0)" onclick="jumpToUID('${u}')" style="color:#7C5CFF;text-decoration:none;">${u}</a>` : '--'; })()}</div>
          </div>
        </div>`;
    }
  } else if (t.sister_nickname2 || t.sister_uid2) {
    membersHtml += `
      <div class="team-member">
        <div class="member-badge" style="background:#f6a6c1;">妹</div>
        <div class="member-info">
          <div class="member-name">${t.sister_nickname2 || '--'}</div>
          <div class="member-uid">UID: ${t.sister_uid2 ? `<a href="javascript:void(0)" onclick="jumpToUID('${t.sister_uid2}')" style="color:#7C5CFF;text-decoration:none;">${t.sister_uid2}</a>` : '--'}</div>
        </div>
      </div>`;
  }

  body.innerHTML = `
    <div class="team-detail-grid">
      <div class="team-detail-item">
        <span class="team-detail-label">大厅名称</span>
        <span class="team-detail-value">${t.hall_name || '--'}</span>
      </div>
      <div class="team-detail-item">
        <span class="team-detail-label">成团日期</span>
        <span class="team-detail-value">${t.form_date || '--'}</span>
      </div>
      <div class="team-detail-item">
        <span class="team-detail-label">姐妹团累计流水</span>
        <span class="team-detail-value">¥${(data.team_total_revenue || t.total_revenue || 0).toLocaleString()}</span>
      </div>
      <div class="team-detail-item">
        <span class="team-detail-label">奖励金额</span>
        <span class="team-detail-value">¥${(t.reward_amount || 0).toLocaleString()}</span>
      </div>
      <div class="team-detail-item">
        <span class="team-detail-label">状态</span>
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
      <td>${s.uid ? `<a href="javascript:void(0)" onclick="jumpToUID('${s.uid}')" style="color:#7C5CFF;text-decoration:none;">${s.uid}</a>` : '--'}</td>
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
    const captainType = document.getElementById('uid-type').value;
    try {
      const resp = await fetch(API_BASE + '/api/uid-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: sisterUid, captain_type: captainType }),
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
    chartDiv.innerHTML = '<div style="padding:40px; text-align:center; color:#999;">对比数据为空（妹妹UID数据可能未成功加载）</div>';
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
  csv += `\n关联信息\n所属大厅,${cmp.hall?.this || thisData.schedule_hall || '—'}\n精英队长,${cmp.is_elite?.this || thisData.is_elite || '—'}\n保护期结束,${thisData.protection_end || '—'}\n累计流水,${d.team_total_revenue || 0}\n历史最高等级,${thisData.hist_best_level || '—'}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `UID_${d.uid}_对比分析.csv`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
