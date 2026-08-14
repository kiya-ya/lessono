async function loadHalls() {
  try {
    const res = await fetch(API_BASE + '/api/halls');
    const result = await res.json();
    const select = document.getElementById('hall-select');
    if (!select) return;

    select.innerHTML = '';
    const role = result.role || 'admin';
    const halls = result.data || [];

    if (role === 'admin') {
      const opt = document.createElement('option');
      opt.value = 'all';
      opt.textContent = '全部大厅';
      select.appendChild(opt);
    } else {
      // hall_manager: 添加「所有大厅」选项（可查看全平台155个厅）
      const optAll = document.createElement('option');
      optAll.value = 'all';
      optAll.textContent = '所有大厅';
      select.appendChild(optAll);
    }

    halls.forEach(hall => {
      const opt = document.createElement('option');
      opt.value = hall;
      opt.textContent = hall;
      select.appendChild(opt);
    });

    // 厅运营默认选中第一个具体厅
    if (role === 'hall_manager' && halls.length > 0) {
      select.value = halls[0];
      currentHall = halls[0];
    }

    // 恢复上次选择的大厅（localStorage）
    const savedHall = localStorage.getItem('wb_hall');
    if (savedHall && [...select.options].some(o => o.value === savedHall)) {
      select.value = savedHall;
      currentHall = savedHall;
    }
  } catch (e) { console.error('大厅列表加载失败:', e); }
}
async function loadWeeks() {
  try {
    const res = await fetch(API_BASE + '/api/weekly-report?limit=all');
    const result = await res.json();
    const select = document.getElementById('week-select');
    select.innerHTML = '';
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

    // 如果数据库不包含本周，先插一个「本周·收集中」选项
    const hasThisWeek = dbWeeks.some(w => w.week_start === thisWeekStart);
    const weeks = [];
    if (!hasThisWeek) {
      weeks.push({ week_start: thisWeekStart, week_end: thisWeekEnd, _labelSuffix: '（本周·收集中）' });
    }
    weeks.push(...dbWeeks);

    weeks.forEach((w, idx) => {
      const opt = document.createElement('option');
      opt.value = w.week_start + '|' + w.week_end;
      opt.textContent = w.week_start + ' ~ ' + w.week_end + (w._labelSuffix || '');
      if (idx === 0) {
        opt.selected = true;
        currentWeek = opt.value;
      }
      select.appendChild(opt);
    });

    // 恢复上次选择的周（localStorage）
    const savedWeek = localStorage.getItem('wb_week');
    if (savedWeek && [...select.options].some(o => o.value === savedWeek)) {
      select.value = savedWeek;
      currentWeek = savedWeek;
    }
  } catch (e) { console.error('周列表加载失败:', e); }
}
async function loadDetailTable(page = 1) {
  detailPage = page;
  const search = document.getElementById('detail-search').value;
  detailPerPage = parseInt(document.getElementById('detail-per-page').value) || 20;
  detailStatus = document.getElementById('detail-status').value;
  try {
    let sortParam = '';
    if (detailSortField) {
      sortParam = `&sort_field=${detailSortField}&sort_order=${detailSortOrder}`;
    }
    const res = await fetch(API_BASE + `/api/detail-table?page=${page}&search=${encodeURIComponent(search)}&per_page=${detailPerPage}&status=${detailStatus}` + getHallParam() + sortParam);
    const result = await res.json();
    document.getElementById('detail-table-body').innerHTML = result.data.map(row => {
      const status = row.dissolve_date ? '已解散' : '进行中';
      const statusStyle = row.dissolve_date ? 'color:#D56060;' : 'color:#3D9A6C;';
      return `<tr><td>${row.team_id}</td><td>${row.form_date || '-'}</td><td>${row.hall_name || '-'}</td>
      <td>${row.sister_nickname || '-'} (<a href="javascript:void(0)" onclick="jumpToUID('${row.sister_uid || ''}', '${row.team_id || ''}')" style="color:#4F5BD5; text-decoration:none; cursor:pointer;">${row.sister_uid || '-'}</a>)</td>
      <td>${row.sister_nickname2 || '-'} (<a href="javascript:void(0)" onclick="jumpToUID('${row.sister_uid2 || ''}', '${row.team_id || ''}')" style="color:#4F5BD5; text-decoration:none; cursor:pointer;">${row.sister_uid2 || '-'}</a>)</td>
      <td>${row.days_since_formed || 0}</td>
      <td>¥${(row.reward_amount || 0).toFixed(1)}</td><td style="${statusStyle}">${status}</td><td>${row.dissolve_date || '-'}</td></tr>`;
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
    if (insEl) insEl.innerHTML = `当前筛选共 <b>${result.total}</b> 条姐妹团记录。`;
  } catch (e) { console.error('明细加载失败:', e); }
}

async function checkCookieStatus() {
  let uidOk = false, bigOk = false;
  let uidStatus = 'unknown', bigStatus = 'unknown';

  try {
    const resp1 = await fetch(API_BASE + '/api/cookie');
    const data1 = await resp1.json();
    uidOk = data1.status === 'valid';
    uidStatus = data1.status;
  } catch (e) { console.log('UID Cookie 检测失败:', e); }

  try {
    const resp2 = await fetch(API_BASE + '/api/cookie/bigdata');
    const data2 = await resp2.json();
    bigOk = data2.status === 'valid';
    bigStatus = data2.status;
  } catch (e) { console.log('抓取 Cookie 检测失败:', e); }

  // 综合状态显示在 header 按钮上
  const mainDot = document.getElementById('cookie-dot-main');
  const mainText = document.getElementById('cookie-text-main');
  if (uidOk && bigOk) {
    mainDot.className = 'cookie-dot valid'; mainText.textContent = 'Cookie 全部有效';
  } else if (!uidOk && !bigOk) {
    mainDot.className = 'cookie-dot invalid'; mainText.textContent = 'Cookie 全部无效';
  } else {
    mainDot.className = 'cookie-dot unknown'; mainText.textContent = '部分 Cookie 需更新';
  }

  // 缓存状态供弹窗使用
  window._cookieStatus = { uid: uidStatus, bigdata: bigStatus };
}

async function updateCookiePanelStatus() {
  try {
    const resp1 = await fetch(API_BASE + '/api/cookie');
    const data1 = await resp1.json();
    const dot1 = document.getElementById('panel-dot-uid');
    const status1 = document.getElementById('panel-status-uid');
    if (data1.status === 'valid') {
      dot1.style.background = '#3D9A6C'; status1.textContent = '✅ 状态：有效（' + (data1.updated_at || '未知') + ' 更新）';
    } else if (data1.status === 'invalid') {
      dot1.style.background = '#D56060'; status1.textContent = '❌ 状态：无效，请重新粘贴';
    } else {
      dot1.style.background = '#C98A2D'; status1.textContent = '⚠️ 状态：未知';
    }
  } catch (e) { console.log('UID panel 检测失败:', e); }

  try {
    const resp2 = await fetch(API_BASE + '/api/cookie/bigdata');
    const data2 = await resp2.json();
    const dot2 = document.getElementById('panel-dot-bigdata');
    const status2 = document.getElementById('panel-status-bigdata');
    if (data2.status === 'valid') {
      dot2.style.background = '#3D9A6C'; status2.textContent = '✅ 状态：有效（' + (data2.updated_at || '未知') + ' 更新）';
    } else if (data2.status === 'invalid') {
      dot2.style.background = '#D56060'; status2.textContent = '❌ 状态：无效，请重新粘贴';
    } else {
      dot2.style.background = '#C98A2D'; status2.textContent = '⚠️ 状态：未知';
    }
  } catch (e) { console.log('抓取 panel 检测失败:', e); }

  // Cookie 保活状态
  try {
    const resp = await fetch(API_BASE + '/api/keepalive-status');
    const ka = await resp.json();
    if (ka && ka.last_run) {
      const fmt = (o) => o ? (o.ok ? `保活正常 · ${ka.last_run.slice(5, 16)}` : `⚠️ ${o.msg || '保活失败'}`) : '保活未运行';
      const el1 = document.getElementById('panel-status-uid');
      const el2 = document.getElementById('panel-status-bigdata');
      if (el1) el1.innerHTML += `<div style="font-size:11px;color:#9AA0AB;margin-top:4px;">🫀 ${fmt(ka.uid)}</div>`;
      if (el2) el2.innerHTML += `<div style="font-size:11px;color:#9AA0AB;margin-top:4px;">🫀 ${fmt(ka.bigdata)}</div>`;
    }
  } catch (e) { console.log('保活状态获取失败:', e); }
}

async function saveCookie(target) {
  const inputId = target === 'bigdata' ? 'cookie-input-bigdata' : 'cookie-input-uid';
  const cookieStr = document.getElementById(inputId).value.trim();
  if (!cookieStr) { alert('请输入 Cookie'); return; }
  if (!cookieStr.includes('PHPSESSID')) { alert('Cookie 格式不正确，缺少 PHPSESSID'); return; }

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
        alert('❌ 后端接口不存在 (404)，请确认后端已重启并加载最新代码');
      } else {
        alert('❌ 服务器错误 (' + resp.status + '): ' + text.substring(0, 200));
      }
      return;
    }
    const data = await resp.json();
    if (data.success) {
      alert('✅ ' + label + ' Cookie 更新成功！');
      document.getElementById(inputId).value = '';
      checkCookieStatus();
      updateCookiePanelStatus();
    } else {
      alert('❌ 更新失败: ' + (data.error || '未知错误'));
    }
  } catch (e) {
    alert('❌ 网络请求失败: ' + (e.message || '请确认后端服务已启动'));
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
