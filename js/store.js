// Persistence on the phone. Small state (drills, progress, settings) lives in localStorage;
// games synced on the phone and engine evals live in IndexedDB.

const PREFIX = 'ol.';

export function load(k, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + k);
    return v == null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}

export function save(k, v) {
  try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) { console.warn('save failed', k, e); }
}

export function remove(k) { try { localStorage.removeItem(PREFIX + k); } catch {} }

let dbp = null;
function db() {
  dbp ||= new Promise((resolve, reject) => {
    const r = indexedDB.open('opening-lab', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('games', { keyPath: 'id' });
      r.result.createObjectStore('evals');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}

export const idb = {
  get: (store, key) => tx(store, 'readonly', s => s.get(key)),
  put: (store, value, key) => tx(store, 'readwrite', s => (key === undefined ? s.put(value) : s.put(value, key))),
  all: store => tx(store, 'readonly', s => s.getAll()),
  clear: store => tx(store, 'readwrite', s => s.clear()),
};
