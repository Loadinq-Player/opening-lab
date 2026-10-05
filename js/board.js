// Board (chessground + chess.js), a Lichess-style move list stepper, eval bar, mini boards.
import { Chessground } from '../vendor/chessground.min.js';
import { Chess } from './chessutil.js';
import { esc, h, icon, md, sound, winPct } from './util.js';

const BRUSH = { G: 'green', R: 'red', B: 'blue', Y: 'yellow' };
export function shapes(arrows = [], highlights = []) {
  return [
    ...(arrows || []).map(a => ({ orig: a.slice(1, 3), dest: a.slice(3, 5), brush: BRUSH[a[0]] || 'green' })),
    ...(highlights || []).map(a => ({ orig: a.slice(1, 3), brush: BRUSH[a[0]] || 'yellow' })),
  ];
}

export class Board {
  // movable: null | 'white' | 'black' | 'turn'
  constructor(el, { fen, orientation = 'white', movable = null, onMove = null, coords = true } = {}) {
    this.el = el;
    this.onMove = onMove;
    this.movable = movable;
    this.chess = new Chess(fen);
    this.cg = Chessground(el, {
      fen: this.chess.fen(), orientation, coordinates: coords,
      animation: { duration: 220 }, highlight: { lastMove: true, check: true },
      drawable: { enabled: true, visible: true, defaultSnapToValidMove: true },
      movable: { free: false, showDests: true, events: { after: (o, d) => this._after(o, d) } },
      premovable: { enabled: false },
    });
    this._sync();
    this._ro = new ResizeObserver(() => this.cg.redrawAll());
    this._ro.observe(el);
  }
  _dests() {
    const d = new Map();
    for (const m of this.chess.moves({ verbose: true })) {
      if (!d.has(m.from)) d.set(m.from, []);
      d.get(m.from).push(m.to);
    }
    return d;
  }
  _sync(lastMove) {
    const turn = this.chess.turn() === 'w' ? 'white' : 'black';
    const can = this.movable === 'turn' || this.movable === turn;
    this.cg.set({
      fen: this.chess.fen(), turnColor: turn, check: this.chess.inCheck() ? turn : false,
      ...(lastMove !== undefined ? { lastMove } : {}),
      movable: { color: can ? turn : undefined, dests: can ? this._dests() : new Map() },
    });
  }
  _after(orig, dest) {
    const p = this.chess.get(orig);
    const promotion = p?.type === 'p' && (dest[1] === '8' || dest[1] === '1') ? 'q' : undefined;
    let mv = null;
    try { mv = this.chess.move({ from: orig, to: dest, promotion }); } catch { /* illegal */ }
    if (!mv) { this._sync(); return; }
    (mv.captured ? sound.capture : sound.move)();
    this._sync([orig, dest]);
    this.onMove?.(mv, this);
  }
  set({ fen, orientation, lastMove, movable, arrows, highlights, silent } = {}) {
    if (fen) {
      const prev = this.chess.fen();
      this.chess = new Chess(fen);
      if (!silent && lastMove && prev !== fen) (/x/.test(this._lastSan(lastMove, prev)) ? sound.capture : sound.move)();
    }
    if (movable !== undefined) this.movable = movable;
    if (orientation) this.cg.set({ orientation });
    this._sync(fen ? (lastMove || null) : undefined);
    if (arrows !== undefined || highlights !== undefined) this.shapes(arrows, highlights);
  }
  _lastSan(lm, prevFen) {
    try { return new Chess(prevFen).move({ from: lm[0], to: lm[1], promotion: 'q' }).san; } catch { return ''; }
  }
  shapes(arrows, highlights) { this.cg.setAutoShapes(shapes(arrows, highlights)); }
  raw(s) { this.cg.setAutoShapes(s); }
  get orientation() { return this.cg.state.orientation; }
  flip() { this.cg.toggleOrientation(); }
  fen() { return this.chess.fen(); }
  destroy() { this._ro.disconnect(); this.cg.destroy(); }
}

// Chessground measures its element, so mini boards are created once they are in the page.
export function miniBoard(el, fen, orientation = 'white', autoShapes = [], lastMove) {
  const init = () => {
    if (!el.isConnected) { requestAnimationFrame(init); return; }
    const cg = Chessground(el, { fen, orientation, viewOnly: true, coordinates: false, lastMove, animation: { enabled: false } });
    cg.setAutoShapes(autoShapes);
  };
  init();
}

export function evalBar(el) {
  el.classList.add('evalbar');
  el.innerHTML = '<div class="eb-fill"></div><div class="eb-mid"></div><span class="eb-num"></span>';
  return {
    set(cp, orientation = 'white') {
      if (cp == null) { el.classList.add('off'); return; }
      el.classList.remove('off');
      const w = winPct(cp);
      el.classList.toggle('flipped', orientation === 'black');
      el.querySelector('.eb-fill').style.height = `${w}%`;
      const num = Math.abs(cp) >= 9000 ? `M${10000 - Math.abs(cp)}` : (Math.abs(cp) / 100).toFixed(1);
      const n = el.querySelector('.eb-num');
      n.textContent = num;
      n.className = `eb-num ${cp >= 0 ? 'w' : 'b'}`;
    },
  };
}

export function controls(handlers, extra = '') {
  const el = h(`<div class="controls">
    <button class="ctl" data-a="first" aria-label="Start">${icon('first')}</button>
    <button class="ctl" data-a="prev" aria-label="Back">${icon('prev')}</button>
    <button class="ctl" data-a="next" aria-label="Forward">${icon('next')}</button>
    <button class="ctl" data-a="last" aria-label="End">${icon('last')}</button>${extra}</div>`);
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b && handlers[b.dataset.a]) handlers[b.dataset.a]();
  });
  return el;
}

// Lichess-style stepper over a list of moves: {san, why?, arrows?, highlights?, cls?}
export function stepper({ board, moves, startFen, intro, orientation = 'white', listEl, commentEl, controlsEl, onIndex, start = 0 }) {
  const fens = [startFen || new Chess().fen()];
  const lasts = [null];
  const c = new Chess(startFen);
  for (const m of moves) {
    const r = c.move(m.san);
    fens.push(c.fen());
    lasts.push([r.from, r.to]);
  }
  const f = (startFen || '').split(' ');
  const startPly = startFen ? (parseInt(f[5] || '1') - 1) * 2 + (f[1] === 'b' ? 1 : 0) : 0;
  let idx = start;

  // move list: [no][white][black] rows
  let html = '';
  for (let i = 0; i < moves.length; i++) {
    const ply = startPly + i;
    const cell = j => `<span class="mv ${moves[j].cls || ''} ${moves[j].why ? 'has-c' : ''}" data-i="${j + 1}">${esc(moves[j].san)}</span>`;
    if (ply % 2 === 0) {
      html += `<span class="no">${Math.floor(ply / 2) + 1}</span>${cell(i)}`;
      if (i + 1 < moves.length) { html += cell(i + 1); i++; } else html += '<span class="mv empty"></span>';
    } else {
      html += `<span class="no">${Math.floor(ply / 2) + 1}</span><span class="mv empty">…</span>${cell(i)}`;
    }
  }
  listEl.classList.add('movelist');
  listEl.innerHTML = html || '<span class="muted">No moves</span>';

  function show(silent) {
    board.set({ fen: fens[idx], lastMove: lasts[idx] || undefined, orientation, movable: null, silent });
    const m = moves[idx - 1];
    board.shapes(m?.arrows, m?.highlights);
    listEl.querySelectorAll('.mv.on').forEach(e => e.classList.remove('on'));
    const cur = listEl.querySelector(`.mv[data-i="${idx}"]`);
    if (cur) {
      cur.classList.add('on');
      const lr = listEl.getBoundingClientRect(), cr = cur.getBoundingClientRect();
      if (cr.top < lr.top || cr.bottom > lr.bottom) listEl.scrollTop += cr.top - lr.top - lr.height / 3;
    } else if (idx === 0) listEl.scrollTop = 0;
    if (commentEl) {
      if (idx === 0) commentEl.innerHTML = intro ? `<div class="comment intro">${md(intro)}</div>` : '';
      else commentEl.innerHTML = m.why ? `<div class="comment"><span class="c-san">${esc(m.san)}</span>${md(m.why)}</div>` : '';
    }
    onIndex?.(idx, m);
  }
  const go = i => { const prev = idx; idx = Math.max(0, Math.min(moves.length, i)); show(Math.abs(idx - prev) !== 1); };
  listEl.addEventListener('click', e => { const t = e.target.closest('.mv[data-i]'); if (t) go(+t.dataset.i); });
  if (controlsEl) controlsEl.replaceChildren(controls({
    first: () => go(0), prev: () => go(idx - 1), next: () => go(idx + 1), last: () => go(moves.length),
  }));
  const key = e => {
    if (!document.body.contains(listEl)) { document.removeEventListener('keydown', key); return; }
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { go(idx + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { go(idx - 1); e.preventDefault(); }
    if (e.key === 'ArrowUp') { go(0); e.preventDefault(); }
    if (e.key === 'ArrowDown') { go(moves.length); e.preventDefault(); }
  };
  document.addEventListener('keydown', key);
  // swipe on the board: left/right to step
  let sx = null;
  board.el.addEventListener('touchstart', e => { sx = e.touches.length === 1 && board.movable == null ? e.touches[0].clientX : null; }, { passive: true });
  board.el.addEventListener('touchend', e => {
    if (sx == null) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50) go(idx + (dx < 0 ? 1 : -1));
    sx = null;
  }, { passive: true });
  show(true);
  return { get index() { return idx; }, go, fens, length: moves.length };
}
