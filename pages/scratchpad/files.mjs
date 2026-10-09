import { API_URL } from './config.js';
import { cleanExpired } from './retention.mjs';

export const MAX_FILE_SIZE = 50 * 1024 * 1024;
const $ = id => document.getElementById(id);
const sizeText = bytes => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

// Independent of text drafts: all writes require an upload/delete button click.
export class FileTransfer {
  constructor(onBusy = () => {}, onAuthError = () => {}) {
    this.onBusy = onBusy; this.onAuthError = onAuthError; this.items = []; this.busy = false;
    $('file-refresh').onclick = () => this.refresh();
    $('file-upload').onclick = () => this.upload();
    $('file-cancel').onclick = () => this.uploadRequest?.abort();
    $('file-input').onchange = () => {
      const files = [...$('file-input').files];
      this.message(files.length ? `已选择 ${files.length} 个文件，点击上传发送。` : '请选择文件。');
    };
  }
  message(text) { $('file-status').textContent = text; }
  setBusy(value) { this.busy = value; this.render(); this.onBusy(value); }
  setSession(auth) {
    this.auth = auth; this.items = [];
    $('file-input').value = ''; this.render();
    if (auth) this.refresh(); else this.message('');
  }
  async request(path, { method = 'GET', body, binary = false } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), binary ? 300000 : 15000);
    try {
      const response = await fetch(API_URL + path, { method, headers: { Authorization: this.auth.token },
        body, cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal });
      if (!response.ok) throw Object.assign(new Error('File request failed'), { status: response.status });
      if (response.status === 204) return null;
      return binary ? await response.blob() : await response.json();
    } finally { clearTimeout(timer); }
  }
  failure(error) {
    if (error.name === 'AbortError') return '已取消上传。结果可能已写入服务器，请先刷新列表再决定是否重试。';
    if (error.name === 'TimeoutError') return '上传超时。请先刷新列表确认结果，再手动重试。';
    if (error.status === 401) { this.onAuthError(error); return '登录已过期，请重新登录后手动重试。'; }
    if (error.status === 403 || error.status === 404) return '文件集合未配置或无权访问，请检查 scratchpad_files 的权限和 Protected 设置。';
    if (error.status === 400 || error.status === 413) return '文件上传被拒绝，请检查文件大小、字段限制与创建权限。';
    return '传输失败，请检查网络。上传结果不确定时先刷新列表，再手动重试。';
  }
  uploadFile(body, file, index, count) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(); this.uploadRequest = xhr;
      xhr.open('POST', API_URL + '/api/collections/scratchpad_files/records');
      xhr.setRequestHeader('Authorization', this.auth.token);
      xhr.timeout = 300000;
      const prefix = `正在上传 ${index}/${count}：${file.name}`;
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) this.message(`${prefix} · ${Math.min(100, Math.round(e.loaded / e.total * 100))}%（${sizeText(e.loaded)} / ${sizeText(e.total)}）`);
      };
      xhr.upload.onload = () => this.message(`${file.name} 已发送，正在等待服务器确认…`);
      const finish = () => { this.uploadRequest = null; $('file-cancel').hidden = true; };
      xhr.onload = () => {
        finish();
        if (xhr.status < 200 || xhr.status >= 300) { reject(Object.assign(new Error('Upload rejected'), { status: xhr.status })); return; }
        try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('Invalid upload response')); }
      };
      xhr.onerror = () => { finish(); reject(new Error('Upload network error')); };
      xhr.ontimeout = () => { finish(); reject(Object.assign(new Error('Upload timeout'), { name: 'TimeoutError' })); };
      xhr.onabort = () => { finish(); reject(Object.assign(new Error('Upload cancelled'), { name: 'AbortError' })); };
      $('file-cancel').hidden = false;
      xhr.send(body);
    });
  }
  render() {
    $('file-panel').hidden = !this.auth;
    for (const id of ['file-input', 'file-upload', 'file-refresh']) $(id).disabled = this.busy;
    $('file-list').replaceChildren(...this.items.map(item => {
      const li = document.createElement('li'), name = document.createElement('span');
      name.className = 'file-name'; name.textContent = item.originalName || item.file;
      const meta = document.createElement('small');
      meta.textContent = `${sizeText(item.size || 0)} · ${item.created ? new Date(item.created).toLocaleString() : ''}`;
      const info = document.createElement('div'); info.className = 'file-info'; info.append(name, meta);
      const download = document.createElement('button'); download.textContent = '下载'; download.disabled = this.busy;
      download.onclick = () => this.download(item);
      const remove = document.createElement('button'); remove.textContent = '删除'; remove.disabled = this.busy;
      remove.onclick = () => this.remove(item);
      li.append(info, download, remove); return li;
    }));
  }
  async list() {
    const items = []; let page = 1, result;
    do {
      result = await this.request(`/api/collections/scratchpad_files/records?sort=-created&perPage=100&page=${page++}`);
      items.push(...result.items);
    } while (page <= result.totalPages);
    const cleaned = await cleanExpired(items, { collection: 'scratchpad_files', owner: this.auth.record.id, field: 'created',
      request: (path, method = 'GET') => this.request(path, { method }) });
    this.items = cleaned.items;
    return cleaned;
  }
  async refresh() {
    if (!this.auth || this.busy) return;
    this.setBusy(true); this.message('正在读取文件列表…');
    try {
      const result = await this.list();
      this.message(`${this.items.length ? `${this.items.length} 个文件` : '暂无文件。选择文件后点击上传。'}${result.removed ? ` 已自动清理 ${result.removed} 个过期文件。` : ''}${result.failed ? ` ${result.failed} 个清理失败，下次操作重试。` : ''}`);
    }
    catch (error) { this.message(this.failure(error)); }
    finally { this.setBusy(false); }
  }
  async upload() {
    if (!this.auth || this.busy) return;
    const files = [...$('file-input').files];
    if (!files.length) { this.message('请先选择文件。'); return; }
    if (files.some(file => file.size > MAX_FILE_SIZE)) { this.message('单个文件不能超过 50 MB。'); return; }
    if (files.some(file => !file.size)) { this.message('不能上传空文件。'); return; }
    this.setBusy(true); let uploaded = 0;
    try {
      this.message('正在清理过期文件…');
      await this.list();
      for (const file of files) {
        this.message(`正在上传 ${uploaded + 1}/${files.length}：${file.name}`);
        const body = new FormData();
        body.append('owner', this.auth.record.id); body.append('originalName', file.name);
        body.append('size', String(file.size)); body.append('file', file);
        const record = await this.uploadFile(body, file, uploaded + 1, files.length);
        this.items.unshift(record); uploaded++; this.render();
      }
      $('file-input').value = ''; this.message(`已上传 ${uploaded} 个文件。另一台设备点击“刷新文件”即可下载。`);
    } catch (error) {
      // Keep only failed/unattempted files selected, so a manual retry doesn't
      // resend earlier successful files from the same batch.
      const remaining = new DataTransfer();
      for (const file of files.slice(uploaded)) remaining.items.add(file);
      $('file-input').files = remaining.files;
      this.message(`已上传 ${uploaded}/${files.length}。${this.failure(error)}`);
    }
    finally { this.setBusy(false); }
  }
  async download(item) {
    if (!this.auth || this.busy) return;
    this.setBusy(true); this.message('正在准备下载…');
    try {
      const { token } = await this.request('/api/files/token', { method: 'POST' });
      // Only a short-lived file token enters the URL; never the login token.
      const path = `/api/files/scratchpad_files/${encodeURIComponent(item.id)}/${encodeURIComponent(item.file)}?token=${encodeURIComponent(token)}&download=1`;
      const blob = await this.request(path, { binary: true });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = item.originalName || item.file; link.rel = 'noreferrer';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      this.message('已开始下载。');
    } catch (error) { this.message(this.failure(error)); }
    finally { this.setBusy(false); }
  }
  async remove(item) {
    if (!this.auth || this.busy || !confirm(`删除文件“${item.originalName || item.file}”？`)) return;
    this.setBusy(true);
    try {
      await this.request('/api/collections/scratchpad_files/records/' + encodeURIComponent(item.id), { method: 'DELETE' });
      this.items = this.items.filter(file => file.id !== item.id); this.message('文件已删除。');
    } catch (error) { this.message(this.failure(error)); }
    finally { this.setBusy(false); }
  }
}
