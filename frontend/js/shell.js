// shell.js - 三栏壳：概览驾驶舱（E 版）+ 左右栏模块加载器（2026-09-20 落正式版）
// 依赖正式版全局：API_BASE / getHallParam() / getWeekParam() / echarts / charts / currentHall

function shMk(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (charts[id]) { try { charts[id].dispose(); } catch (e) {} }
  const c = echarts.init(el);
  charts[id] = c;
  return c;
}

/* ═══════ 概览驾驶舱（中列） ═══════ */
async function loadShellOverview() {
  const heroNum = document.getElementById('sh-hero-num');
  if (!heroNum) return;
  try {
    const k = await (await fetch(API_BASE + '/api/kpi?' + getHallParam() + getWeekParam())).json();
    const kd = k.data || {};
    const sub = `数据周期 ${k.week || ''} · 对比上一${k.period_type === 'month' ? '月' : '周'}`;
    const refEl = document.getElementById('sh-ref-date');
    if (refEl) refEl.textContent = sub;
    const subEl = document.getElementById('sh-kpi-sub');
    if (subEl) subEl.textContent = sub;

    const items = [
      { l: '进行中姐妹团', v: kd.active_team.value, d: kd.active_team.change },
      { l: '新成团数', v: kd.new_team.value, d: kd.new_team.change },
      { l: '姐妹团留存率', v: Math.round(kd.retention.value) + '%', d: kd.retention.change, suf: 'pp' },
      { l: '解散率', v: kd.dissolution.value.toFixed(1) + '%', d: -kd.dissolution.change, suf: 'pp' },
      { l: '妹妹留存率', v: Math.round(kd.sister_retention.value) + '%', d: null },
      { l: '礼物奖励', v: kd.revenue.value >= 10000 ? (kd.revenue.value / 10000).toFixed(1) + 'w' : Math.round(kd.revenue.value), d: kd.revenue.change },
    ];
    const slim = document.getElementById('sh-slim');
    if (slim) slim.innerHTML = items.map(x => `<div class="it"><div class="l">${x.l}</div><div class="v">${x.v}${x.d != null ? `<small class="${x.d >= 0 ? 'up' : 'down'}">${x.d >= 0 ? '↑' : '↓'}${Math.abs(x.d)}${x.suf || '%'}</small>` : ''}</div></div>`).join('');

    heroNum.textContent = kd.active_team.value;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('sh-hero-new', kd.new_team.value);
    set('sh-hero-grad', kd.graduated_sisters.value);
    set('sh-hero-ret', Math.round(kd.retention.value) + '%');
    set('sh-hero-diss', kd.dissolution.value.toFixed(1) + '%');
    set('sh-hero-sis', Math.round(kd.sister_retention.value) + '%');
    set('sh-hero-rev', kd.revenue.value >= 10000 ? (kd.revenue.value / 10000).toFixed(1) + 'w' : Math.round(kd.revenue.value));

    // 核心指标明细表
    const tbl = document.getElementById('sh-kpi-tbl');
    if (tbl) {
      const krows = [
        ['进行中姐妹团', kd.active_team.value + ' 个', kd.active_team.change, '%', false],
        ['新成团数', kd.new_team.value + ' 个', kd.new_team.change, '%', false],
        ['姐妹团留存率', kd.retention.value.toFixed(1) + '%', kd.retention.change, 'pp', false],
        ['解散率', kd.dissolution.value.toFixed(1) + '%', kd.dissolution.change, 'pp', true],
        ['妹妹留存率（第1周仍在排档）', Math.round(kd.sister_retention.value) + '%', null, '', false],
        ['毕业妹妹数', kd.graduated_sisters.value + ' 人', kd.graduated_sisters.change, '%', false],
        ['礼物奖励金额', '¥' + Number(kd.revenue.value).toLocaleString(), kd.revenue.change, '%', false],
        ['主动解散占比', kd.active_dissolved_pct.value.toFixed(1) + '%', kd.active_dissolved_pct.change, 'pp', true],
      ];
      tbl.innerHTML = '<thead><tr><th>指标</th><th style="text-align:right;">本期</th><th style="text-align:right;">环比</th></tr></thead><tbody>' +
        krows.map(r => {
          const txt = r[2] == null ? '<span style="color:var(--wb-text-3);">—</span>'
            : `<span style="color:${(r[4] ? r[2] < 0 : r[2] >= 0) ? 'var(--wb-up)' : 'var(--wb-down)'};">${r[2] > 0 ? '↑' : r[2] < 0 ? '↓' : '—'} ${Math.abs(r[2])}${r[3]}</span>`;
          return `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td class="num">${txt}</td></tr>`;
        }).join('') + '</tbody>';
    }
  } catch (e) { console.error('驾驶舱 KPI 加载失败:', e); }

  try {
    // 本周节奏图
    const d = await (await fetch(API_BASE + '/api/daily-events?days=14' + getHallParam())).json();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('sh-hero-tnew', d.new_teams[d.new_teams.length - 1] ?? '—');
    set('sh-hero-tdiss', d.dissolved[d.dissolved.length - 1] ?? '—');
    const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const dayName = s => labels[new Date(s + 'T00:00:00').getDay()];
    const x = d.dates.slice(7).map(dayName);
    const wc = shMk('sh-week-chart');
    if (wc) wc.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['本周新成团', '上周新成团', '本周解散', '上周解散'], top: 0, right: 8, textStyle: { fontSize: 11 } },
      grid: { left: 8, right: 12, top: 34, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: x, axisLabel: { fontSize: 11, color: '#6B7280' } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 10, color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
      series: [
        { name: '本周新成团', type: 'line', data: d.new_teams.slice(7), smooth: true, symbolSize: 6, lineStyle: { width: 3, color: '#7C5CFF' }, itemStyle: { color: '#7C5CFF' }, areaStyle: { color: 'rgba(124,92,255,.10)' } },
        { name: '上周新成团', type: 'line', data: d.new_teams.slice(0, 7), smooth: true, symbol: 'none', lineStyle: { width: 1.5, type: 'dashed', color: '#B7A8FF' }, itemStyle: { color: '#B7A8FF' } },
        { name: '本周解散', type: 'line', data: d.dissolved.slice(7), smooth: true, symbolSize: 6, lineStyle: { width: 3, color: '#D56060' }, itemStyle: { color: '#D56060' }, areaStyle: { color: 'rgba(213,96,96,.08)' } },
        { name: '上周解散', type: 'line', data: d.dissolved.slice(0, 7), smooth: true, symbol: 'none', lineStyle: { width: 1.5, type: 'dashed', color: '#F0A3A3' }, itemStyle: { color: '#F0A3A3' } },
      ],
    });
  } catch (e) { console.error('本周节奏图加载失败:', e); }

  try {
    // 近 8 周双趋势
    const wr = await (await fetch(API_BASE + '/api/weekly-report?limit=all' + getHallParam())).json();
    const weeks = (wr.data || []).slice(-8);
    const c1 = shMk('sh-wk8-chart');
    if (c1) c1.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['姐妹团留存率', '解散率'], top: 0, right: 8, textStyle: { fontSize: 11 } },
      grid: { left: 8, right: 12, top: 30, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: weeks.map(w => w.week_label), axisLabel: { fontSize: 10, color: '#6B7280', interval: 0 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, color: '#9CA3AF', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
      series: [
        { name: '姐妹团留存率', type: 'line', data: weeks.map(w => Math.round(w.retention_rate)), smooth: true, symbolSize: 5, lineStyle: { width: 2.5, color: '#16A34A' }, itemStyle: { color: '#16A34A' } },
        { name: '解散率', type: 'line', data: weeks.map(w => Math.round(w.dissolution_rate)), smooth: true, symbolSize: 5, lineStyle: { width: 2.5, color: '#D56060' }, itemStyle: { color: '#D56060' } },
      ],
    });
    const c2 = shMk('sh-wk8n-chart');
    if (c2) c2.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['新成团', '毕业'], top: 0, right: 8, textStyle: { fontSize: 11 } },
      grid: { left: 8, right: 12, top: 30, bottom: 8, containLabel: true },
      xAxis: { type: 'category', data: weeks.map(w => w.week_label), axisLabel: { fontSize: 10, color: '#6B7280', interval: 0 } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 10, color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
      series: [
        { name: '新成团', type: 'bar', data: weeks.map(w => w.new_team_count), barMaxWidth: 22, itemStyle: { color: '#7C5CFF', borderRadius: [4, 4, 0, 0] } },
        { name: '毕业', type: 'bar', data: weeks.map(w => w.graduation_count || 0), barMaxWidth: 22, itemStyle: { color: '#C9A0DC', borderRadius: [4, 4, 0, 0] } },
      ],
    });
  } catch (e) { console.error('8周趋势加载失败:', e); }

  loadMiniDetail();
}

/* 明细紧凑表（概览中列底部） */
let miniDtPage = 1;
async function loadMiniDetail() {
  const tbl = document.getElementById('sh-mini-dt-tbl');
  if (!tbl) return;
  try {
    const q = encodeURIComponent((document.getElementById('sh-mini-dt-search') || {}).value || '');
    const st = (document.getElementById('sh-mini-dt-status') || {}).value || 'all';
    const d = await (await fetch(API_BASE + `/api/detail-table?page=${miniDtPage}&per_page=8&search=${q}&status=${st}` + getHallParam())).json();
    const rows = d.data || [];
    tbl.innerHTML = '<thead><tr><th>团ID</th><th>大厅</th><th>姐姐</th><th>妹妹</th><th>保护期结束</th><th style="text-align:right;">状态</th></tr></thead><tbody>' +
      (rows.map(r => `<tr><td>#${r.team_id}</td><td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.hall_name || '—'}</td><td>${r.sister_nickname || '—'}</td><td>${r.sister_nickname2 || '—'}</td><td>${r.protection_end || '—'}</td><td class="num" style="color:${r.dissolve_date ? 'var(--wb-down)' : 'var(--wb-up)'};">${r.dissolve_date ? '已结束' : '进行中'}</td></tr>`).join('') || '<tr><td colspan="6" style="color:var(--wb-text-3);">无匹配记录</td></tr>') + '</tbody>';
    const totalPages = Math.max(1, Math.ceil((d.total || 0) / 8));
    if (miniDtPage > totalPages) { miniDtPage = totalPages; return loadMiniDetail(); }
    const pg = document.getElementById('sh-mini-dt-page');
    if (pg) pg.textContent = `第 ${miniDtPage}/${totalPages} 页`;
    const tt = document.getElementById('sh-mini-dt-total');
    if (tt) tt.textContent = `共 ${d.total} 条`;
  } catch (e) { console.error('明细紧凑表加载失败:', e); }
}

/* ═══════ 左右栏模块 ═══════ */
async function loadShellRails() {
  const hp = getHallParam();
  // 厅排行 TOP5
  try {
    const ho = await (await fetch(API_BASE + '/api/hall-overview?weeks=2')).json();
    const halls = (ho.data || []).filter(h => h.sister_weekly_revenue != null).sort((a, b) => b.sister_weekly_revenue - a.sister_weekly_revenue);
    const el = document.getElementById('sh-hall-top5');
    if (el) el.innerHTML = '<tbody>' + (halls.length ? halls.slice(0, 5).map((h, i) => `<tr onclick="switchTab('compare')" style="cursor:pointer;" title="进入厅分析"><td>${i + 1}</td><td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px;">${h.hall_name}</td><td class="num">${h.sister_weekly_revenue >= 10000 ? (h.sister_weekly_revenue / 10000).toFixed(1) + 'w' : Math.round(h.sister_weekly_revenue)}</td></tr>`).join('') : '<tr><td style="color:var(--wb-text-3);">本周暂无流水数据</td></tr>') + '</tbody>';
  } catch (e) { console.warn('厅TOP5 加载失败:', e); }
  // 师门榜 TOP5
  try {
    const lr = await (await fetch(API_BASE + '/api/lineage-rank?limit=5' + (hp ? '?' + hp.slice(1) : ''))).json();
    const el = document.getElementById('sh-lin-top5');
    if (el) el.innerHTML = '<tbody>' + ((lr.data || []).map((c, i) => `<tr onclick="switchTab('captains')" style="cursor:pointer;" title="进入姐姐分析"><td>${i + 1}</td><td style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;">${c.nickname}</td><td class="num">毕业${c.grad_count} · 晋升${c.promoted_count}</td></tr>`).join('') || '<tr><td style="color:var(--wb-text-3);">暂无数据</td></tr>') + '</tbody>';
  } catch (e) { console.warn('师门榜 加载失败:', e); }
  // 解散原因饼图（左栏，点击进预警中心）
  try {
    const dr = await (await fetch(API_BASE + '/api/dissolve-reasons?x=1' + hp)).json();
    const c = shMk('sh-dr-chart');
    if (c) {
      c.setOption({
        tooltip: { trigger: 'item', formatter: p => `${p.name}<br/>${p.value} 个（${p.percent}%）<br/><span style="color:#9CA3AF;font-size:10px;">点击进预警中心</span>` },
        series: [{ type: 'pie', radius: ['38%', '68%'], center: ['50%', '50%'], label: { show: true, position: 'outside', formatter: '{c}', fontSize: 9, color: '#6B7280' }, labelLine: { length: 6, length2: 4 }, itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 }, data: (dr.buckets || []).map((b, i) => ({ name: b.name, value: b.count, itemStyle: { color: ['#D56060', '#C98A2D', '#16A34A', '#C0C4CC'][i % 4] } })) }],
      });
      c.off('click'); c.on('click', () => switchTab('alerts'));
      document.getElementById('sh-dr-chart').style.cursor = 'pointer';
    }
  } catch (e) { console.warn('解散饼图 加载失败:', e); }
  // 预警速览 + 摘要 + 解散时间分布
  try {
    const w = await (await fetch(API_BASE + '/api/warncenter')).json();
    const trig = (w.cards || []).filter(c => c.triggered).length;
    const nEl = document.getElementById('sh-warn-n');
    if (nEl) nEl.textContent = trig + ' 项';
    const wl = document.getElementById('sh-warn-list');
    if (wl) wl.innerHTML = (w.cards || []).filter(c => c.key !== 'active_diss').map(c => {
      const color = c.triggered ? '#DC2626' : c.level === 'severe' ? '#D56060' : c.level === 'warning' ? '#D97706' : '#7C5CFF';
      const cur = c.current == null ? (c.total != null ? c.total + ' 个' : '—') : c.current + (c.key === 'new_team' ? ' 个' : '%');
      return `<div class="sh-warn-line" onclick="switchTab('alerts')" style="cursor:pointer;" title="进入预警中心"><span class="dot" style="background:${color};"></span><span style="flex:1;">${c.title}</span><b>${cur}</b><span style="font-size:10.5px;color:${c.triggered ? '#DC2626' : 'var(--wb-text-3)'};">${c.triggered ? '触发' : '正常'}</span></div>`;
    }).join('');
    const sw = document.getElementById('sh-sum-warn');
    if (sw) { sw.textContent = trig + ' 项'; sw.style.color = trig ? 'var(--wb-down)' : 'var(--wb-up)'; }
    const sws = document.getElementById('sh-sum-warn-s');
    if (sws) sws.textContent = trig ? (w.cards || []).filter(c => c.triggered).map(c => c.title).join('、') : '全部正常';
    const dtCard = (w.cards || []).find(c => c.key === 'dissolve_time');
    const dc = shMk('sh-dt-chart');
    if (dc && dtCard && dtCard.hist) {
      dc.setOption({
        tooltip: { trigger: 'axis', formatter: ps => `${ps[0].name}<br/>解散 ${ps[0].value} 个<br/><span style="color:#9CA3AF;font-size:10px;">点击进入预警中心</span>` },
        grid: { left: 8, right: 8, top: 20, bottom: 4, containLabel: true },
        xAxis: { type: 'category', data: dtCard.hist.map(h => h.label), axisLabel: { fontSize: 9, color: '#6B7280', interval: 0 } },
        yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 9, color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
        series: [{ type: 'bar', data: dtCard.hist.map(h => h.count), barMaxWidth: 30, itemStyle: { color: p => p.dataIndex === 1 ? '#D56060' : '#C9A0DC', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', fontSize: 9, color: '#6B7280' } }],
      });
      dc.off('click'); dc.on('click', () => switchTab('alerts'));
      document.getElementById('sh-dt-chart').style.cursor = 'pointer';
    }
  } catch (e) { console.warn('预警速览 加载失败:', e); }
  // 毕业妹妹摘要 + 趋势
  try {
    const gr = await (await fetch(API_BASE + '/api/grad-retention?x=1' + hp)).json();
    const g = gr.stats || {};
    const sg = document.getElementById('sh-sum-grad');
    if (sg) sg.textContent = (g.w1s_rate ?? '—') + '%';
    const sgs = document.getElementById('sh-sum-grad-s');
    if (sgs) sgs.textContent = `${g.w1_scheduled}/${g.w1s_covered} 位 · 产出达标 ${g.w1_rate ?? '—'}%`;
    const gd = document.getElementById('sh-sum-gradd');
    if (gd) gd.textContent = (g.total ?? '—') + ' 位毕业妹妹';
    const c = shMk('sh-grad-trend');
    if (c) {
      c.setOption({
        grid: { left: 4, right: 4, top: 8, bottom: 4, containLabel: true },
        xAxis: { type: 'category', data: (gr.trend || []).map(t => t.week), axisLabel: { fontSize: 9, color: '#9CA3AF', interval: 1 } },
        yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 9, color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
        series: [{ type: 'bar', data: (gr.trend || []).map(t => t.count), barMaxWidth: 14, itemStyle: { color: '#8F7BFF', borderRadius: [3, 3, 0, 0] } }],
        tooltip: { trigger: 'axis', formatter: ps => `${ps[0].name}：毕业 ${ps[0].value} 人<br/><span style="color:#9CA3AF;font-size:10px;">点击进入姐姐分析</span>` },
      });
      c.off('click'); c.on('click', () => switchTab('captains'));
      document.getElementById('sh-grad-trend').style.cursor = 'pointer';
    }
  } catch (e) { console.warn('毕业摘要 加载失败:', e); }
  // 存活率 chips
  try {
    const sv = await (await fetch(API_BASE + '/api/survival?x=1' + hp)).json();
    const el = document.getElementById('sh-survival-chips');
    if (el) {
      const chips = [['7天', sv.survival && sv.survival.d7], ['14天', sv.survival && sv.survival.d14], ['30天', sv.survival && sv.survival.d30]].filter(x => x[1]);
      el.innerHTML = chips.map(([l, c]) =>
        `<div class="sh-chipx"><span>存活 ${l}</span><b style="color:${c.rate >= 60 ? 'var(--wb-up)' : c.rate >= 40 ? 'var(--wb-warn)' : 'var(--wb-down)'};">${c.rate}%</b></div>`).join('') || '暂无';
    }
  } catch (e) { console.warn('存活chips 加载失败:', e); }
  // 保护期将到期
  try {
    const pe = await (await fetch(API_BASE + '/api/protection-expiring?days=3')).json();
    const el = document.getElementById('sh-prot-list');
    if (el) {
      const list = pe.list || [];
      el.innerHTML = list.length ? list.slice(0, 6).map(r => {
        const dl = r.days_left;
        const badge = dl == null ? '' : dl < 0 ? `<span class="sh-badge red">已过${-dl}天</span>` : dl === 0 ? '<span class="sh-badge red">今天</span>' : `<span class="sh-badge amber">${dl}天后</span>`;
        return `<div class="sh-mini-it"><span class="nm">${r.nickname}</span>${badge}</div>`;
      }).join('') : '<div style="color:var(--wb-text-3);font-size:12px;">暂无将到期</div>';
    }
  } catch (e) { console.warn('保护期名单 加载失败:', e); }
  // 躺平 TOP
  try {
    const lf = await (await fetch(API_BASE + '/api/lying-flat')).json();
    const el = document.getElementById('sh-lying-list');
    if (el) {
      const list = (lf.list || []).slice(0, 4);
      el.innerHTML = list.length ? list.map(r =>
        `<div class="sh-mini-it"><span class="nm">${r.sister_nickname2 || r.sister_nickname}</span><span class="sh-badge red">${r.accompany_streak}天未陪档</span></div>`).join('')
        : '<div style="color:var(--wb-text-3);font-size:12px;">暂无躺平团</div>';
    }
  } catch (e) { console.warn('躺平TOP 加载失败:', e); }
  // 数据新鲜度
  try {
    const [lu, ka] = await Promise.all([
      fetch(API_BASE + '/api/last-update').then(r => r.json()).catch(() => null),
      fetch(API_BASE + '/api/keepalive-status').then(r => r.json()).catch(() => null),
    ]);
    const el = document.getElementById('sh-fresh-line');
    if (el) {
      const fmt = s => (s || '').slice(5, 16);
      const dot = ok => `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${ok ? 'var(--wb-up)' : 'var(--wb-down)'};margin-right:4px;"></span>`;
      el.innerHTML = [
        lu ? `${dot(lu.status === 'success')}最近抓取 ${fmt(lu.last_update)}` : '',
        ka ? `${dot(ka.uid && ka.uid.ok)}UID 查询 Cookie · ${dot(ka.bigdata && ka.bigdata.ok)}抓取 Cookie` : '',
        ka && ka.last_run ? `<span style="color:var(--wb-text-3);font-size:10.5px;">保活巡检 ${fmt(ka.last_run)}</span>` : '',
      ].filter(Boolean).join('<br>');
    }
  } catch (e) { console.warn('新鲜度 加载失败:', e); }
}

/* UID 快查（右栏） */
async function shUidQuick() {
  const input = document.getElementById('sh-uid-quick-input');
  const box = document.getElementById('sh-uid-quick-res');
  if (!input || !box) return;
  const uid = input.value.trim();
  if (!uid) return;
  box.style.display = 'block';
  box.innerHTML = '查询中…';
  try {
    const res = await fetch(API_BASE + '/api/uid-query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, captain_type: 'game' }) });
    const d = await res.json();
    if (!res.ok || d.error) throw new Error(d.error || '查询失败');
    const tw = (d.this_week && d.this_week.data) || {};
    box.innerHTML = `<b>${d.nickname || uid}</b> · ${d.type_label || ''}<br>当周流水 <b style="color:var(--wb-accent);">¥${Number(tw.week_revenue || 0).toLocaleString()}</b> · 排档 ${tw.week_schedule_days ?? '—'} 天 · ${tw.week_level || '—'}<br><a href="javascript:void(0)" onclick="jumpToUID('${uid}')" style="color:var(--wb-accent);font-size:11px;text-decoration:none;">进入 UID 查询页看完整 →</a>`;
  } catch (e) {
    box.innerHTML = `<span style="color:var(--wb-down);font-size:12px;">${e.message}</span>`;
  }
}

/* 回到顶部（滚中列容器） */
function initShellScroll() {
  const center = document.getElementById('sh-center');
  const btn = document.getElementById('sh-back-top');
  if (!center || !btn) return;
  center.addEventListener('scroll', e => {
    btn.classList.toggle('show', e.target.scrollTop > 400);
  }, { passive: true });
}
