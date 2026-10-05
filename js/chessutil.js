import { Chess } from '../vendor/chess.js';

export { Chess };

// Position key identical to python-chess Board.epd(): placement, turn, castling, and the
// en-passant square only when an en-passant capture is actually legal.
export function key(chessOrFen) {
  const c = typeof chessOrFen === 'string' ? new Chess(chessOrFen) : chessOrFen;
  const f = c.fen().split(' ');
  let ep = f[3];
  if (ep !== '-' && !c.moves({ verbose: true }).some(m => m.flags.includes('e'))) ep = '-';
  return `${f[0]} ${f[1]} ${f[2]} ${ep}`;
}

export const fenFromKey = (k, ply = 0) => `${k} 0 ${Math.floor(ply / 2) + 1}`;

export function uciMove(c, uci) {
  return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
}

export function sansToUcis(sans, fen) {
  const c = new Chess(fen);
  return sans.map(s => { const m = c.move(s); return m.from + m.to + (m.promotion || ''); });
}

export function ucisToSans(ucis, fen) {
  const c = new Chess(fen);
  return ucis.map(u => uciMove(c, u).san);
}

// Board after the first n moves of a uci list.
export function replay(ucis, n = ucis.length, fen) {
  const c = new Chess(fen);
  let last;
  for (const u of ucis.slice(0, n)) last = uciMove(c, u);
  return { chess: c, last };
}

export function sanToUci(fen, san) {
  try { const m = new Chess(fen).move(san); return m.from + m.to + (m.promotion || ''); } catch { return null; }
}

export function uciToSan(fen, uci) {
  try { return uciMove(new Chess(fen), uci).san; } catch { return null; }
}

export function pvSan(fen, pv, n = 8) {
  const c = new Chess(fen);
  const out = [];
  for (const u of (pv || '').split(' ').filter(Boolean).slice(0, n)) {
    try { out.push(uciMove(c, u).san); } catch { break; }
  }
  return out;
}

export const turnOf = fen => (fen.split(' ')[1] === 'w' ? 'white' : 'black');
export const plyOf = fen => { const f = fen.split(' '); return (parseInt(f[5] || '1') - 1) * 2 + (f[1] === 'b' ? 1 : 0); };

// ---------------------------------------------------------------- pawn structure (port of app/structures.py)

export const STRUCTURES = {
  advance: 'Advance chain (e5/d4 vs d5/e6)',
  mieses: 'Mieses wedge (e5 vs doubled c-pawns)',
  'iqp-w': "Isolated queen's pawn (White's d4)",
  'iqp-b': "Isolated queen's pawn (Black's d5)",
  carlsbad: 'Carlsbad (QGD Exchange)',
  'carlsbad-rev': 'Reversed Carlsbad (Caro-Kann Exchange)',
  scotch: 'Scotch structure (e4 vs d6/d7)',
  sicilian: 'Open Sicilian (e4 vs d6+e6/e7)',
  'caro-semi': 'Caro/Scandinavian (d4 vs c6+e6)',
  'closed-d': 'Closed d4–d5 (QGD / London)',
  'closed-e': 'Open game, e4 vs e5',
  open: 'Open centre (centre pawns traded)',
  other: 'Other',
};
export const STRUCTURE_CARDS = {
  scotch: 'st-scotch-structure', mieses: 'scotch-mieses', carlsbad: 'st-carlsbad', 'carlsbad-rev': 'st-reversed-carlsbad',
  'iqp-w': 'st-iqp', 'iqp-b': 'st-iqp', advance: 'st-advance', 'caro-semi': 'st-caro-slav-centre', 'closed-d': 'st-london',
};

export function classify(fenOrKey) {
  const rows = fenOrKey.split(' ')[0].split('/');
  const files = { white: { c: new Set(), d: new Set(), e: new Set() }, black: { c: new Set(), d: new Set(), e: new Set() } };
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) { f += +ch; continue; }
      const file = 'abcdefgh'[f];
      if ((ch === 'P' || ch === 'p') && 'cde'.includes(file)) files[ch === 'P' ? 'white' : 'black'][file].add(8 - r);
      f++;
    }
  });
  const w = files.white, b = files.black, n = s => s.size;
  if (w.e.has(5) && b.d.has(5) && b.e.has(6)) return 'advance';
  if (w.e.has(5) && !n(w.d) && n(b.c) >= 2) return 'mieses';
  if (w.d.has(4) && !n(w.c) && !n(w.e) && n(w.d) === 1) return 'iqp-w';
  if (b.d.has(5) && !n(b.c) && !n(b.e) && n(b.d) === 1) return 'iqp-b';
  if (w.d.has(4) && !n(w.c) && n(w.e) && b.d.has(5) && n(b.c) && !n(b.e)) return 'carlsbad';
  if (w.d.has(4) && n(w.c) && !n(w.e) && b.d.has(5) && !n(b.c) && n(b.e)) return 'carlsbad-rev';
  if (n(w.e) && !n(w.d) && n(b.d) && !n(b.e) && n(b.c)) return 'scotch';
  if (n(w.e) && !n(w.d) && n(b.d) && n(b.e) && !n(b.c)) return 'sicilian';
  if (n(w.d) && !n(w.e) && n(b.c) && n(b.e) && !n(b.d)) return 'caro-semi';
  if (w.d.has(4) && b.d.has(5)) return 'closed-d';
  if (w.e.has(4) && b.e.has(5)) return 'closed-e';
  if (n(w.d) + n(w.e) + n(b.d) + n(b.e) <= 2) return 'open';
  return 'other';
}
