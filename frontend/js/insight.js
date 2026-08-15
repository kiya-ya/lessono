// insight.js - 姐姐分析 / 预警中心

/* ═══════════════ 姐姐分析 ═══════════════ */

let captainPeriod = 'day';          // day / week / month
let captainSortField = 'total_reward';
let captainSortOrder = 'desc';
let captainData = [];
let captainPage = 0;
let captainPerPage = 20;

const CAPTAIN_PERIOD_LABEL = { day: '当日', week: '当周', month: '当月' };

function setCaptainPeriod(p) {
  captainPeriod = p;
  ['day', 'week', 'month'].forEach(k => {
    const b = document.getElementById('cap-' + k);
    if (b) b.classList.toggle('on', k === p);
  });
  loadCaptains();
}

function sortCaptains(field) {
  if (captainSortField === field) {
    captainSortOrder = captainSortOrder === 'desc' ? 'asc' : 'desc';
  } else {
    captainSortField = field;
    captainSortOrder = 'desc';
  }
  captainPage = 0;
  renderCaptainTable();
}

function setCaptainPerPage(v) {
  captainPerPage = parseInt(v) || 20;
  captainPage = 0;
  renderCaptainTable();
}

function renderCaptainTable() {
  const tableEl = document.getElementById('captain-table');
  if (!tableEl) return;
  const sortArrow = f => captainSortField === f ? (captainSortOrder === 'desc' ? '▼' : '▲') : '▲▼';
  const sorted = [...captainData].sort((a, b) => {
    const av = a[captainSortField] || 0, bv = b[captainSortField] || 0;
    return captainSortOrder === 'desc' ? bv - av : av - bv;
  });
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / captainPerPage));
  if (captainPage >= totalPages) captainPage = totalPages - 1;
  if (captainPage < 0) captainPage = 0;
  const start = captainPage * captainPerPage;
  const pageData = sorted.slice(start, start + captainPerPage);
  const th = (field, label) =>
    `<th style="cursor:pointer;user-select:none" onclick="sortCaptains('${field}')">${label} <span style="font-size:10px;color:var(--wb-text-3)">${sortArrow(field)}</span></th>`;
  tableEl.innerHTML = `
    <tr><th>#</th><th>姐姐</th><th>所在大厅</th>${th('total_reward', CAPTAIN_PERIOD_LABEL[captainPeriod] + '奖励')}</tr>
    ${pageData.map((c, i) => `<tr>
      <td class="rank-no ${(start + i) < 3 ? 'top' : ''}">${start + i + 1}</td>
      <td>${c.nickname} <span style="color:var(--wb-text-3);font-size:11px">(${c.uid})</span></td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis">${c.halls}</td>
      <td>${wbFmtMoney(c.total_reward)}</td>
    </tr>`).join('')}`;
  const el = document.getElementById('captain-pagination');
  if (el) {
    let html = `<span style="font-size:12px;color:#666;margin-right:10px;">共 ${total} 位 · ${captainPage + 1}/${totalPages} 页</span>`;
    if (captainPage > 0) html += `<button onclick="captainPage--;renderCaptainTable();">上一页</button>`;
    pagerRange(captainPage, totalPages).forEach(i => {
      html += i === '...'
        ? '<span class="pager-dots">…</span>'
        : `<button class="${i === captainPage ? 'active' : ''}" onclick="captainPage=${i};renderCaptainTable();">${i + 1}</button>`;
    });
    if (captainPage < totalPages - 1) html += `<button onclick="captainPage++;renderCaptainTable();">下一页</button>`;
    el.innerHTML = html;
  }
  const insEl = document.getElementById('captain-insight');
  if (insEl) {
    const top = sorted[0];
    insEl.innerHTML = top
      ? `TOP 姐姐「${top.nickname}」${CAPTAIN_PERIOD_LABEL[captainPeriod]}奖励 <b>${wbFmtMoney(top.total_reward)}</b>。`
      : '暂无排行数据。';
  }
}

async function loadCaptains() {
  const tableEl = document.getElementById('captain-table');
  if (!tableEl) return;
  try {
    const res = await fetch(API_BASE + `/api/captains?limit=100&period=${captainPeriod}&` + getHallParam().substring(1));
    const d = await res.json();
    if (d.ref_date) {
      document.getElementById('captains-hint').textContent = `数据日期 ${d.ref_date} · 会随所选大厅变化`;
    }
    const titleEl = document.getElementById('captain-table-title');
    if (titleEl) titleEl.textContent = `👑 姐姐排行榜（按${CAPTAIN_PERIOD_LABEL[captainPeriod]}奖励）`;

    captainData = d.data || [];
    captainPage = 0;
    renderCaptainTable();
  } catch (e) { console.error('姐姐分析加载失败:', e); }
}

/* 姐姐画像（周口径）：产出/留存/稳定性 + 头部/风险打标 */
let sisterProfileList = [];
let sisterProfileSummary = {};
let sisterProfileGraduates = [];
let sisterProfilePage = 0;
let sisterProfilePerPage = 20;
let sisterProfileSort = 'week_rev';

async function loadSisterProfile() {
  const sumEl = document.getElementById('sister-profile-sum');
  const tableEl = document.getElementById('sister-profile-table');
  if (!tableEl) return;
  try {
    const res = await fetch(API_BASE + '/api/sister-profile?' + getHallParam().substring(1));
    const d = await res.json();
    if (d.error) return;
    sisterProfileList = d.list || [];
    sisterProfileSummary = d.summary || {};
    sisterProfileGraduates = d.recent_graduates || [];
    const s = d.summary || {};
    sumEl.innerHTML = `
      <span class="survival-chip">👤 姐姐 ${d.total} 位（周 ${d.cur_week || ''}）</span>
      <span class="survival-chip">🏆 头部 <strong>${s.head_count}</strong> 位</span>
      <span class="survival-chip">⚠️ 风险 <strong>${s.risk_count}</strong> 位</span>
      <span class="survival-chip">💰 本周流水 TOP：${s.top_sister || '—'} <strong>${wbFmtMoney(s.top_rev || 0)}</strong></span>`;
    const insEl = document.getElementById('sister-profile-insight');
    if (insEl) {
      insEl.innerHTML = `头部 <b>${s.head_count}</b> 位是流水主力（高于八成非零姐姐且留存≥50%），风险 <b>${s.risk_count}</b> 位需重点跟进（环比暴跌或带团多留存低）。本周流水 TOP「${s.top_sister || '—'}」${wbFmtMoney(s.top_rev || 0)}。`;
    }
    renderSisterProfile();
    renderSisterCharts();
    renderRecentGraduates();
  } catch (e) { console.error('姐姐画像加载失败:', e); }
}

/* 最近一周毕业的妹妹（满30天自动毕业） */
function renderRecentGraduates() {
  const el = document.getElementById('recent-grad-list');
  if (!el) return;
  const list = sisterProfileGraduates || [];
  if (!list.length) {
    el.innerHTML = '<div style="color:var(--wb-text-3);font-size:12px;padding:8px 0;">近一周暂无毕业的妹妹。</div>';
    return;
  }
  el.innerHTML = `
    <div class="rank-scroll" style="max-height:320px;">
      <table class="rank-table">
        <thead><tr><th>妹妹</th><th>大厅</th><th>毕业日期</th></tr></thead>
        <tbody>${list.map((g, i) => `<tr>
          <td>${g.nickname || g.sister_uid2 || '-'}</td>
          <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${g.hall_name || '-'}</td>
          <td>${g.dissolve_date || '-'}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

/* 画像主视图顶部两张图：打标分布环形 + 流水×留存散点 */
function renderSisterCharts() {
  const list = sisterProfileList || [];
  const s = sisterProfileSummary || {};
  // 1) 打标分布环形
  const tagEl = document.getElementById('chart-sister-tag');
  if (tagEl && tagEl.offsetHeight) {
    const head = s.head_count || 0, risk = s.risk_count || 0;
    const normal = Math.max(0, list.length - head - risk);
    if (charts['sisterTag']) charts['sisterTag'].dispose();
    charts['sisterTag'] = echarts.init(tagEl);
    charts['sisterTag'].setOption({
      tooltip: { trigger: 'item', formatter: p => `${p.name}<br/>${p.value} 位（${p.percent}%）` },
      legend: { orient: 'vertical', right: 0, top: 'middle', textStyle: { fontSize: 11, color: '#6B7280' } },
      series: [{
        type: 'pie', radius: ['48%', '72%'], center: ['38%', '50%'],
        itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
        label: { show: true, formatter: '{b}\n{c}位', fontSize: 10, color: '#6B7280' },
        data: [
          { name: '头部', value: head, itemStyle: { color: '#3D9A6C' } },
          { name: '风险', value: risk, itemStyle: { color: '#D56060' } },
          { name: '普通', value: normal, itemStyle: { color: '#C0C4CC' } },
        ],
      }]
    });
  }
  // 2) 带团存活率分段直方图（分箱避免散点重叠）
  const retEl = document.getElementById('chart-sister-ret');
  if (retEl && retEl.offsetHeight) {
    const bins = [['0-20%', 0, 20], ['20-40%', 20, 40], ['40-60%', 40, 60], ['60-80%', 60, 80], ['80-100%', 80, 101]];
    const counts = bins.map(() => 0);
    list.forEach(x => {
      if (x.retention == null) return;
      const v = Math.min(100, Math.max(0, x.retention));
      for (let i = 0; i < bins.length; i++) {
        if (v >= bins[i][1] && v < bins[i][2]) { counts[i]++; break; }
      }
    });
    const colors = ['#D56060', '#E08A5A', '#C98A2D', '#8FA8C9', '#3D9A6C'];
    if (charts['sisterRet']) charts['sisterRet'].dispose();
    charts['sisterRet'] = echarts.init(retEl);
    charts['sisterRet'].setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => `${p[0].name}<br/>${p[0].value} 位姐姐` },
      grid: { left: 50, right: 30, top: 20, bottom: 36 },
      xAxis: { type: 'category', data: bins.map(b => b[0]), axisLabel: { fontSize: 11, color: '#6B7280' }, axisLine: { lineStyle: { color: '#E5E7EB' } } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 10, color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
      series: [{
        type: 'bar', barWidth: '55%',
        data: counts.map((c, i) => ({ value: c, itemStyle: { color: colors[i], borderRadius: [4, 4, 0, 0] } })),
        label: { show: true, position: 'top', fontSize: 11, color: '#6B7280' },
      }]
    });
  }
}

function setSisterProfileSort(v) { sisterProfileSort = v; sisterProfilePage = 0; renderSisterProfile(); }
function setSisterProfilePerPage(v) { sisterProfilePerPage = parseInt(v) || 20; sisterProfilePage = 0; renderSisterProfile(); }

function renderSisterProfile() {
  const list = [...sisterProfileList];
  const key = sisterProfileSort;
  list.sort((a, b) => {
    const va = a[key], vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return vb - va;
  });
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / sisterProfilePerPage));
  if (sisterProfilePage >= totalPages) sisterProfilePage = totalPages - 1;
  if (sisterProfilePage < 0) sisterProfilePage = 0;
  const start = sisterProfilePage * sisterProfilePerPage;
  const page = list.slice(start, start + sisterProfilePerPage);
  const tag = x => x === 'head' ? '<span class="chip up">头部</span>' : x === 'risk' ? '<span class="chip down">风险</span>' : '<span class="chip flat">普通</span>';
  const wow = v => v == null ? '—' : `<span class="chip ${v > 0 ? 'up' : v < 0 ? 'down' : 'flat'}">${v > 0 ? '+' : ''}${v}%</span>`;
  document.getElementById('sister-profile-table').innerHTML = `
    <tr><th>#</th><th>姐姐</th><th>等级</th><th>本周流水</th><th>环比</th><th>带团</th><th>进行中</th><th>存活率</th><th>均成团天</th><th>在榜天</th><th>标签</th></tr>
    ${page.map((x, i) => `<tr>
      <td class="rank-no ${(start + i) < 3 ? 'top' : ''}">${start + i + 1}</td>
      <td><a href="javascript:void(0)" onclick="openSisterDetail('${x.sister_uid || ''}')">${x.sister_nickname || '-'}</a></td>
      <td>${x.sister_level ?? '-'}</td>
      <td>${wbFmtMoney(x.week_rev)}</td>
      <td>${wow(x.rev_wow)}</td>
      <td>${x.total_teams}</td>
      <td>${x.active_teams}</td>
      <td>${x.retention == null ? '—' : x.retention + '%'}</td>
      <td>${x.avg_days ?? '-'}</td>
      <td>${x.presence_days}</td>
      <td>${tag(x.tag)}</td>
    </tr>`).join('')}`;
  const pg = document.getElementById('sister-profile-pagination');
  if (pg) {
    let html = `<span style="font-size:12px;color:#666;margin-right:10px;">共 ${total} 位 · ${sisterProfilePage + 1}/${totalPages} 页</span>`;
    if (sisterProfilePage > 0) html += `<button onclick="sisterProfilePage--;renderSisterProfile();">上一页</button>`;
    pagerRange(sisterProfilePage, totalPages).forEach(i => {
      html += i === '...'
        ? '<span class="pager-dots">…</span>'
        : `<button class="${i === sisterProfilePage ? 'active' : ''}" onclick="sisterProfilePage=${i};renderSisterProfile();">${i + 1}</button>`;
    });
    if (sisterProfilePage < totalPages - 1) html += `<button onclick="sisterProfilePage++;renderSisterProfile();">下一页</button>`;
    pg.innerHTML = html;
  }
}

/* 姐姐下钻：带团明细 + 流水曲线 */
let sdUid = '';

async function openSisterDetail(uid) {
  sdUid = uid || '';
  const modal = document.getElementById('sister-detail-modal');
  if (!modal) return;
  modal.classList.add('active');
  document.getElementById('sd-name').textContent = '加载中...';
  document.getElementById('sd-chips').innerHTML = '';
  document.getElementById('sd-table').innerHTML = '';
  document.getElementById('sd-chart-src').textContent = '每日礼物流水';
  const el = document.getElementById('sd-chart');
  const lvEl = document.getElementById('sd-level-chart');
  if (charts['sdChart']) { charts['sdChart'].dispose(); charts['sdChart'] = null; }
  if (charts['sdLevelChart']) { charts['sdLevelChart'].dispose(); charts['sdLevelChart'] = null; }
  try {
    const res = await fetch(API_BASE + '/api/sister-detail?uid=' + encodeURIComponent(uid));
    const d = await res.json();
    if (d.error) { document.getElementById('sd-name').textContent = '未找到该姐姐的画像'; return; }
    document.getElementById('sd-name').textContent = `${d.nickname || uid}（${d.level || '未知'}）`;
    document.getElementById('sd-chips').innerHTML = `
      <span class="survival-chip">带团 <strong>${d.total_teams}</strong></span>
      <span class="survival-chip">进行中 <strong>${d.active_teams}</strong></span>
      <span class="survival-chip">存活率 ${d.retention == null ? '—' : '<strong>' + d.retention + '%</strong>'}</span>
      <span class="survival-chip">均成团 <strong>${d.avg_days ?? '—'}</strong>天</span>
      <span class="survival-chip">在榜 <strong>${d.presence_days}</strong>天</span>`;
    // 等级轨迹折线图（姐姐当日等级会波动，用折线展示）
    const track = d.level_track || [];
    const lvNames = ['无', '初级铜牌', '铜牌', '初级银牌', '银牌', '金牌', '王牌', '大神'];
    if (track.length >= 2) {
      charts['sdLevelChart'] = echarts.init(lvEl);
      charts['sdLevelChart'].setOption({
        tooltip: { trigger: 'axis', textStyle: { fontSize: 12 }, formatter: ps => { const p = ps[0]; return `${p.name}<br/>等级 ${lvNames[p.value] || '无'}`; } },
        grid: { left: 60, right: 16, top: 16, bottom: 28 },
        xAxis: { type: 'category', data: track.map(x => x.date), axisLabel: { fontSize: 10, color: '#6B7280' } },
        yAxis: { type: 'category', data: lvNames, axisLabel: { fontSize: 11, color: '#374151' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
        series: [{ name: '等级', type: 'line', data: track.map(x => x.rank), itemStyle: { color: '#3D9A6C' }, lineStyle: { color: '#3D9A6C', width: 2 }, symbolSize: 6 }]
      });
    } else {
      lvEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9CA3AF;font-size:12px;">等级轨迹数据不足</div>';
    }
    // 流水图：优先每日(15天曲线)，否则周流水
    const seriesData = (d.daily && d.daily.length) ? d.daily.map(x => ({ name: x.date, value: x.rev })) : [];
    if (seriesData.length) {
      document.getElementById('sd-chart-src').textContent = '每日礼物流水（快照日）';
      charts['sdChart'] = echarts.init(el);
      charts['sdChart'].setOption({
        tooltip: { trigger: 'axis', textStyle: { fontSize: 12 }, formatter: ps => { const p = ps[0]; return `${p.name}<br/>流水 ${wbFmtMoney(p.value)}`; } },
        grid: { left: 70, right: 20, top: 16, bottom: 28 },
        xAxis: { type: 'category', data: seriesData.map(x => x.name), axisLabel: { fontSize: 10, color: '#6B7280' } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#9CA3AF', formatter: v => wbFmtMoney(v) }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
        series: [{ name: '流水', type: 'bar', data: seriesData.map(x => x.value), barWidth: '50%', itemStyle: { color: '#7C5CFF', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', fontSize: 10, color: '#6B7280', formatter: p => wbFmtMoney(p.value) } }]
      });
    } else if (d.weekly && d.weekly.length) {
      document.getElementById('sd-chart-src').textContent = '周礼物流水';
      charts['sdChart'] = echarts.init(el);
      charts['sdChart'].setOption({
        tooltip: { trigger: 'axis', textStyle: { fontSize: 12 }, formatter: ps => { const p = ps[0]; return `${p.name}<br/>流水 ${wbFmtMoney(p.value)}`; } },
        grid: { left: 70, right: 20, top: 16, bottom: 28 },
        xAxis: { type: 'category', data: d.weekly.map(x => x.week), axisLabel: { fontSize: 11, color: '#6B7280' } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#9CA3AF', formatter: v => wbFmtMoney(v) }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
        series: [{ name: '周流水', type: 'bar', data: d.weekly.map(x => x.rev), barWidth: '45%', itemStyle: { color: '#7C5CFF', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', fontSize: 10, color: '#6B7280', formatter: p => wbFmtMoney(p.value) } }]
      });
    } else {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9CA3AF;font-size:12px;">暂无流水数据</div>';
    }
    document.getElementById('sd-table').innerHTML = `
      <tr><th>团ID</th><th>大厅</th><th>成团天</th><th>状态</th><th>妹妹</th><th>奖励</th></tr>
      ${(d.teams || []).map(t => `<tr>
        <td>${t.team_id}</td>
        <td>${t.hall_name || '-'}</td>
        <td>${t.days_since_formed ?? '-'}天</td>
        <td>${t.status === 'active' ? '<span class="chip up">进行中</span>' : '<span class="chip flat">已解散</span>'}</td>
        <td>${t.sister2 || '-'}</td>
        <td>${wbFmtMoney(t.reward_amount)}</td>
      </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:#9CA3AF;padding:16px;">暂无带团记录</td></tr>'}`;
  } catch (e) { console.error('姐姐下钻失败:', e); document.getElementById('sd-name').textContent = '加载失败'; }
}

function closeSisterDetail() {
  const modal = document.getElementById('sister-detail-modal');
  if (modal) modal.classList.remove('active');
}

function sdGoUID() {
  if (sdUid) { closeSisterDetail(); jumpToUID(sdUid); }
}

/* ═══════════════ 候选池（阶段B）：并列展示四因子证据 + 结果记录 ═══════════════ */

let poolList = [];
let poolPage = 0;
let poolPerPage = 20;

function switchCaptainView(view) {
  const main = document.getElementById('captains-main');
  const pool = document.getElementById('captains-pool');
  if (!main || !pool) return;
  main.style.display = view === 'profile' ? '' : 'none';
  pool.style.display = view === 'pool' ? '' : 'none';
  const set = (id, on) => { const b = document.getElementById(id); if (b) b.classList.toggle('on', on); };
  set('cap-view-profile', view === 'profile');
  set('cap-view-pool', view === 'pool');
  if (view === 'pool') { loadTalentPool(); loadTalentActions(); }
  if (view === 'profile') {
    setTimeout(() => { if (charts['sisterTag']) charts['sisterTag'].resize(); if (charts['sisterRet']) charts['sisterRet'].resize(); }, 60);
  }
}

function setPoolPerPage(v) { poolPerPage = parseInt(v) || 20; poolPage = 0; renderTalentPool(); }

async function loadTalentPool() {
  const sumEl = document.getElementById('pool-sum');
  const tableEl = document.getElementById('pool-table');
  if (!tableEl) return;
  try {
    const res = await fetch(API_BASE + '/api/talent-pool?' + getHallParam().substring(1));
    const d = await res.json();
    if (d.error) return;
    poolList = d.list || [];
    if (sumEl) sumEl.innerHTML = `
      <span class="survival-chip">👤 姐姐 <strong>${d.total}</strong> 位</span>
      <span class="survival-chip">🎯 候选 <strong>${d.candidate_count}</strong> 位</span>
      <span class="survival-chip">并列展示 · 不做权威排序</span>`;
    const insEl = document.getElementById('pool-insight');
    if (insEl) {
      insEl.innerHTML = `候选 <b>${d.candidate_count}</b> 位满足「存活率≥50% 且 妹妹有成长 且 牌子≥铜牌」。四因子权重暂为「留存 = 妹妹成长 &gt; 共同成长 &gt; 牌子等级（门槛）」，在攒出成功案例前不做权威排序——请结合四列证据自行判断倾斜给谁，并把动作记到下方「结果记录」。`;
    }
    renderTalentPool();
  } catch (e) { console.error('候选池加载失败:', e); }
}

function renderTalentPool() {
  const list = poolList; // 后端已按「候选优先 + 牌子等级」并列分组
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / poolPerPage));
  if (poolPage >= totalPages) poolPage = totalPages - 1;
  if (poolPage < 0) poolPage = 0;
  const start = poolPage * poolPerPage;
  const page = list.slice(start, start + poolPerPage);
  const cand = c => c ? '<span class="chip up">候选</span>' : '<span class="chip flat">待观察</span>';
  document.getElementById('pool-table').innerHTML = `
    <tr><th>#</th><th>姐姐</th><th>牌子等级</th><th>带团(总/进行)</th><th>存活率</th><th>妹妹成长(级/月)</th><th>共同成长</th><th>状态</th><th>操作</th></tr>
    ${page.map((x, i) => `<tr>
      <td class="rank-no ${(start + i) < 3 ? 'top' : ''}">${start + i + 1}</td>
      <td><a href="javascript:void(0)" onclick="openSisterDetail('${x.sister_uid || ''}')">${x.sister_nickname || '-'}</a></td>
      <td>${x.level ?? '-'}</td>
      <td>${x.total_teams} / ${x.active_teams}</td>
      <td>${x.retention == null ? '—' : x.retention + '%'}</td>
      <td>${x.sister_growth}</td>
      <td>${x.joint_growth}%</td>
      <td>${cand(x.candidate)}</td>
      <td><button class="mini-btn" onclick="openTalentActionModal('${x.sister_uid || ''}')">记录</button></td>
    </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;color:#9CA3AF;padding:16px;">暂无数据</td></tr>'}`;
  const pg = document.getElementById('pool-pagination');
  if (pg) {
    let html = `<span style="font-size:12px;color:#666;margin-right:10px;">共 ${total} 位 · ${poolPage + 1}/${totalPages} 页</span>`;
    if (poolPage > 0) html += `<button onclick="poolPage--;renderTalentPool();">上一页</button>`;
    pagerRange(poolPage, totalPages).forEach(i => {
      html += i === '...'
        ? '<span class="pager-dots">…</span>'
        : `<button class="${i === poolPage ? 'active' : ''}" onclick="poolPage=${i};renderTalentPool();">${i + 1}</button>`;
    });
    if (poolPage < totalPages - 1) html += `<button onclick="poolPage++;renderTalentPool();">下一页</button>`;
    pg.innerHTML = html;
  }
}

/* 结果记录：回填「输送妹妹 / 提拔管理」动作 */
let taUid = '';
let taNickname = '';

function openTalentActionModal(uid) {
  taUid = uid || '';
  const item = poolList.find(x => x.sister_uid === taUid);
  taNickname = item ? item.sister_nickname : '';
  const modal = document.getElementById('talent-action-modal');
  if (!modal) return;
  modal.classList.add('active');
  document.getElementById('ta-info').textContent = `${taNickname || taUid}（UID ${taUid}）`;
  document.getElementById('ta-type').value = 'send_sister';
  document.getElementById('ta-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('ta-note').value = '';
}

function closeTalentActionModal() {
  const modal = document.getElementById('talent-action-modal');
  if (modal) modal.classList.remove('active');
}

async function saveTalentAction() {
  const type = document.getElementById('ta-type').value;
  const date = document.getElementById('ta-date').value;
  const note = document.getElementById('ta-note').value.trim();
  if (!taUid) return;
  if (!date) { alert('请选择动作日期'); return; }
  try {
    const res = await fetch(API_BASE + '/api/talent-actions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sister_uid: taUid,
        sister_nickname: taNickname,
        hall_name: currentHall === 'all' ? '' : currentHall,
        action_type: type,
        action_date: date,
        note: note
      })
    });
    const d = await res.json();
    if (d.success) { closeTalentActionModal(); loadTalentActions(); }
    else { alert(d.error || '保存失败'); }
  } catch (e) { console.error('保存记录失败:', e); alert('保存失败'); }
}

let talentActionsList = [];

async function loadTalentActions() {
  const tableEl = document.getElementById('talent-actions-table');
  if (!tableEl) return;
  try {
    const res = await fetch(API_BASE + '/api/talent-actions');
    const d = await res.json();
    talentActionsList = d.list || [];
    const typeName = t => t === 'send_sister' ? '<span class="chip up">输送妹妹</span>' : '<span class="chip warn">提拔管理</span>';
    const resultName = s => s === 'good' ? '<span class="chip up">效果佳</span>' : s === 'mixed' ? '<span class="chip warn">一般</span>' : s === 'bad' ? '<span class="chip down">效果差</span>' : '<span class="chip flat">待回填</span>';
    tableEl.innerHTML = `
      <tr><th>日期</th><th>姐姐</th><th>大厅</th><th>动作</th><th>结果</th><th>备注</th><th>记录时间</th><th>操作</th></tr>
      ${talentActionsList.map(r => `<tr>
        <td>${r.action_date}</td>
        <td>${r.sister_nickname || r.sister_uid}</td>
        <td>${r.hall_name || '—'}</td>
        <td>${typeName(r.action_type)}</td>
        <td>${resultName(r.result_status)}</td>
        <td>${r.result_note || r.note || '—'}</td>
        <td>${(r.created_at || '').slice(0, 16)}</td>
        <td><button class="mini-btn" onclick="openTalentResultModal(${r.id})">${r.result_status && r.result_status !== 'pending' ? '改结果' : '补填结果'}</button></td>
      </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:#9CA3AF;padding:16px;">暂无结果记录</td></tr>'}`;
  } catch (e) { console.error('结果记录加载失败:', e); }
}

/* 结果回填：补填某次倾斜动作的后续效果 */
let trId = null;

function openTalentResultModal(id) {
  const row = talentActionsList.find(r => r.id === id);
  if (!row) return;
  trId = id;
  const modal = document.getElementById('talent-result-modal');
  if (!modal) return;
  modal.classList.add('active');
  const typeName = row.action_type === 'send_sister' ? '输送妹妹' : '提拔管理';
  document.getElementById('tr-info').textContent = `${row.sister_nickname || row.sister_uid} · ${typeName}（${row.action_date}）`;
  document.getElementById('tr-sister-promoted').checked = !!row.result_sister_promoted;
  document.getElementById('tr-team-alive').checked = !!row.result_team_alive;
  document.getElementById('tr-revenue-up').checked = !!row.result_revenue_up;
  document.getElementById('tr-status').value = (row.result_status && row.result_status !== 'pending') ? row.result_status : 'good';
  document.getElementById('tr-note').value = row.result_note || '';
  document.getElementById('tr-date').value = row.result_date || new Date().toISOString().slice(0, 10);
}

function closeTalentResultModal() {
  const modal = document.getElementById('talent-result-modal');
  if (modal) modal.classList.remove('active');
}

async function saveTalentResult() {
  if (trId == null) return;
  const date = document.getElementById('tr-date').value;
  if (!date) { alert('请选择回填日期'); return; }
  const body = {
    result_sister_promoted: document.getElementById('tr-sister-promoted').checked ? 1 : 0,
    result_team_alive: document.getElementById('tr-team-alive').checked ? 1 : 0,
    result_revenue_up: document.getElementById('tr-revenue-up').checked ? 1 : 0,
    result_status: document.getElementById('tr-status').value,
    result_note: document.getElementById('tr-note').value.trim(),
    result_date: date
  };
  try {
    const res = await fetch(API_BASE + '/api/talent-actions/' + trId + '/result', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await res.json();
    if (d.success) { closeTalentResultModal(); loadTalentActions(); }
    else { alert(d.error || '保存失败'); }
  } catch (e) { console.error('保存结果失败:', e); alert('保存失败'); }
}
