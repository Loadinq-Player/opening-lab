// Idea card, repertoire line, model game, your own game, library.
import { Board, evalBar, stepper } from '../board.js';
import { chessComUrl } from '../analysis.js';
import { replay, sansToUcis, uciToSan, ucisToSans } from '../chessutil.js';
import { D, TC, ucis } from '../data.js';
import * as srs from '../srs.js';
import { $, dateStr, esc, h, icon, moveText, winPct } from '../util.js';
import { renderCard } from './parts.js';

function layout(root, crumbs, title, sub = '') {
  root.classList.add('wide');
  root.append(h(`<div>
    <div class="crumbs">${crumbs}</div>
    <div class="pagehead"><h1 style="font-size:1.35rem">${title}</h1></div>${sub}
    <div class="analysis"><div class="boardcol bleed"><div class="boardrow"><div class="ebar" hidden></div><div class="board"></div></div><div class="ctlslot"></div><div class="below"></div></div>
    <div class="side"></div></div></div>`));
  return { board: $('.board', root), side: $('.side', root), slot: $('.ctlslot', root), below: $('.below', root), ebar: $('.ebar', root) };
}

export function card(root, id) {
  const cd = D.content.cards[id];
  if (!cd) { root.innerHTML = '<div class="empty">Card not found.</div>'; return; }
  const L = layout(root, `<a href="#/library">Library</a> › Idea card`, esc(cd.title));
  const board = new Board(L.board, { orientation: cd.color });
  L.below.append(h(`<div class="history">${esc(moveText(cd.anchor_sans))}</div>`));
  L.below.append(h(`<div class="row" style="margin-top:8px"><a class="btn ghost" href="#/explore?c=${cd.color[0]}&m=${sansToUcis(cd.anchor_sans).join(',')}">${icon('explore')} Your games here</a></div>`));
  renderCard(L.side, board, cd);
  return () => board.destroy();
}

export function line(root, id) {
  const ln = D.content.lines[id];
  if (!ln) { root.innerHTML = '<div class="empty">Line not found.</div>'; return; }
  const L = layout(root, `<a href="#/library">Library</a> › Repertoire`, esc(ln.name));
  const board = new Board(L.board, { orientation: ln.color });
  const list = h('<div></div>'), com = h('<div></div>');
  L.side.append(list, com);
  stepper({ board, moves: ln.notes, orientation: ln.color, listEl: list, commentEl: com, controlsEl: L.slot, start: 0 });
  const links = h('<div class="row" style="margin-top:12px"></div>');
  if (ln.card) links.append(h(`<a class="btn" href="#/card/${ln.card}">${icon('bulb')} Idea card</a>`));
  links.append(h(`<a class="btn ghost" href="#/explore?c=${ln.color[0]}&m=${sansToUcis(ln.sans).join(',')}">${icon('explore')} Your games</a>`));
  L.side.append(links);
  return () => board.destroy();
}

export function model(root, id) {
  const g = D.content.games[id];
  if (!g) { root.innerHTML = '<div class="empty">Game not found.</div>'; return; }
  const hd = g.headers;
  const orient = /caro|^d5-|black/.test((hd.Lines || '') + ' ' + id) ? 'black' : 'white';
  const L = layout(root, `<a href="#/library">Library</a> › Model game`, `${esc(hd.White)} – ${esc(hd.Black)}`,
    `<p class="muted small" style="margin-top:-6px">${esc([hd.Event, hd.Date?.replace(/\.\?\?/g, '')].filter(Boolean).join(' · '))} · ${esc(hd.Result || '')}
     <span class="tag">${esc(hd.Kind)}</span> ${hd.Source ? `<a href="${esc(hd.Source)}" target="_blank" rel="noopener">source</a>` : ''}</p>
     ${hd.Theme ? `<div class="comment intro" style="margin:0 0 12px"><b>Theme:</b> ${esc(hd.Theme)}</div>` : ''}`);
  const board = new Board(L.board, { orientation: orient });
  const list = h('<div></div>'), com = h('<div></div>');
  L.side.append(list, com);
  let marked = false;
  stepper({ board, moves: g.moves, intro: g.intro, orientation: orient, listEl: list, commentEl: com, controlsEl: L.slot,
    onIndex: i => { if (!marked && i === g.moves.length) { marked = true; srs.markDone(`game:${id}`); } } });
  return () => board.destroy();
}

export function mygame(root, id, q) {
  const g = D.byId.get(id);
  if (!g) { root.innerHTML = '<div class="empty">Game not found.</div>'; return; }
  const a = g.a || {};
  const moves = ucis(g);
  const sans = ucisToSans(moves);
  const orient = g.c === 'w' ? 'white' : 'black';
  const res = g.s === 1 ? 'Won' : g.s === 0.5 ? 'Draw' : 'Lost';
  const url = chessComUrl(g);
  const L = layout(root, `<a href="#/insights">Insights</a> › Your game`, `${res} vs ${esc(g.o)} <span class="muted" style="font-weight:400">${g.or || ''}</span>`,
    `<p class="muted small" style="margin-top:-6px">${dateStr(g.t)} · ${esc(TC[g.tc])} · ${esc(g.n || '')}${url ? ` · <a href="${url}" target="_blank" rel="noopener">chess.com ${icon('ext', 'sm')}</a>` : ''}</p>`);
  const chips = [];
  if (a.by === 'm') chips.push(`<span class="badge gold">You left the repertoire: move ${Math.floor(a.lb / 2) + 1}</span>`);
  else if (a.by === 'o') chips.push(`<span class="badge blue">Opponent left the repertoire: move ${Math.floor(a.lb / 2) + 1}</span>`);
  if (a.mp != null) chips.push(`<span class="badge red">First mistake: move ${Math.floor(a.mp / 2) + 1} (−${Math.round(a.ml)}%)</span>`);
  if (!a.ev) chips.push('<span class="badge">Not analysed yet</span>');
  L.side.append(h(`<div class="row" style="margin-bottom:10px">${chips.join('')}</div>`));
  const board = new Board(L.board, { orientation: orient });
  const bar = a.ev ? evalBar(L.ebar) : null;
  if (bar) L.ebar.hidden = false;
  const marks = moves.map((_, i) => ({ san: sans[i], cls: i === a.mp ? 'mistake' : (i === a.lb && a.by !== 'e' ? 'book' : '') }));
  if (a.mp != null && a.mb) {
    const best = uciToSan(replay(moves, a.mp).chess.fen(), a.mb);
    marks[a.mp].why = `Mistake (−${Math.round(a.ml)}% winning chances). Better was **${best}**, shown in green.`;
  }
  const list = h('<div></div>'), com = h('<div></div>');
  L.side.append(list, com);
  const st = stepper({ board, moves: marks, orientation: orient, listEl: list, commentEl: com, controlsEl: L.slot,
    start: Math.min(+(q.get('ply') || 0), moves.length),
    onIndex: i => {
      if (bar) bar.set(a.ev[i] ?? null, orient);
      if (i === a.mp && a.mb) {
        board.shapes([`G${a.mb.slice(0, 4)}`, `R${moves[i].slice(0, 4)}`]);
        // show the position before the mistake so the arrows make sense
      }
      const ex = $('.explink', root);
      if (ex) ex.href = `#/explore?c=${g.c}&m=${moves.slice(0, i).join(',')}`;
    } });
  // jump to the position *before* the mistake when arriving from a mistake
  if (q.get('ply') && a.mp === +q.get('ply')) {
    st.go(a.mp);
    board.shapes([`G${a.mb.slice(0, 4)}`, `R${moves[a.mp].slice(0, 4)}`]);
    com.innerHTML = `<div class="comment warn">You played <b>${esc(sans[a.mp])}</b> (red) here. Better was the green move.</div>`;
  }
  if (a.ev) {
    const ev = a.ev.map(cp => cp == null ? null : (g.c === 'w' ? winPct(cp) : 100 - winPct(cp)));
    const W = 300, H = 64, n = Math.max(ev.length - 1, 1);
    const pts = ev.map((p, i) => p == null ? null : `${(i / n) * W},${H - p / 100 * H}`).filter(Boolean);
    L.below.append(h(`<div style="margin-top:10px"><svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <rect width="${W}" height="${H}" fill="#2f2c29"/><polygon points="0,${H} ${pts.join(' ')} ${W},${H}" fill="rgba(232,230,227,.85)"/>
      <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="rgba(214,79,0,.6)" stroke-width="1"/></svg>
      <div class="tiny muted">Your winning chances, first ${ev.length} moves</div></div>`));
  }
  L.below.append(h(`<p class="small" style="margin-top:8px"><a class="explink" href="#/explore">${icon('explore', 'sm')} Open this position in the explorer</a></p>`));
  return () => board.destroy();
}

export function library(root) {
  const C = D.content;
  const done = srs.progress();
  const byMod = {};
  Object.values(C.cards).forEach(c => (byMod[c.module] ||= []).push(c));
  root.append(h(`<div>
    <div class="pagehead"><h1>Learn</h1><span class="spacer"></span>
      <div class="seg"><button onclick="location.hash='#/learn'">Course</button><button class="on">Library</button></div></div>
    <div class="section-title" style="margin-top:4px"><h2>Idea cards</h2><span class="muted small">the plans behind each line</span></div>
    ${C.modules.filter(m => byMod[m.id]).map(m => `<details class="acc"><summary>${esc(m.title)} <span class="muted small" style="font-weight:400">${byMod[m.id].length}</span>${icon('down')}</summary><div class="in">
      ${byMod[m.id].map(c => `<a class="item" href="#/card/${c.id}" style="padding:10px 0"><span class="ico gold" style="width:32px;height:32px">${icon('bulb')}</span><span class="body"><div class="t">${esc(c.title)}</div></span><span class="chev">${icon('chev')}</span></a>`).join('')}</div></details>`).join('')}
    <div class="section-title"><h2>Repertoire</h2></div>
    ${Object.values(C.repertoires).map(r => `<details class="acc"><summary><span class="color-dot ${r.color}"></span> ${esc(r.title)} <span class="muted small" style="font-weight:400">${r.line_ids.length} lines</span>${icon('down')}</summary><div class="in">
      ${r.line_ids.map(l => `<a class="item" href="#/line/${l}" style="padding:9px 0"><span class="body"><div class="t" style="font-weight:500">${esc(C.lines[l].name)}</div></span><span class="chev">${icon('chev')}</span></a>`).join('')}</div></details>`).join('')}
    <div class="section-title"><h2>Model games</h2></div>
    <div class="list">${Object.values(C.games).map(g => `<a class="item ${done['game:' + g.id] ? 'done' : ''}" href="#/model/${g.id}">
      <span class="ico gold">${icon('book')}</span><span class="body"><div class="t">${esc(g.headers.White)} – ${esc(g.headers.Black)}</div>
      <div class="s">${esc(g.headers.Theme || '')}</div></span><span class="trail tiny muted">${esc((g.headers.Date || '').slice(0, 4))}</span></a>`).join('')}</div>
  </div>`));
}
