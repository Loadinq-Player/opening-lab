// Spaced repetition (port of app/srs.py; same card ids and fields, so Mac progress carries over).
//   move:<white|black>:<epd>   play the repertoire move
//   quiz:<card>:<n>            "what's the plan?" question from an idea card
//   mistake:<game>:<ply>       find a better move than you played in your own game
import { Chess, key, uciMove } from './chessutil.js';
import { D, settings } from './data.js';
import * as engine from './engine.js';
import { load, save } from './store.js';
import { DAY, now, winPct } from './util.js';

const STEPS = [4 / 24, 1, 3];
const CLOSE_ENOUGH = 6;

const cards = () => load('srs', {});
const saveCards = c => save('srs', c);
export const progress = () => load('progress', {});

export function markDone(item) {
  const p = progress();
  p[item] = now();
  save('progress', p);
  if (item.startsWith('lesson:')) syncCards();
}

export function unlocked() {
  const c = D.content;
  const lines = new Set(), cardIds = new Set();
  const lessons = Object.fromEntries(c.lessons.map(l => [l.id, l]));
  for (const item of Object.keys(progress())) {
    if (!item.startsWith('lesson:')) continue;
    const l = lessons[item.slice(7)];
    if (!l) continue;
    for (const u of l.unlocks || []) {
      if (c.repertoires[u]) c.repertoires[u].line_ids.forEach(x => lines.add(x));
      else if (c.lines[u]) lines.add(u);
    }
    for (const id of l.cards || []) cardIds.add(id);
  }
  return { lines, cards: cardIds };
}

export function syncCards() {
  const c = D.content;
  const all = cards();
  let added = 0;
  const add = (id, kind, data) => { if (!all[id]) { all[id] = { kind, ease: 2.5, interval: 0, reps: 0, lapses: 0, ...(data ? { data } : {}) }; added++; } };
  const { lines, cards: cids } = unlocked();
  for (const lid of [...lines].sort()) {
    const line = c.lines[lid];
    const ch = new Chess();
    line.sans.forEach((san, i) => {
      if ((ch.turn() === 'w') === (line.color === 'white')) add(`move:${line.color}:${key(ch)}`, 'move', { line: lid, ply: i });
      ch.move(san);
    });
  }
  for (const cid of [...cids].sort()) (c.cards[cid]?.quiz || []).forEach((_, i) => add(`quiz:${cid}:${i}`, 'quiz'));
  if (added) saveCards(all);
  return added;
}

export function addMistake(id, data) {
  const all = cards();
  if (all[id]) return false;
  all[id] = { kind: 'mistake', ease: 2.5, interval: 0, reps: 0, lapses: 0, data };
  saveCards(all);
  return true;
}

const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return Math.floor(d / 1000); };

export function counts() {
  const all = Object.values(cards());
  const s = settings();
  const t = now(), day = startOfDay();
  const due = all.filter(c => c.introduced && c.due <= t).length;
  const waiting = all.filter(c => !c.introduced).length;
  const introducedToday = all.filter(c => c.introduced >= day).length;
  const log = load('log', []);
  return {
    due: Math.min(due, s.max_reviews_per_day), dueAll: due,
    new: Math.min(waiting, Math.max(0, s.new_cards_per_day - introducedToday)),
    waiting, total: all.length,
    reviewedToday: log.filter(r => r[0] >= day).length,
  };
}

const ORDER = { mistake: 0, move: 1, quiz: 2 };

export function nextCard(kind) {
  const all = cards();
  const t = now();
  const entries = Object.entries(all).filter(([, c]) => !kind || c.kind === kind);
  for (;;) {
    let pick = entries.filter(([, c]) => c.introduced && c.due <= t).sort((a, b) => a[1].due - b[1].due)[0];
    if (!pick && counts().new > 0) {
      pick = entries.filter(([, c]) => !c.introduced).sort((a, b) => (ORDER[a[1].kind] - ORDER[b[1].kind]))[0];
    }
    if (!pick) return null;
    const card = render(pick[0], pick[1]);
    if (card) return card;
    delete all[pick[0]];
    entries.splice(entries.indexOf(pick), 1);
    saveCards(all);
  }
}

function lineBoard(line, ply) {
  const ch = new Chess();
  let last;
  for (const san of line.sans.slice(0, ply)) last = ch.move(san);
  return { ch, last };
}

function render(id, c) {
  const C = D.content;
  const out = { id, kind: c.kind, isNew: !c.introduced, reps: c.reps || 0 };
  if (c.kind === 'move') {
    const line = C.lines[c.data?.line];
    if (!line || c.data.ply >= line.sans.length) return null;
    const { ch, last } = lineBoard(line, c.data.ply);
    return { ...out, fen: ch.fen(), orientation: line.color, lastMove: last ? [last.from, last.to] : undefined,
      history: line.sans.slice(0, c.data.ply), title: line.name, prompt: 'Your move' };
  }
  if (c.kind === 'quiz') {
    const [, cid, n] = id.split(':');
    const card = C.cards[cid];
    const q = card?.quiz?.[+n];
    if (!q) return null;
    return { ...out, fen: q.fen, orientation: card.color || 'white', prompt: q.question, choices: q.choices, title: card.title, card: cid };
  }
  if (c.kind === 'mistake') {
    const d = c.data;
    if (!d?.fen || !d.best_uci) return null;
    return { ...out, fen: d.fen, orientation: d.color === 'w' ? 'white' : 'black', title: `vs ${d.opp || '?'} · move ${d.move_no}`,
      prompt: `You played ${d.played} here. Find a better move.`, url: d.url };
  }
  return null;
}

export async function answer(id, { uci, choice } = {}) {
  const all = cards();
  const c = all[id];
  const C = D.content;
  let res;
  if (c.kind === 'move') {
    const line = C.lines[c.data.line];
    const { ch } = lineBoard(line, c.data.ply);
    const want = line.sans[c.data.ply];
    const wantMv = new Chess(ch.fen()).move(want);
    const wantUci = wantMv.from + wantMv.to + (wantMv.promotion || '');
    let correct = uci === wantUci;
    if (!correct && uci) {
      try {
        const played = uciMove(new Chess(ch.fen()), uci);
        correct = !!C.tree[line.color]?.[key(ch)]?.[played.san]?.mine;
      } catch { /* illegal */ }
    }
    const note = line.notes[c.data.ply] || {};
    res = { correct, answerSan: want, answerUci: wantUci, why: note.why, arrows: note.arrows, highlights: note.highlights };
  } else if (c.kind === 'quiz') {
    const [, cid, n] = id.split(':');
    const q = C.cards[cid].quiz[+n];
    res = { correct: choice === q.answer, answer: q.answer, why: q.explanation };
  } else {
    const d = c.data;
    let correct = uci === d.best_uci;
    if (!correct && uci) {
      try {
        const after = fen => { const ch = new Chess(d.fen); uciMove(ch, fen); return ch; };
        const mine = after(uci), best = after(d.best_uci);
        const [em, eb] = await Promise.all([
          engine.evalKey(key(mine), mine.fen(), 12), engine.evalKey(key(best), best.fen(), 12)]);
        const sign = d.color === 'w' ? 1 : -1;
        correct = winPct(sign * eb.cp) - winPct(sign * em.cp) <= CLOSE_ENOUGH;
      } catch (e) { console.warn(e); }
    }
    const ch = new Chess(d.fen);
    const bestSan = uciMove(ch, d.best_uci).san;
    res = { correct, answerSan: bestSan, answerUci: d.best_uci, pv: d.pv, fen: d.fen,
      why: `In the game you played **${d.played}**, which cost about ${Math.round(d.loss || 0)}% winning chances.` };
  }
  grade(id, res.correct);
  return res;
}

export function grade(id, correct) {
  const all = cards();
  const c = all[id];
  const t = now();
  if (correct) {
    c.reps = (c.reps || 0) + 1;
    c.interval = c.reps <= STEPS.length ? STEPS[c.reps - 1] : Math.max(c.interval || 1, 1) * (c.ease || 2.5);
    c.ease = Math.min(3, (c.ease || 2.5) + 0.05);
  } else {
    c.reps = 0; c.interval = 10 / 1440; c.ease = Math.max(1.3, (c.ease || 2.5) - 0.2); c.lapses = (c.lapses || 0) + 1;
  }
  c.due = t + Math.round(c.interval * DAY);
  c.last = t;
  c.introduced ||= t;
  saveCards(all);
  const log = load('log', []);
  log.push([t, id, correct ? 1 : 0]);
  save('log', log.slice(-5000));
}

// Days in a row with at least one review (today counts once you've done one).
export function streak() {
  const days = new Set(load('log', []).map(r => new Date(r[0] * 1000).toDateString()));
  let n = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return { days: n, today: days.has(new Date().toDateString()) };
}
