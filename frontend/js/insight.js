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

    // 明细表
    document.getElementById('policy-table').innerHTML = `
      <tr><th>#</th><th>大厅</th><th>留存率 前→后</th><th>变化</th><th>解散率 前→后</th><th>流水 前→后</th><th>流水变化</th></tr>
      ${r.map((x, i) => `<tr>
        <td class="rank-no ${i < 3 ? 'top' : ''}">${i + 1}</td>
        <td>${x.hall_name}</td>
        <td>${x.ret_pre}% → ${x.ret_post}%</td>
        <td>${arrow(x.ret_delta, false)}</td>
        <td>${x.dis_pre}% → ${x.dis_post}%</td>
        <td>${wbFmtMoney(x.rev_pre)} → ${wbFmtMoney(x.rev_post)}</td>
        <td>${x.rev_delta_pct === null ? '—' : arrow(x.rev_delta_pct, false)}</td>
      </tr>`).join('')}`;
  } catch (e) { console.error('政策评估加载失败:', e); }
}

/* ═══════════════ 姐姐分析 ═══════════════ */

let captainPeriod = 'day';          // day / week / month
let captainSortField = 'total_reward';
let captainSortOrder = 'desc';
let captainData = [];

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
  const th = (field, label) =>
    `<th style="cursor:pointer;user-select:none" onclick="sortCaptains('${field}')">${label} <span style="font-size:10px;color:var(--wb-text-3)">${sortArrow(field)}</span></th>`;
  tableEl.innerHTML = `
    <tr><th>#</th><th>姐姐</th><th>所在大厅</th>${th('team_count', '带团数')}${th('active_count', '进行中')}${th('survival_rate', '团存活率')}${th('total_reward', CAPTAIN_PERIOD_LABEL[captainPeriod] + '奖励')}</tr>
    ${sorted.map((c, i) => `<tr>
      <td class="rank-no ${i < 3 ? 'top' : ''}">${i + 1}</td>
      <td>${c.nickname} <span style="color:var(--wb-text-3);font-size:11px">(${c.uid})</span></td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis">${c.halls}</td>
      <td>${c.team_count}</td>
      <td>${c.active_count}</td>
      <td>${c.survival_rate}%</td>
      <td>${wbFmtMoney(c.total_reward)}</td>
    </tr>`).join('')}`;
}

async function loadCaptains() {
  const tableEl = document.getElementById('captain-table');
  if (!tableEl) return;
  try {
    const res = await fetch(API_BASE + `/api/captains?limit=100&period=${captainPeriod}&` + getHallParam().substring(1));
    const d = await res.json();
    if (d.ref_date) {
      document.getElementById('captains-hint').textContent = `快照日期 ${d.ref_date} · 随大厅筛选联动`;
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
    renderCaptainTable();
  } catch (e) { console.error('姐姐分析加载失败:', e); }
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
