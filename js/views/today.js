import { D } from '../data.js';
import { miniBoard } from '../board.js';
import * as coach from '../coach.js';
import * as sync from '../sync.js';
import { $, ago, esc, h, icon, pct } from '../util.js';

function ring(p) {
  const r = 24, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 56 56"><circle class="bg" cx="28" cy="28" r="${r}"/>
    <circle class="fg" cx="28" cy="28" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p / 100)}"/>
    <text x="28" y="29">${p}%</text></svg>`;
}

function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'Late night study' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}

export default function today(root) {
  const t = coach.today();
  const c = t.cards;
  const reviews = c.due + c.new;
  const mistakeCards = t.mistakes.length;
  const lesson = t.lesson;
  const mod = lesson && D.content.modules.find(m => m.id === lesson.module);
  const allDone = !reviews && !lesson;

  root.append(h(`<div>
    <div class="hello"><h1>${greeting()}</h1><span class="spacer"></span>
      <span class="streak ${t.streak.today ? 'lit' : ''}" title="Days in a row with drills">${icon('fire')}${t.streak.days}</span>
      <a class="iconbtn" href="#/settings" aria-label="Settings">${icon('gear')}</a></div>

    <div class="card hero">
      <div class="row nowrap">${ring(t.progress.pct)}
        <div><div class="hi" style="font-weight:700;font-size:1.05rem">Today's session</div>
        <div class="muted small">${allDone ? 'All caught up. Play some games and come back tomorrow.' : 'About 20 minutes. Work top to bottom.'}</div></div></div>
    </div>

    <div class="list" style="margin-top:12px">
      <a class="item ${reviews ? '' : 'done'}" href="#/drill">
        <span class="ico blue">${icon('drill')}</span>
        <span class="body"><div class="t">${reviews ? `Review ${reviews} card${reviews === 1 ? '' : 's'}` : 'Drills done for today'}</div>
          <div class="s">${c.due} due · ${c.new} new${c.waiting > c.new ? ` · ${c.waiting - c.new} waiting` : ''}</div></span>
        ${reviews ? `<span class="chev">${icon('chev')}</span>` : `<span class="check">${icon('check')}</span>`}</a>
      ${lesson ? `<a class="item" href="#/lesson/${lesson.id}">
        <span class="ico green">${icon('learn')}</span>
        <span class="body"><div class="t">${esc(lesson.title)}</div><div class="s">${esc(mod?.title || '')} · ${lesson.minutes || 10} min</div></span>
        <span class="chev">${icon('chev')}</span></a>` : ''}
      ${t.model ? `<a class="item" href="#/model/${t.model.id}">
        <span class="ico gold">${icon('book')}</span>
        <span class="body"><div class="t">Model game: ${esc(t.model.headers.White?.split(',')[0])} – ${esc(t.model.headers.Black?.split(',')[0])}</div>
        <div class="s">${esc(t.model.headers.Theme || '')}</div></span><span class="chev">${icon('chev')}</span></a>` : ''}
    </div>

    <div class="section-title"><h2>Fix these</h2><span class="muted small">opening mistakes from the last 2 weeks</span><span class="spacer"></span><a href="#/insights">All</a></div>
    <div class="mist"></div>

    <div class="section-title"><h2>This week</h2></div>
    <div class="card">
      <div class="stats">
        <div class="stat"><div class="v">${t.form.games}</div><div class="l">Games</div></div>
        <div class="stat"><div class="v">${pct(t.form.pct)}</div><div class="l">Score</div></div>
        <div class="stat"><div class="v">${t.form.leftByMe}</div><div class="l">You left book</div></div>
        <div class="stat"><div class="v">${t.form.afterBook == null ? '–' : t.form.afterBook.toFixed(1)}</div><div class="l">After-book loss</div></div>
      </div>
      <p class="small muted" style="margin:.8rem 0 0">"After-book loss" is the winning chances you give away per move once the opening ends. That's the "random moves" number. Lower is better.</p>
    </div>

    <div class="section-title"><h2>Course</h2><span class="spacer"></span><a href="#/learn">Open</a></div>
    <div class="list">${t.progress.modules.map(m => `<a class="item" href="#/learn?m=${m.id}">
      <span class="body"><div class="t">${esc(m.title)}</div>
        <div class="progress" style="margin-top:7px"><span style="width:${m.total ? 100 * m.done / m.total : 0}%"></span></div></span>
      <span class="trail muted small">${m.done}/${m.total}</span></a>`).join('')}</div>

    <p class="tiny muted" style="margin-top:18px;text-align:center"><span class="syncline"></span></p>
  </div>`));

  const mist = $('.mist', root);
  if (!mistakeCards) {
    mist.innerHTML = `<div class="card flat muted small">No analysed opening mistakes recently. ${D.games.length ? 'Play a few games: new ones are analysed on your phone automatically.' : ''}</div>`;
  } else {
    const row = h('<div class="hscroll"></div>');
    for (const p of t.mistakes) {
      const el = h(`<div class="mini-card"><div class="mini"></div>
        <div class="cap"><b>Move ${p.moveNo}</b> vs ${esc(p.opp)}<br><span class="muted">You played ${esc(p.san)} · −${Math.round(p.loss || 0)}%</span></div></div>`);
      miniBoard($('.mini', el), p.fen, p.color === 'w' ? 'white' : 'black', [{ orig: p.uci.slice(0, 2), dest: p.uci.slice(2, 4), brush: 'red' }]);
      el.onclick = () => location.hash = `#/game/${encodeURIComponent(p.id)}?ply=${p.ply}`;
      row.append(el);
    }
    mist.append(row);
    mist.append(h(`<a class="btn block" style="margin-top:10px" href="#/drill?kind=mistake">${icon('drill')} Practise your mistakes</a>`));
  }

  const syncLine = () => {
    const s = sync.state;
    $('.syncline', root).innerHTML = s.running ? s.message : `${D.games.length.toLocaleString()} games · synced ${ago(sync.lastSync())} · <a href="#" class="sync-now">Sync now</a>`;
    const a = $('.sync-now', root);
    if (a) a.onclick = async e => { e.preventDefault(); const n = await sync.sync(); if (n) window.dispatchEvent(new HashChangeEvent('hashchange')); };
  };
  syncLine();
  sync.state.listeners.add(syncLine);
  return () => sync.state.listeners.delete(syncLine);
}
