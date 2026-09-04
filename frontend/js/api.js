let _hallListRole = 'admin';

async function loadHalls() {
  try {
    const res = await fetch(API_BASE + '/api/halls');
    const result = await res.json();
    const role = result.role || 'admin';
    _hallListRole = role;
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
      syncFilterCombobox(sel);
    }
  } catch (e) { console.error('大厅列表加载失败:', e); }
}

async function loadHallGroups() {
  try {
    const res = await fetch(API_BASE + '/api/hall-groups');
    const d = await res.json();
    _hallGroupTypes = d.types || [];
    renderTypeSelect();
    syncHierarchyFromHall(currentHall);
  } catch (e) { console.error('组大厅层级加载失败:', e); }
}

// 搜索栏三级联动：类型 → 组 → 大厅。
// 同时支持从大厅/组反查父级，供用户跳级选择时自动补齐上层。
function findHallHierarchy(hall) {
  if (!hall || hall === 'all') return null;
  for (const typeItem of _hallGroupTypes) {
    for (const groupItem of (typeItem.groups || [])) {
      if ((groupItem.halls || []).includes(hall)) {
        return { type: typeItem.type, group: groupItem.group, hall };
      }
    }
  }
  return null;
}

function findGroupHierarchy(group, preferredType) {
  if (!group || group === 'all') return null;
  const orderedTypes = preferredType && preferredType !== 'all'
    ? [
        ..._hallGroupTypes.filter(t => t.type === preferredType),
        ..._hallGroupTypes.filter(t => t.type !== preferredType),
      ]
    : _hallGroupTypes;
  for (const typeItem of orderedTypes) {
    if ((typeItem.groups || []).some(g => g.group === group)) {
      return { type: typeItem.type, group };
    }
  }
  return null;
}

function renderTypeSelect(selectedType = 'all') {
  const sel = document.getElementById('type-select');
  if (!sel) return;
  const esc = h => String(h).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  sel.innerHTML = '<option value="all">全部类型</option>' +
    _hallGroupTypes.map(t => `<option value="${esc(t.type)}">${esc(t.type)}</option>`).join('');
  sel.value = _hallGroupTypes.some(t => t.type === selectedType) ? selectedType : 'all';
  syncFilterCombobox(sel);
  renderGroupSelect();
}
function renderGroupSelect(selectedGroup = 'all', selectedHall = currentHall) {
  const sel = document.getElementById('group-select');
  if (!sel) return;
  const esc = h => String(h).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const type = (document.getElementById('type-select') || {}).value;
  const groupEntries = type === 'all'
    ? _hallGroupTypes.flatMap(t => (t.groups || []).map(g => ({ ...g, parentType: t.type })))
    : (((_hallGroupTypes.find(t => t.type === type) || {}).groups || [])
        .map(g => ({ ...g, parentType: type })));
  sel.innerHTML = '<option value="all">全部组</option>' +
    groupEntries.map(g => `<option value="${esc(g.group)}" data-type="${esc(g.parentType)}">${esc(g.group)}</option>`).join('');
  const matchingOption = Array.from(sel.options).find(option =>
    option.value === selectedGroup && (type === 'all' || option.dataset.type === type));
  sel.value = matchingOption ? selectedGroup : 'all';
  if (matchingOption) matchingOption.selected = true;
  syncFilterCombobox(sel);
  renderHallSelectByGroup(selectedHall);
}
function renderHallSelectByGroup(selectedHall = currentHall) {
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
    const configuredHalls = [...new Set(groups.flatMap(g => g.halls || []))];
    halls = allHalls.length || _hallListRole !== 'admin' ? allHalls : configuredHalls;
  }
  sel.innerHTML = '<option value="all">全部大厅</option>' +
    halls.map(h => `<option value="${esc(h)}">${esc(h)}</option>`).join('');
  sel.value = (selectedHall && halls.includes(selectedHall)) ? selectedHall : 'all';
  syncFilterCombobox(sel);
}

function syncHierarchyFromHall(hall) {
  const hallSel = document.getElementById('hall-select');
  if (!hall || hall === 'all') {
    if (hallSel) hallSel.value = 'all';
    syncFilterCombobox(hallSel);
    return false;
  }
  const hierarchy = findHallHierarchy(hall);
  if (!hierarchy) {
    if (hallSel) hallSel.value = hall;
    return false;
  }
  const typeSel = document.getElementById('type-select');
  if (typeSel) typeSel.value = hierarchy.type;
  syncFilterCombobox(typeSel);
  renderGroupSelect(hierarchy.group, hall);
  return true;
}

function resetHallHierarchy() {
  const typeSel = document.getElementById('type-select');
  if (typeSel) typeSel.value = 'all';
  syncFilterCombobox(typeSel);
  renderGroupSelect('all', 'all');
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

/* ─────────── 明细表「生命周期方框」：30 天 = 4 周，1 方框 = 1 周，点击看该周数据 ─────────── */
const _lwCache = {};  // team_id -> /api/team/<id>/life-weeks 返回

function _lwParseDate(s) {
  if (!s) return null;
  s = String(s).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : null; // 老格式'07-15星期三'不猜，按完整周期处理
}

// 4 个方框（第1~4周）+ 天数：实心=已经历的周，描边高亮=当前周，灰色=未经历（已结束）
function lwSquaresHtml(row) {
  const d = row.days_since_formed || 0;
  let lifeDays = d;
  if (row.dissolve_date) {
    const f = _lwParseDate(row.form_date), dd = _lwParseDate(row.dissolve_date);
    lifeDays = (f && dd) ? Math.round((dd - f) / 864e5) + 1 : 30;
  }
  const endWeek = Math.min(4, Math.ceil(Math.max(lifeDays, 1) / 7)); // 生命覆盖到最后一周
  const isActive = !row.dissolve_date;
  let out = '<span class="lw-strip" title="4 个方框 = 30 天生命周期的 4 周，点击查看该周数据">';
  for (let i = 1; i <= 4; i++) {
    let cls, click = '', tip;
    if (i < endWeek) {
      cls = 'done'; tip = `第${i}周 · 已结束，点击查看该周数据`;
    } else if (i === endWeek) {
      if (isActive && lifeDays <= 30) { cls = 'current'; tip = `第${i}周 · 本周进行中，点击查看该周数据`; }
      else { cls = 'done end'; tip = `第${i}周 · 生命最后一周，点击查看该周数据`; }
    } else {
      if (isActive) { cls = 'todo'; tip = `第${i}周 · 未开始`; }
      else { cls = 'ended'; tip = '未经历（团已结束）'; }
    }
    if (cls !== 'ended' && cls !== 'todo') click = ` onclick="event.stopPropagation();lwShow(event,${row.team_id},${i})"`;
    out += `<span class="lw-sq ${cls}"${click} title="${tip}"></span>`;
  }
  out += `</span><span class="lw-days">${d} 天</span>`;
  return out;
}

function lwClose() {
  const p = document.getElementById('lw-popover');
  if (p) p.remove();
}
document.addEventListener('click', e => {
  const p = document.getElementById('lw-popover');
  if (p && !p.contains(e.target)) lwClose();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') lwClose(); });
// 滚动即收起弹层（capture 覆盖表格等嵌套滚动容器）
document.addEventListener('scroll', lwClose, true);
window.addEventListener('resize', lwClose);

function _lwMoney(v) { return v == null ? '—' : '¥' + Number(v).toFixed(1); }

async function lwShow(ev, teamId, idx) {
  ev.stopPropagation();
  lwClose();
  const pop = document.createElement('div');
  pop.className = 'lw-popover';
  pop.id = 'lw-popover';
  pop.innerHTML = '<div class="lw-pop-loading">加载中…</div>';
  document.body.appendChild(pop);
  // 定位：优先点击处右下方；实测弹层高度，底部溢出则翻转到上方，左右防溢出
  const place = () => {
    const pw = pop.offsetWidth || 250, ph = pop.offsetHeight || 120;
    let left = Math.max(8, Math.min(ev.clientX, window.innerWidth - pw - 12));
    let top = ev.clientY + 8;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, ev.clientY - ph - 8);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  };
  place();
  try {
    if (!_lwCache[teamId]) {
      const res = await fetch(API_BASE + `/api/team/${teamId}/life-weeks`);
      _lwCache[teamId] = await res.json();
    }
    const d = _lwCache[teamId];
    const w = (d.weeks || []).find(x => x.idx === idx);
    if (!w || w.state === 'future') { pop.innerHTML = '<div class="lw-pop-loading">该周尚未开始</div>'; place(); return; }
    if (w.state === 'gone') { pop.innerHTML = `<div class="lw-pop-loading">第 ${idx} 周未经历 · 团已于 ${d.dissolve_date || '—'} ${d.dissolve_reason === '毕业' ? '毕业' : '解散'}</div>`; place(); return; }
    const stateTag = w.state === 'dissolved'
      ? `<span class="lw-tag end">${(d.dissolve_reason === '毕业' ? '该周毕业' : '该周解散')}</span>`
      : w.state === 'current' ? '<span class="lw-tag cur">进行中</span>' : '<span class="lw-tag">已结束</span>';
    const fmtD = s => (s || '').slice(5).replace('-', '/');
    pop.innerHTML = `
      <div class="lw-pop-head">#${d.team_id} ${d.sister_nickname || ''} × ${d.sister_nickname2 || ''}</div>
      <div class="lw-pop-sub">第 ${w.idx} 周 · ${fmtD(w.start)} ~ ${fmtD(w.end)} ${stateTag}</div>
      <div class="lw-pop-grid">
        <span>妹妹周流水</span><b>${w.sister2_revenue == null ? '—' : (w.sis2_partial ? '≈' : '') + _lwMoney(w.sister2_revenue)}</b>
        <span>姐姐周流水</span><b>${w.sister_revenue == null ? '—' : '≈' + _lwMoney(w.sister_revenue)}</b>
        <span>妹妹累计流水</span><b>${_lwMoney(w.sister2_cum)}</b>
        <span>姐姐累计流水</span><b>${w.sister_cum == null ? '—' : '≈' + _lwMoney(w.sister_cum)}</b>
        <span>任务活跃</span><b>${w.tasks == null ? '—' : (w.tasks_partial ? '≈+' : '+') + w.tasks}</b>
        <span>姐姐牌子</span><b>${w.sister_level || '—'}</b>
        <span>妹妹最高牌子</span><b>${w.sister_max_level2 || '—'}</b>
      </div>
      ${w.state === 'dissolved' && d.dissolve_reason ? `<div class="lw-pop-foot">结束原因：${d.dissolve_reason}</div>` : ''}
      ${(w.sister_revenue != null || w.sister_cum != null || w.sis2_partial || w.tasks_partial) ? '<div class="lw-pop-foot">≈ 为自然周折算或快照缺口的估算值；周流水严格限定在该周时间范围内</div>' : ''}
      <button class="lw-pop-more" onclick="lwOpenDetail(${d.team_id},${w.idx})">查看团队完整明细 →</button>`;
    place();  // 内容渲染后按实测高度重新定位（防底部溢出）
  } catch (e) {
    pop.innerHTML = '<div class="lw-pop-loading">加载失败，请重试</div>';
    place();
  }
}

// 方框弹层 → 团队完整明细弹窗（按 team_id 找回明细行索引，并聚焦当前周）
function lwOpenDetail(teamId, weekIdx) {
  lwClose();
  const idx = (_detailRows || []).findIndex(r => String(r.team_id) === String(teamId));
  if (idx >= 0) openTeamDetail(idx, weekIdx || 0);
}

// 保护期结束时间显示：3 天内到期橙色加粗，已过期灰色标注
function fmtProtection(pe) {
  const d = (pe || '').slice(0, 10);
  if (!d) return '<span style="color:#C4C9D1;">—</span>';
  const left = Math.ceil((new Date(d + 'T00:00:00') - Date.now()) / 864e5);
  if (left < 0) return `<span style="color:#9CA3AF;">${d}（已过）</span>`;
  if (left <= 3) return `<span style="color:#D97706;font-weight:600;" title="保护期 ${left} 天后到期">${d}</span>`;
  return d;
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
        const leadBadge = n > 1 ? `<span class="sis-lead-cnt" title="该姐姐同时带 ${n} 个妹妹">×${n}</span>` : '';
        sisterCell = `<td rowspan="${n}" class="sis-lead-cell"><span class="sis-lead-name">${row.sister_nickname || '-'}</span> (<a href="javascript:void(0)" onclick="event.stopPropagation();jumpToUID('${row.sister_uid || ''}', '${row.team_id || ''}')" style="color:#7C5CFF; text-decoration:none; cursor:pointer;">${row.sister_uid || '-'}</a>)${leadBadge}</td>`;
        if (n > 1) {
          const stack = g.rows.map(r => `<span class="sis-chip">${r.sister_nickname2 || '-'} (<a href="javascript:void(0)" onclick="event.stopPropagation();jumpToUID('${r.sister_uid2 || ''}', '${r.team_id || ''}')" style="color:#7C5CFF; text-decoration:none; cursor:pointer;">${r.sister_uid2 || '-'}</a>)</span>`).join('');
          sis2Cell = `<td rowspan="${n}" style="vertical-align:middle;"><span class="sis-stack">${stack}</span></td>`;
        } else {
          sis2Cell = `<td>${row.sister_nickname2 || '-'} (<a href="javascript:void(0)" onclick="event.stopPropagation();jumpToUID('${row.sister_uid2 || ''}', '${row.team_id || ''}')" style="color:#7C5CFF; text-decoration:none; cursor:pointer;">${row.sister_uid2 || '-'}</a>)</td>`;
        }
      }
      return `<tr><td style="font-weight:600;color:var(--wb-text);">#${row.team_id}</td><td>${row.form_date || '-'}</td><td>${row.hall_name || '-'}</td>${sisterCell}${sis2Cell}<td style="white-space:nowrap;">${fmtProtection(row.protection_end)}</td><td style="white-space:nowrap;">${lwSquaresHtml(row)}</td><td style="${statusStyle}">${status}</td><td>${row.dissolve_date || '-'}</td><td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${row.dissolve_reason || ''}">${row.dissolve_reason || '-'}</td></tr>`;
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
let _tdFocusWeek = 0;  // 从方框弹层进入时聚焦的周（0=全部）

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

function renderTeamDetailModal(row, focusWeek) {
  _tdSisterUid = row.sister_uid || '';
  _tdTeamId = row.team_id || '';
  _tdFocusWeek = focusWeek || 0;
  document.getElementById('td-team-id').textContent = '#' + (row.team_id || '-');
  const status = row.dissolve_date ? '已解散' : '进行中';
  const statusColor = row.dissolve_date ? '#D56060' : '#3D9A6C';
  const statusIcon = row.dissolve_date ? '✗' : '✓';
  document.getElementById('td-body').innerHTML = `
    <div class="team-detail-grid">
      <div class="team-detail-item"><span class="team-detail-label">大厅名称</span><span class="team-detail-value">${row.hall_name || '--'}</span></div>
      <div class="team-detail-item"><span class="team-detail-label">成团日期</span><span class="team-detail-value">${row.form_date || '--'}</span></div>
      <div class="team-detail-item"><span class="team-detail-label">已成团天数</span><span class="team-detail-value">${row.days_since_formed || 0} 天</span></div>
      <div class="team-detail-item"><span class="team-detail-label">妹妹累计流水</span><span class="team-detail-value" id="td-sis2-cum">…</span></div>
      <div class="team-detail-item"><span class="team-detail-label">姐姐累计流水</span><span class="team-detail-value" id="td-sis-cum">…</span></div>
      <div class="team-detail-item"><span class="team-detail-label">状态</span><span class="team-detail-value" style="color:${statusColor};font-weight:600;">${statusIcon} ${status}${row.dissolve_date ? ' (' + row.dissolve_date + ')' : ''}</span></div>
      <div class="team-detail-item"><span class="team-detail-label">解散原因</span><span class="team-detail-value">${row.dissolve_reason || '—'}</span></div>
    </div>
    <div class="team-members">
      <div class="team-member"><div class="member-badge">姐</div><div class="member-info"><div class="member-name">${row.sister_nickname || '--'}</div><div class="member-uid">UID: <a href="javascript:void(0)" onclick="closeTeamDetail();jumpToUID('${row.sister_uid || ''}')" style="color:#7C5CFF;text-decoration:none;">${row.sister_uid || '--'}</a></div></div></div>
      <div class="team-member"><div class="member-badge" style="background:#f6a6c1;">妹</div><div class="member-info"><div class="member-name">${row.sister_nickname2 || '--'}</div><div class="member-uid">UID: <a href="javascript:void(0)" onclick="closeTeamDetail();jumpToUID('${row.sister_uid2 || ''}')" style="color:#7C5CFF;text-decoration:none;">${row.sister_uid2 || '--'}</a></div></div></div>
    </div>
    <div style="margin:14px 0 6px;font-size:12px;font-weight:600;color:var(--wb-text-1);"><span id="td-weekly-title">按周流水与牌子走势（成团第 1~4 周）</span>${focusWeek ? ' <a id="td-weekly-all" href="javascript:void(0)" onclick="lwShowAllWeeks()" style="color:#7C5CFF;text-decoration:none;font-weight:400;">查看全部周 →</a>' : ''}</div>
    <div class="rank-scroll"><table class="rank-table" style="min-width:0;">
      <thead><tr><th>周次</th><th>妹妹牌子</th><th>妹妹周流水</th><th>姐姐牌子</th><th>姐姐周流水</th><th>任务活跃</th></tr></thead>
      <tbody id="td-weekly-body"><tr><td colspan="6" style="color:#9CA3AF;">加载中…</td></tr></tbody>
    </table></div>`;
  if (focusWeek) {
    const t = document.getElementById('td-weekly-title');
    if (t) t.textContent = `第 ${focusWeek} 周数据`;
  }
  document.getElementById('team-detail-modal').classList.add('active');
  loadTeamWeekly(row.team_id);
}

// 「查看全部周」：清除单周聚焦，重渲染周表
function lwShowAllWeeks() {
  _tdFocusWeek = 0;
  const t = document.getElementById('td-weekly-title');
  if (t) t.textContent = '按周流水与牌子走势（成团第 1~4 周）';
  const a = document.getElementById('td-weekly-all');
  if (a) a.style.display = 'none';
  loadTeamWeekly(_tdTeamId);
}

async function loadTeamWeekly(teamId) {
  const body = document.getElementById('td-weekly-body');
  if (!body || !teamId) return;
  try {
    if (!_lwCache[teamId]) {
      const res = await fetch(API_BASE + '/api/team/' + teamId + '/life-weeks');
      _lwCache[teamId] = await res.json();
    }
    const d = _lwCache[teamId];
    const all = d.weeks || [];
    // 顶部累计流水卡（截至最新有数据的周）
    const lastCum2 = [...all].reverse().find(w => w.sister2_cum != null);
    const lastCum1 = [...all].reverse().find(w => w.sister_cum != null);
    const el2 = document.getElementById('td-sis2-cum');
    if (el2) el2.textContent = lastCum2 ? '¥' + lastCum2.sister2_cum.toLocaleString() : '—';
    const el1 = document.getElementById('td-sis-cum');
    if (el1) el1.textContent = lastCum1 ? '≈¥' + lastCum1.sister_cum.toLocaleString() : '—';
    // 周表：默认全部有数据的周；从方框进入时只显示点击的当周
    let ws = all.filter(w => w.has_data);
    if (_tdFocusWeek) ws = ws.filter(w => w.idx === _tdFocusWeek);
    if (!ws.length) { body.innerHTML = '<tr><td colspan="6" style="color:#9CA3AF;">暂无周数据</td></tr>'; return; }
    body.innerHTML = ws.map(w => `
      <tr>
        <td style="font-weight:600;">第${w.idx}周 <span style="color:#9CA3AF;font-weight:400;">${(w.start || '').slice(5).replace('-', '/')}~${(w.end || '').slice(5).replace('-', '/')}</span></td>
        <td>${w.sister_max_level2 || '—'}</td>
        <td style="font-weight:600;">${w.sister2_revenue == null ? '—' : (w.sis2_partial ? '≈' : '') + '¥' + w.sister2_revenue.toLocaleString()}</td>
        <td>${w.sister_level || '—'}</td>
        <td style="font-weight:600;">${w.sister_revenue == null ? '—' : '≈¥' + w.sister_revenue.toLocaleString()}</td>
        <td>${w.tasks == null ? '—' : '+' + w.tasks}</td>
      </tr>`).join('');
  } catch (e) {
    body.innerHTML = '<tr><td colspan="6" style="color:#9CA3AF;">周数据加载失败</td></tr>';
  }
}

function openTeamDetail(idx, focusWeek) {
  const row = _detailRows && _detailRows[idx];
  if (!row) return;
  renderTeamDetailModal(row, focusWeek);
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
