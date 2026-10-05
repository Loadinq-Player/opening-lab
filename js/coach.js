// The daily session: drills, next lesson, a mistake from recent games, a model game.
import { MISTAKE, positions } from './analysis.js';
import { D, filtered } from './data.js';
import * as srs from './srs.js';
import { DAY, now } from './util.js';

const RECENT_DAYS = 14;

export function nextLesson() {
  const done = srs.progress();
  return D.content.lessons.find(l => !done[`lesson:${l.id}`]) || null;
}

export function harvestMistakes(limit = 6) {
  let added = 0;
  for (const p of positions('mistakes', { since: now() - RECENT_DAYS * DAY, limit: 50 })) {
    if (!p.bestUci || (p.loss || 0) < MISTAKE) continue;
    if (srs.addMistake(`mistake:${p.id}:${p.ply}`, {
      fen: p.fen, color: p.color, best_uci: p.bestUci, played: p.san, loss: p.loss, opp: p.opp,
      move_no: p.moveNo, url: p.url, pv: p.pv, line: p.line,
    })) added++;
    if (added >= limit) break;
  }
  return added;
}

export function modelGame() {
  const done = srs.progress();
  const { cards } = srs.unlocked();
  const all = Object.values(D.content.games);
  const pool = [...all.filter(g => g.lines.some(l => cards.has(l))), ...all];
  return pool.find(g => !done[`game:${g.id}`]) || null;
}

export function courseProgress() {
  const done = srs.progress();
  const mods = D.content.modules.map(m => {
    const ls = D.content.lessons.filter(l => l.module === m.id);
    return { ...m, total: ls.length, done: ls.filter(l => done[`lesson:${l.id}`]).length };
  });
  const total = mods.reduce((a, m) => a + m.total, 0), fin = mods.reduce((a, m) => a + m.done, 0);
  return { modules: mods, total, done: fin, pct: total ? Math.round(100 * fin / total) : 0 };
}

export function form(days = 7) {
  const gs = filtered({ since: now() - days * DAY });
  const after = gs.map(g => g.a?.ab).filter(x => x != null);
  return {
    days, games: gs.length,
    pct: gs.length ? 100 * gs.reduce((a, g) => a + g.s, 0) / gs.length : null,
    leftByMe: gs.filter(g => g.a?.by === 'm').length,
    afterBook: after.length ? after.reduce((a, b) => a + b, 0) / after.length : null,
  };
}

export function today() {
  srs.syncCards();
  harvestMistakes();
  return {
    cards: srs.counts(),
    lesson: nextLesson(),
    mistakes: positions('mistakes', { since: now() - RECENT_DAYS * DAY, limit: 3 }),
    model: modelGame(),
    form: form(7),
    progress: courseProgress(),
    streak: srs.streak(),
  };
}
