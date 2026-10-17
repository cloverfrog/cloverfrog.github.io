import { authRequest, safeReturnPath } from '/assets/auth.mjs';

const form = document.querySelector('#login');
const button = form.querySelector('button');
const status = document.querySelector('#status');
const returnTo = safeReturnPath(new URLSearchParams(location.search).get('returnTo'));
form.onsubmit = async event => {
  event.preventDefault(); button.disabled = true; status.textContent = '正在登录…';
  try {
    await authRequest('login', { identity: document.querySelector('#identity').value.trim(),
      password: document.querySelector('#password').value });
    document.querySelector('#password').value = '';
    location.replace(returnTo);
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
};
try {
  const data = await authRequest('session');
  if (data.authenticated) location.replace(returnTo);
  else status.textContent = '';
} catch (error) { status.textContent = error.message; }
finally { button.disabled = false; }
