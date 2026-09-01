// warncenter.js - 预警中心（平台级预警 4 卡：留存率 / 异常解散 / 新成团 / 解散时间分布）

const WARN_LEVEL = { severe: { label: '严重', cls: 'down' }, warning: { label: '警告', cls: 'warn' }, notice: { label: '提醒', cls: 'flat' } };
const WARN_TITLE = { retention: '姐妹团留存率预警', active_diss: '主动解散占比预警', new_team: '新成团数预警', dissolve_time: '解散时间分布' };

let _warnData = null;

async function loadWarncenter() {
  const grid = document.getElementById('alerts-grid');
  if (!grid) return;
  const refEl = document.getElementById('alerts-ref');
  try {
    const res = await fetch(API_BASE + '/api/warncenter');
    const d = await res.json();
    if (d.error || !d.cards || !d.cards.length) {
      grid.innerHTML = '<div class="chart-card">暂无预警数据</div>';
      return;
    }
    _warnData = d;
    renderOverviewWarn();
    if (refEl) refEl.textContent = '平台级预警 · 近 8 周 · 数据日 ' + (d.ref_date || '--');
    grid.innerHTML = '';
    d.cards.forEach((card) => {
      const el = document.createElement('div');
      el.className = 'chart-card';
      el.innerHTML = warnCardHTML(card);
      grid.appendChild(el);
      setTimeout(() => warnRenderChart(card), 30);
    });
  } catch (e) {
    console.error('预警中心加载失败:', e);
    grid.innerHTML = '<div class="chart-card">预警中心加载失败</div>';
  }
}

function warnCardHTML(card) {
  const lv = WARN_LEVEL[card.level] || WARN_LEVEL.notice;
  const title = WARN_TITLE[card.key] || card.title;
  const isHist = card.key === 'dissolve_time';

  let insight;
  if (isHist) {
    insight = `近 8 周非毕业解散 <b>${card.total ?? 0}</b> 个，按「成团 → 解散」存续天数分 4 桶。`;
  } else {
    const unit = card.key === 'new_team' ? ' 个' : '%';
    const cur = card.current == null ? '--' : card.current + unit;
    const wow = card.wow == null ? '--' : ((card.wow >= 0 ? '↑' : '↓') + Math.abs(card.wow) + 'pp');
    insight = `当前 <b>${cur}</b>，较上周 <b>${wow}</b>。`;
  }

  const hallRows = (card.affected_halls || []).slice(0, 6).map((h) => {
    if (isHist) {
      return `<tr><td>${esc(h.hall)}</td><td class="center" style="font-weight:600;">${h.count} 个</td><td class="center">${h.peak_week || '--'}</td></tr>`;
    }
    const wowTxt = h.wow == null ? '--' : (h.wow >= 0 ? '↑' : '↓') + Math.abs(h.wow) + 'pp';
    const wowCls = h.wow == null ? '' : (h.wow < 0 ? 'color:#16A34A;' : 'color:#DC2626;');
    return `<tr><td>${esc(h.hall)}</td><td class="center" style="font-weight:600;">${fmtVal(h.current, card.key)}</td><td class="center" style="${wowCls}">${wowTxt}</td></tr>`;
  }).join('');

  const hallHead = isHist
    ? '<thead><tr><th>大厅</th><th class="center">解散数</th><th class="center">高发周</th></tr></thead>'
    : '<thead><tr><th>大厅</th><th class="center">当前</th><th class="center">较上周</th></tr></thead>';

  return `
    <h3 style="display:flex;justify-content:space-between;align-items:center;">${title}<span class="chip ${lv.cls}">${lv.label}</span></h3>
    <div class="chart-src">${card.metric_note || ''} · 阈值：${card.threshold || ''}</div>
    <div class="chart-box" id="wc-${card.key}" style="height:200px;"></div>
    <div class="chart-insight">${insight}</div>
    <div style="font-weight:600;margin:12px 0 4px;font-size:12px;color:var(--wb-text-1);">${isHist ? '非毕业解散 · 受影响厅' : '受影响厅'}</div>
    <div class="rank-scroll"><table class="rank-table">${hallHead}<tbody>${hallRows || '<tr><td colspan="3" style="color:#9CA3AF;">暂无</td></tr>'}</tbody></table></div>
    <button class="expand-btn" onclick="openWarnHalls('${card.key}')">查看全部受影响厅 →</button>
    <button class="expand-btn" onclick="drillWarn('${card.key}')">下钻明细 →</button>`;
}

function fmtVal(v, key) { return v == null ? '--' : v + (key === 'new_team' ? ' 个' : '%'); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function warnRenderChart(card) {
  const el = document.getElementById('wc-' + card.key);
  if (!el || !window.echarts) return;
  if (charts['warn-' + card.key]) charts['warn-' + card.key].dispose();
  const c = echarts.init(el);
  charts['warn-' + card.key] = c;

  let opt;
  if (card.key === 'dissolve_time') {
    const labels = (card.hist || []).map((h) => h.label);
    const vals = (card.hist || []).map((h) => h.count);
    opt = {
      grid: { left: 8, right: 12, top: 24, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, color: '#6B7280', interval: 0 } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 10, color: '#6B7280' } },
      series: [{ type: 'bar', data: vals, barMaxWidth: 40, itemStyle: { color: '#D97706', borderRadius: [4, 4, 0, 0] } }]
    };
  } else {
    const labels = (card.trend || []).map((t) => t.week);
    const vals = (card.trend || []).map((t) => t.value);
    opt = {
      grid: { left: 8, right: 12, top: 24, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, color: '#6B7280', interval: 0 } },
      yAxis: { type: 'value', scale: true, axisLabel: { fontSize: 10, color: '#6B7280' } },
      series: [{ type: 'line', data: vals, smooth: true, symbolSize: 5, itemStyle: { color: '#7C5CFF' }, areaStyle: { color: 'rgba(124,92,255,.08)' } }]
    };
  }
  c.setOption(opt);
  c.on('click', () => drillWarn(card.key));
}

// 概览页「预警」小卡：从 /api/warncenter 回填 3 张摘要卡（留存率/主动解散占比/新成团）
function renderOverviewWarn() {
  const fill = (key, valId, lvlId, footId) => {
    const valEl = document.getElementById(valId);
    if (!valEl) return;
    const card = ((_warnData && _warnData.cards) || []).find((c) => c.key === key);
    if (!card) return;
    const lv = WARN_LEVEL[card.level] || WARN_LEVEL.notice;
    const unit = key === 'new_team' ? ' 个' : '%';
    valEl.textContent = card.current == null ? '--' : card.current + unit;
    const lvlEl = document.getElementById(lvlId);
    if (lvlEl) lvlEl.textContent = lv.label;
    const footEl = document.getElementById(footId);
    if (footEl) footEl.textContent = card.threshold || '';
  };
  fill('retention', 'ow-ret-val', 'ow-ret-lvl', 'ow-ret-foot');
  fill('active_diss', 'ow-diss-val', 'ow-diss-lvl', 'ow-diss-foot');
  fill('new_team', 'ow-new-val', 'ow-new-lvl', 'ow-new-foot');
}

function openWarnHalls(key) {
  const card = ((_warnData && _warnData.cards) || []).find((c) => c.key === key);
  if (!card) return;
  const isHist = key === 'dissolve_time';
  const halls = card.affected_halls || [];
  const title = WARN_TITLE[key] || card.title;

  const rows = halls.map((h) => {
    if (isHist) {
      return `<tr><td>${esc(h.hall)}</td><td class="center" style="font-weight:600;">${h.count} 个</td><td class="center">${h.peak_week || '--'}</td></tr>`;
    }
    const wowTxt = h.wow == null ? '--' : (h.wow >= 0 ? '↑' : '↓') + Math.abs(h.wow) + 'pp';
    return `<tr><td>${esc(h.hall)}</td><td class="center" style="font-weight:600;">${fmtVal(h.current, key)}</td><td class="center">${wowTxt}</td></tr>`;
  }).join('');
  const head = isHist
    ? '<tr><th>大厅</th><th class="center">解散数</th><th class="center">高发周</th></tr>'
    : '<tr><th>大厅</th><th class="center">当前</th><th class="center">较上周</th></tr>';

  openWarnModal(title, `<table class="rank-table"><thead>${head}</thead><tbody>${rows || '<tr><td colspan="3" style="color:#9CA3AF;">暂无</td></tr>'}</tbody></table>`);
}

function openWarnModal(title, bodyHTML) {
  let m = document.getElementById('warn-full-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'warn-full-modal';
    m.className = 'cookie-modal';
    m.innerHTML = `<div class="cookie-modal-content" style="width:720px;"><h3 style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><span id="warn-full-title"></span><button onclick="closeWarnModal()" style="padding:4px 12px;background:#f0f0f0;color:#666;border:none;border-radius:6px;cursor:pointer;">✕</button></h3><div class="rank-scroll" style="max-height:60vh;" id="warn-full-body"></div></div>`;
    document.body.appendChild(m);
  }
  m.querySelector('#warn-full-title').textContent = title;
  m.querySelector('#warn-full-body').innerHTML = bodyHTML;
  m.classList.add('active');
}
function closeWarnModal() { const m = document.getElementById('warn-full-modal'); if (m) m.classList.remove('active'); }

// 下钻：解散时间分布 → 概览已解散明细；其余 → 概览切换状态
function drillWarn(key) {
  if (key === 'dissolve_time' || key === 'active_diss') {
    switchTab('overview');
    const st = document.getElementById('detail-status'); if (st) st.value = 'dissolved';
    const dr = document.getElementById('detail-reason'); if (dr) dr.value = '';
    const ds = document.getElementById('detail-search'); if (ds) ds.value = '';
    loadDetailTable(1);
    if (typeof focusDetailTable === 'function') focusDetailTable();
    return;
  }
  if (key === 'new_team') {
    switchTab('overview');
    const st = document.getElementById('detail-status'); if (st) st.value = 'active';
    loadDetailTable(1);
    if (typeof focusDetailTable === 'function') focusDetailTable();
    return;
  }
  switchTab('overview');
}
