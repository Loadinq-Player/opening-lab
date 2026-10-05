import { analyseRecent, bg, stopBackground } from '../analysis.js';
import { D, saveSettings, settings } from '../data.js';
import * as sync from '../sync.js';
import { load, save } from '../store.js';
import { $, $$, ago, esc, h, icon, setSound, toast } from '../util.js';

export default function settingsView(root) {
  const s = settings();
  const analysed = D.games.filter(g => g.a?.ev).length;
  root.append(h(`<div>
    <div class="pagehead"><a class="iconbtn" href="#/today">${icon('prev')}</a><h1>Settings</h1></div>
    <div class="card"><h3>chess.com</h3>
      <div class="row"><input type="text" class="user" value="${esc(s.username)}" style="flex:1;min-width:0" autocapitalize="off" autocorrect="off">
        <button class="btn primary syncbtn">${icon('sync')} Sync</button></div>
      <p class="small muted syncmsg" style="margin-bottom:0">${D.games.length.toLocaleString()} games · last synced ${ago(sync.lastSync())}</p></div>

    <div class="card"><h3>Games that count</h3>
      <div class="chips">${['bullet', 'blitz', 'rapid', 'daily'].map(t => `<button class="chip ${s.time_classes.includes(t) ? 'on' : ''}" data-t="${t}">${t}</button>`).join('')}</div>
      <p class="small muted" style="margin-bottom:0">Bullet is off by default: at one minute, mistakes are mostly about the clock.</p></div>

    <div class="card"><h3>Drills</h3>
      <div class="row"><label class="small" style="flex:1">New cards per day</label><input type="number" class="npd" min="0" max="50" value="${s.new_cards_per_day}" style="width:5rem"></div>
      <div class="row" style="margin-top:8px"><label class="small" style="flex:1">Max reviews per day</label><input type="number" class="mrd" min="5" max="500" value="${s.max_reviews_per_day}" style="width:5rem"></div>
      <div class="row" style="margin-top:8px"><label class="small" style="flex:1" for="snd">Sounds</label><input type="checkbox" id="snd" ${s.sound ? 'checked' : ''}></div></div>

    <div class="card"><h3>Analysis on this phone</h3>
      <p class="small">${analysed.toLocaleString()} of ${D.games.length.toLocaleString()} games analysed. New games are checked with Stockfish here on the phone, newest first.</p>
      <div class="row"><label class="small" style="flex:1" for="aa">Analyse new games automatically</label><input type="checkbox" id="aa" ${s.auto_analyse ? 'checked' : ''}></div>
      <div class="row" style="margin-top:10px"><button class="btn abtn"></button><span class="small muted astat"></span></div></div>

    <div class="card"><h3>Backup</h3>
      <p class="small muted">Your drill progress lives on this phone. Copy a backup now and then, or move it to another device.</p>
      <div class="row"><button class="btn exp">Copy backup</button><button class="btn ghost imp">Restore…</button></div>
      <textarea class="bk" hidden style="width:100%;height:120px;margin-top:10px;background:var(--bg-2);color:var(--text);border:1px solid var(--line);border-radius:8px;font:12px var(--mono)"></textarea>
      <div class="row restore" hidden style="margin-top:8px"><button class="btn primary doimp">Restore this backup</button></div></div>

    <p class="tiny muted" style="text-align:center;margin-top:18px">Opening Lab · data ${esc(D.version || 'dev')} · Stockfish 18 lite (GPLv3)</p></div>`));

  $('.syncbtn', root).onclick = async () => {
    saveSettings({ username: $('.user', root).value.trim() });
    $('.syncbtn', root).classList.add('spinning');
    const n = await sync.sync();
    $('.syncbtn', root).classList.remove('spinning');
    $('.syncmsg', root).textContent = `${sync.state.message} · ${D.games.length.toLocaleString()} games`;
    if (n && settings().auto_analyse) analyseRecent();
  };
  $$('.chip', root).forEach(c => c.onclick = () => {
    c.classList.toggle('on');
    const tcs = $$('.chip.on', root).map(x => x.dataset.t);
    saveSettings({ time_classes: tcs.length ? tcs : ['blitz'] });
  });
  $('.npd', root).onchange = e => saveSettings({ new_cards_per_day: +e.target.value });
  $('.mrd', root).onchange = e => saveSettings({ max_reviews_per_day: +e.target.value });
  $('#snd', root).onchange = e => { saveSettings({ sound: e.target.checked }); setSound(e.target.checked); };
  $('#aa', root).onchange = e => saveSettings({ auto_analyse: e.target.checked });

  const abtn = $('.abtn', root), astat = $('.astat', root);
  const paint = () => {
    abtn.textContent = bg.running ? 'Pause' : 'Analyse recent games';
    astat.textContent = bg.running ? `${bg.done}/${bg.total}` : '';
  };
  abtn.onclick = () => (bg.running ? stopBackground() : analyseRecent({ limit: 60 }));
  bg.listeners.add(paint);
  paint();

  const bk = $('.bk', root);
  $('.exp', root).onclick = async () => {
    const data = JSON.stringify({ srs: load('srs', {}), progress: load('progress', {}), log: load('log', []), settings: settings() });
    bk.hidden = false; bk.value = data;
    try { await navigator.clipboard.writeText(data); toast('Backup copied. Paste it into Notes to keep it.'); }
    catch { bk.select(); toast('Select all and copy the text below.'); }
  };
  $('.imp', root).onclick = () => { bk.hidden = false; bk.value = ''; bk.placeholder = 'Paste a backup here'; $('.restore', root).hidden = false; bk.focus(); };
  $('.doimp', root).onclick = () => {
    try {
      const d = JSON.parse(bk.value);
      if (!d.srs || !d.progress) throw new Error('not a backup');
      save('srs', d.srs); save('progress', d.progress); save('log', d.log || []);
      if (d.settings) save('settings', d.settings);
      toast('Restored');
      location.hash = '#/today';
    } catch (e) { toast(`Could not restore: ${e.message}`); }
  };
  return () => bg.listeners.delete(paint);
}
