function switchPage(name) {
  state.page = name;  // 单一来源记录当前页
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const clicked = Array.from(document.querySelectorAll('.tab')).find(t => t.getAttribute('onclick') && t.getAttribute('onclick').includes("'" + name + "'"));
  if (clicked) clicked.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'overview') setTimeout(() => {
    if (typeof wbResizeCharts === 'function') wbResizeCharts();
    // 团分析 + 姐姐小框并入概览页：切回概览时重绘（自愈隐藏态 0×0 图表）
    if (typeof loadSurvival === 'function') loadSurvival();
    if (typeof loadDissolveReasons === 'function') loadDissolveReasons();
    if (typeof loadOverviewCaptains === 'function') loadOverviewCaptains();
  }, 100);
  if (name === 'compare') setTimeout(() => { initCompareChart(); if (typeof initRetentionDist === 'function') initRetentionDist(); }, 300);
  if (name === 'captains') setTimeout(() => { if (typeof loadCaptains === 'function') loadCaptains(); if (typeof loadSisterProfile === 'function') loadSisterProfile(); }, 100);
  if (name === 'alerts') setTimeout(() => { if (typeof loadWarncenter === 'function') loadWarncenter(); }, 100);
}

// 旧名兼容：index.html 里的 onclick="switchTab(...)" 仍走这里
function switchTab(tabName) { switchPage(tabName); }

// 跨页下钻：记下目标页 + 上下文 → 切页；目标页就绪后自行消费 state.pending（替代「切页后再手动筛一遍」）
function goPage(name, context) {
  state.pending = context || null;
  switchPage(name);
}

// 趋势图下钻：工作台 6 张趋势图 → 对应详情视角（自动带入当前大厅/周）
const DRILL_TARGETS = {
  retention:   { tab: 'compare' },                      // 留存率 → 对比分析
  dissolution: { tab: 'overview', status: 'dissolved' }, // 解散率 → 概览 · 明细已解散
  revenue:     { tab: 'compare' },                      // 礼物奖励 → 对比分析（大厅流水对比）
  activity:    { tab: 'compare' },                      // 任务活跃度 → 对比分析（指标对比表）
  dailyNew:    { tab: 'overview', status: 'active' },   // 日级新成团 → 概览 · 明细进行中
  dailyDiss:   { tab: 'overview', status: 'dissolved' }, // 日级解散 → 概览 · 明细已解散
};

function drillTo(key) {
  const t = DRILL_TARGETS[key];
  if (!t) return;
  switchTab(t.tab);
  if (t.status) {
    const sel = document.getElementById('detail-status');
    if (sel) sel.value = t.status;
    if (typeof loadDetailTable === 'function') loadDetailTable(1);
    focusDetailTable();
  }
}

// 明细下钻统一落点：切到团分析页后滚动到明细表（避免落在顶部存活/解散图上）
function focusDetailTable() {
  const card = document.getElementById('detail-table-card');
  if (!card) return;
  setTimeout(() => {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.style.animation = 'none';
    requestAnimationFrame(() => { card.style.animation = ''; });
  }, 150);
}

// 柱状图点击下钻：切到指定大厅并跳到明细
function drillToHall(hall) {
  if (!hall) return;
  setHall(hall);
  if (typeof wbSyncHallSelect === 'function') wbSyncHallSelect();
  const ds = document.getElementById('detail-search');
  if (ds) ds.value = '';
  refreshData();
  if (typeof loadWorkbenchOverview === 'function') loadWorkbenchOverview();
  switchTab('overview');
  loadDetailTable(1);
  focusDetailTable();
}

// 饼图点击下钻：按解散原因跳到明细（已解散 + 原因筛选）
function drillToReason(reason) {
  if (!reason) return;
  switchTab('overview');
  const st = document.getElementById('detail-status');
  if (st) st.value = 'dissolved';
  const dr = document.getElementById('detail-reason');
  if (dr && [...dr.options].some(o => o.value === reason)) dr.value = reason;
  const ds = document.getElementById('detail-search');
  if (ds) ds.value = '';
  loadDetailTable(1);
  focusDetailTable();
}

// 存活分析直方图点击下钻：按已成团天数区间跳到明细（进行中）
function drillToDays(label) {
  const m = (label || '').match(/(\d+)-(\d+)/);
  const val = label === '30天以上' ? '30+' : m ? `${m[1]}-${m[2]}` : '';
  switchTab('overview');
  const st = document.getElementById('detail-status');
  if (st) st.value = 'active';
  const dd = document.getElementById('detail-days');
  if (dd && [...dd.options].some(o => o.value === val)) dd.value = val;
  const dr = document.getElementById('detail-reason');
  if (dr) dr.value = '';
  const ds = document.getElementById('detail-search');
  if (ds) ds.value = '';
  loadDetailTable(1);
  focusDetailTable();
}

// 日级趋势图点数据点下钻：按成团/解散日期过滤明细
function drillToDate(field, min, max, status) {
  detailDateField = field || '';
  detailDateMin = min || '';
  detailDateMax = max || '';
  switchTab('overview');
  const st = document.getElementById('detail-status');
  if (st) st.value = status || 'all';
  const dd = document.getElementById('detail-days');
  if (dd) dd.value = '';
  const dr = document.getElementById('detail-reason');
  if (dr) dr.value = '';
  const ds = document.getElementById('detail-search');
  if (ds) ds.value = '';
  loadDetailTable(1);
  focusDetailTable();
}

function toggleSort(field) {
  if (detailSortField === field) {
    detailSortOrder = detailSortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    detailSortField = field;
    detailSortOrder = 'asc';
  }
  // 更新表头箭头显示
  ['team_id','form_date','hall_name','days_since_formed','reward_amount','dissolve_date'].forEach(f => {
    const el = document.getElementById('sort-' + f);
    if (el) el.textContent = '▲▼';
  });
  const activeEl = document.getElementById('sort-' + field);
  if (activeEl) activeEl.textContent = detailSortOrder === 'asc' ? '▲' : '▼';
  loadDetailTable(1);
}

// 侧栏折叠/展开（状态存 localStorage）
function toggleSidebar() {
  const layout = document.querySelector('.layout');
  if (!layout) return;
  layout.classList.toggle('side-collapsed');
  localStorage.setItem('wb_sidebar', layout.classList.contains('side-collapsed') ? 'collapsed' : 'expanded');
  // 侧栏宽度变化后重绘图表
  setTimeout(() => Object.values(charts).forEach(c => c && c.resize()), 260);
}

// 周选择下拉（概览页 KPI 标题行右侧）：切换统计周 → 刷新工作台
function onWeekChange() {
  const sel = document.getElementById('week-select');
  if (!sel) return;
  currentWeek = sel.value;
  localStorage.setItem('wb_week', currentWeek);
  if (typeof refreshWorkbench === 'function') refreshWorkbench();
}

function refreshData() {
  // 工作台（KPI + 趋势图）
  if (typeof refreshWorkbench === 'function') refreshWorkbench();
  loadDetailTable();
  if (typeof loadSurvival === 'function') loadSurvival();
  if (typeof loadDissolveReasons === 'function') loadDissolveReasons();
  if (typeof maybeLoadDailyOverlay === 'function') maybeLoadDailyOverlay();
  if (typeof initRetentionDist === 'function') initRetentionDist();
  if (typeof loadCaptains === 'function') loadCaptains();
  if (typeof loadSisterProfile === 'function') loadSisterProfile();
  if (typeof loadOverviewCaptains === 'function') loadOverviewCaptains();
  if (typeof loadWarncenter === 'function') loadWarncenter();
  initCompareChart();
}

// 大厅对比搜索：仅过滤当前厅排行条形图，不跨模块改动 currentHall
let _hallSearchTimer = null;
function onHallCompareSearch() {
  clearTimeout(_hallSearchTimer);
  _hallSearchTimer = setTimeout(() => {
    hallCompareSearch = document.getElementById('hall-compare-search').value.trim();
    hallComparePage = 0;
    renderHallComparePage();
  }, 300);
}

function onHallCompareSortChange() {
  const val = document.getElementById('hall-compare-sort').value;
  const [field, order] = val.split('|');
  hallCompareSortField = field;
  hallCompareSortOrder = order;
  hallComparePage = 0;
  renderHallComparePage();
}

function jumpToUID(uid, teamId) {
  if (!uid || uid === '-') return;
  switchTab('uid');
  document.getElementById('uid-input').value = uid;
  queryUID(teamId);
}

async function queryUID(teamId) {
  const uid = document.getElementById('uid-input').value.trim();
  const captainType = document.getElementById('uid-type').value;
  if (!uid) { alert('请输入UID'); return; }
  document.getElementById('uid-loading').style.display = 'block';
  document.getElementById('uid-result').style.display = 'none';
  document.getElementById('uid-error').style.display = 'none';
  const body = { uid, captain_type: captainType };
  if (teamId) body.team_id = teamId;
  try {
    const resp = await fetch(API_BASE + '/api/uid-query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await resp.json();
    if (!resp.ok || result.error) throw new Error(result.error || '查询失败');
    renderUIDResult(result);
    document.getElementById('uid-result').style.display = 'block';
  } catch (e) {
    const errDiv = document.getElementById('uid-error');
    let html = `<strong>查询失败</strong><br>${e.message}`;
    if (e.message.includes('Cookie') || e.message.includes('连接') || e.message.includes('未加载')) html += `<div class="hint">提示：请更新Cookie后重试。</div>`;
    errDiv.innerHTML = html;
    errDiv.style.display = 'block';
  } finally {
    document.getElementById('uid-loading').style.display = 'none';
  }
}

function openCookieModal() {
  document.getElementById('cookie-modal').classList.add('active');
  updateCookiePanelStatus();
}

function closeCookieModal() {
  document.getElementById('cookie-modal').classList.remove('active');
}

function exportData() {
  const a = document.createElement('a');
  a.href = API_BASE + '/api/export/weekly?' + getHallParam().substring(1);
  a.download = 'weekly_report.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function exportPDF() {
  const a = document.createElement('a');
  a.href = API_BASE + '/api/export/pdf-report?' + getWeekParam().substring(1);
  a.download = 'sister_report.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function exportDetail() {
  const a = document.createElement('a');
  a.href = API_BASE + '/api/export/detail?' + getHallParam().substring(1);
  a.download = 'team_detail.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// 窗口大小变化时重绘图表
window.addEventListener('resize', () => {
  Object.values(charts).forEach(c => c && c.resize());
  if (typeof _partnerChart !== 'undefined' && _partnerChart) _partnerChart.resize();
});

// 一键回到顶部：滚动超过一屏后显示按钮
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.addEventListener('scroll', () => {
  const btn = document.getElementById('back-to-top');
  if (btn) btn.classList.toggle('show', window.scrollY > 300);
});

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 恢复侧栏折叠状态
  if (localStorage.getItem('wb_sidebar') === 'collapsed') {
    const layout = document.querySelector('.layout');
    if (layout) layout.classList.add('side-collapsed');
  }
  await loadHalls();
  await loadWeeks();
  loadUIDTypes();
  loadLastUpdate();
  // Cookie 有效性状态灯（侧边栏 + header 综合点），由 keepalive 真实活性驱动；每 60s 刷新一次
  if (typeof refreshCookieStatus === 'function') refreshCookieStatus();
  setInterval(() => { if (typeof refreshCookieStatus === 'function') refreshCookieStatus(); }, 60000);
  // 工作台初始化（卡墙/排行榜 + KPI + 趋势图）
  if (typeof initWorkbench === 'function') await initWorkbench();
  loadDetailTable();
  // 团分析 + 姐姐小框已并入概览页：首屏渲染
  if (typeof loadSurvival === 'function') loadSurvival();
  if (typeof loadDissolveReasons === 'function') loadDissolveReasons();
  if (typeof loadOverviewCaptains === 'function') loadOverviewCaptains();
  if (typeof loadWarncenter === 'function') loadWarncenter();

  // 明细搜索框自动补全
  const searchInput = document.getElementById('detail-search');
  const suggestBox = document.getElementById('search-suggest');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      clearTimeout(_suggestTimer);
      if (!val) {
        suggestBox.style.display = 'none';
        return;
      }
      _suggestTimer = setTimeout(() => loadSearchSuggestions(val), 200);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        suggestBox.style.display = 'none';
        loadDetailTable(1);
      }
    });
  }
  // 点击外部关闭搜索建议
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-autocomplete-wrap')) {
      if (suggestBox) suggestBox.style.display = 'none';
    }
  });

  // 趋势图下钻：点击工作台 6 张图跳转到对应详情（事件委托，图表重绘不重复绑定）
  const grid = document.querySelector('.chart-grid');
  if (grid) {
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-drill]');
      if (card) drillTo(card.getAttribute('data-drill'));
    });
  }
});
