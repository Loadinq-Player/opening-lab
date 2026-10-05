import { D, loadAll, settings } from './data.js';
import { bg, analyseRecent } from './analysis.js';
import * as srs from './srs.js';
import * as sync from './sync.js';
import { $, $$, h, icon, setSound, toast } from './util.js';
import today from './views/today.js';
import { learn, lesson } from './views/learn.js';
import drill from './views/drill.js';
import explore from './views/explore.js';
import insights from './views/insights.js';
import { card, line, model, mygame, library } from './views/viewers.js';
import settingsView from './views/settings.js';

const TABS = [
  { r: 'today', label: 'Today', icon: 'home' },
  { r: 'learn', label: 'Learn', icon: 'learn' },
  { r: 'drill', label: 'Drill', icon: 'drill' },
  { r: 'explore', label: 'Explore', icon: 'explore' },
  { r: 'insights', label: 'Insights', icon: 'insights' },
];
const ROUTES = { today, learn, lesson, drill, explore, insights, card, line, model, game: mygame, library, settings: settingsView };
const FOCUS = new Set(['lesson', 'drill']);
const TAB_OF = { lesson: 'learn', card: 'learn', line: 'learn', model: 'learn', library: 'learn', game: 'insights', settings: 'today' };

export const LOGO = `<div class="cg-wrap logo-piece"><piece class="knight white"></piece></div>`;

function shell() {
  const app = $('#app');
  app.innerHTML = '';
  app.append(h(`<header class="topbar">
    <a class="brand" href="#/today"><span class="logo">${LOGO}</span>Opening Lab</a>
    <nav>${TABS.map(t => `<a href="#/${t.r}" data-r="${t.r}">${t.label}</a>`).join('')}</nav>
    <div class="status"><span id="st-text"></span><a class="iconbtn" href="#/settings" aria-label="Settings">${icon('gear')}</a></div>
  </header>`));
  app.append(h('<main id="view"></main>'));
  app.append(h(`<nav class="tabbar">${TABS.map(t => `<a href="#/${t.r}" data-r="${t.r}">${icon(t.icon)}<span>${t.label}</span></a>`).join('')}</nav>`));
}

function status() {
  const el = $('#st-text');
  if (!el) return;
  const parts = [];
  if (sync.state.running) parts.push(`<span class="spinning">${icon('sync')}</span> ${sync.state.message}`);
  if (bg.running) parts.push(`Analysing ${bg.done}/${bg.total}`);
  if (!parts.length) parts.push(`${D.games.length.toLocaleString()} games`);
  el.innerHTML = parts.join(' · ');
  const c = srs.counts();
  const n = c.due + c.new;
  $$('[data-r="drill"]').forEach(a => {
    a.querySelector('.dot')?.remove();
    if (n) a.append(h(`<span class="dot">${n > 99 ? '99+' : n}</span>`));
  });
}

let cleanup = null;
let current = '';

async function route() {
  const raw = location.hash.slice(2) || 'today';
  const [path, query] = raw.split('?');
  const [name, ...rest] = path.split('/');
  const view = ROUTES[name] ? name : 'today';
  const tab = TAB_OF[view] || view;
  $$('[data-r]').forEach(a => a.classList.toggle('on', a.dataset.r === tab));
  document.body.classList.toggle('focus', FOCUS.has(view));
  if (typeof cleanup === 'function') { try { cleanup(); } catch {} }
  cleanup = null;
  const root = h(`<div class="view"></div>`);
  $('#view').replaceChildren(root);
  if (current !== raw) window.scrollTo(0, 0);
  current = raw;
  try {
    cleanup = await ROUTES[view](root, decodeURIComponent(rest.join('/')), new URLSearchParams(query || ''));
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="card"><h2>Something went wrong</h2><pre class="errors">${String(e.stack || e)}</pre></div>`;
  }
  status();
}

export function rerender() { route(); }

async function start() {
  const splash = $('#splash');
  try {
    await loadAll(msg => { $('#splash-msg').textContent = msg; });
  } catch (e) {
    $('#splash-msg').innerHTML = `Could not load data.<br><small>${e.message}</small>`;
    return;
  }
  setSound(settings().sound);
  srs.syncCards();
  shell();
  window.addEventListener('hashchange', route);
  await route();
  splash.classList.add('gone');
  setTimeout(() => splash.remove(), 400);
  sync.state.listeners.add(status);
  bg.listeners.add(status);
  // catch up quietly: new games from chess.com, then analyse them on the phone
  const stale = Date.now() / 1000 - sync.lastSync() > 3600;
  if (stale && navigator.onLine !== false) {
    const n = await sync.sync();
    if (n) { toast(`${n} new game${n === 1 ? '' : 's'} from chess.com`); if (location.hash.match(/today|insights|explore|^$/)) route(); }
  }
  if (settings().auto_analyse) analyseRecent({ limit: 30 });
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Update downloaded. It applies next time you open the app.', 4000);
      });
    });
  }).catch(() => {});
}

start();
