// DOM, formatting and tiny-markdown helpers shared by every view.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

// Paragraphs, "-" / "1." lists, **bold**, *italic*, `code`.
export function md(text, { inlineOnly = false } = {}) {
  if (!text) return '';
  if (inlineOnly) return inline(String(text).replace(/\n+/g, ' '));
  const out = [];
  let list = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd();
    const m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (m) { (list ||= []).push(`<li>${inline(m[1])}</li>`); continue; }
    if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push(`<ul>${list.join('')}</ul>`);
  return out.join('');
}

export const pct = x => x == null || Number.isNaN(x) ? '–' : `${Math.round(x)}%`;
export const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? '' : 's'}`;
export const DAY = 86400;
export const now = () => Math.floor(Date.now() / 1000);

export function ago(ts) {
  if (!ts) return 'never';
  const s = now() - ts;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < DAY) return `${Math.round(s / 3600)} h ago`;
  if (s < 2 * DAY) return 'yesterday';
  return `${Math.round(s / DAY)} days ago`;
}

export function dateStr(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function moveText(sans, startPly = 0) {
  return sans.map((s, i) => {
    const ply = startPly + i;
    const no = Math.floor(ply / 2) + 1;
    return ply % 2 === 0 ? `${no}.${s}` : (i === 0 ? `${no}…${s}` : s);
  }).join(' ');
}

// Lichess win% model (White's view).
export function winPct(cp) {
  cp = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function fmtEval(cp) {
  if (cp == null) return '';
  if (Math.abs(cp) >= 9000) return `#${(10000 - Math.abs(cp)) * Math.sign(cp)}`;
  return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
}

export function toast(msg, ms = 2400) {
  let t = $('#toast');
  if (!t) { t = h('<div id="toast" class="toast"></div>'); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('on'), ms);
}

// ---------------------------------------------------------------- icons (24px stroke icons)

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>',
  learn: '<path d="M2 6.5 12 3l10 3.5L12 10z"/><path d="M6 8.3V14c0 1.7 2.7 3 6 3s6-1.3 6-3V8.3"/><path d="M22 6.5V12"/>',
  drill: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  explore: '<path d="M4 20V4h16v16z"/><path d="M4 12h16M12 4v16"/><path d="M4 8h4v4H4zM12 12h4v4h-4zM8 4h4v4H8zM16 8h4v4h-4zM8 16h4v4H8zM16 16h4v4h-4z" fill="currentColor" stroke="none" opacity=".55"/>',
  insights: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  library: '<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="m16 5 3.8-1 3 15.5-3.8 1z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  first: '<path d="M18 6 11 12l7 6M7 6v12"/>',
  prev: '<path d="M15 6 9 12l6 6"/>',
  next: '<path d="m9 6 6 6-6 6"/>',
  last: '<path d="m6 6 7 6-7 6M17 6v12"/>',
  flip: '<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>',
  engine: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  x: '<path d="M7 7l10 10M17 7 7 17"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.7-4.3L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.7 4.3L21 15"/><path d="M21 20v-5h-5"/>',
  fire: '<path d="M12 22c4 0 7-2.7 7-7 0-4.5-3.5-6.5-4.5-10.5C12 7 11 9 11 11c-1.5-1-2.5-2.5-2.5-4.5C6 9 5 12 5 15c0 4.3 3 7 7 7z"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
  sword: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6M16 16l4 4M19 21l2-2"/>',
  chev: '<path d="m9 5 7 7-7 7"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  hint: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
};
export const icon = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

// ---------------------------------------------------------------- sounds (synthesised, no files)

let actx = null;
let soundOn = true;
export function setSound(on) { soundOn = on; }
function ctx() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
document.addEventListener('pointerdown', () => ctx(), { once: true });

function knock(freq, dur, gain) {
  const a = ctx();
  if (!a || !soundOn) return;
  const t = a.currentTime;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.4;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}
function chime(notes) {
  const a = ctx();
  if (!a || !soundOn) return;
  let t = a.currentTime;
  for (const [freq, len] of notes) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + len + 0.02);
    t += len * 0.6;
  }
}
export const sound = {
  move: () => knock(1700, 0.07, 1.1),
  capture: () => { knock(1100, 0.09, 1.4); setTimeout(() => knock(1900, 0.05, 0.6), 35); },
  right: () => chime([[784, 0.12], [1175, 0.22]]),
  wrong: () => chime([[330, 0.16], [262, 0.24]]),
  done: () => chime([[659, 0.12], [784, 0.12], [1047, 0.3]]),
};
