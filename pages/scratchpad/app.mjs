import { API_URL } from './config.js';
import { Store } from './store.mjs';
import { FileTransfer } from './files.mjs';
import { pruneCache, cleanExpired } from './retention.mjs';

const $ = id => document.getElementById(id);
const store = new Store();
const authKey = 'scratchpad-auth';
let session, busy = false, composing = false;
const files = new FileTransfer(() => { $('logout').disabled = busy || files.busy; }, error => { notice(errorMessage(error)); });
const notice = text => { $('notice').textContent = text; };
const selected = () => session?.drafts.find(d => d.localId === session.selected && !d.pending);
const hasChanges = () => session?.drafts.some(d => d.dirty || d.pending);
const recordId = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), n => 'abcdefghijklmnopqrstuvwxyz0123456789'[n % 36]).join('');
const draft = r => ({ localId: r.id || crypto.randomUUID(), id: r.id || null,
  createId: r.id || recordId(), title: r.title || '', content: r.content || '', seq: 0, dirty: !r.id,
  localSavedAt: Date.now() });

async function request(path, method = 'GET', body, token = session?.auth.token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(API_URL + path, { method, headers: {
      ...(token ? { Authorization: token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal, cache: 'no-store' });
    const data = response.status === 204 ? null : await response.json();
    if (!response.ok) throw Object.assign(new Error(data?.message || '请求失败'), { status: response.status });
    return data;
  } finally { clearTimeout(timer); }
}
function errorMessage(error) {
  if (error.status === 401) {
    $('login').hidden = false;
    return '登录已过期，请使用同一账号重新登录。当前文本仍保留。';
  }
  if (error.status === 403) return 'PocketBase 权限未配置（403），请按说明设置 scratchpads 的 API Rules。无需反复登录。';
  if (error.status === 404) return '集合或草稿不存在，或当前账号无权访问（404）。当前文本仍保留。';
  if (error.status === 400) return '保存被拒绝（400），请检查 owner 权限规则、字段长度及 version 是否仍为必填。当前文本仍保留。';
  return '请求失败，请检查网络后手动重试。当前文本仍保留。';
}
function render(text = true) {
  const d = selected();
  $('workspace').hidden = !session; $('logout').hidden = !session;
  $('editor').hidden = !d; $('empty').hidden = !!d;
  $('drafts').replaceChildren(...(session?.drafts || []).filter(x => !x.pending).map(x => {
    const b = document.createElement('button'); b.textContent = (x.title || '未命名草稿') + (x.dirty ? ' *' : '');
    b.setAttribute('aria-current', String(x === d)); b.disabled = busy;
    b.onclick = () => { session.selected = x.localId; render(); }; return b;
  }));
  if (text) { $('title').value = d?.title || ''; $('content').value = d?.content || ''; }
  for (const id of ['save', 'new', 'refresh', 'complete', 'logout']) $(id).disabled = busy;
  $('logout').disabled = busy || files.busy;
  $('status').textContent = busy ? '处理中…' : d?.dirty ? '未保存' : d ? '已保存' : '';
  $('undo').replaceChildren(...(session?.drafts || []).filter(x => x.pending).map(x => {
    const p = document.createElement('p'); p.textContent = `待完成：${x.title || '未命名草稿'}`;
    const b = document.createElement('button'); b.textContent = '撤销'; b.disabled = x.deleting;
    b.onclick = () => { clearTimeout(x.timer); x.pending = false; session.selected = x.localId; render(); };
    p.append(b); return p;
  }));
}
async function localSnapshot(s) {
  // Only called by an explicit Save action, never by input, focus or timers.
  await store.put(s.auth.record.id, { selected: s.selected, drafts: s.drafts.map(d => ({
    localId: d.localId, id: d.id, createId: d.createId, title: d.title, content: d.content,
    seq: d.seq, dirty: d.dirty, localSavedAt: d.localSavedAt, pending: null, op: null })) });
}
async function refresh() {
  if (!session || busy) return;
  const s = session; busy = true; render(false);
  try {
    await store.prune();
    const protectedDrafts = s.drafts.filter(d => d.dirty || d.pending);
    const retained = pruneCache({ drafts: s.drafts.filter(d => !protectedDrafts.includes(d)), selected: s.selected }).state;
    retained.drafts.push(...protectedDrafts);
    if (retained.drafts.some(d => d.localId === s.selected)) retained.selected = s.selected;
    s.drafts = retained.drafts; s.selected = retained.selected;
    const items = []; let result, page = 1;
    do {
      result = await request(`/api/collections/scratchpads/records?perPage=200&page=${page++}`);
      items.push(...result.items);
    } while (page <= result.totalPages);
    const cleaned = await cleanExpired(items, { collection: 'scratchpads', owner: s.auth.record.id, field: 'updated', request,
      keep: new Set(s.drafts.filter(d => d.dirty || d.pending).map(d => d.id)) });
    const remote = new Map(cleaned.items.map(r => [r.id, r]));
    s.drafts = s.drafts.filter(d => d.dirty || d.pending || remote.has(d.id));
    for (const r of cleaned.items) {
      const existing = s.drafts.find(d => d.id === r.id);
      if (!existing) s.drafts.push(draft(r));
      else if (!existing.dirty && !existing.pending) { existing.title = r.title; existing.content = r.content; }
    }
    if (!s.drafts.some(d => d.localId === s.selected && !d.pending)) s.selected = s.drafts.find(d => !d.pending)?.localId;
    notice(`已读取云端草稿。${cleaned.removed ? `已自动清理 ${cleaned.removed} 份过期草稿。` : ''}${cleaned.failed ? `${cleaned.failed} 份清理失败，下次刷新重试。` : ''}其他设备保存后，点击“刷新列表”查看。`);
  } catch (error) { notice(errorMessage(error)); }
  finally { busy = false; render(!composing); }
}
async function save() {
  const s = session, d = selected(); if (!d || busy) return;
  busy = true; render(false);
  const seq = d.seq, body = { title: d.title, content: d.content };
  try {
    d.localSavedAt = Date.now();
    // A manual save keeps a recovery snapshot even if the network then fails.
    await localSnapshot(s);
    let result;
    if (d.id) result = await request('/api/collections/scratchpads/records/' + d.id, 'PATCH', body);
    else {
      try {
        result = await request('/api/collections/scratchpads/records', 'POST', { ...body, owner: s.auth.record.id, id: d.createId });
      } catch (error) {
        // If a previous manual create timed out after succeeding, retry the same
        // chosen ID rather than making another draft. No automatic retries.
        if (error.status !== 400) throw error;
        try { await request('/api/collections/scratchpads/records/' + d.createId); }
        catch { throw error; }
        result = await request('/api/collections/scratchpads/records/' + d.createId, 'PATCH', body);
      }
    }
    d.id = result.id; d.dirty = d.seq !== seq;
    await localSnapshot(s);
    notice(d.dirty ? '已保存刚才的内容；后续修改尚未保存。' : '已保存到云端。');
  } catch (error) { notice(errorMessage(error)); }
  finally { busy = false; render(false); }
}
async function start(auth) {
  const previous = session;
  for (const d of previous?.drafts || []) clearTimeout(d.timer);
  const sameUser = previous?.auth.record.id === auth.record.id;
  const cached = sameUser ? null : await store.get(auth.record.id);
  session = { auth, drafts: sameUser ? previous.drafts : (cached.drafts || []).map(r => ({
    ...draft(r), localId: r.localId || r.id || crypto.randomUUID(), createId: r.createId || r.id || recordId(),
    dirty: !!(r.dirty || r.op || r.pending), pending: false, seq: r.seq || 0, localSavedAt: r.localSavedAt })),
    selected: sameUser ? previous.selected : cached.selected };
  for (const d of session.drafts) d.pending = false;
  $('login').hidden = true; render(); files.setSession(auth); await refresh();
}
$('login').onsubmit = async e => {
  e.preventDefault(); if (busy || files.busy) return;
  const button = $('login').querySelector('button'); button.disabled = true;
  try {
    const auth = await request('/api/collections/users/auth-with-password', 'POST', { identity: $('email').value, password: $('password').value }, '');
    if (session && session.auth.record.id !== auth.record.id && hasChanges() && !confirm('当前账号有未保存修改，切换账号将放弃这些修改。继续？')) return;
    localStorage.setItem(authKey, JSON.stringify(auth)); $('password').value = ''; await start(auth);
  } catch (error) { notice('登录失败，请检查账号、密码与网络。'); }
  finally { button.disabled = false; }
};
$('new').onclick = () => {
  if (!session || busy) return; const d = draft({});
  session.drafts.push(d); session.selected = d.localId; render(); $('content').focus();
};
function edit() {
  const d = selected(); if (!d) return;
  d.title = $('title').value; d.content = $('content').value; d.dirty = true; d.seq++; render(false);
}
for (const id of ['title', 'content']) {
  $(id).addEventListener('input', edit);
  $(id).addEventListener('compositionstart', () => { composing = true; });
  $(id).addEventListener('compositionend', () => { composing = false; edit(); });
}
$('save').onclick = save; $('refresh').onclick = refresh;
async function copy() {
  const d = selected(); if (!d) return;
  try { await navigator.clipboard.writeText(d.content); notice('已复制全文；复制不会保存或完成草稿。'); }
  catch { notice('请手动复制选中的正文。'); $('content').focus(); $('content').select(); }
}
$('copy').onclick = copy;
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.isComposing || composing || e.keyCode === 229) return;
  if (e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  if (e.key === 'Enter') { e.preventDefault(); copy(); }
});
$('complete').onclick = () => {
  const s = session, d = selected(); if (!d || busy) return;
  if (d.dirty && !confirm('这份草稿有未保存修改，完成将丢弃它们。继续？')) return;
  d.pending = true; s.selected = s.drafts.find(x => x !== d && !x.pending)?.localId;
  render();
  d.timer = setTimeout(async () => {
    if (session !== s || !d.pending) return;
    if (busy) { d.pending = false; notice('当前操作尚未结束，请稍后重新点击完成。'); render(); return; }
    busy = true; d.deleting = true; render(false);
    try {
      if (d.id) await request('/api/collections/scratchpads/records/' + d.id, 'DELETE');
      s.drafts = s.drafts.filter(x => x !== d);
      // Remove only this explicitly completed draft from an older recovery cache.
      const cached = await store.get(s.auth.record.id);
      cached.drafts = cached.drafts.filter(x => x.localId !== d.localId && (!d.id || x.id !== d.id));
      await store.put(s.auth.record.id, cached);
      notice('已完成。');
    } catch (error) { d.pending = false; s.selected = d.localId; notice(errorMessage(error)); }
    finally { d.deleting = false; busy = false; render(); }
  }, 8000);
};
$('logout').onclick = () => {
  if (busy || files.busy || (hasChanges() && !confirm('仍有未保存修改，退出将放弃这些修改。继续？'))) return;
  for (const d of session.drafts) clearTimeout(d.timer);
  session = null; files.setSession(null); localStorage.removeItem(authKey); $('login').hidden = false; render(); notice('已退出。');
};
window.addEventListener('beforeunload', e => { if (hasChanges() || files.busy) { e.preventDefault(); e.returnValue = ''; } });
try {
  await store.open();
  let cached; try { cached = JSON.parse(localStorage.getItem(authKey) || 'null'); } catch { localStorage.removeItem(authKey); }
  if (cached?.record?.id && cached.record.collectionName === 'users') await start(cached);
} catch { notice('无法读取本机旧草稿，请检查浏览器存储设置。'); }
