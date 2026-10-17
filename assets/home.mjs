import { authRequest, logout } from './auth.mjs';

const button = document.getElementById('logout');
const status = document.getElementById('auth-status');

button.onclick = async () => {
  button.disabled = true;
  status.textContent = '';
  try { await logout(); }
  catch { status.textContent = '退出失败，请稍后重试。'; }
  finally { button.disabled = false; }
};

try {
  const session = await authRequest('session');
  button.hidden = !session.authenticated;
} catch { status.textContent = '无法连接登录服务，请稍后刷新重试。'; }
