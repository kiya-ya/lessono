function getHallParam() {
  return currentHall === 'all' ? '' : '&hall=' + encodeURIComponent(currentHall);
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

