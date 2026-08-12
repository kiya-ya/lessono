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

function renderUserInfo(user) {
  const container = document.getElementById('header-user-info');
  if (!container) return;
  container.innerHTML = `
    <span style="display:flex;align-items:center;gap:8px;">
      <span style="width:28px;height:28px;border-radius:50%;background:#4F5BD5;color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;">
        ${(user.nickname || '管').charAt(0)}
      </span>
      <span style="color:rgba(255,255,255,0.84);font-size:13px;">${user.nickname || '管理员'}</span>
      <span style="color:rgba(255,255,255,0.5);font-size:11px;background:rgba(255,255,255,0.1);padding:2px 8px;border-radius:4px;">${user.role || 'admin'}</span>
      <button onclick="doLogout()" style="margin-left:4px;padding:4px 10px;border:none;border-radius:4px;background:rgba(255,255,255,0.15);color:white;font-size:12px;cursor:pointer;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'" onmouseout="this.style.background='rgba(255,255,255,0.15)'">退出登录</button>
    </span>
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
