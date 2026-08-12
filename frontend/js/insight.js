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
          itemStyle: { color: p => p.value >= 0 ? '#16A34A' : '#DC2626', borderRadius: [3, 3, 3, 3] },
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

async function loadCaptains() {
  const tableEl = document.getElementById('captain-table');
  if (!tableEl) return;
  try {
    const res = await fetch(API_BASE + '/api/captains?limit=50&' + getHallParam().substring(1));
    const d = await res.json();

    // 头牌依赖度（选中具体厅时只显示该厅）
    const dep = (d.dependency || []).filter(x => currentHall === 'all' || x.hall_name === currentHall);
    const flagged = dep.filter(x => x.share >= 30).slice(0, 12);
    const depEl = document.getElementById('dep-list');
    depEl.innerHTML = flagged.length
      ? flagged.map(x => `<div class="dep-item ${x.share >= 40 ? 'red' : 'amber'}">
          <span class="share">${x.share}%</span>
          <span><strong>${x.hall_name}</strong></span>
          <span class="meta">头牌：${x.top_captain}（${wbFmtMoney(x.captain_rev)} / 全厅 ${wbFmtMoney(x.hall_rev)}）</span>
        </div>`).join('')
      : '<div class="dep-empty">✅ 当前范围内没有头牌依赖度超过 30% 的厅</div>';

    tableEl.innerHTML = `
      <tr><th>#</th><th>姐姐</th><th>所在大厅</th><th>带团数</th><th>进行中</th><th>团存活率</th><th>累计流水</th></tr>
      ${(d.data || []).map((c, i) => `<tr>
        <td class="rank-no ${i < 3 ? 'top' : ''}">${i + 1}</td>
        <td>${c.nickname} <span style="color:var(--wb-text-3);font-size:11px">(${c.uid})</span></td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis">${c.halls}</td>
        <td>${c.team_count}</td>
        <td>${c.active_count}</td>
        <td>${c.survival_rate}%</td>
        <td>${wbFmtMoney(c.total_reward)}</td>
      </tr>`).join('')}`;
  } catch (e) { console.error('团长分析加载失败:', e); }
}

/* ═══════════════ 预警中心 ═══════════════ */

let alertsResolvedFilter = '0';

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
          <div class="time">${a.week_label || ''} · ${(a.created_at || '').slice(0, 16)} · 规则：${a.alert_type}</div>
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
