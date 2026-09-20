function switchPage(name) {
  state.page = name;  // 单一来源记录当前页
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active', 'sub-on'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const clicked = Array.from(document.querySelectorAll('.tab')).find(t => t.getAttribute('onclick') && t.getAttribute('onclick').includes("'" + name + "'"));
  if (clicked) clicked.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'overview') setTimeout(() => {
    if (typeof wbResizeCharts === 'function') wbResizeCharts();
    // 三栏壳：概览驾驶舱 + 左右栏
    if (typeof loadShellOverview === 'function') loadShellOverview();
    if (typeof loadShellRails === 'function') loadShellRails();
    if (typeof loadGradRetention === 'function') loadGradRetention();
  }, 100);
  if (name === 'compare') setTimeout(() => { initCompareChart(); if (typeof initRetentionDist === 'function') initRetentionDist(); }, 300);
  if (name === 'captains') {
    if (typeof switchCaptainView === 'function') switchCaptainView('profile');
    setTimeout(() => { if (typeof loadCaptains === 'function') loadCaptains(); if (typeof loadSisterProfile === 'function') loadSisterProfile(); if (typeof loadGradRetention === 'function') loadGradRetention(); }, 100);
  }
  if (name === 'alerts') setTimeout(() => {
    if (typeof loadWarncenter === 'function') loadWarncenter();
    if (typeof loadLyingFlat === 'function') loadLyingFlat();
    // 团分析图表已并入预警中心：存活分析 + 解散原因分布
    if (typeof loadSurvival === 'function') loadSurvival();
    if (typeof loadDissolveReasons === 'function') loadDissolveReasons();
  }, 100);
  if (name === 'detail') setTimeout(() => { if (typeof loadDetailTable === 'function') loadDetailTable(); }, 60);
}

// 旧名兼容：index.html 里的 onclick="switchTab(...)" 仍走这里
function switchTab(tabName) { switchPage(tabName); }

// 跨页下钻：记下目标页 + 上下文 → 切页；目标页就绪后自行消费 state.pending（替代「切页后再手动筛一遍」）
function goPage(name, context) {
  state.pending = context || null;
  switchPage(name);
}

function focusModule(selector, attempts = 12) {
  const el = document.querySelector(selector);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (attempts > 0) setTimeout(() => focusModule(selector, attempts - 1), 120);
}

// 概览预警卡 → 预警中心对应指标模块
function jumpToAlertModule(key) {
  switchTab('alerts');
  setTimeout(() => focusModule('#wc-' + key), 140);
}

// 概览姐姐排行 → 姐姐分析的姐姐总览模块
function jumpToCaptainOverview() {
  switchTab('captains');
  setTimeout(() => focusModule('#sister-overview-card'), 180);
}

// 概览模块预览：团分析摘要（点 → 预警中心） + 明细计数（点 → 明细页）
async function loadOverviewPreviews() {
  const teamEl = document.getElementById('overview-team-preview');
  if (teamEl) {
    try {
      const res = await fetch(API_BASE + '/api/dissolve-reasons' + (currentHall !== 'all' ? '?hall=' + encodeURIComponent(currentHall) : ''));
      const d = await res.json();
      const top = (d.buckets || [])[0];
      teamEl.innerHTML = top
        ? `累计解散 <b>${d.total}</b> 团 · 最大类「${top.name}」${top.count} 个（${top.share}%）<br><span style="color:var(--wb-text-3);font-size:12px;">存活分析 / 解散原因钻取已并入预警中心</span>`
        : '暂无解散数据。';
    } catch (e) { teamEl.textContent = '加载失败'; }
  }
  const detEl = document.getElementById('overview-detail-preview');
  if (detEl) {
    try {
      const [a, b] = await Promise.all([
        fetch(API_BASE + '/api/detail-table?per_page=1' + getHallParam()).then(r => r.json()),
        fetch(API_BASE + '/api/detail-table?per_page=1&status=active' + getHallParam()).then(r => r.json()),
      ]);
      detEl.innerHTML = `共 <b>${a.total}</b> 个姐妹团 · 进行中 <b style="color:#3D9A6C;">${b.total}</b> · 已结束 <b>${a.total - b.total}</b>`;
    } catch (e) { detEl.textContent = '加载失败'; }
  }
}

// 明细预览 → 明细数据页（带搜索词）
function overviewGoDetail() {
  const q = (document.getElementById('overview-detail-search') || {}).value || '';
  switchTab('detail');
  const ds = document.getElementById('detail-search');
  if (ds) ds.value = q.trim();
  loadDetailTable(1);
}

// 趋势图下钻：工作台 6 张趋势图 → 对应详情视角（自动带入当前大厅/周）
const DRILL_TARGETS = {
  retention:   { tab: 'compare' },                      // 留存率 → 对比分析
  dissolution: { tab: 'detail', status: 'dissolved' },  // 解散率 → 明细数据 · 已解散
  revenue:     { tab: 'compare' },                      // 礼物奖励 → 对比分析（大厅流水对比）
  activity:    { tab: 'compare' },                      // 任务活跃度 → 对比分析（指标对比表）
  dailyNew:    { tab: 'detail', status: 'active' },     // 日级新成团 → 明细数据 · 进行中
  dailyDiss:   { tab: 'detail', status: 'dissolved' },  // 日级解散 → 明细数据 · 已解散
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

// 明细下钻统一落点：切到明细数据页后滚动到明细表
function focusDetailTable() {
  if (state.page !== 'detail') switchTab('detail');
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
  switchTab('detail');
  loadDetailTable(1);
  focusDetailTable();
}

// 饼图点击下钻：按解散原因跳到明细（已解散 + 原因筛选）
function drillToReason(reason) {
  if (!reason) return;
  switchTab('detail');
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
  switchTab('detail');
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
  switchTab('detail');
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
  ['team_id','form_date','hall_name','days_since_formed','dissolve_date'].forEach(f => {
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
  setTimeout(resizeAllCharts, 260);
}

// 等高网格内图表在数据渲染/卡片拉伸后统一重绘（canvas 跟上容器高度）
function resizeAllCharts() {
  Object.values(charts).forEach(c => { try { c && c.resize(); } catch (e) {} });
}

// 月选择下拉（先选月）：重建该月周下拉并默认选中「整月」→ 刷新工作台
function onMonthChange() {
  const mSel = document.getElementById('month-select');
  if (!mSel) return;
  const v = typeof fillWeekSelectForMonth === 'function' ? fillWeekSelectForMonth(mSel.value) : mSel.value;
  currentWeek = v || mSel.value;
  localStorage.setItem('wb_week', currentWeek);
  if (typeof refreshWorkbench === 'function') refreshWorkbench();
}

// 周选择下拉（后选周）：整月或该月某一周 → 刷新工作台
function onWeekChange() {
  const sel = document.getElementById('week-select');
  if (!sel) return;
  currentWeek = sel.value;
  localStorage.setItem('wb_week', currentWeek);
  if (typeof refreshWorkbench === 'function') refreshWorkbench();
}

// 顶部搜索栏全局搜索：同步到明细搜索框 → 重载明细并滚动定位
function topSearch() {
  const q = (document.getElementById('top-search') || {}).value || '';
  const ds = document.getElementById('detail-search');
  if (ds) ds.value = q.trim();
  if (typeof loadDetailTable === 'function') loadDetailTable(1);
  if (typeof focusDetailTable === 'function') focusDetailTable();
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
  if (typeof loadGradRetention === 'function') loadGradRetention();
  if (typeof loadOverviewPreviews === 'function') loadOverviewPreviews();
  if (typeof loadWarncenter === 'function') loadWarncenter();
  if (typeof loadLyingFlat === 'function') loadLyingFlat();
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

// UID 查询结果：姐妹团参与明细 / 本周vs上周对比 两个模块分页切换
function uidSwitchPane(pane) {
  const teams = document.getElementById('uid-pane-teams');
  const week = document.getElementById('uid-pane-week');
  const bT = document.getElementById('uid-pane-btn-teams');
  const bW = document.getElementById('uid-pane-btn-week');
  if (!teams || !week) return;
  const isTeams = pane === 'teams';
  teams.style.display = isTeams ? '' : 'none';
  week.style.display = isTeams ? 'none' : '';
  if (bT) bT.classList.toggle('on', isTeams);
  if (bW) bW.classList.toggle('on', !isTeams);
  // 切回参与明细页时，姐姐vs妹妹图表需 resize（隐藏时 echarts 尺寸为 0）
  if (isTeams && typeof _partnerChart !== 'undefined' && _partnerChart) setTimeout(() => _partnerChart.resize(), 50);
  // 切到个人信息详情页时，个人周趋势图同理
  if (!isTeams && typeof _memberTrendChart !== 'undefined' && _memberTrendChart) setTimeout(() => _memberTrendChart.resize(), 50);
}

async function queryUID(teamId) {
  const uid = document.getElementById('uid-input').value.trim();
  const captainType = document.getElementById('uid-type').value;
  if (!uid) { if (typeof showToast === 'function') showToast('请输入UID', 'error'); return; }
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

// 页面内的术语/口径说明默认收起，避免大段灰底说明挤占首屏。
// 保留原有内容结构，通过渐进增强统一加上可访问的折叠控制。
function initInfoFolds() {
  document.querySelectorAll('.dn-footer, .warn-note, .warn-rule').forEach((panel, index) => {
    if (panel.classList.contains('info-fold')) return;

    const originalHead = panel.querySelector(':scope > .dn-foot-head, :scope > .wr-head');
    const titleHtml = originalHead
      ? originalHead.innerHTML
      : '提示说明<span class="info-fold-subtitle">严重 · 警告 · 提醒的触发含义</span>';
    if (originalHead) originalHead.remove();

    const body = document.createElement('div');
    const content = document.createElement('div');
    const bodyId = `info-fold-body-${index + 1}`;
    body.className = 'info-fold-body';
    body.id = bodyId;
    body.setAttribute('aria-hidden', 'true');
    body.inert = true;
    content.className = 'info-fold-content';

    while (panel.firstChild) content.appendChild(panel.firstChild);
    body.appendChild(content);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'info-fold-trigger';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', bodyId);
    trigger.innerHTML = `
      <span class="info-fold-title">${titleHtml}</span>
      <span class="info-fold-action">
        <span class="info-fold-state">展开</span>
        <span class="info-fold-chevron" aria-hidden="true"></span>
      </span>`;

    trigger.addEventListener('click', () => {
      const isOpen = panel.classList.toggle('is-open');
      trigger.setAttribute('aria-expanded', String(isOpen));
      body.setAttribute('aria-hidden', String(!isOpen));
      body.inert = !isOpen;
      trigger.querySelector('.info-fold-state').textContent = isOpen ? '收起' : '展开';
    });

    panel.classList.add('info-fold');
    panel.append(trigger, body);
  });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  initInfoFolds();
  initSearchableHallFilters();
  // 恢复侧栏折叠状态
  if (localStorage.getItem('wb_sidebar') === 'collapsed') {
    const layout = document.querySelector('.layout');
    if (layout) layout.classList.add('side-collapsed');
  }
  await loadHalls();
  await loadWeeks();
  loadHallGroups();
  loadUIDTypes();
  loadLastUpdate();
  // Cookie 有效性状态灯（侧边栏 + header 综合点），由 keepalive 真实活性驱动；每 60s 刷新一次
  if (typeof refreshCookieStatus === 'function') refreshCookieStatus();
  setInterval(() => { if (typeof refreshCookieStatus === 'function') refreshCookieStatus(); }, 60000);
  // 工作台初始化（卡墙/排行榜 + KPI + 趋势图）
  if (typeof initWorkbench === 'function') await initWorkbench();
  // 三栏壳：概览驾驶舱 + 左右栏模块
  if (typeof loadShellOverview === 'function') await loadShellOverview();
  if (typeof loadShellRails === 'function') loadShellRails();
  if (typeof initShellScroll === 'function') initShellScroll();
  loadDetailTable();
  // 概览驾驶舱首屏：师门榜 / 毕业妹妹卡 / 模块预览（团分析与明细已独立成页，入页时再加载）
  if (typeof loadOverviewCaptains === 'function') loadOverviewCaptains();
  if (typeof loadGradRetention === 'function') loadGradRetention();
  if (typeof loadOverviewPreviews === 'function') loadOverviewPreviews();
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
