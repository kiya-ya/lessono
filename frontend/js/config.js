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
