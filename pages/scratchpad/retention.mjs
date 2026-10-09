export const RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
export const expired = (timestamp, now = Date.now()) => Number.isFinite(timestamp) && timestamp <= now - RETENTION_MS;
const timestamp = value => Date.parse(value?.replace(' ', 'T'));

// Standard REST only. Re-read before deleting to avoid using stale list timestamps.
// There is no atomic CAS with this lightweight client-only cleanup policy.
export async function cleanExpired(items, { collection, owner, field, request, keep = new Set(), now = Date.now() }) {
  const retained = []; let removed = 0, failed = 0;
  for (const item of items) {
    if (item.owner !== owner) continue;
    if (keep.has(item.id) || !expired(timestamp(item[field]), now)) { retained.push(item); continue; }
    const path = `/api/collections/${collection}/records/${encodeURIComponent(item.id)}`;
    try {
      const current = await request(path);
      if (current.owner !== owner) continue;
      if (!expired(timestamp(current[field]), now)) { retained.push(current); continue; }
      await request(path, 'DELETE'); removed++;
    } catch (error) {
      if (error.status === 404) { removed++; continue; }
      if (error.status === 401) throw error;
      retained.push(item); failed++;
    }
  }
  return { items: retained, removed, failed };
}

// Only manual-save snapshots are retained. Older releases had no cache timestamp;
// give those existing local copies one fixed three-day migration window.
export function pruneCache(state, now = Date.now()) {
  let changed = false;
  const drafts = (state.drafts || []).filter(d => {
    if (!Number.isFinite(d.localSavedAt)) { d.localSavedAt = now; changed = true; }
    if (expired(d.localSavedAt, now)) { changed = true; return false; }
    return true;
  });
  const selected = drafts.some(d => d.localId === state.selected) ? state.selected : drafts[0]?.localId || null;
  if (selected !== state.selected) changed = true;
  return { state: { ...state, drafts, selected }, changed };
}
