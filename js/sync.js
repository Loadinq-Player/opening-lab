// Fetch new games straight from chess.com (its public API allows browser requests).
import { Chess } from './chessutil.js';
import { D, addGames, openingName, settings } from './data.js';
import { bookInfo } from './analysis.js';
import { load, save } from './store.js';
import { key } from './chessutil.js';

const DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);
const TC = { bullet: 'u', blitz: 'b', rapid: 'r', daily: 'd' };

export const state = { running: false, message: '', listeners: new Set() };
const emit = () => state.listeners.forEach(f => f(state));

export const lastSync = () => load('lastSync', 0);

function parse(g, user) {
  if (g.rules !== 'chess' || !g.pgn || g.initial_setup && g.initial_setup !== new Chess().fen()) return null;
  const white = g.white.username.toLowerCase() === user.toLowerCase();
  const me = white ? g.white : g.black, opp = white ? g.black : g.white;
  const c = new Chess();
  try { c.loadPgn(g.pgn); } catch { return null; }
  const moves = c.history({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
  // deepest named position in the first 60 plies
  const r = new Chess();
  let named = null;
  for (const u of moves.slice(0, 60)) {
    r.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    named = openingName(key(r)) || named;
  }
  const out = {
    id: g.uuid || g.url, u: (g.url || '').split('/').pop(), t: g.end_time, tc: TC[g.time_class] || 'b',
    c: white ? 'w' : 'b', r: me.rating, o: opp.username, or: opp.rating,
    s: me.result === 'win' ? 1 : DRAWS.has(me.result) ? 0.5 : 0, n: named?.name || null, e: named?.eco || null,
    m: moves.join(' '), x: me.result === 'win' ? opp.result : me.result,
  };
  if ((g.url || '').includes('/daily/')) out.d = 1;
  const b = bookInfo(out);
  out.a = { lb: b.lb, by: b.by, l: b.l, st: b.st };
  return out;
}

export async function sync() {
  if (state.running) return 0;
  const user = settings().username;
  Object.assign(state, { running: true, message: 'Checking chess.com…' });
  emit();
  let added = 0;
  try {
    const arch = await (await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user)}/games/archives`)).json();
    const months = arch.archives || [];
    const newest = D.games.length ? D.games[D.games.length - 1].t : 0;
    const since = new Date((newest || 0) * 1000);
    const want = months.filter(u => {
      const [y, m] = u.split('/').slice(-2).map(Number);
      return y > since.getFullYear() || (y === since.getFullYear() && m >= since.getMonth() + 1);
    }).slice(-6);
    for (const url of want) {
      state.message = `Downloading ${url.split('/').slice(-2).join('/')}…`;
      emit();
      const data = await (await fetch(url)).json();
      const fresh = [];
      for (const g of data.games || []) {
        const id = g.uuid || g.url;
        if (D.byId.has(id)) continue;
        const p = parse(g, user);
        if (p) fresh.push(p);
      }
      await addGames(fresh);
      added += fresh.length;
    }
    save('lastSync', Math.floor(Date.now() / 1000));
    state.message = added ? `${added} new game${added === 1 ? '' : 's'}` : 'Up to date';
  } catch (e) {
    state.message = navigator.onLine === false ? 'Offline' : `Sync failed: ${e.message}`;
  } finally {
    state.running = false;
    emit();
  }
  return added;
}
