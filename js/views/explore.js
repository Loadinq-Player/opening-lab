import { Board, evalBar } from '../board.js';
import { Chess, STRUCTURES, classify, key, pvSan, sanToUci, uciMove } from '../chessutil.js';
import { D, TC, filtered, openingName, settings } from '../data.js';
import * as engine from '../engine.js';
import { idb } from '../store.js';
import { $, $$, dateStr, esc, fmtEval, h, icon, md, pct } from '../util.js';

const MAX_PLY = 40;

function stats(prefix, games) {
  const p = prefix ? prefix + ' ' : '';
  const next = new Map();
  let n = 0, score = 0;
  const hits = [];
  for (const g of games) {
    if (p && !g.m.startsWith(p)) continue;
    if (!p && !g.m) continue;
    n++; score += g.s;
    hits.push(g);
    const rest = g.m.slice(p.length);
    if (!rest) continue;
    const sp = rest.indexOf(' ');
    const u = sp < 0 ? rest : rest.slice(0, sp);
    let r = next.get(u);
    if (!r) next.set(u, r = { uci: u, n: 0, w: 0, d: 0, l: 0, opp: 0 });
    r.n++; r.opp += g.or || 0;
    if (g.s === 1) r.w++; else if (g.s === 0.5) r.d++; else r.l++;
  }
  return { n, pct: n ? 100 * score / n : null, moves: [...next.values()].sort((a, b) => b.n - a.n), hits };
}

const wdl = m => {
  const t = m.n || 1, seg = (cls, v) => v ? `<span class="${cls}" style="width:${100 * v / t}%">${100 * v / t >= 18 ? Math.round(100 * v / t) + '%' : ''}</span>` : '';
  return `<div class="wdl">${seg('w', m.w)}${seg('d', m.d)}${seg('l', m.l)}</div>`;
};

export default function explore(root, _, q) {
  const s = settings();
  const state = {
    color: q.get('c') || 'w',
    moves: (q.get('m') || '').split(',').filter(Boolean),
    tcs: (q.get('tc') || '').split(',').filter(Boolean),
    engineOn: false,
  };
  if (!state.tcs.length) state.tcs = s.time_classes;
  root.classList.add('wide');
  root.append(h(`<div class="analysis">
    <div class="boardcol bleed">
      <div class="boardrow"><div class="ebar"></div><div class="board"></div></div>
      <div class="controls">
        <button class="ctl" data-a="first">${icon('first')}</button><button class="ctl" data-a="back">${icon('prev')}</button>
        <button class="ctl" data-a="flip">${icon('flip')}</button><button class="ctl" data-a="engine">${icon('engine')}</button></div>
      <div class="below"><div class="engine-lines"></div><div class="history"></div></div>
    </div>
    <div class="side">
      <div class="row" style="margin-bottom:10px"><div class="seg color"><button data-c="w">White</button><button data-c="b">Black</button></div>
        <div class="chips tcs">${['bullet', 'blitz', 'rapid', 'daily'].map(t => `<button class="chip" data-t="${t}">${t}</button>`).join('')}</div></div>
      <div class="info"></div>
      <div class="tablecard" style="margin-top:12px"><div class="scroll"><table class="xtable"></table></div></div>
      <div class="section-title"><h2>Your games here</h2></div><div class="list gl"></div>
    </div></div>`));
  const board = new Board($('.board', root), {
    orientation: state.color === 'w' ? 'white' : 'black', movable: 'turn',
    onMove: mv => { state.moves.push(mv.from + mv.to + (mv.promotion || '')); load(); },
  });
  const bar = evalBar($('.ebar', root));
  let games = filtered({ color: state.color, tcs: state.tcs });
  let token = 0;

  function refilter() { games = filtered({ color: state.color, tcs: state.tcs }); }

  async function showEval(k, fen) {
    const t = ++token;
    const orient = board.orientation;
    const cached = await idb.get('evals', k).catch(() => null);
    if (t !== token) return;
    bar.set(cached ? cached.cp : null, orient);
    const lines = $('.engine-lines', root);
    lines.innerHTML = '';
    if (!state.engineOn) return;
    lines.innerHTML = '<div class="el"><span class="muted">Stockfish is thinking…</span></div>';
    engine.stop();
    try {
      await engine.analyse(fen, {
        movetime: 2500, multipv: 3,
        onInfo: ls => {
          if (t !== token) return;
          bar.set(ls[0].cp, orient);
          lines.innerHTML = ls.map(l => `<div class="el" data-u="${l.pv.split(' ')[0]}"><span class="ev">${fmtEval(l.cp)}</span><span class="pv">${esc(pvSan(fen, l.pv, 8).join(' '))}</span><span class="muted tiny">d${l.depth}</span></div>`).join('');
          board.raw([{ orig: ls[0].pv.slice(0, 2), dest: ls[0].pv.slice(2, 4), brush: 'paleBlue' }]);
        },
      });
    } catch (e) { lines.innerHTML = `<div class="el muted">Engine unavailable on this device.</div>`; }
  }

  function load() {
    const q2 = `#/explore?c=${state.color}&m=${state.moves.join(',')}&tc=${state.tcs.join(',')}`;
    history.replaceState(null, '', q2);
    $$('.color button', root).forEach(b => b.classList.toggle('on', b.dataset.c === state.color));
    $$('.tcs .chip', root).forEach(b => b.classList.toggle('on', state.tcs.includes(b.dataset.t)));
    $('.controls [data-a=engine]', root).classList.toggle('on', state.engineOn);

    const c = new Chess();
    let last;
    const sans = [];
    for (const u of state.moves) { last = uciMove(c, u); sans.push(last.san); }
    const fen = c.fen(), k = key(c);
    board.set({ fen, lastMove: last ? [last.from, last.to] : undefined, movable: 'turn', silent: true });
    const st = stats(state.moves.join(' '), games);
    const myTurn = (c.turn() === 'w') === (state.color === 'w');
    const rc = state.color === 'w' ? 'white' : 'black';
    const rep = D.content.tree[rc]?.[k] || {};
    const repMine = Object.entries(rep).find(([, e]) => e.mine);
    const named = openingName(k);

    // shapes: repertoire move in gold
    const arrows = [];
    if (repMine) { const u = sanToUci(fen, repMine[0]); if (u) arrows.push(`Y${u.slice(0, 4)}`); }
    board.shapes(arrows);

    // history
    $('.history', root).innerHTML = sans.length ? sans.map((sn, i) => `${i % 2 === 0 ? `<span class="muted">${i / 2 + 1}.</span>` : ''}<a href="#" data-k="${i + 1}" style="color:${i === sans.length - 1 ? 'var(--text-hi)' : 'var(--text)'}">${esc(sn)}</a>`).join(' ')
      : '<span class="muted">Starting position. Play a move or tap one in the table.</span>';
    $$('.history a', root).forEach(a => a.onclick = e => { e.preventDefault(); state.moves = state.moves.slice(0, +a.dataset.k); load(); });

    // info
    const cards = (D.content.anchors[k] || []).map(id => D.content.cards[id]).filter(Boolean);
    const inBook = Object.keys(rep).length > 0;
    let info = `<div class="card"><div class="row nowrap" style="align-items:flex-start"><div style="flex:1;min-width:0">
      <div class="hi" style="font-weight:700;font-size:1.05rem">${esc(named?.name || (state.moves.length ? 'Position' : 'Starting position'))}</div>
      <div class="muted small">${st.n.toLocaleString()} of your games as ${state.color === 'w' ? 'White' : 'Black'} · score ${pct(st.pct)} · ${esc(STRUCTURES[classify(k)])}</div></div>
      ${named ? `<span class="tag">${esc(named.eco)}</span>` : ''}</div>`;
    if (repMine && myTurn) info += `<div class="comment good"><span class="c-san">★ ${esc(repMine[0])}</span>${md(repMine[1].why)}</div>`;
    else if (!myTurn && inBook) info += `<div class="comment"><b>Your repertoire is ready for:</b> ${Object.keys(rep).map(esc).join(', ')}</div>`;
    else if (state.moves.length && !inBook) info += `<div class="comment warn">Out of your repertoire. Ask the 4 questions: their threat? your worst piece? which pawn break? their weakness?</div>`;
    info += cards.map(cd => `<a class="item" href="#/card/${cd.id}" style="padding:12px 0 2px"><span class="ico gold">${icon('bulb')}</span>
      <span class="body"><div class="t">${esc(cd.title)}</div><div class="s">${md(cd.summary, { inlineOnly: true }).slice(0, 220)}</div></span><span class="chev">${icon('chev')}</span></a>`).join('');
    info += '</div>';
    $('.info', root).innerHTML = info;

    // move table
    const rows = st.moves.map(m => ({ ...m, san: null }));
    const seen = new Set(rows.map(r => r.uci));
    for (const [san, e] of Object.entries(rep)) {
      const u = sanToUci(fen, san);
      if (u && !seen.has(u)) rows.push({ uci: u, n: 0, w: 0, d: 0, l: 0, opp: 0 });
    }
    const tc = new Chess(fen);
    for (const r of rows) {
      const cc = new Chess(fen);
      try { r.san = uciMove(cc, r.uci).san; } catch { r.san = r.uci; }
      r.rep = rep[r.san];
      r.name = openingName(key(cc))?.name;
    }
    $('.xtable', root).innerHTML = `<tr><th>Move</th><th class="num">Games</th><th style="width:40%">Your results</th><th class="num">Score</th></tr>` +
      (rows.length ? rows.map(r => `<tr class="click ${r.rep?.mine ? 'rep' : ''}" data-u="${r.uci}">
        <td><span class="san">${r.rep?.mine ? '<span class="star">★</span>' : ''}${esc(r.san)}</span>${r.name ? `<div class="tiny muted" style="max-width:14em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.name.split(': ').slice(-1)[0])}</div>` : ''}</td>
        <td class="num">${r.n || '<span class="muted">–</span>'}</td>
        <td>${r.n ? wdl(r) : `<span class="tiny muted">${r.rep ? 'in your repertoire' : ''}</span>`}</td>
        <td class="num">${r.n ? pct(100 * (r.w + r.d / 2) / r.n) : ''}</td></tr>`).join('') : `<tr><td colspan="4" class="muted small">No games with these filters.</td></tr>`);
    $$('.xtable tr.click', root).forEach(tr => {
      tr.onclick = () => { state.moves.push(tr.dataset.u); load(); };
      tr.onmouseenter = () => board.raw([{ orig: tr.dataset.u.slice(0, 2), dest: tr.dataset.u.slice(2, 4), brush: 'paleBlue' }]);
    });

    // games
    const recent = st.hits.slice(-12).reverse();
    $('.gl', root).innerHTML = recent.length ? recent.map(g => `<a class="item" href="#/game/${encodeURIComponent(g.id)}?ply=${state.moves.length}">
      <span class="ico ${g.s === 1 ? 'green' : g.s === 0.5 ? '' : 'red'}" style="width:30px;height:30px;font-weight:800;font-size:.8rem">${g.s === 1 ? 'W' : g.s === 0.5 ? '½' : 'L'}</span>
      <span class="body"><div class="t">${esc(g.o)} <span class="muted small">${g.or || ''}</span></div><div class="s">${esc(TC[g.tc])} · ${dateStr(g.t)}</div></span>
      <span class="chev">${icon('chev')}</span></a>`).join('') : '<div class="empty small">No games here yet.</div>';

    showEval(k, fen);
  }

  $('.controls', root).addEventListener('click', e => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'first') { state.moves = []; load(); }
    if (a === 'back') { state.moves.pop(); load(); }
    if (a === 'flip') { board.flip(); load(); }
    if (a === 'engine') { state.engineOn = !state.engineOn; if (!state.engineOn) engine.stop(); load(); }
  });
  $$('.color button', root).forEach(b => b.onclick = () => {
    state.color = b.dataset.c;
    board.set({ orientation: state.color === 'w' ? 'white' : 'black' });
    refilter(); load();
  });
  $$('.tcs .chip', root).forEach(b => b.onclick = () => {
    const t = b.dataset.t;
    state.tcs = state.tcs.includes(t) ? state.tcs.filter(x => x !== t) : [...state.tcs, t];
    if (!state.tcs.length) state.tcs = [t];
    refilter(); load();
  });
  const onKey = e => {
    if (e.key === 'ArrowLeft' && state.moves.length) { state.moves.pop(); load(); }
  };
  document.addEventListener('keydown', onKey);
  load();
  return () => { document.removeEventListener('keydown', onKey); engine.stop(); board.destroy(); };
}
