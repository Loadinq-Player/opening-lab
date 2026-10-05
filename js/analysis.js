// Opening diagnostics (port of app/leaks.py) + on-phone engine analysis for newly synced games.
import { Chess, classify, key, uciMove, uciToSan } from './chessutil.js';
import { D, filtered, ucis, updateGame } from './data.js';
import * as engine from './engine.js';
import { winPct } from './util.js';

export const MISTAKE = 12;
const STRUCTURE_PLY = 24;
const EVAL_PLIES = 31;
const AFTER_BOOK_MOVES = 10;

const repColor = c => (c === 'w' ? 'white' : 'black');

// Walk a game through the repertoire tree: where did it leave book and who left?
export function bookInfo(g) {
  const tree = D.content.tree[repColor(g.c)] || {};
  const moves = ucis(g);
  const c = new Chess();
  let lb = null, by = 'e', line = null, card = null, st = null;
  const keys = [];
  for (let ply = 0; ply < Math.min(moves.length, 60); ply++) {
    const k = key(c);
    keys.push(k);
    if (ply === STRUCTURE_PLY) st = classify(k);
    const mv = uciMove(c, moves[ply]);
    if (lb == null) {
      const entry = tree[k];
      const mine = (ply % 2 === 0) === (g.c === 'w');
      if (!entry) { lb = ply; by = ply > 0 ? 'e' : (mine ? 'm' : 'o'); }
      else if (!entry[mv.san]) { lb = ply; by = mine ? 'm' : 'o'; }
      else line = entry[mv.san].lines[0];
    }
  }
  if (lb == null) lb = Math.min(moves.length, 60);
  if (st == null) st = classify(key(c));
  for (const k of keys) {
    for (const cid of D.content.anchors[k] || []) {
      if ((D.content.cards[cid]?.color || 'white')[0] === g.c) card = cid;
    }
  }
  return { lb, by, l: card || line, st, keys };
}

// Engine pass for one game (phone-side). Mirrors leaks.engine_pass_game.
export async function analyseGame(g, { depth = 11 } = {}) {
  const info = bookInfo(g);
  const moves = ucis(g);
  const n = Math.min(moves.length, EVAL_PLIES);
  const c = new Chess();
  const ev = [];
  for (let ply = 0; ply < n; ply++) {
    const k = info.keys[ply] || key(c);
    const e = await engine.evalKey(k, c.fen(), depth, true);
    if (!e) return null; // cancelled
    ev.push({ cp: e.cp, best: e.best, pv: e.pv });
    uciMove(c, moves[ply]);
  }
  const me = cp => (g.c === 'w' ? winPct(cp) : 100 - winPct(cp));
  const losses = {};
  for (let i = 0; i < ev.length - 1; i++) {
    if ((i % 2 === 0) !== (g.c === 'w')) continue;
    losses[i] = Math.max(0, me(ev[i].cp) - me(ev[i + 1].cp));
  }
  const a = { lb: info.lb, by: info.by, l: info.l, st: info.st, ev: ev.map(e => e.cp) };
  const first = Object.entries(losses).find(([, l]) => l >= MISTAKE);
  if (first) {
    const ply = +first[0];
    a.mp = ply; a.ml = Math.round(first[1] * 10) / 10;
    a.mb = ev[ply].best; a.pv = (ev[ply].pv || '').split(' ').slice(0, 8).join(' ');
  }
  const window = Object.entries(losses).filter(([i]) => +i >= info.lb && +i < info.lb + 2 * AFTER_BOOK_MOVES).map(([, l]) => l);
  if (window.length) a.ab = Math.round(100 * window.reduce((x, y) => x + y, 0) / window.length) / 100;
  g.a = a;
  await updateGame(g);
  return a;
}

// ---------------------------------------------------------------- background queue

export const bg = { running: false, done: 0, total: 0, listeners: new Set() };
const emit = () => bg.listeners.forEach(f => f(bg));

export async function analyseRecent({ limit = 40 } = {}) {
  if (bg.running || !engine.available()) return;
  const todo = filtered({}).filter(g => !g.a?.ev).slice(-limit).reverse();
  if (!todo.length) return;
  Object.assign(bg, { running: true, done: 0, total: todo.length });
  emit();
  try {
    for (const g of todo) {
      if (!bg.running) break;
      const r = await analyseGame(g);
      if (!r) break;
      bg.done++;
      emit();
    }
  } catch (e) {
    console.warn('analysis stopped', e);
  } finally {
    bg.running = false;
    emit();
  }
}

export function stopBackground() { bg.running = false; engine.clearBackground(); }

// ---------------------------------------------------------------- reports

export function groupKey(g) {
  return g.a?.l || ('~' + (g.n || 'Unknown').split(':')[0]);
}

export function groupTitle(k) {
  const c = D.content;
  if (c.cards[k]) return { title: c.cards[k].title, card: k };
  if (c.lines[k]) return { title: c.lines[k].name, card: c.lines[k].card };
  return { title: k.replace(/^~/, ''), card: null };
}

export function report({ color, since, tcs } = {}) {
  const groups = new Map();
  for (const g of filtered({ color, since, tcs })) {
    const k = groupKey(g);
    let r = groups.get(k);
    if (!r) groups.set(k, r = { key: k, color: g.c, n: 0, score: 0, meLeft: 0, oppLeft: 0, left: [], analysed: 0, early: 0, after: [] });
    const a = g.a || {};
    r.n++; r.score += g.s;
    if (a.by === 'm') r.meLeft++;
    if (a.by === 'o') r.oppLeft++;
    if (a.lb != null) r.left.push(a.lb);
    if (a.ev) {
      r.analysed++;
      if (a.mp != null && a.mp < 20) r.early++;
      if (a.ab != null) r.after.push(a.ab);
    }
  }
  return [...groups.values()].map(r => ({
    ...r, ...groupTitle(r.key),
    pct: 100 * r.score / r.n,
    avgLeft: r.left.length ? r.left.reduce((x, y) => x + y, 0) / r.left.length / 2 + 0.5 : null,
    earlyRate: r.analysed ? 100 * r.early / r.analysed : null,
    afterBook: r.after.length ? r.after.reduce((x, y) => x + y, 0) / r.after.length : null,
  })).sort((a, b) => b.n - a.n);
}

export function structureReport({ color, since, tcs } = {}) {
  const m = new Map();
  for (const g of filtered({ color, since, tcs })) {
    const s = g.a?.st;
    if (!s) continue;
    let r = m.get(s);
    if (!r) m.set(s, r = { id: s, n: 0, score: 0, after: [] });
    r.n++; r.score += g.s;
    if (g.a.ab != null) r.after.push(g.a.ab);
  }
  return [...m.values()].map(r => ({ ...r, pct: 100 * r.score / r.n,
    afterBook: r.after.length ? r.after.reduce((x, y) => x + y, 0) / r.after.length : null })).sort((a, b) => b.n - a.n);
}

// Ids that count as "this line": a line id, a card id, or a whole repertoire.
function lineIds(line) {
  const c = D.content;
  const ids = new Set([line]);
  if (c.repertoires[line]) for (const l of c.repertoires[line].line_ids) { ids.add(l); if (c.lines[l].card) ids.add(c.lines[l].card); }
  if (c.lines[line]?.card) ids.add(c.lines[line].card);
  if (c.cards[line]) for (const [l, v] of Object.entries(c.lines)) if (v.card === line) ids.add(l);
  return ids;
}

// Concrete positions from the user's games. kind: mistakes | left_book
export function positions(kind, { color, line, limit = 20, since, tcs } = {}) {
  const ids = line ? lineIds(line) : null;
  const out = [];
  const games = filtered({ color, since, tcs });
  for (let i = games.length - 1; i >= 0 && out.length < limit; i--) {
    const g = games[i], a = g.a || {};
    if (ids && !ids.has(a.l)) continue;
    const ply = kind === 'mistakes' ? a.mp : (a.by === 'm' ? a.lb : null);
    if (ply == null || (kind === 'mistakes' && !a.mb)) continue;
    const moves = ucis(g);
    if (ply >= moves.length) continue;
    const c = new Chess();
    for (const u of moves.slice(0, ply)) uciMove(c, u);
    const fen = c.fen();
    const p = { id: g.id, g, ply, fen, moveNo: Math.floor(ply / 2) + 1, color: g.c, uci: moves[ply],
      san: uciToSan(fen, moves[ply]), loss: a.ml, opp: g.o, t: g.t, url: chessComUrl(g), opening: g.n, line: a.l };
    if (a.mb) { p.bestUci = a.mb; p.bestSan = uciToSan(fen, a.mb); p.pv = a.pv; }
    if (kind === 'left_book') {
      const entry = D.content.tree[repColor(g.c)]?.[key(c)] || {};
      const book = Object.entries(entry).find(([, e]) => e.mine);
      if (book) { p.bookSan = book[0]; p.bookWhy = book[1].why; p.bookArrows = book[1].arrows; }
      if (kind === 'left_book' && !book) continue;
    }
    out.push(p);
  }
  return out;
}

export function chessComUrl(g) {
  return g.u ? `https://www.chess.com/game/${g.d ? 'daily' : 'live'}/${g.u}` : null;
}
