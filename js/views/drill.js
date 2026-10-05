import { Board } from '../board.js';
import { pvSan } from '../chessutil.js';
import * as srs from '../srs.js';
import { $, esc, h, icon, md, moveText, sound } from '../util.js';
import { feedback } from './parts.js';

const KIND = { move: ['Repertoire', 'blue'], quiz: ['Plan', 'gold'], mistake: ['Your game', 'red'] };

export default function drill(root, _, q) {
  const kind = q.get('kind') || null;
  srs.syncCards();
  const start = srs.counts();
  const total = (kind ? null : start.due + start.new) || 0;
  let doneN = 0, right = 0;
  root.append(h(`<div>
    <div class="focusbar"><a class="iconbtn" href="#/today" aria-label="Close">${icon('close')}</a>
      <div class="progress"><span style="width:0"></span></div><span class="count"></span></div>
    <div class="analysis narrow-side">
      <div class="boardcol bleed"><div class="board"></div></div>
      <div class="side"><div class="cardbox"></div><div class="actionbar" hidden><button class="btn primary big block nextbtn">Continue</button></div></div>
    </div></div>`));
  const board = new Board($('.board', root));
  const box = $('.cardbox', root);
  const bar = $('.actionbar', root);
  const nextBtn = $('.nextbtn', root);

  function header(c) {
    const left = srs.counts();
    const n = left.due + left.new;
    $('.count', root).textContent = `${n} left`;
    $('.progress span', root).style.width = total ? `${Math.min(100, 100 * doneN / total)}%` : '0';
  }

  function finishScreen() {
    board.set({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', movable: null, arrows: [] });
    const c = srs.counts();
    box.innerHTML = '';
    box.append(h(`<div class="card" style="text-align:center;padding:28px 18px">
      <div style="font-size:2.4rem;line-height:1">🎉</div>
      <h2 style="margin:.6rem 0 .3rem">${doneN ? 'Session complete' : 'Nothing due'}</h2>
      <p class="muted">${doneN ? `${right} of ${doneN} right first time.` : c.total ? 'Come back tomorrow. A little every day works best.' : 'Finish a lesson to fill your deck.'}</p>
      ${c.waiting ? `<p class="small muted">${c.waiting} new cards are queued for the coming days.</p>` : ''}
      <div class="row" style="justify-content:center;margin-top:12px"><a class="btn primary" href="#/today">Back to Today</a>
      ${!c.total ? '<a class="btn" href="#/learn">Start a lesson</a>' : ''}</div></div>`));
    bar.hidden = true;
    header();
    if (doneN) sound.done();
  }

  async function next() {
    bar.hidden = true;
    const card = srs.nextCard(kind);
    header();
    if (!card) return finishScreen();
    const [label, col] = KIND[card.kind];
    box.innerHTML = '';
    box.append(h(`<div class="row" style="margin-bottom:6px"><span class="badge ${col}">${label}</span>${card.isNew ? '<span class="badge">New</span>' : ''}
      <span class="muted small" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(card.title || '')}</span></div>`));
    const turn = card.fen.split(' ')[1] === 'w' ? 'white' : 'black';
    if (card.kind === 'quiz') {
      board.set({ fen: card.fen, orientation: card.orientation, movable: null, arrows: [], silent: true });
      box.append(h(`<p class="hi" style="font-weight:600;font-size:1.05rem;margin:.6rem 0">${esc(card.prompt)}</p>`));
      card.choices.forEach((ch, k) => {
        const b = h(`<button class="choice">${md(ch, { inlineOnly: true })}</button>`);
        b.onclick = async () => {
          const res = await srs.answer(card.id, { choice: k });
          box.querySelectorAll('.choice').forEach((x, j) => { x.disabled = true; if (j === res.answer) x.classList.add('right'); else if (j === k) x.classList.add('wrong'); });
          done(card, res);
        };
        box.append(b);
      });
      return;
    }
    board.set({ fen: card.fen, orientation: card.orientation, lastMove: card.lastMove, movable: card.orientation, arrows: [], silent: true });
    box.append(h(`<div class="prompt"><span class="turn ${turn}"></span><span class="t">${esc(card.prompt)}</span></div>`));
    if (card.history?.length) box.append(h(`<div class="history">${esc(moveText(card.history))}</div>`));
    if (card.url) box.append(h(`<p class="small" style="margin-top:8px"><a href="${esc(card.url)}" target="_blank" rel="noopener">${icon('ext')} Game on chess.com</a></p>`));
    board.onMove = async mv => {
      board.onMove = null;
      board.set({ movable: null });
      if (card.kind === 'mistake') box.append(h('<p class="muted small checking">Checking with Stockfish…</p>'));
      const res = await srs.answer(card.id, { uci: mv.from + mv.to + (mv.promotion || '') });
      box.querySelector('.checking')?.remove();
      if (res.correct) board.shapes(res.arrows || [], res.highlights || []);
      else board.set({ fen: card.fen, lastMove: card.lastMove, movable: null, arrows: [`G${res.answerUci.slice(0, 4)}`, `R${mv.from}${mv.to}`], silent: true });
      done(card, res, mv.san);
    };
  }

  function done(card, res, played) {
    doneN++;
    if (res.correct) right++;
    (res.correct ? sound.right : sound.wrong)();
    let head = res.correct ? (card.kind === 'move' ? `Correct: ${res.answerSan}` : 'Correct') : (played ? `${played} isn't it: ${res.answerSan}` : 'Not quite');
    if (!res.correct && card.kind === 'quiz') head = 'Not quite';
    let body = res.why || '';
    if (res.pv && res.fen) body += `\n\nEngine line: ${moveText(pvSan(res.fen, res.pv, 6), (parseInt(res.fen.split(' ')[5] || '1') - 1) * 2 + (res.fen.split(' ')[1] === 'b' ? 1 : 0))}`;
    box.append(feedback(res.correct, head, body));
    if (!res.correct) box.append(h('<p class="tiny muted" style="margin-top:6px">This card comes back in 10 minutes.</p>'));
    bar.hidden = false;
    nextBtn.focus({ preventScroll: true });
    header();
  }

  nextBtn.onclick = next;
  const onKey = e => { if (e.key === 'Enter' && !bar.hidden && document.activeElement !== nextBtn) { e.preventDefault(); next(); } };
  document.addEventListener('keydown', onKey);
  next();
  return () => { document.removeEventListener('keydown', onKey); board.destroy(); };
}
