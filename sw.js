// Offline support: everything is cached on first load; new versions download in the background.
const VERSION = "5e27f89c79";
const CACHE = `opening-lab-${VERSION}`;
const CORE = [
  "./", "index.html", "manifest.webmanifest", "version.json", "css/app.css",
  "js/main.js", "js/util.js", "js/chessutil.js", "js/store.js", "js/data.js", "js/engine.js", "js/analysis.js",
  "js/srs.js", "js/sync.js", "js/coach.js", "js/board.js",
  "js/views/today.js", "js/views/learn.js", "js/views/drill.js", "js/views/explore.js", "js/views/insights.js",
  "js/views/viewers.js", "js/views/settings.js", "js/views/parts.js",
  "vendor/chessground.min.js", "vendor/chess.js", "vendor/chessground.base.css", "vendor/chessground.brown.css",
  "vendor/chessground.cburnett.css", "vendor/stockfish-18-lite-single.js", "vendor/stockfish-18-lite-single.wasm",
  "data/content.json", "data/games.json", "data/openings.json", "data/seed.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // chess.com API goes straight to the network
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
});
