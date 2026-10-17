import { API_URL } from '/config.js';
import { requireUser, goToLogin, logout as siteLogout } from '/assets/auth.mjs';

const video = document.querySelector('#video');
const status = document.querySelector('#status');
const logout = document.querySelector('#logout');
let authenticated = false;
// Remove obsolete direct-source settings from earlier local previews.
try { localStorage.removeItem('tinytv.settings'); } catch {}
function setAuthenticated(value) {
  authenticated = value;
  logout.hidden = !value;
  document.querySelector('#enter').disabled = !value;
  if (!value) {
    started = false; current = null; pending = null;
    clearTimeout(boundary);
    video.pause(); video.removeAttribute('src'); video.load();
    document.querySelector('#current').textContent = '登录后进入频道';
    document.querySelector('#next').textContent = '';
    document.querySelector('#programs').replaceChildren();
    status.textContent = '使用 PocketBase 账号登录';
  }
}
let busy = false, current = null, boundary = null, pending = null, started = false;
const label = p => `${p.title} · 第 ${p.season} 季 第 ${p.episode} 集`;
const identity = p => `${p.programStart}:${p.playUrl}`;
function applyPosition() {
  if (!pending || video.readyState < 1) return;
  const target = pending.offset + (performance.now() - pending.received) / 1000;
  if (Number.isFinite(video.duration) && target >= video.duration) {
    status.textContent = '视频已结束，等待节目时间线切换；请核对节目时长。';
    return;
  }
  if (Math.abs(video.currentTime - target) > 3) video.currentTime = target;
  pending = null;
  if (started && video.paused) video.play().catch(() => { status.textContent = '请点击进入频道以开始播放。'; });
}
async function sync() {
  if (busy || !authenticated) return;
  busy = true;
  try {
    const sent = performance.now();
    const response = await fetch(API_URL + '/api/tinytv/channels/tiny/now', {cache:'no-store', signal:AbortSignal.timeout(10000)});
    if (response.status === 401) { setAuthenticated(false); goToLogin(); return; }
    if (!response.ok) throw new Error(`接口返回 ${response.status}`);
    const data = await response.json();
    if (!authenticated) return;
    const received = performance.now();
    clearTimeout(boundary);
    if (data.status === 'waiting') {
      video.pause(); current = null; pending = null;
      status.textContent = `频道将于 ${new Date(data.startTime * 1000).toLocaleString()} 开播`;
      boundary = setTimeout(sync, Math.min(30000, Math.max(100, (data.startTime-data.serverTime)*1000)));
      return;
    }
    const delay = (received - sent) / 2000;
    pending = {offset:data.offset + delay, received};
    if (current !== identity(data)) {
      current = identity(data);
      video.src = data.playUrl;
      video.load();
    }
    document.querySelector('#current').textContent = label(data);
    document.querySelector('#next').textContent = `接下来：${label(data.next)}`;
    document.querySelector('#programs').replaceChildren(...data.programs.map(p => {
      const li = document.createElement('li');
      li.textContent = `${label(p)} · ${p.duration.toFixed(2)} 秒`;
      li.classList.toggle('active', p.title === data.title && p.season === data.season && p.episode === data.episode);
      return li;
    }));
    status.textContent = started ? '已同步频道时间' : '频道已就绪，点击进入频道';
    applyPosition();
    boundary = setTimeout(sync, Math.max(100, (data.remaining-delay)*1000+50));
  } catch (error) {
    status.textContent = `同步失败：${error.message}。稍后自动重试。`;
  } finally { busy = false; }
}
video.addEventListener('loadedmetadata', applyPosition);
video.addEventListener('ended', sync);
video.addEventListener('play', () => { started = true; sync(); });
video.addEventListener('error', () => { if (authenticated) { current = null; status.textContent = '视频加载失败，正在重试；也可能是当前浏览器不支持视频编码。'; } });
document.querySelector('#enter').onclick = () => { started = true; video.play().catch(() => {}); sync(); };
const player = document.querySelector('#player');
const fullscreen = document.querySelector('#fullscreen');
let hideControls;
function revealControls() {
  clearTimeout(hideControls);
  player.classList.remove('controls-hidden');
  if (document.fullscreenElement === player) {
    hideControls = setTimeout(() => {
      // Do not hide a button while a keyboard user is interacting with it.
      if (player.querySelector('.bar :focus-visible')) return;
      player.classList.add('controls-hidden');
    }, 2500);
  }
}
['pointermove', 'pointerdown', 'keydown', 'focusin', 'focusout'].forEach(event => {
  player.addEventListener(event, revealControls);
});
fullscreen.onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (player.requestFullscreen) await player.requestFullscreen();
    else { status.textContent = '当前浏览器不支持此页面的全屏模式。'; }
  } catch { status.textContent = '无法进入全屏，请检查浏览器权限。'; }
};
document.addEventListener('fullscreenchange', () => {
  fullscreen.textContent = document.fullscreenElement ? '退出全屏' : '全屏';
  revealControls();
});
logout.onclick = async () => {
  logout.disabled = true;
  try { await siteLogout(); setAuthenticated(false); }
  catch { status.textContent = '退出失败，请重试。'; }
  finally { logout.disabled = false; }
};
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
setInterval(sync, 15000);
setAuthenticated(false);
requireUser()
  .then(user => { if (user) { setAuthenticated(true); sync(); } })
  .catch(() => { status.textContent = '无法连接登录服务，请稍后刷新。'; });
