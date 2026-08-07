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

// 页面获得焦点时自动刷新数据（避免后台数据更新后前端显示旧值）
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && typeof refreshData === 'function') {
    refreshData();
  }
});
