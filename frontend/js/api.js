async function loadHalls() {
  try {
    const res = await fetch(API_BASE + '/api/halls');
    const result = await res.json();
    const role = result.role || 'admin';
    const halls = result.data || [];
    allHalls = halls;

    // 厅运营默认选中第一个具体厅（管理员保持 'all'）
    if (role === 'hall_manager' && halls.length > 0) {
      currentHall = halls[0];
    }

    // 恢复上次选择的大厅（localStorage）
    const savedHall = localStorage.getItem('wb_hall');
    if (savedHall) currentHall = savedHall;

    // 概览页厅选择器：全量大厅，可下拉选择联动下方全部数据
    const sel = document.getElementById('hall-select');
    if (sel) {
      const esc = h => String(h).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      sel.innerHTML = '<option value="all">全部大厅</option>' +
        halls.map(h => `<option value="${esc(h)}">${esc(h)}</option>`).join('');
      sel.value = currentHall;
    }
  } catch (e) { console.error('大厅列表加载失败:', e); }
}

async function loadHallGroups() {
  try {
    const res = await fetch(API_BASE + '/api/hall-groups');
    const d = await res.json();
    _hallGroupTypes = d.types || [];
    renderTypeSelect();
  } catch (e) { console.error('组大厅层级加载失败:', e); }
}

// 搜索栏三级联动：类型 → 组 → 大厅
function renderTypeSelect() {
  const sel = document.getElementById('type-select');
  if (!sel) return;
  const esc = h => String(h).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  sel.innerHTML = '<option value="all">全部类型</option>' +
    _hallGroupTypes.map(t => `<option value="${esc(t.type)}">${esc(t.type)}</option>`).join('');
  sel.value = 'all';
  renderGroupSelect();
}
function renderGroupSelect() {
  const sel = document.getElementById('group-select');
  if (!sel) return;
  const esc = h => String(h).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const type = (document.getElementById('type-select') || {}).value;
  const groups = type === 'all'
    ? _hallGroupTypes.flatMap(t => t.groups)
    : ((_hallGroupTypes.find(t => t.type === type) || {}).groups || []);
  sel.innerHTML = '<option value="all">全部组</option>' +
    groups.map(g => `<option value="${esc(g.group)}">${esc(g.group)}</option>`).join('');
  sel.value = 'all';
  renderHallSelectByGroup();
}
function renderHallSelectByGroup() {
  const sel = document.getElementById('hall-select');
  if (!sel) return;
  const esc = h => String(h).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const type = (document.getElementById('type-select') || {}).value;
  const group = (document.getElementById('group-select') || {}).value;
  const groups = type === 'all'
    ? _hallGroupTypes.flatMap(t => t.groups)
    : ((_hallGroupTypes.find(t => t.type === type) || {}).groups || []);
  let halls;
  if (group !== 'all') {
    halls = (groups.find(g => g.group === group) || {}).halls || [];
  } else if (type !== 'all') {
    halls = groups.flatMap(g => g.halls);
  } else {
    halls = allHalls;
  }
  sel.innerHTML = '<option value="all">全部大厅</option>' +
    halls.map(h => `<option value="${esc(h)}">${esc(h)}</option>`).join('');
  sel.value = (currentHall && halls.includes(currentHall)) ? currentHall : 'all';
}

async function loadWeeks() {
  try {
    const res = await fetch(API_BASE + '/api/weekly-report?limit=all');
    const result = await res.json();
    const dbWeeks = (result.data || []).slice().reverse(); // 从新到旧

    // 计算本周（周一~周日）
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = d => d.toISOString().split('T')[0];
    const thisWeekStart = fmt(monday);
    const thisWeekEnd = fmt(sunday);
    const thisWeekValue = thisWeekStart + '|' + thisWeekEnd;

    // 默认最新周（数据库不含本周时用「本周·收集中」）
    const hasThisWeek = dbWeeks.some(w => w.week_start === thisWeekStart);
    currentWeek = hasThisWeek
      ? dbWeeks[0].week_start + '|' + dbWeeks[0].week_end
      : thisWeekValue;

    // 恢复上次选择的周（localStorage）
    const savedWeek = localStorage.getItem('wb_week');
    if (savedWeek) currentWeek = savedWeek;

    // 全量周选项（姐姐分析画像周选择 / 厅分析周选择用，不分月）
    const buildWeekOptions = () => {
      const opts = [];
      if (!hasThisWeek) {
        opts.push(`<option value="${thisWeekValue}">本周·收集中（${thisWeekStart.slice(5)} ~ ${thisWeekEnd.slice(5)}）</option>`);
      }
      opts.push(...dbWeeks.map(w => {
        const v = w.week_start + '|' + w.week_end;
        const label = w.week_label || `${(w.week_start || '').slice(5)} ~ ${(w.week_end || '').slice(5)}`;
        return `<option value="${v}">${label}</option>`;
      }));
      return opts;
    };

    // 概览页「先选月后选周」：缓存全量周/月候选（值同为 start|end 范围，后端按区间重算）
    window.wbAllWeeks = [];
    if (!hasThisWeek) {
      window.wbAllWeeks.push({ value: thisWeekValue, label: `本周·收集中（${thisWeekStart.slice(5)} ~ ${thisWeekEnd.slice(5)}）`, ws: thisWeekStart, we: thisWeekEnd });
    }
    dbWeeks.forEach(w => {
      const v = w.week_start + '|' + w.week_end;
      window.wbAllWeeks.push({ value: v, label: w.week_label || `${(w.week_start || '').slice(5)} ~ ${(w.week_end || '').slice(5)}`, ws: w.week_start, we: w.week_end });
    });
    // 月候选：从最早有数据的月份到当前月（倒序，当前月标注「至今」）
    window.wbMonths = [];
    {
      const now2 = new Date();
      const first = dbWeeks.length
        ? new Date((dbWeeks[dbWeeks.length - 1].week_start || '') + 'T00:00:00')
        : now2;
      let y = now2.getFullYear(), m = now2.getMonth();
      const endY = first.getFullYear(), endM = first.getMonth();
      while (y > endY || (y === endY && m >= endM)) {
        const mm = String(m + 1).padStart(2, '0');
        const lastDay = new Date(y, m + 1, 0).getDate();
        const isCur = (y === now2.getFullYear() && m === now2.getMonth());
        const mws = `${y}-${mm}-01`, mwe = `${y}-${mm}-${lastDay}`;
        window.wbMonths.push({ value: `${mws}|${mwe}`, label: `${y}年${m + 1}月${isCur ? '·至今' : ''}`, ws: mws, we: mwe });
        m--; if (m < 0) { m = 11; y--; }
      }
    }

    // 当前选中值归属的月：整月值直接匹配；周 → 周四所在月（与后端周均值归属口径一致）
    const monthOfValue = v => {
      const fallback = (window.wbMonths[0] || {}).value || '';
      if (!v || !v.includes('|')) return fallback;
      const direct = window.wbMonths.find(x => x.value === v);
      if (direct) return direct.value;
      const thu = new Date(v.split('|')[0] + 'T00:00:00');
      thu.setDate(thu.getDate() + 3);
      const ym = `${thu.getFullYear()}-${String(thu.getMonth() + 1).padStart(2, '0')}`;
      const hit = window.wbMonths.find(x => x.ws.slice(0, 7) === ym);
      return hit ? hit.value : fallback;
    };

    const mSel = document.getElementById('month-select');
    if (mSel) {
      mSel.innerHTML = window.wbMonths.map(x => `<option value="${x.value}">${x.label}</option>`).join('');
      mSel.value = monthOfValue(currentWeek);
      // 按所选月重建周下拉；当前值不在该月候选（历史遗留）时回退「整月」
      const v = fillWeekSelectForMonth(mSel.value, currentWeek);
      if (v && v !== currentWeek) currentWeek = v;
    } else {
      // 无月下拉（旧结构兜底）：周下拉保持全量平铺
      const sel = document.getElementById('week-select');
      if (sel) {
        sel.innerHTML = buildWeekOptions().join('');
        sel.value = currentWeek;
      }
    }
    const sisterSel = document.getElementById('sister-week-select');
    if (sisterSel) {
      sisterSel.innerHTML = buildWeekOptions().join('');
      sisterSel.value = dbWeeks[0] ? (dbWeeks[0].week_start + '|' + dbWeeks[0].week_end) : thisWeekValue;
    }
    const hallSel = document.getElementById('hall-week-select');
    if (hallSel) {
      hallSel.innerHTML = buildWeekOptions().join('');
      hallSel.value = dbWeeks[0] ? (dbWeeks[0].week_start + '|' + dbWeeks[0].week_end) : thisWeekValue;
    }
  } catch (e) { console.error('周列表加载失败:', e); }
}

// 概览页「先选月后选周」联动：按所选月重建周下拉（「整月」+ 与该月有交集的周），返回实际选中值
function fillWeekSelectForMonth(monthValue, preferValue) {
  const sel = document.getElementById('week-select');
  if (!sel) return preferValue || monthValue;
  const m = (window.wbMonths || []).find(x => x.value === monthValue);
  if (!m) return preferValue || monthValue;
  const opts = [`<option value="${m.value}">整月</option>`];
  (window.wbAllWeeks || []).forEach(w => {
    if (w.we >= m.ws && w.ws <= m.we) opts.push(`<option value="${w.value}">${w.label}</option>`);
  });
  sel.innerHTML = opts.join('');
  const want = preferValue || m.value;
  sel.value = want;
  if (sel.value !== want) sel.value = m.value; // 不在本月候选 → 回退整月
  return sel.value;
}

async function loadDetailTable(page = 1) {
  detailPage = page;
  const search = document.getElementById('detail-search').value;
  detailPerPage = parseInt(document.getElementById('detail-per-page').value) || 20;
  detailStatus = document.getElementById('detail-status').value;
  const detailReason = document.getElementById('detail-reason') ? document.getElementById('detail-reason').value : '';
  const daysVal = document.getElementById('detail-days') ? document.getElementById('detail-days').value : '';
  const daysRange = { '0-3': [0, 3], '4-7': [4, 7], '8-14': [8, 14], '15-30': [15, 30], '30+': [31, null] }[daysVal] || null;
  try {
    let sortParam = '';
    if (detailSortField) {
      sortParam = `&sort_field=${detailSortField}&sort_order=${detailSortOrder}`;
    }
    let daysParam = '';
    if (daysRange) {
      daysParam = `&days_min=${daysRange[0]}` + (daysRange[1] != null ? `&days_max=${daysRange[1]}` : '');
    }
    let dateParam = '';
    if (detailDateField && (detailDateMin || detailDateMax)) {
      dateParam = `&date_field=${detailDateField}` + (detailDateMin ? `&date_min=${detailDateMin}` : '') + (detailDateMax ? `&date_max=${detailDateMax}` : '');
    }
    const res = await fetch(API_BASE + `/api/detail-table?page=${page}&search=${encodeURIComponent(search)}&per_page=${detailPerPage}&status=${detailStatus}&reason=${encodeURIComponent(detailReason)}` + daysParam + dateParam + getHallParam() + sortParam);
    const result = await res.json();
    const rows = result.data || [];
    // 同一姐姐绑定多个妹妹时，合并成一大行（姐姐列 + 妹妹列 rowspan，妹妹名堆叠）
    const groups = [];
    rows.forEach(row => {
      const key = row.sister_uid ? 'u:' + row.sister_uid : 'r:' + row.team_id + ':' + groups.length;
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.rows.push(row);
      else groups.push({ key, rows: [row] });
    });
    const display = [];
    groups.forEach(g => g.rows.forEach((r, gi) => display.push({ row: r, group: g, gi })));
    _detailRows = display.map(d => d.row);
    document.getElementById('detail-table-body').innerHTML = display.map((d, i) => {
      const row = d.row, g = d.group, gi = d.gi, n = g.rows.length;
      const status = row.dissolve_date ? '已解散' : '进行中';
      const statusStyle = row.dissolve_date ? 'color:#D56060;' : 'color:#3D9A6C;';
      let sisterCell = '', sis2Cell = '';
      if (gi === 0) {
        sisterCell = `<td rowspan="${n}" style="vertical-align:middle;">${row.sister_nickname || '-'} (<a href="javascript:void(0)" onclick="event.stopPropagation();jumpToUID('${row.sister_uid || ''}', '${row.team_id || ''}')" style="color:#7C5CFF; text-decoration:none; cursor:pointer;">${row.sister_uid || '-'}</a>)</td>`;
        if (n > 1) {
          const stack = g.rows.map(r => `<span>${r.sister_nickname2 || '-'} (<a href="javascript:void(0)" onclick="event.stopPropagation();jumpToUID('${r.sister_uid2 || ''}', '${r.team_id || ''}')" style="color:#7C5CFF; text-decoration:none; cursor:pointer;">${r.sister_uid2 || '-'}</a>)</span>`).join('');
          sis2Cell = `<td rowspan="${n}" style="vertical-align:middle;"><span style="display:inline-flex;flex-direction:column;line-height:1.6;">${stack}</span></td>`;
        } else {
          sis2Cell = `<td>${row.sister_nickname2 || '-'} (<a href="javascript:void(0)" onclick="event.stopPropagation();jumpToUID('${row.sister_uid2 || ''}', '${row.team_id || ''}')" style="color:#7C5CFF; text-decoration:none; cursor:pointer;">${row.sister_uid2 || '-'}</a>)</td>`;
        }
      }
      return `<tr onclick="openTeamDetail(${i})" title="点击查看姐妹团详情" style="cursor:pointer;"><td><a href="javascript:void(0)" onclick="event.stopPropagation();openTeamDetail(${i})" style="color:#7C5CFF;text-decoration:none;cursor:pointer;font-weight:600;">#${row.team_id}</a></td><td>${row.form_date || '-'}</td><td>${row.hall_name || '-'}</td>${sisterCell}${sis2Cell}<td>${row.days_since_formed || 0}</td><td style="${statusStyle}">${status}</td><td>${row.dissolve_date || '-'}</td><td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${row.dissolve_reason || '-'}</td><td>¥${(row.reward_amount || 0).toFixed(1)}</td></tr>`;
    }).join('');
    
    // 分页渲染
    const totalPages = Math.ceil(result.total / result.per_page);
    let html = `<span style="font-size:13px;color:#666;margin-right:12px;">共 ${result.total} 条 · 第 ${page}/${totalPages} 页</span>`;
    if (page > 1) html += `<button onclick="loadDetailTable(1)">首页</button><button onclick="loadDetailTable(${page-1})">上一页</button>`;
    
    // 页码范围：当前页前后各2页
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);
    if (startPage > 1) html += `<button onclick="loadDetailTable(1)">1</button>${startPage > 2 ? '<span style="padding:6px;">...</span>' : ''}`;
    for (let i = startPage; i <= endPage; i++) {
      html += `<button class="${i === page ? 'active' : ''}" onclick="loadDetailTable(${i})">${i}</button>`;
    }
    if (endPage < totalPages) html += `${endPage < totalPages - 1 ? '<span style="padding:6px;">...</span>' : ''}<button onclick="loadDetailTable(${totalPages})">${totalPages}</button>`;
    
    if (page < totalPages) html += `<button onclick="loadDetailTable(${page+1})">下一页</button><button onclick="loadDetailTable(${totalPages})">末页</button>`;
    html += `<input type="number" id="goto-page" min="1" max="${totalPages}" placeholder="跳转到" style="width:60px;padding:4px 8px;border:1px solid #d9d9d9;border-radius:4px;font-size:13px;margin-left:8px;"><button onclick="const gp=parseInt(document.getElementById('goto-page').value);if(gp>=1&&gp<=${totalPages})loadDetailTable(gp);" style="margin-left:4px;">GO</button>`;
    document.getElementById('detail-pagination').innerHTML = html;
    const insEl = document.getElementById('detail-insight');
    if (insEl) {
      let filterNote = '';
      if (detailDateField && (detailDateMin || detailDateMax)) {
        const label = detailDateField === 'form_date' ? '成团日期' : '解散日期';
        const range = detailDateMin === detailDateMax ? detailDateMin : `${detailDateMin} ~ ${detailDateMax}`;
        filterNote = `<span style="color:#7C5CFF;"> · 已按${label} ${range} 过滤</span> <a href="javascript:void(0)" onclick="clearDateFilter()" style="color:#D56060;cursor:pointer;">清除</a>`;
      }
      insEl.innerHTML = `当前筛选共 <b>${result.total}</b> 条姐妹团记录${filterNote}。`;
    }
  } catch (e) { console.error('明细加载失败:', e); }
}

/* ── 姐妹团详情弹窗（明细表整行点击） ── */
let _detailRows = [];
let _tdSisterUid = '';
let _tdTeamId = '';

/* ── 日期下钻过滤（趋势图点数据点 → 按成团/解散日期过滤明细） ── */
let detailDateField = '';
let detailDateMin = '';
let detailDateMax = '';

function clearDateFilter() {
  detailDateField = '';
  detailDateMin = '';
  detailDateMax = '';
  loadDetailTable(1);
}

function renderTeamDetailModal(row) {
  _tdSisterUid = row.sister_uid || '';
  _tdTeamId = row.team_id || '';
  document.getElementById('td-team-id').textContent = '#' + (row.team_id || '-');
  const status = row.dissolve_date ? '已解散' : '进行中';
  const statusColor = row.dissolve_date ? '#D56060' : '#3D9A6C';
  const statusIcon = row.dissolve_date ? '✗' : '✓';
  document.getElementById('td-body').innerHTML = `
    <div class="team-detail-grid">
      <div class="team-detail-item"><span class="team-detail-label">大厅名称</span><span class="team-detail-value">${row.hall_name || '--'}</span></div>
      <div class="team-detail-item"><span class="team-detail-label">成团日期</span><span class="team-detail-value">${row.form_date || '--'}</span></div>
      <div class="team-detail-item"><span class="team-detail-label">已成团天数</span><span class="team-detail-value">${row.days_since_formed || 0} 天</span></div>
      <div class="team-detail-item"><span class="team-detail-label">奖励金额</span><span class="team-detail-value">¥${(row.reward_amount || 0).toLocaleString()}</span></div>
      <div class="team-detail-item"><span class="team-detail-label">状态</span><span class="team-detail-value" style="color:${statusColor};font-weight:600;">${statusIcon} ${status}${row.dissolve_date ? ' (' + row.dissolve_date + ')' : ''}</span></div>
      <div class="team-detail-item"><span class="team-detail-label">解散原因</span><span class="team-detail-value">${row.dissolve_reason || '—'}</span></div>
    </div>
    <div class="team-members">
      <div class="team-member"><div class="member-badge">姐</div><div class="member-info"><div class="member-name">${row.sister_nickname || '--'}</div><div class="member-uid">UID: <a href="javascript:void(0)" onclick="closeTeamDetail();jumpToUID('${row.sister_uid || ''}')" style="color:#7C5CFF;text-decoration:none;">${row.sister_uid || '--'}</a></div></div></div>
      <div class="team-member"><div class="member-badge" style="background:#f6a6c1;">妹</div><div class="member-info"><div class="member-name">${row.sister_nickname2 || '--'}</div><div class="member-uid">UID: <a href="javascript:void(0)" onclick="closeTeamDetail();jumpToUID('${row.sister_uid2 || ''}')" style="color:#7C5CFF;text-decoration:none;">${row.sister_uid2 || '--'}</a></div></div></div>
    </div>
    <div style="margin:14px 0 6px;font-size:12px;font-weight:600;color:var(--wb-text-1);">按周流水与牌子走势</div>
    <div class="rank-scroll"><table class="rank-table" style="min-width:0;">
      <thead><tr><th>周次</th><th>妹妹牌子</th><th>妹妹流水</th><th>姐姐牌子</th><th>姐姐流水</th><th>合计</th></tr></thead>
      <tbody id="td-weekly-body"><tr><td colspan="6" style="color:#9CA3AF;">加载中…</td></tr></tbody>
    </table></div>`;
  document.getElementById('team-detail-modal').classList.add('active');
  loadTeamWeekly(row.team_id);
}

async function loadTeamWeekly(teamId) {
  const body = document.getElementById('td-weekly-body');
  if (!body || !teamId) return;
  try {
    const res = await fetch(API_BASE + '/api/team/' + teamId + '/weekly');
    const d = await res.json();
    const wk = d.weekly || [];
    if (!wk.length) { body.innerHTML = '<tr><td colspan="6" style="color:#9CA3AF;">暂无按周流水数据</td></tr>'; return; }
    body.innerHTML = wk.map(w => `
      <tr>
        <td style="font-weight:600;">${w.week}</td>
        <td>${w.sister_max_level2 || '—'}</td>
        <td style="font-weight:600;">¥${(w.sister2_revenue || 0).toLocaleString()}</td>
        <td>${w.sister_level || '—'}</td>
        <td style="font-weight:600;">¥${(w.sister_revenue || 0).toLocaleString()}</td>
        <td style="font-weight:700;color:#7C5CFF;">¥${(w.total_revenue || 0).toLocaleString()}</td>
      </tr>`).join('');
  } catch (e) {
    body.innerHTML = '<tr><td colspan="6" style="color:#9CA3AF;">按周流水数据加载失败</td></tr>';
  }
}

function openTeamDetail(idx) {
  const row = _detailRows && _detailRows[idx];
  if (!row) return;
  renderTeamDetailModal(row);
}

function closeTeamDetail() {
  document.getElementById('team-detail-modal').classList.remove('active');
}

function tdGoUID() {
  if (_tdSisterUid) { closeTeamDetail(); jumpToUID(_tdSisterUid, _tdTeamId); }
}

async function checkCookieStatus() { refreshCookieStatus(); }

// 顶部 header 综合点 + 侧边栏底部「数据连接」状态灯，均由 keepalive 真实活性驱动
async function refreshCookieStatus() {
  let ka = null;
  try {
    const resp = await fetch(API_BASE + '/api/keepalive-status');
    ka = await resp.json();
  } catch (e) { console.log('保活状态获取失败:', e); }
  const lastRun = ka && ka.last_run ? ka.last_run.slice(11, 16) : '';
  const uid = ka && ka.uid;
  const big = ka && ka.bigdata;

  renderSideLight('uid', uid, lastRun);
  renderSideLight('bigdata', big, lastRun);

  const mainDot = document.getElementById('cookie-dot-main');
  const mainText = document.getElementById('cookie-text-main');
  if (mainDot && mainText) {
    if (uid && big && uid.ok && big.ok) {
      mainDot.className = 'cookie-dot valid'; mainText.textContent = 'Cookie 全部有效';
    } else if ((uid && !uid.ok) && (big && !big.ok)) {
      mainDot.className = 'cookie-dot invalid'; mainText.textContent = 'Cookie 失效 · 点击刷新';
    } else if (uid || big) {
      mainDot.className = 'cookie-dot unknown'; mainText.textContent = '部分 Cookie 失效';
    } else {
      mainDot.className = 'cookie-dot unknown'; mainText.textContent = 'Cookie 未检测';
    }
  }
}

function renderSideLight(key, info, lastRun) {
  const dot = document.getElementById('ss-dot-' + key);
  const txt = document.getElementById('ss-' + key + '-txt');
  if (!dot) return;
  let cls = 'unknown', label = '检测中…';
  if (info) {
    if (info.ok) { cls = 'ok'; label = '有效' + (lastRun ? ' · ' + lastRun + ' 保活' : ''); }
    else { cls = 'bad'; label = '失效 · 自动重登中'; }
  }
  dot.className = 'ss-dot ' + cls;
  if (txt) txt.textContent = label;
}

async function updateCookiePanelStatus() {
  let ka = null;
  try {
    const resp = await fetch(API_BASE + '/api/keepalive-status');
    ka = await resp.json();
  } catch (e) { console.log('保活状态获取失败:', e); }
  const lastRun = ka && ka.last_run ? ka.last_run.slice(11, 16) : '';

  renderPanelStatus('uid', ka && ka.uid, lastRun);
  renderPanelStatus('bigdata', ka && ka.bigdata, lastRun);
}

function renderPanelStatus(key, info, lastRun) {
  const dot = document.getElementById('panel-dot-' + key);
  const status = document.getElementById('panel-status-' + key);
  if (!dot || !status) return;
  const label = key === 'uid' ? 'UID 查询' : '数据抓取';
  if (info) {
    if (info.ok) {
      dot.style.background = '#3D9A6C';
      status.textContent = label + ' Cookie 有效' + (lastRun ? ' · ' + lastRun + ' 保活' : '');
    } else {
      dot.style.background = '#D56060';
      status.textContent = label + ' Cookie 失效，自动重登中（可点「立即刷新」兜底）';
    }
  } else {
    dot.style.background = '#C98A2D';
    status.textContent = label + ' Cookie 未检测';
  }
}

// ── Toast 轻提示（替代 alert，用于 Cookie 刷新等非阻断反馈） ──
function showToast(message, type = 'info', duration = 3200) {
  let wrap = document.getElementById('wb-toast');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'wb-toast';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = 'wb-toast-item ' + (type || 'info');
  const txt = document.createElement('span');
  txt.className = 'wb-toast-txt';
  txt.textContent = message;
  el.appendChild(txt);
  wrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 260);
  }, duration);
}

async function manualRefreshCookie(target) {
  const label = target === 'bigdata' ? '数据抓取' : target === 'uid' ? 'UID查询' : '全部';
  const btn = document.getElementById('refresh-btn-' + target);
  if (btn) { btn.disabled = true; btn.textContent = '重登中…（OCR 验证码，约 10~30 秒）'; }
  try {
    const resp = await fetch(API_BASE + '/api/cookie/auto-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: target })
    });
    const data = await resp.json();
    await refreshCookieStatus();
    updateCookiePanelStatus();
    if (data.error) {
      showToast('自动重登失败：' + data.error, 'error');
    } else {
      const ka = data.keepalive || {};
      const parts = [];
      if (ka.uid) parts.push('UID查询 ' + (ka.uid.ok ? '有效' : (ka.uid.msg || '失效')));
      if (ka.bigdata) parts.push('数据抓取 ' + (ka.bigdata.ok ? '有效' : (ka.bigdata.msg || '失效')));
      showToast('自动重登「' + label + '」完成\n' + (parts.join(' · ') || '已刷新'), 'success');
    }
  } catch (e) {
    showToast('请求失败: ' + (e.message || '请确认后端已启动'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '立即刷新（自动重登）'; }
  }
}

async function saveCookie(target) {
  const inputId = target === 'bigdata' ? 'cookie-input-bigdata' : 'cookie-input-uid';
  const cookieStr = document.getElementById(inputId).value.trim();
  if (!cookieStr) { showToast('请输入 Cookie', 'error'); return; }
  if (!cookieStr.includes('PHPSESSID')) { showToast('Cookie 格式不正确，缺少 PHPSESSID', 'error'); return; }

  const endpoint = target === 'bigdata' ? '/api/cookie/bigdata' : '/api/cookie';
  const label = target === 'bigdata' ? '数据抓取' : 'UID查询';

  try {
    const resp = await fetch(API_BASE + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie_str: cookieStr })
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      if (resp.status === 404) {
        showToast('后端接口不存在 (404)，请确认后端已重启并加载最新代码', 'error');
      } else {
        showToast('服务器错误 (' + resp.status + '): ' + text.substring(0, 200), 'error');
      }
      return;
    }
    const data = await resp.json();
    if (data.success) {
      showToast(label + ' Cookie 更新成功！', 'success');
      document.getElementById(inputId).value = '';
      checkCookieStatus();
      updateCookiePanelStatus();
    } else {
      showToast('更新失败: ' + (data.error || '未知错误'), 'error');
    }
  } catch (e) {
    showToast('网络请求失败: ' + (e.message || '请确认后端服务已启动'), 'error');
  }
}

async function loadLastUpdate() {
  try {
    const res = await fetch(API_BASE + '/api/last-update');
    const data = await res.json();
    const el = document.getElementById('last-update');
    if (data.last_update) {
      el.textContent = '上次更新：' + data.last_update;
      el.style.color = data.status === 'success' ? '#3D9A6C' : data.status === 'failed' ? '#D56060' : '';
      // 数据新鲜度色点：>24h 黄、>48h 红
      const wrap = el.closest('.fresh');
      if (wrap) {
        const t = new Date(String(data.last_update).replace(' ', 'T'));
        if (!isNaN(t)) {
          const hours = (Date.now() - t.getTime()) / 36e5;
          wrap.classList.toggle('stale', hours > 24 && hours <= 48);
          wrap.classList.toggle('dead', hours > 48);
        }
      }
    } else {
      el.textContent = '上次更新：--';
    }
  } catch (e) { console.error('加载更新时间失败:', e); }
}

let _suggestTimer = null;

async function loadSearchSuggestions(keyword) {
  const box = document.getElementById('search-suggest');
  if (!keyword || keyword.length < 1) {
    box.style.display = 'none';
    return;
  }
  try {
    const res = await fetch(API_BASE + '/api/search-suggest?keyword=' + encodeURIComponent(keyword));
    const result = await res.json();
    const data = result.data || [];
    if (data.length === 0) {
      box.innerHTML = '<div class="search-suggest-empty">无匹配结果</div>';
      box.style.display = 'block';
      return;
    }
    box.innerHTML = data.map(item => {
      const tagClass = 'role-' + (item.role || '其他');
      const meta = item.uid ? `UID:${item.uid}` : (item.hall || '');
      return `<div class="search-suggest-item" onclick="selectSearchSuggest('${item.name.replace(/'/g, "\\'")}')">
        <span class="suggest-name">${item.name}</span>
        <span class="suggest-meta">${meta}<span class="suggest-tag ${tagClass}">${item.role}</span></span>
      </div>`;
    }).join('');
    box.style.display = 'block';
  } catch (e) { console.error('搜索建议加载失败:', e); }
}

function selectSearchSuggest(name) {
  const input = document.getElementById('detail-search');
  input.value = name;
  document.getElementById('search-suggest').style.display = 'none';
  loadDetailTable(1);
}

async function loadUIDTypes() {
  try {
    const res = await fetch(API_BASE + '/api/uid-query/types');
    const d = await res.json();
    const types = d.types || [];
    if (!types.length) return;
    const sel = document.getElementById('uid-type');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = types.map(t => `<option value="${t.key}">${t.label}</option>`).join('');
    if (types.some(t => t.key === cur)) sel.value = cur;
  } catch (e) { console.error('UID类型加载失败:', e); }
}

// ========== 全局 401 拦截 ==========
(function() {
  const originalFetch = window.fetch;
  window.fetch = function(url, options) {
    return originalFetch(url, options).then(function(response) {
      if (response.status === 401) {
        // 延迟跳转，避免并发请求导致多次跳转
        if (!window._authRedirecting) {
          window._authRedirecting = true;
          setTimeout(function() {
            window.location.href = '/login.html';
          }, 100);
        }
      }
      return response;
    });
  };
})();
