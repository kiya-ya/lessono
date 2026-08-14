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
      <td><a href="javascript:void(0)" onclick="jumpToUID('${x.sister_uid || ''}')">${x.sister_nickname || '-'}</a></td>
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
