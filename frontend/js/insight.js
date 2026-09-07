// insight.js - 姐姐分析 / 预警中心

/* ═══════════════ 姐姐分析 ═══════════════ */

let captainPeriod = 'day';          // day / week / month

const CAPTAIN_PERIOD_LABEL = { day: '当日', week: '当周', month: '当月' };

function setCaptainPeriod(p) {
  captainPeriod = p;
  ['day', 'week', 'month'].forEach(k => {
    const b = document.getElementById('cap-' + k);
    if (b) b.classList.toggle('on', k === p);
  });
  loadCaptains();
}

let captainRewardMap = {};   // uid → { reward, halls }

async function loadCaptains() {
  try {
    const res = await fetch(API_BASE + `/api/captains?limit=200&period=${captainPeriod}&` + getHallParam().substring(1));
    const d = await res.json();
    if (d.ref_date) {
      const hintEl = document.getElementById('captains-hint');
      if (hintEl) hintEl.textContent = `数据日期 ${d.ref_date} · 会随所选大厅变化`;
    }
    captainRewardMap = {};
    (d.data || []).forEach(c => { captainRewardMap[c.uid] = { reward: c.total_reward, halls: c.halls || '' }; });
    applyCaptainReward();
  } catch (e) { console.error('姐姐奖励排行加载失败:', e); }
}

// 把 /api/captains 的奖励/大厅合并进 /api/sister-profile 画像列表，形成「姐姐总览」合并表
function applyCaptainReward() {
  sisterProfileList.forEach(x => {
    const m = captainRewardMap[x.sister_uid];
    x.reward = m ? m.reward : 0;
    x.halls = m ? m.halls : '';
  });
  renderSisterProfile();
}

/* 概览页姐姐小窗：当日奖励 TOP3（点行跳姐姐分析页） */
async function loadOverviewCaptains() {
  const el = document.getElementById('overview-captain-preview');
  if (!el) return;
  try {
    const res = await fetch(API_BASE + `/api/captains?limit=5&period=day&` + getHallParam().substring(1));
    const d = await res.json();
    const list = (d.data || []).slice(0, 3);
    el.innerHTML = list.length
      ? `<ul class="mini-preview">${list.map((c, i) => `<li onclick="switchTab('captains')" style="cursor:pointer;" title="点击查看姐姐分析">
          <span class="mp-rank ${i < 3 ? 'top' : ''}">${i + 1}</span>
          <span class="mp-name">${c.nickname} <span class="mp-sub">(${c.uid})</span></span>
          <span class="mp-val">${wbFmtMoney(c.total_reward)}</span>
        </li>`).join('')}</ul>`
      : '<div style="color:var(--wb-text-3);font-size:12px;padding:8px 0;">暂无排行数据。</div>';
  } catch (e) { console.error('概览姐姐排行加载失败:', e); }
}

/* 姐姐画像（周口径）：产出/留存/稳定性 + 头部/风险打标 */
let sisterProfileList = [];
let sisterProfileSummary = {};
let sisterProfileGraduates = [];
let sisterProfilePage = 0;
let sisterProfilePerPage = 20;
let sisterProfileSort = 'reward';
let gradRange = 'week';   // 毕业妹妹时间档：today / week / month

function getSisterWeekParam() {
  const wkSel = document.getElementById('sister-week-select');
  return wkSel && wkSel.value ? '&week=' + encodeURIComponent(wkSel.value) : '';
}

async function loadSisterProfile() {
  const sumEl = document.getElementById('sister-profile-sum');
  const tableEl = document.getElementById('sister-profile-table');
  if (!tableEl) return;
  try {
    const res = await fetch(API_BASE + '/api/sister-profile?' + getHallParam().substring(1) + getSisterWeekParam() + '&grad_range=' + gradRange);
    const d = await res.json();
    if (d.error) return;
    sisterProfileList = d.list || [];
    sisterProfileSummary = d.summary || {};
    sisterProfileGraduates = d.recent_graduates || [];
    const s = d.summary || {};
    sumEl.innerHTML = `
      <span class="survival-chip">姐姐 ${d.total} 位（周 ${d.cur_week || ''}）</span>
      <span class="survival-chip">头部 <strong>${s.head_count}</strong> 位</span>
      <span class="survival-chip">风险 <strong>${s.risk_count}</strong> 位</span>
      <span class="survival-chip">本周流水 TOP：${s.top_sister || '—'} <strong>${wbFmtMoney(s.top_rev || 0)}</strong></span>`;
    const insEl = document.getElementById('sister-profile-insight');
    if (insEl) {
      insEl.innerHTML = `头部 <b>${s.head_count}</b> 位是流水主力（高于八成非零姐姐且持续率≥65%），风险 <b>${s.risk_count}</b> 位需重点跟进（环比暴跌或带团多持续率低）。本周流水 TOP「${s.top_sister || '—'}」${wbFmtMoney(s.top_rev || 0)}。`;
    }
    applyCaptainReward();
    renderSisterCharts();
    renderRecentGraduates();
  } catch (e) { console.error('姐姐画像加载失败:', e); }
}

/* 最近毕业的妹妹（满30天自动毕业）· 三档时间切换 + 富字段 */
const GRAD_RANGE_LABEL = { today: '今天', week: '近一周', month: '近一个月' };

function setGradRange(v) {
  gradRange = v;
  ['today', 'week', 'month'].forEach(k => {
    const b = document.getElementById('grad-' + k);
    if (b) b.classList.toggle('on', k === v);
  });
  loadSisterProfile();
}

function renderRecentGraduates() {
  const list = sisterProfileGraduates || [];
  const emptyTxt = `「${GRAD_RANGE_LABEL[gradRange] || ''}」暂无毕业的妹妹。`;
  // 1) 小窗口预览（TOP 3）：妹妹 + 毕业日期，可点跳 UID
  const prevEl = document.getElementById('grad-preview');
  if (prevEl) {
    prevEl.innerHTML = list.length
      ? `<ul class="mini-preview">${list.slice(0, 3).map((g, i) => `<li onclick="jumpToUID('${g.sister_uid2 || ''}')" style="cursor:pointer;" title="点击查看妹妹 UID">
          <span class="mp-rank ${i < 3 ? 'top' : ''}">${i + 1}</span>
          <span class="mp-name">${g.nickname || g.sister_uid2 || '-'} <span class="mp-sub">${g.dissolve_date || '-'}</span></span>
        </li>`).join('')}</ul>`
      : `<div style="color:var(--wb-text-3);font-size:12px;padding:8px 0;">${emptyTxt}</div>`;
  }
  // 2) 全量表（弹窗内）：妹妹UID / 姐姐UID / 大厅 / 妹妹最高牌子 / 流水 / 毕业日期
  const tableEl = document.getElementById('grad-full-table');
  if (tableEl) {
    tableEl.innerHTML = list.length
      ? `<tr><th>#</th><th>妹妹</th><th>姐姐</th><th>大厅</th><th>妹妹最高牌子</th><th>流水</th><th>毕业日期</th></tr>
        ${list.map((g, i) => `<tr>
          <td class="rank-no ${i < 3 ? 'top' : ''}">${i + 1}</td>
          <td><a href="javascript:void(0)" onclick="jumpToUID('${g.sister_uid2 || ''}')">${g.nickname || '-'}</a> <span style="color:var(--wb-text-3);font-size:11px">(${g.sister_uid2 || '-'})</span></td>
          <td><a href="javascript:void(0)" onclick="jumpToUID('${g.sister_uid || ''}')">${g.sister_nickname || '-'}</a> <span style="color:var(--wb-text-3);font-size:11px">(${g.sister_uid || '-'})</span></td>
          <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${g.hall_name || '-'}</td>
          <td>${g.sister_max_level2 || '无'}</td>
          <td>${wbFmtMoney(g.sister_revenue || 0)}</td>
          <td>${g.dissolve_date || '-'}</td>
        </tr>`).join('')}`
      : `<tr><td colspan="7" style="text-align:center;color:#9CA3AF;padding:16px;">${emptyTxt}</td></tr>`;
  }
  // 展开按钮文案
  const expEl = document.getElementById('grad-expand');
  if (expEl) expEl.innerHTML = `展开全部 ${list.length} 位 →`;
}

function openGradFull() {
  const modal = document.getElementById('grad-full-modal');
  if (modal) modal.classList.add('active');
}

function closeGradFull() {
  const modal = document.getElementById('grad-full-modal');
  if (modal) modal.classList.remove('active');
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
  // 2) 姐妹关系持续率分段直方图（分箱避免散点重叠）
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
  const rewardTh = CAPTAIN_PERIOD_LABEL[captainPeriod] + '奖励';
  document.getElementById('sister-profile-table').innerHTML = `
    <tr><th>#</th><th>姐姐</th><th>姐姐UID</th><th>标签</th><th>带团</th><th>进行中</th><th>姐妹关系持续率</th><th>所在大厅</th><th>等级</th><th>${rewardTh}</th></tr>
    ${page.map((x, i) => `<tr>
      <td class="rank-no ${(start + i) < 3 ? 'top' : ''}">${start + i + 1}</td>
      <td><a href="javascript:void(0)" onclick="openSisterDetail('${x.sister_uid || ''}')">${x.sister_nickname || '-'}</a></td>
      <td>${x.sister_uid ? `<a href="javascript:void(0)" onclick="jumpToUID('${x.sister_uid}')" style="color:#7C5CFF;text-decoration:none;">${x.sister_uid}</a>` : '-'}</td>
      <td>${tag(x.tag)}</td>
      <td>${x.total_teams}</td>
      <td>${x.active_teams}</td>
      <td>${x.retention == null ? '—' : '<b>' + x.retention + '%</b>'}<div style="color:var(--wb-text-3);font-size:11px;">毕业率 ${x.graduation_rate == null ? '—' : x.graduation_rate + '%'}</div></td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${x.halls || '-'}</td>
      <td>${x.sister_level ?? '-'}</td>
      <td style="font-weight:600;">${wbFmtMoney(x.reward || 0)}</td>
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
let sdTeams = [];

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
      <span class="survival-chip">进行中占比 ${d.retention == null ? '—' : '<strong>' + d.retention + '%</strong>'}</span>
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
    sdTeams = d.teams || [];
    document.getElementById('sd-table').innerHTML = `
      <tr><th>团ID</th><th>大厅</th><th>成团天</th><th>状态</th><th>妹妹</th><th>奖励</th></tr>
      ${sdTeams.map((t, i) => `<tr>
        <td><a href="javascript:void(0)" onclick="openSDTeamDetail(${i})" style="color:#7C5CFF;text-decoration:none;">#${t.team_id}</a></td>
        <td>${t.hall_name || '-'}</td>
        <td>${t.days_since_formed ?? '-'}天</td>
        <td>${t.status === 'active' ? '<span class="chip up">进行中</span>' : '<span class="chip flat">已解散</span>'}</td>
        <td>${t.sister_uid2 ? `<a href="javascript:void(0)" onclick="closeSisterDetail();jumpToUID('${t.sister_uid2}')" style="color:#7C5CFF;text-decoration:none;">${t.sister2 || t.sister_uid2}</a> <span style="color:var(--wb-text-3);font-size:11px">(${t.sister_uid2})</span>` : (t.sister2 || '-')}</td>
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

function openSDTeamDetail(i) {
  const t = sdTeams && sdTeams[i];
  if (!t) return;
  closeSisterDetail();
  if (typeof renderTeamDetailModal === 'function') renderTeamDetailModal(t);
}

/* ═══════════════ 候选池（阶段B）：并列展示四因子证据 + 结果记录 ═══════════════ */

let poolList = [];
let poolPage = 0;
let poolPerPage = 20;
let poolSortField = null;   // null = 后端默认顺序（候选优先 + 牌子等级）
let poolSortOrder = 'desc';
let quadrantHall = 'all';    // 培养力象限图按厅筛选

function switchCaptainView(view) {
  const main = document.getElementById('captains-main');
  const pool = document.getElementById('captains-pool');
  if (!main || !pool) return;
  main.style.display = view === 'profile' ? '' : 'none';
  pool.style.display = view === 'pool' ? '' : 'none';
  const set = (id, on) => { const b = document.getElementById(id); if (b) b.classList.toggle('on', on); };
  set('cap-view-profile', view === 'profile');
  set('cap-view-pool', view === 'pool');
  // 侧栏高亮：姐姐分析主标签 vs 姐姐筛选子标签
  const sm = document.getElementById('side-captains');
  const ss = document.getElementById('side-filter');
  if (sm) sm.classList.toggle('active', view === 'profile');
  if (ss) { ss.classList.toggle('active', view === 'pool'); ss.classList.toggle('sub-on', view === 'pool'); }
  if (view === 'pool') { loadTalentPool(); loadTalentActions(); }
  if (view === 'profile') {
    setTimeout(() => { if (charts['sisterTag']) charts['sisterTag'].resize(); if (charts['sisterRet']) charts['sisterRet'].resize(); }, 60);
  }
}

// 侧栏「姐姐筛选」子标签入口：切到姐姐分析并展示候选池
function openCaptainPool() { switchPage('captains'); switchCaptainView('pool'); }

// 概览「毕业妹妹留存」跳转：切到姐姐分析并定位毕业妹妹留存模块
function jumpToGrad() {
  switchPage('captains');
  switchCaptainView('profile');
  setTimeout(() => {
    const el = document.getElementById('grad-retention-sec');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

// 概览「毕业妹妹数」卡点击：切到姐姐分析并定位毕业妹妹名单模块
function jumpToGraduated() {
  switchPage('captains');
  switchCaptainView('profile');
  setTimeout(() => {
    const el = document.getElementById('grad-sec') || document.getElementById('grad-preview');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

// 回填「毕业妹妹留存」模块（概览 3 卡 + 姐姐分析完整模块 + 近 8 周毕业趋势）：
// 近似兜底口径：毕业后是否再次成团/当姐姐；晋升为姐姐取真数。
async function loadGradRetention() {
  const owRet = document.getElementById('ow-grad-ret');
  const ow30d = document.getElementById('ow-grad-30d');
  const owPro = document.getElementById('ow-grad-promoted');
  const grRet = document.getElementById('gr-ret');
  const gr30d = document.getElementById('gr-30d');
  const grPro = document.getElementById('gr-promoted');
  const grTable = document.getElementById('gr-table');
  const lineEl = document.getElementById('cap-grad-line');
  if (!owRet && !ow30d && !owPro && !grRet && !gr30d && !grPro && !grTable && !lineEl) return;
  try {
    const res = await fetch(API_BASE + '/api/grad-retention?' + getHallParam().substring(1));
    const d = await res.json();
    const s = d.stats || {};
    const setPct = (el, v) => { if (el) el.textContent = v == null ? '—' : Math.round(v) + '%'; };
    setPct(owRet, s.retention_rate);
    setPct(ow30d, s.retention_30d);
    setPct(grRet, s.retention_rate);
    setPct(gr30d, s.retention_30d);
    const promotedTxt = s.promoted == null ? '—' : s.promoted + ' 人';
    if (owPro) owPro.textContent = promotedTxt;
    if (grPro) grPro.textContent = promotedTxt;
    if (grTable) {
      _gradRetentionList = s.list || [];
      grFilter();
    }
    renderGradLine(d.trend || []);
  } catch (e) {
    console.error('毕业妹妹留存加载失败:', e);
    if (grTable) grTable.innerHTML = '<tbody><tr><td colspan="8" style="color:#9CA3AF;">毕业妹妹留存加载失败</td></tr></tbody>';
  }
}

function gradRetentionTableHTML(list) {
  const head = '<thead><tr><th>妹妹</th><th>妹妹UID</th><th>毕业日期</th><th>配对姐姐</th><th>毕业后留存</th><th>是否开始带妹妹</th><th>带妹代数</th><th>来源</th></tr></thead>';
  if (!list.length) return head + `<tbody><tr><td colspan="8" style="color:#9CA3AF;">${_gradRetentionList.length ? '无匹配的妹妹' : '暂无毕业妹妹'}</td></tr></tbody>`;
  const rows = list.map(g => {
    const name = g.nickname || g.sister_uid2 || '-';
    const uid = g.sister_uid2 || '';
    const days = g.retained_days;
    const keep = (!g.retained || days == null || days <= 0)
      ? '<span style="color:#6B7280;font-weight:700;">0 天</span>'
      : days >= 90 ? '<span style="color:#16A34A;font-weight:700;">≥90 天</span>'
      : days >= 30 ? '<span style="color:#16A34A;font-weight:700;">≥30 天</span>'
      : `<span style="color:#B45309;font-weight:700;">${days} 天</span>`;
    const lineage = g.promoted
      ? `<span class="chip up" style="cursor:pointer;" data-n="${esc(name)}" data-u="${esc(uid)}" onclick="openLineage(this.dataset.n, this.dataset.u)" title="点击查看她带的团">已开始带妹妹 · 看明细</span>`
      : '<span style="display:inline-flex;font-size:11.5px;font-weight:600;padding:2px 7px;border-radius:6px;color:#6B7280;background:#F3F4F6;">未开始带妹妹</span>';
    return `<tr>
      <td>${esc(name)}</td>
      <td>${uid ? `<a href="javascript:void(0)" onclick="jumpToUID('${uid}')" style="color:#7C5CFF;text-decoration:none;">${uid}</a>` : '—'}</td>
      <td>${esc(g.grad_date || '—')}</td>
      <td>${esc(g.sister_nickname || '—')}</td>
      <td>${keep}</td>
      <td>${lineage}</td>
      <td style="color:#9CA3AF;">—</td>
      <td><span style="font-size:10.5px;color:#92400E;background:#FFFBEB;border-radius:6px;padding:2px 6px;">近似</span></td>
    </tr>`;
  }).join('');
  return head + `<tbody>${rows}</tbody>`;
}

// 毕业妹妹留存表：每页 20 条分页 + 搜索过滤（纯前端，数据源已在内存中）
let _gradRetentionList = [];
let _grPage = 1;
const GR_PAGE_SIZE = 20;

function grFilteredList() {
  const kw = ((document.getElementById('gr-search') || {}).value || '').trim().toLowerCase();
  if (!kw) return _gradRetentionList;
  return _gradRetentionList.filter(g => ((g.nickname || '') + (g.sister_uid2 || '') + (g.sister_nickname || '')).toLowerCase().includes(kw));
}

function grFilter() { _grPage = 1; grRenderPage(); }
function grGoPage(p) { _grPage = p; grRenderPage(); }

function grRenderPage() {
  const list = grFilteredList();
  const totalPages = Math.max(1, Math.ceil(list.length / GR_PAGE_SIZE));
  if (_grPage > totalPages) _grPage = totalPages;
  const pageRows = list.slice((_grPage - 1) * GR_PAGE_SIZE, _grPage * GR_PAGE_SIZE);
  const grTable = document.getElementById('gr-table');
  if (grTable) grTable.innerHTML = gradRetentionTableHTML(pageRows);
  const cnt = document.getElementById('gr-count');
  if (cnt) cnt.textContent = list.length === _gradRetentionList.length
    ? `共 ${list.length} 位`
    : `共 ${_gradRetentionList.length} 位 · 筛选出 ${list.length} 位`;
  const pg = document.getElementById('gr-pagination');
  if (!pg) return;
  if (totalPages <= 1) { pg.innerHTML = ''; return; }
  let h = `<span style="font-size:13px;color:#666;margin-right:12px;">第 ${_grPage}/${totalPages} 页</span>`;
  if (_grPage > 1) h += `<button onclick="grGoPage(1)">首页</button><button onclick="grGoPage(${_grPage - 1})">上一页</button>`;
  const s = Math.max(1, _grPage - 2), e = Math.min(totalPages, _grPage + 2);
  if (s > 1) h += `<button onclick="grGoPage(1)">1</button>${s > 2 ? '<span class="pager-dots">…</span>' : ''}`;
  for (let i = s; i <= e; i++) h += `<button class="${i === _grPage ? 'active' : ''}" onclick="grGoPage(${i})">${i}</button>`;
  if (e < totalPages) h += `${e < totalPages - 1 ? '<span class="pager-dots">…</span>' : ''}<button onclick="grGoPage(${totalPages})">${totalPages}</button>`;
  if (_grPage < totalPages) h += `<button onclick="grGoPage(${_grPage + 1})">下一页</button><button onclick="grGoPage(${totalPages})">末页</button>`;
  pg.innerHTML = h;
}

// 近 8 周毕业趋势柱图（/api/grad-retention trend）
function renderGradLine(trend) {
  const el = document.getElementById('cap-grad-line');
  if (!el || !window.echarts) return;
  if (charts['gradLine']) charts['gradLine'].dispose();
  const labels = trend.map(t => t.week);
  const vals = trend.map(t => t.count);
  const c = echarts.init(el);
  charts['gradLine'] = c;
  c.setOption({
    tooltip: { trigger: 'axis', formatter: ps => `${ps[0].name}<br/>毕业 ${ps[0].value} 位` },
    grid: { left: 8, right: 12, top: 24, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: labels, axisLabel: { fontSize: 10, color: '#6B7280', interval: 0 } },
    yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 10, color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#F0F1F4' } } },
    series: [{ type: 'bar', data: vals, barMaxWidth: 40, itemStyle: { color: '#7C5CFF', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', fontSize: 10, color: '#6B7280' } }]
  });
  setTimeout(resizeAllCharts, 300);
  const ins = document.getElementById('grad-line-insight');
  if (ins) {
    if (!vals.length) { ins.innerHTML = '暂无毕业趋势数据。'; return; }
    const total = vals.reduce((a, b) => a + b, 0);
    const avg = total / vals.length;
    const last = vals[vals.length - 1];
    ins.innerHTML = `近 ${vals.length} 周每周毕业 <b>${Math.min(...vals)}~${Math.max(...vals)}</b> 位，均值 ≈ <b>${avg.toFixed(1)}</b> 位，本周 <b>${last}</b> 位。`;
  }
}

// 传承链弹窗：树状图（毕业妹妹 → 晋升姐姐 → 她带的妹妹 → 妹妹再晋升…代际展开）
async function openLineage(name, uid) {
  if (!uid) return;
  try {
    const res = await fetch(API_BASE + '/api/lineage-tree?uid=' + encodeURIComponent(uid));
    const d = await res.json();
    if (d.error || !d.tree || !(d.tree.children || []).length) {
      if (typeof showToast === 'function') showToast(`「${name}」暂无带团记录`, 'info');
      return;
    }
    const st = d.stats || {};
    // 直接带的团明细表（按人聚合 → 展开为每团一行）
    const directRows = [];
    (d.tree.children || []).forEach(p => {
      (p.teams || []).forEach(t => directRows.push({ ...t, nickname: p.nickname, uid: p.uid, became_sister: p.became_sister }));
    });
    const rows = directRows.map(t => `<tr>
      <td>${t.team_id}</td>
      <td>${esc(t.hall_name || '-')}</td>
      <td>${esc(t.nickname || '-')}${t.uid ? ` <span style="color:#9CA3AF;font-size:11px;">(${t.uid})</span>` : ''}${t.became_sister ? ' <span class="chip up" style="font-size:10px;">也当了姐姐</span>' : ''}</td>
      <td>${esc(t.form_date || '-')}</td>
      <td>${t.status === 'active' ? '<span style="color:#16A34A;">进行中</span>' : esc(t.dissolve_date || '-')}</td>
      <td>${t.days} 天</td>
    </tr>`).join('');
    openWarnModal(`传承链 · ${esc(name)}`,
      `<div style="font-size:12px;color:#6B7280;margin-bottom:6px;">代际传承 <b>${st.generations || 1}</b> 代 · 累计带出 <b>${st.descendants || directRows.length}</b> 个团 · 进行中 <b>${st.active_teams || 0}</b> 个</div>
       <div id="lineage-tree-chart" style="width:100%;height:380px;"></div>
       <div style="font-size:12px;color:#9CA3AF;margin:6px 0;">直接带的 ${directRows.length} 个团：</div>
       <table class="rank-table"><thead><tr><th>团ID</th><th>大厅</th><th>带的妹妹</th><th>成团日期</th><th>状态</th><th>天数</th></tr></thead><tbody>${rows}</tbody></table>`);
    renderLineageTree(d.tree);
  } catch (e) {
    if (typeof showToast === 'function') showToast('传承链加载失败: ' + e.message, 'error');
  }
}

// ECharts 树状图渲染：节点=妹妹（团），颜色区分状态；「也当了姐姐」的节点紫色描边可继续展开
let _lineageChart = null;
function renderLineageTree(root) {
  const el = document.getElementById('lineage-tree-chart');
  if (!el || !window.echarts) return;
  if (_lineageChart) { _lineageChart.dispose(); _lineageChart = null; }
  const toNode = n => ({
    name: n.nickname + (n.team_count > 1 ? ` ×${n.team_count}` : ''),
    value: n.uid,
    teamInfo: n,
    symbolSize: n.became_sister ? 12 : 8,
    itemStyle: {
      color: n.status === 'active' ? '#3D9A6C' : '#C0C4CC',
      borderColor: n.became_sister ? '#7C5CFF' : '#fff',
      borderWidth: n.became_sister ? 2 : 1,
    },
    label: { fontWeight: n.became_sister ? 700 : 400 },
    children: (n.children || []).map(toNode),
  });
  const data = {
    name: root.nickname, value: root.uid, teamInfo: root,
    symbolSize: 14, itemStyle: { color: '#7C5CFF', borderColor: '#5B3EC4', borderWidth: 2 },
    label: { fontWeight: 700 },
    children: (root.children || []).map(toNode),
  };
  _lineageChart = echarts.init(el);
  _lineageChart.setOption({
    tooltip: {
      trigger: 'item', triggerOn: 'mousemove',
      formatter: p => {
        const t = p.data.teamInfo || {};
        if (t.team_count == null) return `<b>${esc(p.name)}</b><br/>UID: ${t.uid || ''}`;
        const teamLines = (t.teams || []).slice(0, 5).map(x =>
          `#${x.team_id} ${esc(x.hall_name || '—')} · ${x.form_date || '—'} · ${x.status === 'active' ? '进行中' : '解散于 ' + (x.dissolve_date || '—')}`).join('<br/>');
        return `<b>${esc(t.nickname || p.name)}</b>（${t.uid || '—'}）<br/>带过 ${t.team_count} 个团 · 进行中 ${t.active_count}${t.became_sister ? ' · 她也晋升为姐姐' : ''}<br/><span style="color:#9CA3AF;">${teamLines}${(t.teams || []).length > 5 ? '<br/>…' : ''}</span>`;
      },
    },
    series: [{
      type: 'tree', data: [data],
      left: '14%', right: '22%', top: '4%', bottom: '4%',
      orient: 'LR', symbol: 'circle',
      expandAndCollapse: true, initialTreeDepth: 2,
      label: { position: 'right', verticalAlign: 'middle', fontSize: 11, color: '#374151', distance: 6 },
      leaves: { label: { position: 'right', fontSize: 11, color: '#374151' } },
      lineStyle: { color: '#D9D5F0', width: 1.2, curveness: 0.5 },
      emphasis: { focus: 'descendant' },
      animationDuration: 300,
    }],
  });
  el.oncontextmenu = ev => ev.preventDefault();
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
      <span class="survival-chip">姐姐 <strong>${d.total}</strong> 位</span>
      <span class="survival-chip">候选 <strong>${d.candidate_count}</strong> 位</span>
      <span class="survival-chip">并列展示 · 不做权威排序</span>`;
    const insEl = document.getElementById('pool-insight');
    if (insEl) {
      insEl.innerHTML = `候选 <b>${d.candidate_count}</b> 位满足「持续率≥65% 且 妹妹有成长 且 牌子≥银牌」。培养力总分 = 0.4×持续率 + 0.35×妹妹成长(封顶T=20) + 0.25×培养升牌率，仅作排序参考、不进候选硬门槛——请结合四列证据自行判断倾斜给谁，并把动作记到下方「结果记录」。`;
    }
    renderTalentPool();
    renderTalentQuadrant();
  } catch (e) { console.error('候选池加载失败:', e); }
}

function sortPool(field) {
  if (poolSortField === field) {
    poolSortOrder = poolSortOrder === 'desc' ? 'asc' : 'desc';
  } else {
    poolSortField = field;
    poolSortOrder = 'desc';
  }
  poolPage = 0;
  renderTalentPool();
}

function renderTalentPool() {
  const poolArrow = f => poolSortField === f ? (poolSortOrder === 'desc' ? '▼' : '▲') : '▲▼';
  const th = (field, label) => field
    ? `<th style="cursor:pointer;user-select:none;white-space:nowrap;" onclick="sortPool('${field}')">${label} <span style="font-size:10px;color:var(--wb-text-3)">${poolArrow(field)}</span></th>`
    : `<th>${label}</th>`;

  let list = poolList;
  if (poolSortField) {
    list = [...poolList].sort((a, b) => {
      let av = a[poolSortField], bv = b[poolSortField];
      if (av == null) av = -Infinity;
      if (bv == null) bv = -Infinity;
      return poolSortOrder === 'desc' ? bv - av : av - bv;
    });
  }
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / poolPerPage));
  if (poolPage >= totalPages) poolPage = totalPages - 1;
  if (poolPage < 0) poolPage = 0;
  const start = poolPage * poolPerPage;
  const page = list.slice(start, start + poolPerPage);
  const cand = c => c ? '<span class="chip up">候选</span>' : '<span class="chip flat">待观察</span>';
  document.getElementById('pool-table').innerHTML = `
    <tr><th>#</th>${th(null, '姐姐')}${th(null, '姐姐UID')}${th('level_rank', '牌子等级')}${th('total_teams', '带团(总/进行)')}${th('retention', '持续率')}${th('sister_growth', '妹妹成长(分/月)')}${th('joint_growth', '培养升牌率')}${th('total_score', '培养力总分')}<th>状态</th><th>操作</th></tr>
    ${page.map((x, i) => `<tr>
      <td class="rank-no ${(start + i) < 3 ? 'top' : ''}">${start + i + 1}</td>
      <td><a href="javascript:void(0)" onclick="openSisterDetail('${x.sister_uid || ''}')">${x.sister_nickname || '-'}</a></td>
      <td>${x.sister_uid ? `<a href="javascript:void(0)" onclick="jumpToUID('${x.sister_uid}')" style="color:#7C5CFF;text-decoration:none;">${x.sister_uid}</a>` : '-'}</td>
      <td>${x.level ?? '-'}</td>
      <td>${x.total_teams} / ${x.active_teams}</td>
      <td>${x.retention == null ? '—' : x.retention + '%'}</td>
      <td>${x.sister_growth}</td>
      <td>${x.joint_growth}%</td>
      <td style="font-weight:600;">${x.total_score == null ? '—' : x.total_score}</td>
      <td>${cand(x.candidate)}</td>
      <td><button class="mini-btn" onclick="openTalentActionModal('${x.sister_uid || ''}')">记录</button></td>
    </tr>`).join('') || '<tr><td colspan="11" style="text-align:center;color:#9CA3AF;padding:16px;">暂无数据</td></tr>'}`;
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

/* 培养力象限图（妹妹成长 × 培养升牌率）：只显示候选 · 密集聚合「N 位」气泡 · 按厅筛选 · 点姐姐跳 UID */
let _quadrantGroups = [];

function setQuadrantHall(v) { quadrantHall = v; renderTalentQuadrant(); }

function renderTalentQuadrant() {
  const el = document.getElementById('chart-talent-quadrant');
  if (!el || !window.echarts) return;
  const hallSel = document.getElementById('quadrant-hall-select');
  if (hallSel) {
    const halls = [...new Set(poolList.flatMap(x => (x.halls || '').split(',').map(h => h.trim()).filter(Boolean)))];
    const cur = quadrantHall;
    hallSel.innerHTML = '<option value="all">全部大厅</option>' + halls.map(h => `<option value="${h}">${h}</option>`).join('');
    if (halls.includes(cur)) hallSel.value = cur; else { hallSel.value = 'all'; quadrantHall = 'all'; }
  }
  const cands = poolList.filter(x => x.candidate);
  const pts = cands.filter(x => quadrantHall === 'all' || (x.halls || '').split(',').map(h => h.trim()).includes(quadrantHall));
  if (charts['talentQuadrant']) { charts['talentQuadrant'].dispose(); charts['talentQuadrant'] = null; }
  const c = echarts.init(el);
  charts['talentQuadrant'] = c;
  if (!pts.length) {
    c.setOption({ title: { text: '暂无候选（持续率≥65% + 妹妹有成长 + 银牌）', left: 'center', top: 'middle', textStyle: { fontSize: 12, color: '#9CA3AF' } } });
    return;
  }
  // 热力图网格聚合（替代重叠气泡）：x 培养升牌率每10%一格，y 妹妹成长按数据自适应分档
  const maxG = Math.max(...pts.map(p => p.sister_growth || 0), 1);
  const step = maxG <= 4 ? 0.5 : maxG <= 10 ? 1 : maxG <= 20 ? 2 : maxG <= 40 ? 5 : 10;
  const yBins = Math.min(8, Math.ceil(maxG / step));
  const buckets = new Map();
  pts.forEach(p => {
    const bx = Math.min(9, Math.max(0, Math.floor((p.joint_growth || 0) / 10)));
    const by = Math.min(yBins - 1, Math.max(0, Math.floor((p.sister_growth || 0) / step)));
    const k = bx + ':' + by;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(p);
  });
  const xLabels = Array.from({ length: 10 }, (_, i) => `${i * 10}-${(i + 1) * 10}%`);
  const yLabels = Array.from({ length: yBins }, (_, i) => `${i * step}~${Math.round((i + 1) * step * 10) / 10}`);
  _quadrantGroups = {};
  const data = [];
  let maxCnt = 1;
  buckets.forEach((items, k) => {
    const [bx, by] = k.split(':').map(Number);
    _quadrantGroups[k] = items;
    maxCnt = Math.max(maxCnt, items.length);
    data.push([bx, by, items.length, k]);
  });
  c.setOption({
    tooltip: {
      trigger: 'item',
      formatter: p => {
        const g = _quadrantGroups[p.data[3]];
        if (!g) return '';
        const head = `升牌率 ${xLabels[p.data[0]]} · 成长 ${yLabels[p.data[1]]} 分/月<br/><b>${g.length} 位</b>`;
        return head + '<br/>' + g.slice(0, 8).map(i => `${i.sister_nickname || i.sister_uid}（${i.joint_growth}% / ${i.sister_growth}）`).join('<br/>') + (g.length > 8 ? `<br/>… 等 ${g.length} 位，点击查看全部` : '');
      }
    },
    grid: { left: 70, right: 30, top: 30, bottom: 50 },
    xAxis: { type: 'category', data: xLabels, name: '培养升牌率', axisLabel: { fontSize: 9, color: '#6B7280' }, splitArea: { show: true }, nameTextStyle: { fontSize: 11, color: '#6B7280' } },
    yAxis: { type: 'category', data: yLabels, name: '妹妹成长(分/月)', axisLabel: { fontSize: 9, color: '#6B7280' }, splitArea: { show: true }, nameTextStyle: { fontSize: 11, color: '#6B7280' } },
    visualMap: { min: 0, max: maxCnt, show: false, inRange: { color: ['#F4F5F8', '#C7BFFB', '#7C5CFF', '#4F3BC4'] } },
    series: [{
      type: 'heatmap', data,
      label: { show: true, fontSize: 10, color: '#374151', formatter: p => p.data[2] > 1 ? p.data[2] + ' 位' : (buckets.get(p.data[3])[0].sister_nickname || '') },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(124,92,255,.4)' } }
    }]
  });
  c.off('click');
  c.on('click', p => {
    const g = _quadrantGroups[p.data[3]];
    if (!g) return;
    if (g.length === 1) { jumpToUID(g[0].sister_uid); return; }
    openQuadrantList(g);
  });
}

function openQuadrantList(items) {
  const rows = items.map(i => `<tr>
    <td><a href="javascript:void(0)" onclick="jumpToUID('${i.sister_uid || ''}')">${i.sister_nickname || '-'}</a></td>
    <td>${i.level ?? '-'}</td>
    <td>${i.joint_growth}%</td>
    <td>${i.sister_growth}</td>
    <td>${i.total_score == null ? '—' : i.total_score}</td>
  </tr>`).join('');
  openWarnModal('培养力象限 · 密集区名单', `<table class="rank-table"><tr><th>姐姐</th><th>牌子</th><th>培养升牌率</th><th>妹妹成长</th><th>总分</th></tr>${rows}</table>`);
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
  if (!date) { showToast('请选择动作日期', 'error'); return; }
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
    else { showToast(d.error || '保存失败', 'error'); }
  } catch (e) { console.error('保存记录失败:', e); showToast('保存失败', 'error'); }
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
  if (!date) { showToast('请选择回填日期', 'error'); return; }
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
    else { showToast(d.error || '保存失败', 'error'); }
  } catch (e) { console.error('保存结果失败:', e); showToast('保存失败', 'error'); }
}
