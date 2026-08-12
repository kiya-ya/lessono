// auth.js - 登录状态管理
// 在页面加载时检查登录状态，未登录则跳转到登录页

(async function initAuth() {
  // 跳过登录页本身
  if (window.location.pathname === '/login.html' || window.location.pathname.endsWith('/login.html')) {
    return;
  }

  try {
    const res = await fetch(API_BASE + '/api/check-auth', {
      credentials: 'same-origin'
    });
    const data = await res.json();

    if (!data.logged_in) {
      window.location.href = '/login.html';
      return;
    }

    // 渲染用户信息到 header
    renderUserInfo(data);
  } catch (e) {
    console.error('认证检查失败:', e);
    // 网络错误时也给一个提示，但不立即跳转（避免后端未启动时无限循环）
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 3000);
  }
})();

async function renderUserInfo(user) {
  const container = document.getElementById('header-user-info');
  if (!container) return;
  const isAdmin = user.role === 'admin';
  const roleName = isAdmin ? '管理员' : '运营';

  // 厅运营显示管理的厅名（从 /api/halls 获取，按角色已过滤）
  let hallsHtml = '';
  if (!isAdmin) {
    try {
      const res = await fetch(API_BASE + '/api/halls', { credentials: 'same-origin' });
      const d = await res.json();
      if (d.data && d.data.length) {
        const names = d.data.join('、');
        hallsHtml = `<div class="side-halls" title="${names}">厅：${names}</div>`;
      }
    } catch (e) { /* 厅名获取失败不影响主信息展示 */ }
  } else {
    hallsHtml = '<div class="side-halls">全部大厅</div>';
  }

  container.innerHTML = `
    <div class="side-user">
      <div class="side-user-uid">${user.uid}<span class="side-user-role">${roleName}</span></div>
      ${hallsHtml}
      <button onclick="doLogout()" class="side-logout">退出登录</button>
    </div>
  `;
}

async function doLogout() {
  try {
    await fetch(API_BASE + '/api/logout', {
      method: 'POST',
      credentials: 'same-origin'
    });
  } catch (e) {}
  window.location.href = '/login.html';
}

// 暴露到全局
window.doLogout = doLogout;
