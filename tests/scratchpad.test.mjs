// Browser test against simulated standard REST; no local PocketBase service.
// Set PLAYWRIGHT_PATH to playwright/index.mjs; BROWSER_CHANNEL defaults to msedge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

test('manual save: no auto writes, shortcuts, late input, errors, recovery, undo and mobile',
  { skip: !process.env.PLAYWRIGHT_PATH, timeout: 60000 }, async () => {
  const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_PATH));
  const http = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const file = resolve('.' + path + (path.endsWith('/') ? 'index.html' : ''));
      if (!file.startsWith(resolve('pages/scratchpad') + sep)) { res.writeHead(403).end(); return; }
      res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript' });
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => http.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const records = new Map(), transfers = new Map(), calls = [], errors = [];
  let fail = 0, slow = false, loseCreateResponse = false, stalledUpload = false;
  await context.route('https://pocketbase.cloverfrog.xyz/**', async route => {
    const r = route.request(), path = new URL(r.url()).pathname, method = r.method();
    calls.push({ path, method });
    assert.ok(!path.includes('/api/scratchpad/'), 'custom API must never be called');
    const respond = (status, data) => route.fulfill({ status, contentType: 'application/json', body: status === 204 ? '' : JSON.stringify(data) });
    if (path.endsWith('/auth-with-password')) {
      const body = r.postDataJSON(); const id = body.identity === 'b@example.test' ? 'userB' : 'userA';
      return respond(200, { token: id, record: { id, collectionName: 'users' } });
    }
    if (fail) return respond(fail, { message: 'injected error' });
    if (path === '/api/files/token') return respond(200, { token: 'file-token-' + r.headers().authorization });
    if (path.startsWith('/api/files/scratchpad_files/')) {
      const entry = transfers.get(path.split('/')[4]);
      if (!entry || new URL(r.url()).searchParams.get('token') !== 'file-token-' + entry.record.owner) return respond(404, {});
      return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: entry.bytes });
    }
    if (path.startsWith('/api/collections/scratchpad_files/records')) {
      const owner = r.headers().authorization, id = path.split('/')[5];
      if (method === 'POST') {
        if (stalledUpload) {
          await delay(1000);
          try { await respond(400, {}); } catch {}
          return;
        }
        assert.ok(r.headers()['content-type'].includes('multipart/form-data; boundary='));
        const form = await new Response(r.postDataBuffer(), { headers: { 'Content-Type': r.headers()['content-type'] } }).formData();
        assert.equal(form.get('owner'), owner);
        const file = form.get('file');
        const record = { id: 'transfer' + transfers.size, owner, originalName: form.get('originalName'),
          file: 'sanitized_random.txt', size: Number(form.get('size')), created: new Date().toISOString() };
        transfers.set(record.id, { record, bytes: Buffer.from(await file.arrayBuffer()) }); return respond(200, record);
      }
      if (method === 'DELETE') { transfers.delete(id); return respond(204); }
      if (id) return transfers.has(id) ? respond(200, transfers.get(id).record) : respond(404, {});
      return respond(200, { items: [...transfers.values()].map(x => x.record).filter(x => x.owner === owner), totalPages: 1 });
    }
    const body = r.postData() ? r.postDataJSON() : null, id = path.split('/')[5];
    const owner = r.headers().authorization;
    if (method === 'GET') {
      if (id) return records.has(id) ? respond(200, records.get(id)) : respond(404, {});
      return respond(200, { items: [...records.values()].filter(x => x.owner === owner), totalPages: 1 });
    }
    if (slow) await delay(600);
    if (method === 'POST') {
      if (records.has(body.id)) return respond(400, {});
      records.set(body.id, { ...body });
      if (loseCreateResponse) { loseCreateResponse = false; return route.abort(); }
      return respond(200, records.get(body.id));
    }
    if (method === 'PATCH') { records.set(id, { ...records.get(id), ...body }); return respond(200, records.get(id)); }
    if (method === 'DELETE') { records.delete(id); return respond(204); }
    return respond(404, {});
  });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', dialog => dialog.accept());
  const writes = () => calls.filter(c => c.method !== 'GET' && !c.path.endsWith('/auth-with-password')).length;
  const saved = () => page.waitForFunction(() => document.querySelector('#status').textContent === '已保存');
  async function login(email = 'a@example.test') {
    await page.locator('#email').fill(email); await page.locator('#password').fill('test');
    await page.locator('#login button').click();
    await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('已读取'));
  }
  try {
    const expiredAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 - 1000).toISOString();
    records.set('expiredDraft', { id: 'expiredDraft', owner: 'userA', title: 'expired', content: '', updated: expiredAt });
    transfers.set('expiredFile', { record: { id: 'expiredFile', owner: 'userA', originalName: 'expired.txt', created: expiredAt, size: 1 }, bytes: Buffer.from('x') });
    await page.goto(`http://127.0.0.1:${http.address().port}/pages/scratchpad/`); await login();
    await page.waitForFunction(() => !document.querySelector('#file-refresh').disabled);
    assert.equal(records.size, 0); assert.equal(transfers.size, 0);
    calls.length = 0;
    await page.locator('#new').click(); await page.locator('#title').fill('手动草稿');
    await page.locator('#content').fill('中文\nMarkdown **原文**');
    await page.evaluate(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('focus')); });
    await delay(1500); assert.equal(writes(), 0);
    assert.equal(await page.locator('#status').textContent(), '未保存');
    await page.keyboard.press('Control+s'); await saved(); assert.equal(records.size, 1);
    assert.equal([...records.values()][0].content, '中文\nMarkdown **原文**');
    await page.reload(); await saved(); assert.equal(await page.locator('#content').inputValue(), '中文\nMarkdown **原文**');
    await page.locator('#content').fill('new input'); const count = writes();
    await page.evaluate(() => {
      window.copies = 0; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { window.copies++; } } });
      document.querySelector('#content').dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, isComposing: true, bubbles: true }));
    });
    await delay(50); assert.equal(writes(), count);
    await page.evaluate(() => document.querySelector('#content').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
    await page.keyboard.press('Control+Enter'); assert.equal(await page.evaluate(() => window.copies), 1); assert.equal(writes(), count);
    slow = true; await page.locator('#save').click(); await page.locator('#content').fill('typed during saving');
    await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('后续修改'));
    assert.equal([...records.values()][0].content, 'new input'); assert.equal(await page.locator('#status').textContent(), '未保存');
    slow = false; fail = 403; await page.locator('#save').click();
    await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('403'));
    assert.equal(await page.locator('#login').isVisible(), false);
    assert.equal(await page.locator('#content').inputValue(), 'typed during saving');
    fail = 0; await page.locator('#save').click(); await saved();
    await page.locator('#new').click(); await page.locator('#content').fill('response lost'); loseCreateResponse = true;
    await page.locator('#save').click(); await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('请求失败'));
    assert.equal(records.size, 2); await page.locator('#save').click(); await saved(); assert.equal(records.size, 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('#complete').click(); await page.getByRole('button', { name: '撤销', exact: true }).click(); assert.equal(records.size, 2);
    await page.locator('#complete').click(); await page.locator('#undo p').waitFor();
    await page.waitForFunction(() => document.querySelector('#undo').children.length === 0, null, { timeout: 12000 }); assert.equal(records.size, 1);
    await page.locator('#file-upload:enabled').waitFor();
    const originalText = await page.locator('#content').inputValue();
    const bytes = Buffer.from('跨设备传文件\n\0binary\xff', 'utf8');
    await page.evaluate(() => {
      const input = document.querySelector('#file-input'), data = new DataTransfer();
      data.items.add(new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'too-large.bin')); input.files = data.files;
    });
    await page.locator('#file-upload').click();
    assert.ok((await page.locator('#file-status').textContent()).includes('不能超过 50 MB'));
    assert.equal(transfers.size, 0);
    await page.locator('#file-input').setInputFiles({ name: '中文文件.txt', mimeType: 'text/plain', buffer: bytes });
    assert.equal(transfers.size, 0); // Choosing a file never uploads it.
    fail = 413; await page.locator('#file-upload').click();
    await page.waitForFunction(() => document.querySelector('#file-status').textContent.includes('上传被拒绝'));
    assert.equal(await page.locator('#file-input').evaluate(input => input.files.length), 1); assert.equal(transfers.size, 0);
    fail = 0;
    stalledUpload = true; await page.locator('#file-upload').click();
    await page.locator('#file-cancel').click();
    await page.waitForFunction(() => document.querySelector('#file-status').textContent.includes('已取消上传'));
    assert.equal(await page.locator('#file-upload').isEnabled(), true); assert.equal(transfers.size, 0);
    stalledUpload = false;
    await page.locator('#file-upload').click();
    await page.waitForFunction(() => document.querySelector('#file-status').textContent.startsWith('已上传 1 个'));
    assert.equal(transfers.size, 1);
    assert.equal(await page.locator('#file-list .file-name').textContent(), '中文文件.txt');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '下载', exact: true }).click()]);
    assert.equal(download.suggestedFilename(), '中文文件.txt');
    const chunks = []; for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), bytes);
    assert.equal(await page.locator('#content').inputValue(), originalText);
    await page.locator('#file-refresh:enabled').waitFor(); await page.locator('#file-refresh').click();
    await page.locator('#file-refresh:enabled').waitFor(); assert.equal(await page.locator('#file-list li').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    // Keep the file to check account isolation, then return to its owner to delete it.
    await page.locator('#logout').click(); await login('b@example.test'); assert.equal(await page.locator('#drafts button').count(), 0);
    await page.locator('#file-refresh:enabled').waitFor(); assert.equal(await page.locator('#file-list li').count(), 0);
    await page.locator('#logout').click(); await login(); await page.locator('#file-refresh:enabled').waitFor();
    assert.equal(await page.locator('#file-list li').count(), 1);
    await page.getByRole('button', { name: '删除', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#file-status').textContent === '文件已删除。'); assert.equal(transfers.size, 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(r => http.close(r)); }
});
