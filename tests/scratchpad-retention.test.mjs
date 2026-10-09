import test from 'node:test';
import assert from 'node:assert/strict';
import { RETENTION_MS, expired, pruneCache, cleanExpired } from '../pages/scratchpad/retention.mjs';

const now = Date.now(), old = new Date(now - RETENTION_MS).toISOString();
test('72 hour boundary and fixed cache migration window', () => {
  assert.equal(expired(now - RETENTION_MS, now), true);
  assert.equal(expired(now - RETENTION_MS + 1, now), false);
  const first = pruneCache({ drafts: [{ localId: 'old', localSavedAt: now - RETENTION_MS }, { localId: 'legacy' }], selected: 'old' }, now);
  assert.equal(first.state.selected, 'legacy');
  assert.equal(first.state.drafts[0].localSavedAt, now);
  assert.equal(pruneCache(first.state, now + RETENTION_MS).state.drafts.length, 0);
});
test('cleanup scopes owner, preserves editing and rechecks fresh timestamps', async () => {
  const calls = [];
  const items = ['expired', 'renewed', 'editing', 'foreign', 'invalid'].map(id => ({ id, owner: id === 'foreign' ? 'b' : 'a', updated: id === 'invalid' ? '' : old }));
  const result = await cleanExpired(items, { collection: 'scratchpads', owner: 'a', field: 'updated', now, keep: new Set(['editing']), request: async (path, method) => {
    calls.push([path, method]);
    return { owner: 'a', updated: path.endsWith('/renewed') ? new Date(now).toISOString() : old, id: path.split('/').at(-1) };
  } });
  assert.equal(result.removed, 1);
  assert.deepEqual(result.items.map(x => x.id), ['renewed', 'editing', 'invalid']);
  assert.equal(calls.filter(x => x[1] === 'DELETE').length, 1);
});
test('failed deletes remain retryable, missing records are removed, authentication errors propagate', async () => {
  const options = { collection: 'scratchpad_files', owner: 'a', field: 'created', now };
  const items = [{ id: 'file', owner: 'a', created: old }];
  for (const status of [403, 404]) {
    const result = await cleanExpired(items, { ...options, request: async () => { throw Object.assign(new Error(), { status }); } });
    assert.equal(result.failed, status === 403 ? 1 : 0);
    assert.equal(result.items.length, status === 403 ? 1 : 0);
  }
  await assert.rejects(cleanExpired(items, { ...options, request: async () => { throw Object.assign(new Error(), { status: 401 }); } }), { status: 401 });
});
