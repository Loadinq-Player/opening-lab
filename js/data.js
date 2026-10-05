// Loads the packaged data (built on the Mac by tools/build_pwa.py) plus anything synced on the phone.
import { idb, load, save } from './store.js';

export const D = {
  content: null,      // modules, lessons, cards, games (model games), lines, tree, anchors, repertoires
  games: [],          // the user's games, oldest first
  byId: new Map(),
  openings: null,     // epd -> [eco, name]
  version: null,
};

export const DEFAULT_SETTINGS = {
  username: 'ddantino',
  time_classes: ['blitz', 'rapid', 'daily'],
  new_cards_per_day: 10,
  max_reviews_per_day: 40,
  sound: true,
  board: 'brown',
  auto_analyse: true,
};

export const TC = { u: 'bullet', b: 'blitz', r: 'rapid', d: 'daily' };
export const TC_CODE = { bullet: 'u', blitz: 'b', rapid: 'r', daily: 'd' };

export function settings() {
  return { ...DEFAULT_SETTINGS, ...load('settings', {}) };
}

export function saveSettings(patch) {
  const s = { ...settings(), ...patch };
  save('settings', s);
  return s;
}

async function json(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export async function loadAll(onProgress = () => {}) {
  onProgress('Loading lessons…');
  const [content, openings, version] = await Promise.all([
    json('data/content.json'), json('data/openings.json'), json('version.json').catch(() => ({})),
  ]);
  D.content = content;
  D.openings = openings;
  D.version = version.version;
  onProgress('Loading your games…');
  const base = await json('data/games.json');
  let extra = [];
  try { extra = await idb.all('games'); } catch (e) { console.warn('IndexedDB unavailable', e); }
  const byId = new Map(base.map(g => [g.id, g]));
  for (const g of extra) {
    const b = byId.get(g.id);
    // keep the phone's own analysis if the packaged copy has none
    if (!b || (!b.a?.ev && g.a?.ev)) byId.set(g.id, g);
  }
  D.games = [...byId.values()].sort((a, b) => a.t - b.t);
  D.byId = byId;
  await seedOnce();
  return D;
}

// First launch: start from the Mac's drill progress.
async function seedOnce() {
  if (load('seeded', null)) return;
  try {
    const seed = await json('data/seed.json');
    if (!load('srs', null)) save('srs', seed.cards || {});
    if (!load('progress', null)) save('progress', seed.progress || {});
    if (!load('log', null)) save('log', seed.log || []);
    if (!load('settings', null) && seed.settings) save('settings', { ...DEFAULT_SETTINGS, ...seed.settings });
  } catch (e) { console.warn('no seed', e); }
  save('seeded', Date.now());
}

export async function addGames(games) {
  for (const g of games) {
    D.byId.set(g.id, g);
    await idb.put('games', g);
  }
  D.games = [...D.byId.values()].sort((a, b) => a.t - b.t);
}

export async function updateGame(g) {
  D.byId.set(g.id, g);
  await idb.put('games', g);
}

export const ucis = g => (g._u ||= g.m ? g.m.split(' ') : []);

export function filtered({ color, tcs, since } = {}) {
  const set = new Set((tcs || settings().time_classes).map(t => TC_CODE[t] || t));
  return D.games.filter(g => (!color || g.c === color) && set.has(g.tc) && (!since || g.t >= since));
}

export function openingName(k) {
  const v = D.openings?.[k];
  return v ? { eco: v[0], name: v[1] } : null;
}
