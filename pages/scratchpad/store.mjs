import { pruneCache } from './retention.mjs';
export class Store {
  async open() {
    this.db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('cloverfrog-scratchpad', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('accounts');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await this.prune();
  }
  async prune() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('accounts', 'readwrite');
      const cursor = tx.objectStore('accounts').openCursor();
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        const result = pruneCache(entry.value);
        if (result.changed) entry.update(result.state);
        entry.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async get(user) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('accounts');
      const r = tx.objectStore('accounts').get(user);
      r.onsuccess = () => resolve(r.result || { drafts: [], selected: null });
      r.onerror = () => reject(r.error);
    });
  }
  async put(user, state) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('accounts', 'readwrite');
      tx.objectStore('accounts').put(structuredClone(state), user);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Local save aborted'));
    });
  }
}
