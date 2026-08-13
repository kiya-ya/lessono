function onHallChange() {
  currentHall = document.getElementById('hall-select').value;
  localStorage.setItem('wb_hall', currentHall);
  refreshData();
  if (typeof loadWorkbenchOverview === 'function') loadWorkbenchOverview();
}

function onWeekChange() {
  currentWeek = document.getElementById('week-select').value;
  localStorage.setItem('wb_week', currentWeek);
  // 工作台刷新
  if (typeof refreshWorkbench === 'function') refreshWorkbench();
  // 对比分析页刷新
  initCompareChart();
  if (typeof initRetentionDist === 'function') initRetentionDist();
  // 明细数据刷新
  loadDetailTable();
  if (typeof loadSurvival === 'function') loadSurvival();
  if (typeof maybeLoadDailyOverlay === 'function') maybeLoadDailyOverlay();
  if (typeof loadCaptains === 'function') loadCaptains();
  if (typeof loadPolicyImpact === 'function') loadPolicyImpact();
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const clicked = Array.from(document.querySelectorAll('.tab')).find(t => t.getAttribute('onclick') && t.getAttribute('onclick').includes("'" + tabName + "'"));
  if (clicked) clicked.classList.add('active');
  document.getElementById('tab-' + tabName).classList.add('active');
  if (tabName === 'overview') setTimeout(() => { if (typeof wbResizeCharts === 'function') wbResizeCharts(); }, 100);
  if (tabName === 'compare') setTimeout(() => { initCompareChart(); if (typeof initRetentionDist === 'function') initRetentionDist(); }, 300);
  if (tabName === 'details') setTimeout(() => { if (typeof loadSurvival === 'function') loadSurvival(); }, 100);
  if (tabName === 'policy') setTimeout(() => { if (typeof loadPolicyImpact === 'function') loadPolicyImpact(); }, 100);
  if (tabName === 'captains') setTimeout(() => { if (typeof loadCaptains === 'function') loadCaptains(); }, 100);
  if (tabName === 'alerts') setTimeout(() => { if (typeof loadAlertsCenter === 'function') loadAlertsCenter(); }, 100);
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

function refreshData() {
  // 工作台（KPI + 趋势图）
  if (typeof refreshWorkbench === 'function') refreshWorkbench();
  loadDetailTable();
  if (typeof loadSurvival === 'function') loadSurvival();
  if (typeof maybeLoadDailyOverlay === 'function') maybeLoadDailyOverlay();
  if (typeof initRetentionDist === 'function') initRetentionDist();
  if (typeof loadCaptains === 'function') loadCaptains();
  if (typeof loadPolicyImpact === 'function') loadPolicyImpact();
  initCompareChart();
}

// 大厅对比搜索
let _hallSearchTimer = null;
function onHallCompareSearch() {
  clearTimeout(_hallSearchTimer);
  _hallSearchTimer = setTimeout(() => {
    hallCompareSearch = document.getElementById('hall-compare-search').value.trim();
    hallComparePage = 0;

    // 联动：搜索到匹配大厅时，同步更新全局 currentHall 并刷新政策前后对比+双轴图
    if (hallCompareSearch && hallCompareData.length > 0) {
      const kw = hallCompareSearch.toLowerCase();
      const matched = hallCompareData.filter(d => d.hall_name && d.hall_name.toLowerCase().includes(kw));
      if (matched.length >= 1) {
        currentHall = matched[0].hall_name;  // 取第一个匹配
      } else {
        currentHall = 'all';
      }
    } else if (!hallCompareSearch) {
      currentHall = 'all';
    }
    if (hallCompareSearch && hallCompareData.length > 0) {
      const kw = hallCompareSearch.toLowerCase();
      const matched = hallCompareData.filter(d => d.hall_name && d.hall_name.toLowerCase().includes(kw));
      if (matched.length === 1) {
        currentHall = matched[0].hall_name;
      } else {
        currentHall = 'all';
      }
    } else if (!hallCompareSearch) {
      currentHall = 'all';
    }
    // 同步全局大厅选择器
    const hallSelect = document.getElementById('hall-select');
    if (hallSelect) hallSelect.value = currentHall;
    // 刷新联动模块：政策前后对比 + 双轴图
    initCompareChart();

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
  const useMock = document.getElementById('uid-mock').checked;
  if (!uid) { alert('请输入UID'); return; }
  document.getElementById('uid-loading').style.display = 'block';
  document.getElementById('uid-result').style.display = 'none';
  document.getElementById('uid-error').style.display = 'none';
  const body = { uid, captain_type: captainType, mock: useMock };
  if (teamId) body.team_id = teamId;
  try {
    const resp = await fetch(API_BASE + '/api/uid-query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await resp.json();
    if (!resp.ok || result.error) throw new Error(result.error || '查询失败');
    renderUIDResult(result);
    document.getElementById('uid-result').style.display = 'block';
  } catch (e) {
    const errDiv = document.getElementById('uid-error');
    let html = `<strong>❌ 查询失败</strong><br>${e.message}`;
    if (e.message.includes('Cookie') || e.message.includes('连接') || e.message.includes('未加载')) html += `<div class="hint">💡 提示：请勾选「模拟数据模式」重新查询，或更新Cookie后重启后端。</div>`;
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
  loadLastUpdate();
  // 工作台初始化（卡墙/排行榜 + KPI + 趋势图）
  if (typeof initWorkbench === 'function') await initWorkbench();
  loadDetailTable();

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
});
