const API_BASE = '';
let charts = {};
let _lastUIDResult = null;
let detailPage = 1;
let detailSortField = 'snapshot_date';
let detailSortOrder = 'desc';  // 默认倒序，最新在前
let currentHall = 'all';
let currentWeek = '';

// 各大厅对比排序
let hallCompareSortField = 'active_count';
let hallCompareSortOrder = 'desc';
let hallCompareSearch = '';

// ===== 页面状态（单一来源，后续各页逐步迁入）=====
const state = {
  page: 'overview',   // 当前激活页
  pending: null,      // 跨页下钻上下文（{ target, ... }，goPage 写入、目标页就绪后消费）
};

// 大厅/周访问器：统一「设值 + localStorage 持久化」，逐步替换散落的 currentHall=/localStorage 写
function setHall(hall) {
  currentHall = hall;
  localStorage.setItem('wb_hall', hall);
}
function getHall() { return currentHall; }
function setWeek(week) {
  currentWeek = week;
  localStorage.setItem('wb_week', week);
}
function getWeek() { return currentWeek; }

// 页面获得焦点时自动刷新数据（避免后台数据更新后前端显示旧值）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && typeof refreshData === 'function') {
    refreshData();
  }
});
