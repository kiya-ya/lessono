// insight.js - 第三期：政策评估 / 姐姐分析 / 预警中心

/* ═══════════════ 政策评估 ═══════════════ */

async function loadPolicyImpact() {
  const cardsEl = document.getElementById('policy-cards');
  if (!cardsEl) return;
  try {
    const res = await fetch(API_BASE + '/api/policy-impact?' + getHallParam().substring(1));
    const d = await res.json();
    if (!d.overall) {
      cardsEl.innerHTML = '<div class="kpi-card"><span class="kpi-note">当前范围政策前或政策后数据不足，无法对比</span></div>';
      document.getElementById('policy-table').innerHTML = '';
      const pp = document.getElementById('policy-pagination');
      if (pp) pp.innerHTML = '';
      policyRanking = [];
      return;
    }
    const o = d.overall;
    const arrow = (v, reverse) => {
      const good = reverse ? v < 0 : v > 0;
      const cls = v === 0 ? 'flat' : good ? 'up' : 'down';
      const a = v > 0 ? '↑' : v < 0 ? '↓' : '→';
      return `<span class="chip ${cls}">${a} ${Math.abs(v)}${''}</span>`;
    };
    const cards = [
      { label: '💯 留存率（周均）', pre: o.ret_pre + '%', post: o.ret_post + '%', delta: o.ret_delta, suf: 'pp', reverse: false },
      { label: '🚫 解散率（周均）', pre: o.dis_pre + '%', post: o.dis_post + '%', delta: o.dis_delta, suf: 'pp', reverse: true },
      { label: '💰 礼物流水（周均）', pre: wbFmtMoney(o.rev_pre), post: wbFmtMoney(o.rev_post), delta: o.rev_delta_pct, suf: '%', reverse: false },
      { label: '📦 新成团（周均）', pre: o.nt_pre + ' 个', post: o.nt_post + ' 个', delta: o.nt_delta_pct, suf: '%', reverse: false },
    ];
    cardsEl.innerHTML = cards.map(c => `
      <div class="kpi-card">
        <div class="kpi-label">${c.label}</div>
        <div class="kpi-value">${c.pre} → ${c.post}</div>
        <div class="policy-delta">${arrow(c.delta, c.reverse)}<span>${c.delta > 0 ? '+' : ''}${c.delta}${c.suf}${c.reverse ? '（下降为好）' : ''}</span></div>
      </div>`).join('');

    // 分厅响应度：改善/恶化各 TOP10 的发散条形图
    const r = d.ranking || [];
    const best = r.slice(0, 10);
    const worst = r.slice(-10).reverse();
    const shown = [...best, ...worst];
    const el = document.getElementById('chart-policy-bars');
    if (shown.length && el) {
      if (charts['policyBars']) charts['policyBars'].dispose();
      charts['policyBars'] = echarts.init(el);
      charts['policyBars'].setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, textStyle: { fontSize: 12 },
          formatter: ps => { const p = ps[0]; const row = shown[p.dataIndex];
            return `${row.hall_name}<br/>留存率：${row.ret_pre}% → ${row.ret_post}%（${row.ret_delta > 0 ? '+' : ''}${row.ret_delta}pp）<br/>流水：${wbFmtMoney(row.rev_pre)} → ${wbFmtMoney(row.rev_post)}`; } },
        grid: { left: 10, right: 60, top: 10, bottom: 10, containLabel: true },
        xAxis: { type: 'value', name: 'pp', axisLabel: { fontSize: 10, color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
        yAxis: { type: 'category', inverse: true, data: shown.map(x => x.hall_name), axisLabel: { fontSize: 11, color: '#6B7280' } },
        series: [{
          type: 'bar', data: shown.map(x => x.ret_delta), barWidth: '55%',
          itemStyle: { color: p => p.value >= 0 ? '#3D9A6C' : '#D56060', borderRadius: [3, 3, 3, 3] },
          label: { show: true, position: 'right', fontSize: 10, color: '#6B7280', formatter: p => (p.value > 0 ? '+' : '') + p.value + 'pp' }
        }]
      });
    }

    // 明细表（分页）
    policyRanking = r;
    policyPage = 0;
    renderPolicyTable();
  } catch (e) { console.error('政策评估加载失败:', e); }
}

function setPolicyPerPage(v) {
  policyPerPage = parseInt(v) || 20;
  policyPage = 0;
  renderPolicyTable();
}

/* 政策归因：留存率变化按大厅存量规模加权，贡献(pp)加总=整体变化 */
async function loadPolicyAttribution() {
  const el = document.getElementById('chart-policy-attr');
  if (!el) return;
  try {
    const res = await fetch(API_BASE + '/api/policy-attribution');
    const d = await res.json();
    const rows = d.attribution || [];
    if (!rows.length) {
      el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--wb-text-3);font-size:12px;">政策前后数据不足</div>';
      return;
    }
    const best = rows.slice(0, 8);
    const worst = rows.slice(-8).reverse();
    const shown = [...best, ...worst];
    if (charts['policyAttr']) charts['policyAttr'].dispose();
    charts['policyAttr'] = echarts.init(el);
    charts['policyAttr'].setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, textStyle: { fontSize: 12 },
        formatter: ps => { const p = ps[0]; const r = shown[p.dataIndex];
          return `${r.hall_name}<br/>留存率：${r.ret_pre}% → ${r.ret_post}%（${r.ret_delta > 0 ? '+' : ''}${r.ret_delta}pp）<br/>存量规模：${r.scale} 团（占 ${r.share}%）<br/>贡献：${r.ret_contrib > 0 ? '+' : ''}${r.ret_contrib}pp`; } },
      grid: { left: 10, right: 56, top: 10, bottom: 10, containLabel: true },
      xAxis: { type: 'value', name: 'pp', axisLabel: { fontSize: 10, color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
      yAxis: { type: 'category', inverse: true, data: shown.map(x => x.hall_name), axisLabel: { fontSize: 11, color: '#6B7280' } },
      series: [{
        type: 'bar', data: shown.map(x => x.ret_contrib), barWidth: '55%',
        itemStyle: { color: p => p.value >= 0 ? '#3D9A6C' : '#D56060', borderRadius: [3, 3, 3, 3] },
        label: { show: true, position: 'right', fontSize: 10, color: '#6B7280', formatter: p => (p.value > 0 ? '+' : '') + p.value + 'pp' }
      }]
    });
  } catch (e) { console.error('政策归因加载失败:', e); }
}

function renderPolicyTable() {
  const total = policyRanking.length;
  const totalPages = Math.max(1, Math.ceil(total / policyPerPage));
  if (policyPage >= totalPages) policyPage = totalPages - 1;
  if (policyPage < 0) policyPage = 0;
  const start = policyPage * policyPerPage;
  const pageData = policyRanking.slice(start, start + policyPerPage);
  const arrow = (v, reverse) => {
    const good = reverse ? v < 0 : v > 0;
    const cls = v === 0 ? 'flat' : good ? 'up' : 'down';
    const a = v > 0 ? '↑' : v < 0 ? '↓' : '→';
    return `<span class="chip ${cls}">${a} ${Math.abs(v)}</span>`;
  };
  document.getElementById('policy-table').innerHTML = `
    <tr><th>#</th><th>大厅</th><th>留存率 前→后</th><th>变化</th><th>解散率 前→后</th><th>流水 前→后</th><th>流水变化</th></tr>
    ${pageData.map((x, i) => `<tr>
      <td class="rank-no ${(start + i) < 3 ? 'top' : ''}">${start + i + 1}</td>
      <td>${x.hall_name}</td>
      <td>${x.ret_pre}% → ${x.ret_post}%</td>
      <td>${arrow(x.ret_delta, false)}</td>
      <td>${x.dis_pre}% → ${x.dis_post}%</td>
      <td>${wbFmtMoney(x.rev_pre)} → ${wbFmtMoney(x.rev_post)}</td>
      <td>${x.rev_delta_pct === null ? '—' : arrow(x.rev_delta_pct, false)}</td>
    </tr>`).join('')}`;
  const el = document.getElementById('policy-pagination');
  if (el) {
    let html = `<span style="font-size:12px;color:#666;margin-right:10px;">共 ${total} 个厅 · ${policyPage + 1}/${totalPages} 页</span>`;
    if (policyPage > 0) html += `<button onclick="policyPage--;renderPolicyTable();">上一页</button>`;
    for (let i = 0; i < totalPages; i++) {
      html += `<button class="${i === policyPage ? 'active' : ''}" onclick="policyPage=${i};renderPolicyTable();">${i + 1}</button>`;
    }
    if (policyPage < totalPages - 1) html += `<button onclick="policyPage++;renderPolicyTable();">下一页</button>`;
    el.innerHTML = html;
  }
}

/* ═══════════════ 姐姐分析 ═══════════════ */

let captainPeriod = 'day';          // day / week / month
let captainSortField = 'total_reward';
let captainSortOrder = 'desc';
let captainData = [];
let captainPage = 0;
let captainPerPage = 20;
let policyRanking = [];
let policyPage = 0;
let policyPerPage = 20;

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
    <tr><th>#</th><th>姐姐</th><th>所在大厅</th>${th('team_count', '带团数')}${th('active_count', '进行中')}${th('survival_rate', '团存活率')}${th('total_reward', CAPTAIN_PERIOD_LABEL[captainPeriod] + '奖励')}</tr>
    ${pageData.map((c, i) => `<tr>
      <td class="rank-no ${(start + i) < 3 ? 'top' : ''}">${start + i + 1}</td>
      <td>${c.nickname} <span style="color:var(--wb-text-3);font-size:11px">(${c.uid})</span></td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis">${c.halls}</td>
      <td>${c.team_count}</td>
      <td>${c.active_count}</td>
      <td>${c.survival_rate}%</td>
      <td>${wbFmtMoney(c.total_reward)}</td>
    </tr>`).join('')}`;
  const el = document.getElementById('captain-pagination');
  if (el) {
    let html = `<span style="font-size:12px;color:#666;margin-right:10px;">共 ${total} 位 · ${captainPage + 1}/${totalPages} 页</span>`;
    if (captainPage > 0) html += `<button onclick="captainPage--;renderCaptainTable();">上一页</button>`;
    for (let i = 0; i < totalPages; i++) {
      html += `<button class="${i === captainPage ? 'active' : ''}" onclick="captainPage=${i};renderCaptainTable();">${i + 1}</button>`;
    }
    if (captainPage < totalPages - 1) html += `<button onclick="captainPage++;renderCaptainTable();">下一页</button>`;
    el.innerHTML = html;
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

    // 头牌依赖度（选中具体厅时只显示该厅；全厅当日奖励 <500 元的小厅不纳入，避免单人厅必然100%的噪音）
    const dep = (d.dependency || []).filter(x => (currentHall === 'all' || x.hall_name === currentHall) && x.hall_rev >= 500);
    const flagged = dep.filter(x => x.share >= 30).slice(0, 12);
    const depEl = document.getElementById('dep-list');
    depEl.innerHTML = flagged.length
      ? flagged.map(x => `<div class="dep-item ${x.share >= 40 ? 'red' : 'amber'}">
          <span class="share">${x.share}%</span>
          <span><strong>${x.hall_name}</strong></span>
          <span class="meta">头牌：${x.top_captain}（${wbFmtMoney(x.captain_rev)} / 全厅 ${wbFmtMoney(x.hall_rev)}）</span>
        </div>`).join('')
      : '<div class="dep-empty">✅ 当前范围内没有头牌依赖度超过 30% 的厅</div>';

    captainData = d.data || [];
    captainPage = 0;
    renderCaptainTable();
  } catch (e) { console.error('姐姐分析加载失败:', e); }
}

/* 姐姐画像（周口径）：产出/留存/稳定性 + 头部/风险打标 */
let sisterProfileList = [];
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
    const s = d.summary || {};
    sumEl.innerHTML = `
      <span class="survival-chip">👤 姐姐 ${d.total} 位（周 ${d.cur_week || ''}）</span>
      <span class="survival-chip">🏆 头部 <strong>${s.head_count}</strong> 位</span>
      <span class="survival-chip">⚠️ 风险 <strong>${s.risk_count}</strong> 位</span>
      <span class="survival-chip">💰 本周流水 TOP：${s.top_sister || '—'} <strong>${wbFmtMoney(s.top_rev || 0)}</strong></span>`;
    renderSisterProfile();
  } catch (e) { console.error('姐姐画像加载失败:', e); }
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
    for (let i = 0; i < totalPages; i++) html += `<button class="${i === sisterProfilePage ? 'active' : ''}" onclick="sisterProfilePage=${i};renderSisterProfile();">${i + 1}</button>`;
    if (sisterProfilePage < totalPages - 1) html += `<button onclick="sisterProfilePage++;renderSisterProfile();">下一页</button>`;
    pg.innerHTML = html;
  }
}

/* 妹妹→姐姐晋升追踪 */
let sister2List = [];
let sister2Page = 0;
let sister2PerPage = 20;
let sister2Sort = 'default';

async function loadSister2Profile() {
  const sumEl = document.getElementById('sister2-sum');
  const tableEl = document.getElementById('sister2-table');
  if (!tableEl) return;
  try {
    const res = await fetch(API_BASE + '/api/sister2-profile?' + getHallParam().substring(1));
    const d = await res.json();
    if (d.error) return;
    sister2List = d.list || [];
    const s = d.summary || {};
    sumEl.innerHTML = `
      <span class="survival-chip">🌱 妹妹 ${d.total} 位</span>
      <span class="survival-chip">🎓 已晋升 <strong>${s.promoted}</strong> 位</span>
      <span class="survival-chip">⭐ 可晋升（王牌/大神）<strong>${s.promotable}</strong> 位</span>`;
    renderSister2Table();
  } catch (e) { console.error('妹妹晋升追踪加载失败:', e); }
}

function setSister2Sort(v) { sister2Sort = v; sister2Page = 0; renderSister2Table(); }
function setSister2PerPage(v) { sister2PerPage = parseInt(v) || 20; sister2Page = 0; renderSister2Table(); }

function renderSister2Table() {
  const list = [...sister2List];
  if (sister2Sort === 'week_rev') list.sort((a, b) => (b.week_rev || 0) - (a.week_rev || 0));
  else if (sister2Sort === 'presence_days') list.sort((a, b) => (b.presence_days || 0) - (a.presence_days || 0));
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / sister2PerPage));
  if (sister2Page >= totalPages) sister2Page = totalPages - 1;
  if (sister2Page < 0) sister2Page = 0;
  const start = sister2Page * sister2PerPage;
  const page = list.slice(start, start + sister2PerPage);
  const tag = x => x === 'promoted' ? '<span class="chip up">已晋升</span>' : x === 'promotable' ? '<span class="chip warn">可晋升</span>' : '<span class="chip flat">普通</span>';
  document.getElementById('sister2-table').innerHTML = `
    <tr><th>#</th><th>妹妹</th><th>等级</th><th>本周流水</th><th>在榜天</th><th>带团</th><th>晋升状态</th></tr>
    ${page.map((x, i) => `<tr>
      <td class="rank-no ${(start + i) < 3 ? 'top' : ''}">${start + i + 1}</td>
      <td><a href="javascript:void(0)" onclick="openSister2Detail('${x.sister_uid || ''}')">${x.sister_nickname || '-'}</a></td>
      <td>${x.level ?? '-'}</td>
      <td>${wbFmtMoney(x.week_rev)}</td>
      <td>${x.presence_days}</td>
      <td>${x.team_count}</td>
      <td>${tag(x.tag)}</td>
    </tr>`).join('')}`;
  const pg = document.getElementById('sister2-pagination');
  if (pg) {
    let html = `<span style="font-size:12px;color:#666;margin-right:10px;">共 ${total} 位 · ${sister2Page + 1}/${totalPages} 页</span>`;
    if (sister2Page > 0) html += `<button onclick="sister2Page--;renderSister2Table();">上一页</button>`;
    for (let i = 0; i < totalPages; i++) html += `<button class="${i === sister2Page ? 'active' : ''}" onclick="sister2Page=${i};renderSister2Table();">${i + 1}</button>`;
    if (sister2Page < totalPages - 1) html += `<button onclick="sister2Page++;renderSister2Table();">下一页</button>`;
    pg.innerHTML = html;
  }
}

/* 妹妹活动追踪下钻：等级成长轨迹 + 产出 + 参与团 */
let s2Uid = '';

async function openSister2Detail(uid) {
  s2Uid = uid || '';
  const modal = document.getElementById('sister2-detail-modal');
  if (!modal) return;
  modal.classList.add('active');
  document.getElementById('s2-name').textContent = '加载中...';
  document.getElementById('s2-chips').innerHTML = '';
  document.getElementById('s2-table').innerHTML = '';
  const lvEl = document.getElementById('s2-level-chart');
  const revEl = document.getElementById('s2-rev-chart');
  if (charts['s2LevelChart']) { charts['s2LevelChart'].dispose(); charts['s2LevelChart'] = null; }
  if (charts['s2RevChart']) { charts['s2RevChart'].dispose(); charts['s2RevChart'] = null; }
  try {
    const res = await fetch(API_BASE + '/api/sister2-detail?uid=' + encodeURIComponent(uid));
    const d = await res.json();
    if (d.error) { document.getElementById('s2-name').textContent = '未找到该妹妹'; return; }
    const ptag = d.promoted ? '<span class="chip up">已晋升姐姐</span>' : '<span class="chip flat">仍是妹妹</span>';
    document.getElementById('s2-name').textContent = `${d.nickname || uid}`;
    document.getElementById('s2-chips').innerHTML = `
      <span class="survival-chip">等级 <strong>${d.level}</strong></span>
      <span class="survival-chip">最高 <strong>${d.max_level}</strong></span>
      <span class="survival-chip">带团 <strong>${d.team_count}</strong></span>
      <span class="survival-chip">在榜 <strong>${d.presence_days}</strong>天</span>
      <span class="survival-chip">${ptag}</span>`;
    // 等级成长阶梯图（历史最高等级随快照日）
    const track = d.level_track || [];
    const lvNames = ['无', '初级铜牌', '铜牌', '初级银牌', '银牌', '金牌', '王牌', '大神'];
    if (track.length >= 2) {
      charts['s2LevelChart'] = echarts.init(lvEl);
      charts['s2LevelChart'].setOption({
        tooltip: { trigger: 'axis', textStyle: { fontSize: 12 }, formatter: ps => { const p = ps[0]; return `${p.name}<br/>最高等级 ${lvNames[p.value] || '无'}`; } },
        grid: { left: 60, right: 16, top: 16, bottom: 28 },
        xAxis: { type: 'category', data: track.map(x => x.date), axisLabel: { fontSize: 10, color: '#6B7280' } },
        yAxis: { type: 'category', data: lvNames, axisLabel: { fontSize: 11, color: '#374151' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
        series: [{ name: '最高等级', type: 'line', step: 'end', data: track.map(x => x.rank), itemStyle: { color: '#C98A2D' }, lineStyle: { color: '#C98A2D', width: 2 }, symbolSize: 6 }]
      });
    } else {
      lvEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9CA3AF;font-size:12px;">等级轨迹数据不足</div>';
    }
    // 周产出柱状图
    if (d.weekly && d.weekly.length) {
      charts['s2RevChart'] = echarts.init(revEl);
      charts['s2RevChart'].setOption({
        tooltip: { trigger: 'axis', textStyle: { fontSize: 12 }, formatter: ps => { const p = ps[0]; return `${p.name}<br/>产出 ${wbFmtMoney(p.value)}`; } },
        grid: { left: 70, right: 20, top: 16, bottom:28 },
        xAxis: { type: 'category', data: d.weekly.map(x => x.week), axisLabel: { fontSize: 10, color: '#6B7280' } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#9CA3AF', formatter: v => wbFmtMoney(v) }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
        series: [{ name: '妹妹产出', type: 'bar', data: d.weekly.map(x => x.rev), barWidth: '45%', itemStyle: { color: '#4F5BD5', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', fontSize: 10, color: '#6B7280', formatter: p => wbFmtMoney(p.value) } }]
      });
    } else {
      revEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9CA3AF;font-size:12px;">暂无周产出数据</div>';
    }
    // 参与团列表
    document.getElementById('s2-table').innerHTML = `
      <tr><th>团ID</th><th>大厅</th><th>姐姐</th><th>妹妹等级</th><th>状态</th></tr>
      ${(d.teams || []).map(t => `<tr>
        <td>${t.team_id}</td>
        <td>${t.hall_name || '-'}</td>
        <td>${t.captain || '-'}</td>
        <td>${t.level || '-'}</td>
        <td>${t.status === 'active' ? '<span class="chip up">进行中</span>' : '<span class="chip flat">已解散</span>'}</td>
      </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#9CA3AF;padding:16px;">暂无参与团记录</td></tr>'}`;
  } catch (e) { console.error('妹妹活动下钻失败:', e); document.getElementById('s2-name').textContent = '加载失败'; }
}

function closeSister2Detail() {
  const modal = document.getElementById('sister2-detail-modal');
  if (modal) modal.classList.remove('active');
}

function s2GoUID() {
  if (s2Uid) { closeSister2Detail(); jumpToUID(s2Uid); }
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
        series: [{ name: '流水', type: 'bar', data: seriesData.map(x => x.value), barWidth: '50%', itemStyle: { color: '#4F5BD5', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', fontSize: 10, color: '#6B7280', formatter: p => wbFmtMoney(p.value) } }]
      });
    } else if (d.weekly && d.weekly.length) {
      document.getElementById('sd-chart-src').textContent = '周礼物流水';
      charts['sdChart'] = echarts.init(el);
      charts['sdChart'].setOption({
        tooltip: { trigger: 'axis', textStyle: { fontSize: 12 }, formatter: ps => { const p = ps[0]; return `${p.name}<br/>流水 ${wbFmtMoney(p.value)}`; } },
        grid: { left: 70, right: 20, top: 16, bottom: 28 },
        xAxis: { type: 'category', data: d.weekly.map(x => x.week), axisLabel: { fontSize: 11, color: '#6B7280' } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#9CA3AF', formatter: v => wbFmtMoney(v) }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
        series: [{ name: '周流水', type: 'bar', data: d.weekly.map(x => x.rev), barWidth: '45%', itemStyle: { color: '#4F5BD5', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', fontSize: 10, color: '#6B7280', formatter: p => wbFmtMoney(p.value) } }]
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

/* ═══════════════ 预警中心 ═══════════════ */

let alertsResolvedFilter = '0';

// 预警规则中文说明（与 crawler/alerts_engine.py 的 RULES 配置对应）
const ALERT_RULE_DESC = {
  dissolution_spike: '全平台解散率环比上升 ≥20%',
  revenue_decline: '全平台流水连续下降 ≥2 周',
  new_team_drop: '全平台新成团数环比下降 ≥30%',
  retention_drop: '全平台留存率环比下降 ≥10 个百分点',
  hall_dissolution_high: '单厅解散率 ≥ 全平台平均的 1.5 倍，且解散率 ≥20%（团数 ≥5，取前 5 名）',
};

function alertsFilter(btn, status) {
  document.querySelectorAll('#tab-alerts .mini-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  alertsResolvedFilter = status;
  loadAlertsCenter();
}

async function loadAlertsCenter() {
  const listEl = document.getElementById('alerts-center-list');
  if (!listEl) return;
  try {
    const res = await fetch(API_BASE + '/api/alerts-center?limit=100&resolved=' + alertsResolvedFilter);
    const d = await res.json();
    const sevName = { high: '高', medium: '中', low: '低' };
    document.getElementById('alerts-summary').innerHTML =
      `<span class="survival-chip">未处理 <strong>${d.unresolved}</strong> 条</span>`;
    const rows = d.data || [];
    listEl.innerHTML = rows.length ? rows.map(a => `
      <div class="alert-row ${a.is_resolved ? 'resolved' : ''}">
        <span class="alert-sev ${a.severity}">${sevName[a.severity] || a.severity}</span>
        <div class="alert-body">
          <div class="t">${a.title}</div>
          <div class="d">${a.description || ''}</div>
          <div class="time">${a.week_label || ''} · ${(a.created_at || '').slice(0, 16)} · 规则：${ALERT_RULE_DESC[a.alert_type] || a.alert_type}</div>
        </div>
        <button class="mini-btn alert-act" onclick="toggleAlert(${a.id}, ${a.is_resolved ? 0 : 1})">${a.is_resolved ? '恢复' : '标记已处理'}</button>
      </div>`).join('')
      : `<div class="alert-empty">${alertsResolvedFilter === '0' ? '✅ 没有未处理的预警' : '暂无预警记录'}</div>`;
  } catch (e) { console.error('预警中心加载失败:', e); }
}

async function toggleAlert(id, resolved) {
  try {
    await fetch(API_BASE + `/api/alerts/${id}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved: !!resolved })
    });
    loadAlertsCenter();
  } catch (e) { console.error('预警状态更新失败:', e); }
}
