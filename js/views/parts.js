// Pieces shared by lessons, idea cards and drills.
import { Chess, sanToUci, turnOf } from '../chessutil.js';
import { D } from '../data.js';
import { positions } from '../analysis.js';
import { $, $$, dateStr, esc, h, icon, md, moveText, sound } from '../util.js';

export function renderQuiz(container, q, { onAnswer } = {}) {
  const box = h(`<div class="quiz"><p class="hi" style="font-weight:600;font-size:1.02rem">${esc(q.question)}</p></div>`);
  q.choices.forEach((ch, k) => {
    const b = h(`<button class="choice">${md(ch, { inlineOnly: true })}</button>`);
    b.onclick = () => {
      const ok = k === q.answer;
      $$('.choice', box).forEach((x, j) => {
        x.disabled = true;
        if (j === q.answer) x.classList.add('right');
        else if (j === k) x.classList.add('wrong');
      });
      (ok ? sound.right : sound.wrong)();
      box.append(feedback(ok, ok ? 'Correct' : 'Not quite', q.explanation));
      onAnswer?.(ok);
    };
    box.append(b);
  });
  container.append(box);
}

export function feedback(ok, head, body) {
  return h(`<div class="feedback ${ok ? 'ok' : 'no'}"><div class="head">${icon(ok ? 'check' : 'x')}${esc(head)}</div>${md(body || '')}</div>`);
}

export function renderFind(container, board, step, { onAnswer } = {}) {
  const f = step.find;
  const sols = Array.isArray(f.solution) ? f.solution : [f.solution];
  const turn = turnOf(step.fen);
  const norm = s => s.replace(/[+#!?]/g, '');
  const box = h(`<div><div class="prompt"><span class="turn ${turn}"></span><span class="t">Find the move</span>
    <span class="spacer"></span><button class="btn ghost hint" style="padding:.35rem .7rem">${icon('hint')} Hint</button>
    <button class="btn ghost show" style="padding:.35rem .7rem">${icon('eye')}</button></div><div class="fb"></div></div>`);
  container.append(box);
  const fb = $('.fb', box);
  let solved = false;
  const reveal = ok => {
    solved = true;
    board.onMove = null;
    const u = sanToUci(step.fen, sols[0]);
    if (!ok) board.set({ fen: step.fen, movable: null });
    else board.set({ movable: null });
    board.shapes(u ? [`G${u.slice(0, 4)}`] : []);
    fb.replaceChildren(feedback(ok, ok ? `Correct: ${sols[0]}` : `The move is ${sols[0]}`, f.explanation));
    ok ? sound.right() : null;
    onAnswer?.(ok);
  };
  board.set({ fen: step.fen, orientation: step.orientation || turn, movable: turn, arrows: step.arrows, highlights: step.highlights });
  board.onMove = mv => {
    if (solved) return;
    if (sols.map(norm).includes(norm(mv.san))) reveal(true);
    else {
      sound.wrong();
      fb.replaceChildren(h(`<div class="feedback no"><div class="head">${icon('x')}${esc(mv.san)} isn't it. Try again.</div></div>`));
      setTimeout(() => !solved && board.set({ fen: step.fen, movable: turn }), 650);
    }
  };
  $('.hint', box).onclick = () => fb.replaceChildren(h(`<div class="comment warn">${md(f.hint || 'Checks, captures and threats first. Then: which piece is doing nothing?')}</div>`));
  $('.show', box).onclick = () => reveal(false);
}

export function renderMine(container, board, spec, { orientation } = {}) {
  const color = spec?.line && D.content.lines[spec.line] ? D.content.lines[spec.line].color[0]
    : spec?.line && D.content.cards[spec.line] ? (D.content.cards[spec.line].color || 'white')[0]
    : (orientation ? orientation[0] : null);
  const items = positions(spec?.kind || 'mistakes', { color: spec?.module === 'principles' ? null : color, line: spec?.line, limit: spec?.count || 3 });
  if (!items.length) {
    container.append(h(`<div class="comment muted">No ${spec?.kind === 'left_book' ? 'repertoire departures' : 'analysed mistakes'} from your games match this yet. Keep playing: new games are analysed automatically.</div>`));
    return;
  }
  const box = h('<div></div>');
  items.forEach((p, k) => {
    const el = h(`<div class="plan"><h4>${icon('sword')} Game ${k + 1}: vs ${esc(p.opp)} <span class="muted small" style="font-weight:400">· move ${p.moveNo} · ${dateStr(p.t)}</span></h4>
      <div class="small ans">You played <b>${esc(p.san)}</b>. Tap to see the position, tap again for the answer.</div></div>`);
    let stage = 0;
    el.onclick = () => {
      $$('.plan', box).forEach(x => x.classList.remove('on'));
      el.classList.add('on');
      const orient = p.color === 'w' ? 'white' : 'black';
      if (stage === 0) {
        board.set({ fen: p.fen, orientation: orient, movable: null, arrows: [`R${p.uci.slice(0, 4)}`] });
        $('.ans', el).innerHTML = `You played <b>${esc(p.san)}</b> (red). What would you play instead? Tap again to reveal.`;
        stage = 1;
      } else {
        const better = p.bookSan || p.bestSan;
        const u = better && sanToUci(p.fen, better);
        board.shapes([`R${p.uci.slice(0, 4)}`, ...(u ? [`G${u.slice(0, 4)}`] : [])]);
        $('.ans', el).innerHTML = p.bookSan ? `Your repertoire plays <b>${esc(p.bookSan)}</b>. ${md(p.bookWhy || '', { inlineOnly: true })}`
          : `Better was <b>${esc(p.bestSan || '?')}</b> (−${Math.round(p.loss || 0)}% in the game). <a href="#/game/${encodeURIComponent(p.id)}?ply=${p.ply}">Open game</a>`;
      }
    };
    box.append(el);
  });
  container.append(box);
}

// Full or compact idea card. Plans and traps drive the board.
export function renderCard(container, board, card, { compact = false } = {}) {
  const shapesOf = o => ({ arrows: o?.arrows || [], highlights: o?.highlights || [] });
  const base = () => board.set({ fen: card.fen, orientation: card.color, movable: null, ...shapesOf(card.board) });
  base();
  const el = h(`<div class="ideacard">
    ${compact ? `<h3 style="margin-top:0">${icon('bulb')} ${esc(card.title)}</h3>` : ''}
    <div class="steptext">${md(card.summary)}</div>
    <div class="kv" style="margin:.6rem 0 .2rem"><b>White wants</b><span>${md(card.goals?.white, { inlineOnly: true })}</span>
      <b>Black wants</b><span>${md(card.goals?.black, { inlineOnly: true })}</span></div>
    ${card.structure ? `<h3>${esc(card.structure.name)}</h3><div>${md(card.structure.description)}</div>` : ''}
    <h3>Plans <span class="muted small" style="font-weight:400">tap to show on the board</span></h3><div class="plans"></div>
    ${card.opponent_plans?.length ? '<h3>What the opponent wants</h3><div class="oplans"></div>' : ''}
  </div>`);
  const planEl = (p, cls = '') => {
    const d = h(`<div class="plan ${cls}"><h4>${esc(p.title)}</h4><ul>${(p.steps || []).map(s => `<li>${md(s, { inlineOnly: true })}</li>`).join('')}</ul></div>`);
    d.onclick = () => {
      const on = d.classList.contains('on');
      $$('.plan', el).forEach(x => x.classList.remove('on'));
      if (on) { base(); return; }
      d.classList.add('on');
      board.set({ fen: card.fen, movable: null, ...shapesOf(p) });
    };
    return d;
  };
  (card.plans || []).forEach(p => $('.plans', el).append(planEl(p)));
  (card.opponent_plans || []).forEach(p => $('.oplans', el).append(planEl(p)));
  if (compact) {
    el.append(h(`<p class="small" style="margin-top:.8rem"><a href="#/card/${card.id}">Full card: pieces, breaks, traps, model games →</a></p>`));
    container.append(el);
    return;
  }
  const acc = (title, inner, open = false) => h(`<details class="acc" ${open ? 'open' : ''}><summary>${title}${icon('down')}</summary><div class="in">${inner}</div></details>`);
  if (card.pieces?.length) el.append(acc('Where the pieces go', `<ul>${card.pieces.map(p => `<li><b>${esc(p.piece)} → ${esc(p.square)}</b>: ${md(p.why, { inlineOnly: true })}</li>`).join('')}</ul>`, true));
  if (card.key_squares?.length) el.append(acc('Key squares', `<ul>${card.key_squares.map(p => `<li><b>${esc(p.square)}</b>: ${md(p.why, { inlineOnly: true })}</li>`).join('')}</ul>`));
  if (card.breaks) el.append(acc('Pawn breaks', ['white', 'black'].map(c => `<p><b>${c[0].toUpperCase() + c.slice(1)}</b></p><ul>${(card.breaks[c] || []).map(b => `<li><b>${esc(b.move)}</b>: ${md(b.why, { inlineOnly: true })}</li>`).join('') || '<li class="muted">–</li>'}</ul>`).join('')));
  if (card.traps?.length) {
    const t = acc('Traps and tactics', '');
    card.traps.forEach(tr => {
      const d = h(`<div class="plan"><h4>${icon('sword')} ${esc(tr.title)}</h4><div class="small">${md(tr.explanation)}</div></div>`);
      d.onclick = () => {
        $$('.plan', el).forEach(x => x.classList.remove('on'));
        d.classList.add('on');
        const c = new Chess();
        let last;
        tr.sans.forEach(s => { const m = c.move(s); last = [m.from, m.to]; });
        board.set({ fen: tr.fen, movable: null, lastMove: last, arrows: [] });
        if (!d.querySelector('.tm')) d.append(h(`<p class="tm small muted" style="margin:.4rem 0 0">${esc(moveText(tr.sans))}</p>`));
      };
      $('.in', t).append(d);
    });
    el.append(t);
  }
  if (card.if_deviates?.length) el.append(acc('If they deviate', `<ul>${card.if_deviates.map(d => `<li><b>${esc(d.move)}</b>: ${md(d.answer, { inlineOnly: true })}${d.why ? ` <span class="muted">${md(d.why, { inlineOnly: true })}</span>` : ''}</li>`).join('')}</ul>`));
  if (card.mistakes_to_avoid?.length) el.append(acc('Mistakes to avoid', `<ul>${card.mistakes_to_avoid.map(m => `<li>${md(m, { inlineOnly: true })}</li>`).join('')}</ul>`));
  const games = (card.model_games || []).map(id => D.content.games[id]).filter(Boolean);
  if (games.length) el.append(acc('Model games', games.map(g => `<a class="item" href="#/model/${g.id}" style="padding:10px 0"><span class="body"><div class="t">${esc(g.headers.White)} – ${esc(g.headers.Black)}</div><div class="s">${esc(g.headers.Theme || '')}</div></span><span class="chev">${icon('chev')}</span></a>`).join(''), true));
  if (card.lines?.length) el.append(acc('Your repertoire lines', card.lines.map(l => `<a class="item" href="#/line/${l.id}" style="padding:10px 0"><span class="body"><div class="t">${esc(l.name)}</div></span><span class="chev">${icon('chev')}</span></a>`).join('')));
  if (card.quiz?.length) {
    const q = acc('Test yourself', '');
    card.quiz.forEach(qq => {
      const d = h('<div class="card flat" style="margin:8px 0"></div>');
      d.addEventListener('click', () => board.set({ fen: qq.fen, movable: null, arrows: [] }), { capture: true, once: true });
      renderQuiz(d, qq);
      $('.in', q).append(d);
    });
    el.append(q);
  }
  if (card.sources?.length) el.append(acc('Sources', `<ul class="small muted">${card.sources.map(s => `<li>${/^https?:/.test(s) ? `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s)}</a>` : esc(s)}</li>`).join('')}</ul>`));
  container.append(el);
}
