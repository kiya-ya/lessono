// lyingflat.js - 躺平预警（妹妹维度 · 进行中团连续未完成陪档 · 接近自动解散）
// 接 /api/lying-flat：4 KPI + 连续未陪档天数分布 + 大厅分布 + 躺平团名单

let _lyingData = null;

async function loadLyingFlat() {
  const kpi = document.getElementById('lying-kpis');
  if (!kpi) return;
  try {
    const res = await fetch(API_BASE + '/api/lying-flat');
    const d = await res.json();
    if (d.error) { kpi.style.opacity = '.5'; return; }
    _lyingData = d;
    renderLyingKpis(d);
    renderLyingDays(d);
    renderLyingHall(d);
    renderLyingList(d, 6);
  } catch (e) {
    console.error('躺平预警加载失败:', e);
  }
}

function renderLyingKpis(d) {
  const s = d.summary || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('ly-lying', s.lying == null ? '--' : s.lying);
  set('ly-warning', s.warning == null ? '--' : s.warning);
  set('ly-rate', s.accompany_rate == null ? '--' : s.accompany_rate + '%');
  set('ly-ref', (d.ref_date || '--').slice(5));
}

function renderLyingDays(d) {
  const el = document.getElementById('ly-days');
  const labels = (d.days_dist || []).map((x) => x.label);
  const vals = (d.days_dist || []).map((x) => x.count);
  const insight = document.getElementById('ly-days-insight');
  if (insight) {
    const parts = (d.days_dist || []).map((x) => `<b>${x.label}</b> ${x.count}`).join(' · ');
    insight.innerHTML = `进行中团连续未陪档分布：${parts || '暂无'}。4 天及以上属躺平、1~3 天属提醒；连续 5 日未陪档即触发自动解散。`;
  }
  if (!el || !window.echarts) return;
  if (charts['ly-days']) charts['ly-days'].dispose();
  const c = echarts.init(el);
  charts['ly-days'] = c;
  c.setOption({
    grid: { left: 40, right: 12, top: 20, bottom: 30 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, color: '#6B7280', interval: 0 } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 10, color: '#6B7280' } },
    series: [{ type: 'bar', data: vals, barMaxWidth: 40, itemStyle: { color: '#DC2626', borderRadius: [4, 4, 0, 0] } }]
  });
}

function lyTeamRowHTML(x, i) {
  const streakCls = x.level === 'lying' ? '#DC2626' : '#D97706';
  return `<tr>
    <td><a href="javascript:void(0)" onclick="lyOpenTeam(${i})" style="color:#5B3EC4;font-weight:500;text-decoration:none;">${esc(x.team_id)}</a></td>
    <td>${esc(x.hall_name)}</td>
    <td>${esc(x.sister_nickname2 || x.sister_nickname || '-')}</td>
    <td class="center" style="color:${streakCls};font-weight:600;">${x.accompany_streak} 天</td>
    <td class="center">${x.days_since_formed || 0} 天</td>
    <td class="center">${esc(x.sister_level2 || '无')}</td>
  </tr>`;
}

function renderLyingHall(d) {
  const tbl = document.getElementById('ly-hall-table');
  if (!tbl) return;
  const rows = (d.hall_dist || []).slice(0, 8);
  const body = rows.length
    ? rows.map((h, i) => `<tr class="row-click" onclick="lyDrillHall(${i})"><td>${esc(h.hall)}</td><td class="center" style="font-weight:600;">${h.count}</td></tr>`).join('')
    : '<tr><td colspan="2" style="color:#9CA3AF;">暂无</td></tr>';
  tbl.innerHTML = `<thead><tr><th>大厅</th><th class="center">躺平团数</th></tr></thead><tbody>${body}</tbody>`;
}

function renderLyingList(d, n) {
  const tbl = document.getElementById('ly-list-table');
  if (!tbl) return;
  const rows = (d.list || []).slice(0, n);
  const body = rows.length
    ? rows.map((x, i) => lyTeamRowHTML(x, i)).join('')
    : '<tr><td colspan="6" style="color:#9CA3AF;">暂无躺平团</td></tr>';
  tbl.innerHTML = `<thead><tr><th>团ID</th><th>大厅</th><th>妹妹</th><th class="center">连续未陪档</th><th class="center">已成团天数</th><th class="center">等级</th></tr></thead><tbody>${body}</tbody>`;
}

// 点团ID → 姐妹团详情弹窗（复用 renderTeamDetailModal，list 项已含足量字段）
function lyOpenTeam(i) {
  const x = _lyingData && _lyingData.list && _lyingData.list[i];
  if (!x || typeof renderTeamDetailModal !== 'function') return;
  renderTeamDetailModal(x);
}

// 点大厅 → 该厅躺平团名单弹窗
function lyDrillHall(i) {
  if (!_lyingData) return;
  const h = (_lyingData.hall_dist || [])[i];
  if (!h) return;
  const rows = (_lyingData.list || []).filter((x) => x.hall_name === h.hall);
  const body = rows.length
    ? rows.map((x) => lyTeamRowHTML(x, _lyingData.list.indexOf(x))).join('')
    : '<tr><td colspan="6" style="color:#9CA3AF;">暂无</td></tr>';
  openWarnModal(`${h.hall} · 躺平团名单`, `<table class="rank-table"><thead><tr><th>团ID</th><th>大厅</th><th>妹妹</th><th class="center">连续未陪档</th><th class="center">已成团天数</th><th class="center">等级</th></tr></thead><tbody>${body}</tbody></table>`);
}

// 查看全部大厅分布
function openLyHalls() {
  if (!_lyingData) return;
  const rows = (_lyingData.hall_dist || []).map((h) => `<tr><td>${esc(h.hall)}</td><td class="center" style="font-weight:600;">${h.count}</td></tr>`).join('');
  openWarnModal('躺平团 · 大厅分布', `<table class="rank-table"><thead><tr><th>大厅</th><th class="center">躺平团数</th></tr></thead><tbody>${rows || '<tr><td colspan="2" style="color:#9CA3AF;">暂无</td></tr>'}</tbody></table>`);
}

// 查看全部躺平名单
function openLyFull() {
  if (!_lyingData) return;
  const rows = (_lyingData.list || []).map((x, i) => lyTeamRowHTML(x, i)).join('');
  openWarnModal(`躺平团名单（${(_lyingData.list || []).length} 个）`, `<table class="rank-table"><thead><tr><th>团ID</th><th>大厅</th><th>妹妹</th><th class="center">连续未陪档</th><th class="center">已成团天数</th><th class="center">等级</th></tr></thead><tbody>${rows || '<tr><td colspan="6" style="color:#9CA3AF;">暂无</td></tr>'}</tbody></table>`);
}
