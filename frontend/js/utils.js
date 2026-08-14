function getHallParam() {
  const select = document.getElementById('hall-select');
  const hall = select ? select.value : currentHall;
  return hall === 'all' ? '' : '&hall=' + encodeURIComponent(hall);
}

function getWeekParam() {
  return currentWeek ? '&week=' + encodeURIComponent(currentWeek) : '';
}

function setChange(id, value, reverse = false) {
  const el = document.getElementById(id);
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '→';
  const isGood = reverse ? value < 0 : value > 0;
  el.className = 'kpi-change ' + (isGood ? 'up' : value === 0 ? 'flat' : 'down');
  el.textContent = arrow + ' ' + Math.abs(value) + '%';
}

function hasValidCompareData(data) {
  const cmp = data.compare || {};
  return cmp.week_level !== undefined;
}

// 分页页码范围：始终显示首末页 + 当前页前后各2页，中间用 '...' 折叠
// 返回 0-based 页码数组（元素为数字或 '...'），避免几十上百页全展开排布错乱
function pagerRange(current, totalPages) {
  totalPages = Math.max(1, totalPages);
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
  const out = [0];
  const left = Math.max(1, current - 2);
  const right = Math.min(totalPages - 2, current + 2);
  if (left > 1) out.push('...');
  for (let i = left; i <= right; i++) out.push(i);
  if (right < totalPages - 2) out.push('...');
  out.push(totalPages - 1);
  return out;
}

