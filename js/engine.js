// Stockfish 18 (lite, single-threaded WASM) in a Web Worker. One search at a time;
// interactive requests jump ahead of background game analysis.
import { idb } from './store.js';

let worker = null;
let ready = null;
let current = null;
const queue = [];
let listeners = [];

function boot() {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    try {
      worker = new Worker('vendor/stockfish-18-lite-single.js');
    } catch (e) { reject(e); return; }
    const t = setTimeout(() => reject(new Error('engine did not start')), 20000);
    worker.onmessage = e => {
      const line = typeof e.data === 'string' ? e.data : '';
      if (line === 'uciok') worker.postMessage('isready');
      else if (line === 'readyok') { clearTimeout(t); resolve(); }
      listeners.forEach(fn => fn(line));
    };
    worker.onerror = e => { clearTimeout(t); reject(e); };
    worker.postMessage('uci');
  });
  return ready;
}

function parseInfo(line, turnWhite) {
  const m = line.match(/ depth (\d+).* multipv (\d+) score (cp|mate) (-?\d+).* pv (.+)$/);
  if (!m) return null;
  let cp = m[3] === 'cp' ? +m[4] : (+m[4] > 0 ? 10000 - +m[4] : -10000 - +m[4]);
  if (!turnWhite) cp = -cp;
  return { depth: +m[1], k: +m[2], cp, pv: m[5].trim() };
}

function run(job) {
  return new Promise(resolve => {
    const lines = [];
    const turnWhite = job.fen.split(' ')[1] === 'w';
    const onLine = line => {
      if (line.startsWith('info') && line.includes(' pv ')) {
        const i = parseInfo(line, turnWhite);
        if (i) { lines[i.k - 1] = i; job.onInfo?.(lines.filter(Boolean)); }
      } else if (line.startsWith('bestmove')) {
        listeners = listeners.filter(f => f !== onLine);
        const best = line.split(' ')[1];
        const out = lines.filter(Boolean).map(l => ({ cp: l.cp, pv: l.pv, best: l.pv.split(' ')[0], depth: l.depth }));
        if (!out.length && best && best !== '(none)') out.push({ cp: 0, pv: best, best, depth: 0 });
        resolve(out);
      }
    };
    listeners.push(onLine);
    worker.postMessage(`setoption name MultiPV value ${job.multipv || 1}`);
    worker.postMessage(`position fen ${job.fen}`);
    worker.postMessage(job.movetime ? `go movetime ${job.movetime}` : `go depth ${job.depth || 12}`);
  });
}

async function pump() {
  if (current || !queue.length) return;
  current = queue.shift();
  try {
    await boot();
    current.resolve(await run(current));
  } catch (e) {
    current.reject(e);
  } finally {
    current = null;
    pump();
  }
}

// opts: {depth | movetime, multipv, onInfo, background}
export function analyse(fen, opts = {}) {
  return new Promise((resolve, reject) => {
    const job = { fen, ...opts, resolve, reject };
    if (opts.background) queue.push(job);
    else {
      const i = queue.findIndex(j => j.background);
      queue.splice(i < 0 ? queue.length : i, 0, job);
    }
    pump();
  });
}

export function stop() {
  if (worker && current) worker.postMessage('stop');
}

export function clearBackground() {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].background) { queue[i].resolve(null); queue.splice(i, 1); }
  }
}

// Cached single-line eval for a position key (White's view).
export async function evalKey(k, fen, depth = 12, background = false) {
  const hit = await idb.get('evals', k).catch(() => null);
  if (hit && hit.depth >= Math.min(depth, 10)) return hit;
  const r = await analyse(fen, { depth, background });
  if (!r) return null;
  const e = r[0] || { cp: 0, best: null, pv: '', depth };
  await idb.put('evals', e, k).catch(() => {});
  return e;
}

export const available = () => typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
