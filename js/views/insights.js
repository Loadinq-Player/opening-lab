import { miniBoard } from '../board.js';
import { positions, report, structureReport } from '../analysis.js';
import { STRUCTURES, STRUCTURE_CARDS } from '../chessutil.js';
import { D } from '../data.js';
import { $, $$, DAY, dateStr, esc, h, icon, now, pct } from '../util.js';

function sheet(content) {
  const bg = h('<div class="sheet-bg"></div>');
  const sh = h('<div class="sheet"><div class="grab"></div></div>');
  sh.append(content);
  const close = () => { bg.remove(); sh.remove(); };
  bg.onclick = close;
  document.body.append(bg, sh);
  return close;
}

function mistakeGrid(items) {
  const grid = h('<div class="minis"></div>');
  for (const p of items) {
    const el = h(`<div class="mini-card"><div class="mini"></div><div class="cap"><b>Move ${p.moveNo}</b>: ${esc(p.san)}
      ${p.bestSan ? `→ <span class="good">${esc(p.bestSan)}</span>` : ''}<br><span class="muted">vs ${esc(p.opp)} · ${dateStr(p.t)}${p.loss ? ` · −${Math.round(p.loss)}%` : ''}</span></div></div>`);
    const arrows = [{ orig: p.uci.slice(0, 2), dest: p.uci.slice(2, 4), brush: 'red' }];
    if (p.bestUci) arrows.push({ orig: p.bestUci.slice(0, 2), dest: p.bestUci.slice(2, 4), brush: 'green' });
    miniBoard($('.mini', el), p.fen, p.color === 'w' ? 'white' : 'black', arrows);
    el.onclick = () => { document.querySelector('.sheet-bg')?.click(); location.hash = `#/game/${encodeURIComponent(p.id)}?ply=${p.ply}`; };
    grid.append(el);
  }
  return grid;
}

export default function insights(root, _, q) {
  const state = { color: q.get('c') || 'w', days: +(q.get('days') || 0) };
  root.append(h(`<div>
    <div class="pagehead"><h1>Insights</h1><span class="spacer"></span>
      <div class="seg color"><button data-c="w">White</button><button data-c="b">Black</button></div></div>
    <div class="chips period" style="margin-bottom:12px">${[[0, 'All time'], [365, 'Year'], [90, '90 days'], [30, '30 days']].map(([d, l]) => `<button class="chip" data-d="${d}">${l}</button>`).join('')}</div>
    <p class="muted small">Where your openings cost you points. <b>Left book</b>: how often <i>you</i> leave the repertoire first. <b>Early mistakes</b>: analysed games with a real mistake (≥12% winning chances) in the first 10 moves. <b>After book</b>: winning chances lost per move once the opening ends.</p>
    <div class="list leaks"></div>
    <div class="section-title"><h2>Recent mistakes</h2></div><div class="recent"></div>
    <div class="section-title"><h2>By pawn structure</h2><span class="muted small">around move 12</span></div>
    <div class="list structs"></div></div>`));

  function load() {
    $$('.color button', root).forEach(b => b.classList.toggle('on', b.dataset.c === state.color));
    $$('.period .chip', root).forEach(b => b.classList.toggle('on', +b.dataset.d === state.days));
    history.replaceState(null, '', `#/insights?c=${state.color}&days=${state.days}`);
    const since = state.days ? now() - state.days * DAY : null;
    const rows = report({ color: state.color, since }).filter(r => r.n >= 5).slice(0, 30);
    $('.leaks', root).innerHTML = rows.length ? rows.map((r, i) => {
      const scoreCls = r.pct < 45 ? 'bad' : r.pct > 55 ? 'good' : 'hi';
      return `<div class="item" data-i="${i}">
        <span class="body"><div class="t">${r.card ? `<span style="color:var(--gold)">${icon('bulb', 'sm')}</span> ` : ''}${esc(r.title)}</div>
          <div class="s">${r.n} games · left book ${pct(100 * r.meLeft / r.n)}${r.avgLeft ? ` (move ${r.avgLeft.toFixed(1)})` : ''}
          ${r.earlyRate != null ? ` · early mistakes ${pct(r.earlyRate)}` : ''}${r.afterBook != null ? ` · after book ${r.afterBook.toFixed(1)}` : ''}</div></span>
        <span class="trail"><div class="${scoreCls}" style="font-weight:700;font-size:1.05rem">${pct(r.pct)}</div><div class="tiny muted">score</div></span></div>`;
    }).join('') : '<div class="empty">Not enough games with these filters.</div>';
    $$('.leaks .item', root).forEach(el => el.onclick = () => {
      const r = rows[+el.dataset.i];
      const c = h(`<div><h2 style="margin-top:0">${esc(r.title)}</h2>
        <div class="stats"><div class="stat"><div class="v">${r.n}</div><div class="l">Games</div></div>
        <div class="stat"><div class="v">${pct(r.pct)}</div><div class="l">Score</div></div>
        <div class="stat"><div class="v">${pct(100 * r.meLeft / r.n)}</div><div class="l">You left book</div></div>
        <div class="stat"><div class="v">${r.afterBook == null ? '–' : r.afterBook.toFixed(1)}</div><div class="l">After book</div></div></div>
        <div class="row" style="margin:12px 0">${r.card ? `<a class="btn primary" href="#/card/${r.card}">${icon('bulb')} Study the plan</a>` : ''}
          <a class="btn" href="#/explore?c=${state.color}">${icon('explore')} Explorer</a></div>
        <h3>Where you went wrong</h3><div class="pos"></div><h3>Where you left the repertoire</h3><div class="lb"></div></div>`);
      const line = r.key.startsWith('~') ? null : r.key;
      const mk = line ? positions('mistakes', { color: state.color, line, limit: 8, since }) : [];
      const lb = line ? positions('left_book', { color: state.color, line, limit: 8, since }) : [];
      $('.pos', c).append(mk.length ? mistakeGrid(mk) : h('<p class="muted small">No analysed mistakes in this line yet.</p>'));
      $('.lb', c).append(lb.length ? mistakeGrid(lb.map(p => ({ ...p, bestSan: p.bookSan, bestUci: null, loss: null }))) : h('<p class="muted small">None. You followed the repertoire.</p>'));
      sheet(c);
    });

    const recent = positions('mistakes', { color: state.color, limit: 12, since });
    $('.recent', root).replaceChildren(recent.length ? mistakeGrid(recent) : h('<div class="empty">No analysed mistakes yet.</div>'));

    const st = structureReport({ color: state.color, since }).filter(r => r.n >= 10);
    $('.structs', root).innerHTML = st.map(r => {
      const card = STRUCTURE_CARDS[r.id] && D.content.cards[STRUCTURE_CARDS[r.id]] ? STRUCTURE_CARDS[r.id] : null;
      return `<${card ? `a href="#/card/${card}"` : 'div'} class="item"><span class="body"><div class="t">${esc(STRUCTURES[r.id] || r.id)}</div>
        <div class="s">${r.n} games${r.afterBook != null ? ` · after book ${r.afterBook.toFixed(1)}` : ''}${card ? ' · <span style="color:var(--blue)">study it</span>' : ''}</div></span>
        <span class="trail"><div class="${r.pct < 45 ? 'bad' : r.pct > 55 ? 'good' : 'hi'}" style="font-weight:700">${pct(r.pct)}</div></span></${card ? 'a' : 'div'}>`;
    }).join('') || '<div class="empty">No data.</div>';
  }
  $$('.color button', root).forEach(b => b.onclick = () => { state.color = b.dataset.c; load(); });
  $$('.period .chip', root).forEach(b => b.onclick = () => { state.days = +b.dataset.d; load(); });
  load();
  return () => document.querySelector('.sheet-bg')?.click();
}
