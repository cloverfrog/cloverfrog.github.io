import { API_URL } from '/config.js';

export function loginUrl() {
  return '/login/?returnTo=' + encodeURIComponent(location.pathname + location.search + location.hash);
}

export function goToLogin() { location.assign(loginUrl()); }

export async function authRequest(action, body) {
  const response = await fetch(API_URL + '/api/auth/' + action, {
    method: action === 'session' ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(response.status === 429 ? '尝试过于频繁，请稍后再试。'
    : response.status === 401 ? '登录失败，请检查邮箱和密码。' : '登录服务暂时不可用，请稍后重试。');
  return response.json();
}

export async function requireUser() {
  const data = await authRequest('session');
  if (!data.authenticated) { goToLogin(); return null; }
  return data.user;
}

export async function logout() {
  await authRequest('logout');
  goToLogin();
}

// Accept only a local page; never send users to an external return URL or an API.
export function safeReturnPath(value) {
  try {
    if (!value?.startsWith('/') || value.startsWith('//') || /[\\\x00-\x1f]/.test(value)) return '/';
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin || /^\/login(?:\/|$)/i.test(url.pathname)
      || /^\/api(?:\/|$)/i.test(url.pathname)) return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}
