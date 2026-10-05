import { Board, stepper } from '../board.js';
import { courseProgress } from '../coach.js';
import { D } from '../data.js';
import * as srs from '../srs.js';
import { $, esc, h, icon, md, moveText, sound } from '../util.js';
import { renderCard, renderFind, renderMine, renderQuiz } from './parts.js';

export function learn(root, _, q) {
  const prog = courseProgress();
  const done = srs.progress();
  const open = q.get('m') || D.content.lessons.find(l => !done[`lesson:${l.id}`])?.module;
  root.append(h(`<div>
    <div class="pagehead"><h1>Learn</h1><span class="spacer"></span>
      <div class="seg"><button class="on">Course</button><button onclick="location.hash='#/library'">Library</button></div></div>
    <div class="card" style="margin-bottom:14px"><div class="row nowrap">
      <div style="flex:1"><div class="hi" style="font-weight:700">${prog.done} of ${prog.total} lessons</div>
      <div class="progress" style="margin-top:8px"><span style="width:${prog.pct}%"></span></div></div>
      <div class="big hi" style="font-size:1.4rem;font-weight:700">${prog.pct}%</div></div>
      <p class="small muted" style="margin:.7rem 0 0">Each lesson adds its moves and plan questions to your drills.</p></div>
    <div class="mods"></div></div>`));
  const mods = $('.mods', root);
  prog.modules.forEach((m, mi) => {
    const lessons = D.content.lessons.filter(l => l.module === m.id);
    const el = h(`<div class="module">
      <div class="head"><span class="ico ${['green', 'blue', 'gold', 'red', 'blue', 'green'][mi % 6]}" style="width:42px;height:42px;border-radius:11px;display:grid;place-items:center;background:var(--surface-3)">${mi + 1}</span>
        <span style="flex:1;min-width:0"><div class="t">${esc(m.title)}</div>
          <div class="muted small"><span class="color-dot ${m.color}"></span> as ${m.color} · ${m.done}/${m.total} done</div>
          <div class="progress" style="margin-top:7px"><span style="width:${m.total ? 100 * m.done / m.total : 0}%"></span></div></span>
        <span class="muted">${icon('down')}</span></div>
      <div class="lessons" ${m.id === open ? '' : 'hidden'}>
        <p class="small muted" style="padding:10px 18px 0;margin:0">${esc(m.description || '')}</p>
        ${lessons.map(l => `<a class="item ${done[`lesson:${l.id}`] ? 'done' : ''}" href="#/lesson/${l.id}">
          <span class="check">${icon('check')}</span>
          <span class="body"><div class="t">${esc(l.title)}</div><div class="s">${esc(l.summary || '')}</div></span>
          <span class="trail muted tiny">${l.minutes || ''}′</span></a>`).join('')}</div></div>`);
    $('.head', el).onclick = () => { const ls = $('.lessons', el); ls.hidden = !ls.hidden; };
    mods.append(el);
  });
}

export function lesson(root, id) {
  const L = D.content.lessons.find(l => l.id === id);
  if (!L) { root.innerHTML = '<div class="empty">Lesson not found.</div>'; return; }
  const mod = D.content.modules.find(m => m.id === L.module) || {};
  const steps = L.steps;
  const idx = D.content.lessons.indexOf(L);
  const next = D.content.lessons[idx + 1];
  root.append(h(`<div>
    <div class="focusbar"><a class="iconbtn" href="#/learn?m=${L.module}" aria-label="Close">${icon('close')}</a>
      <div class="progress blue"><span></span></div><span class="count"></span></div>
    <div class="analysis narrow-side">
      <div class="boardcol bleed"><div class="board"></div><div class="ctlslot"></div><div class="below"><div class="history"></div></div></div>
      <div class="side"><div class="crumbs">${esc(mod.title || '')}</div><h1 style="font-size:1.3rem">${esc(L.title)}</h1><div class="stepbox"></div>
        <div class="actionbar"><button class="btn ghost big back">${icon('prev')}</button><button class="btn primary big fwd">Continue</button></div></div>
    </div></div>`));
  const board = new Board($('.board', root), { orientation: steps[0]?.orientation || mod.color || 'white' });
  const box = $('.stepbox', root), slot = $('.ctlslot', root), hist = $('.history', root);
  let i = 0;
  let finished = false;

  function render() {
    const s = steps[i];
    finished = false;
    $('.progress span', root).style.width = `${100 * (i + 1) / steps.length}%`;
    $('.count', root).textContent = `${i + 1} / ${steps.length}`;
    $('.back', root).disabled = i === 0;
    $('.fwd', root).textContent = i === steps.length - 1 ? 'Finish lesson' : 'Continue';
    box.innerHTML = '';
    slot.innerHTML = '';
    hist.innerHTML = '';
    board.onMove = null;
    if (s.fen) board.set({ fen: s.fen, orientation: s.orientation, movable: null, arrows: s.arrows || [], highlights: s.highlights || [], silent: true });
    else board.shapes(s.arrows, s.highlights);
    if (s.sans?.length) hist.textContent = moveText(s.sans);
    if (s.text) box.append(h(`<div class="steptext">${md(s.text)}</div>`));
    if (s.quiz) renderQuiz(box, s.quiz);
    if (s.find) renderFind(box, board, s);
    if (s.line && D.content.lines[s.line]) {
      const ln = D.content.lines[s.line];
      box.append(h(`<h3>${esc(ln.name)}</h3>`));
      const list = h('<div></div>'), com = h('<div></div>');
      box.append(list, com);
      stepper({ board, moves: ln.notes, orientation: ln.color, listEl: list, commentEl: com, controlsEl: slot });
      box.append(h(`<p class="small muted">Step with the arrows under the board, or swipe it.</p>`));
    }
    if (s.game && D.content.games[s.game]) {
      const g = D.content.games[s.game];
      box.append(h(`<h3>${esc(g.headers.White)} – ${esc(g.headers.Black)} <span class="tag">${esc(g.headers.Kind)}</span></h3>`));
      const list = h('<div></div>'), com = h('<div></div>');
      box.append(list, com);
      stepper({ board, moves: g.moves, intro: g.intro, orientation: s.orientation, listEl: list, commentEl: com, controlsEl: slot });
      box.append(h(`<p class="small"><a href="#/model/${g.id}">Open in the game viewer →</a></p>`));
    }
    if (s.card && D.content.cards[s.card]) renderCard(box, board, D.content.cards[s.card], { compact: true });
    if (s.mine) renderMine(box, board, { ...s.mine, module: L.module }, { orientation: s.orientation });
  }

  function finish() {
    srs.markDone(`lesson:${L.id}`);
    sound.done();
    const c = srs.counts();
    box.innerHTML = '';
    slot.innerHTML = '';
    box.append(h(`<div class="feedback ok"><div class="head">${icon('check')} Lesson complete</div>
      <p>Its moves and ideas are in your drills now: <b>${c.new}</b> new cards ready today${c.waiting > c.new ? `, ${c.waiting - c.new} more over the next days` : ''}.</p></div>`));
    const bar = $('.actionbar', root);
    bar.innerHTML = `<a class="btn ghost big" href="#/drill">${icon('drill')} Drill</a>` +
      (next ? `<a class="btn primary big" href="#/lesson/${next.id}">Next lesson</a>` : `<a class="btn primary big" href="#/today">Done</a>`);
    finished = true;
  }

  $('.back', root).onclick = () => { if (i > 0) { i--; render(); window.scrollTo({ top: 0 }); } };
  $('.fwd', root).onclick = () => {
    if (finished) return;
    if (i < steps.length - 1) { i++; render(); if (window.innerWidth < 900) window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else finish();
  };
  render();
  return () => board.destroy();
}
