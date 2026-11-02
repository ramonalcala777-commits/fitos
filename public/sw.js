// Fitos: funcionamiento sin cobertura.
// - Datos (carpeta data/): primero la red; si no hay cobertura, la última copia guardada en el móvil.
// - Programa (assets/): se guarda la primera vez y se reutiliza (los nombres cambian con cada versión).
// - Página: primero la red; sin cobertura, la copia guardada.
const SHELL_CACHE = 'fitos-programa-v1';
const DATA_CACHE = 'fitos-datos';
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './apple-touch-icon.png', './icon-192.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== DATA_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/data/')) return event.respondWith(networkFirst(request, DATA_CACHE));
  if (url.pathname.includes('/assets/')) return event.respondWith(cacheFirst(request));
  if (request.mode === 'navigate') return event.respondWith(networkFirst(request, SHELL_CACHE, './index.html'));
  event.respondWith(cacheFirst(request));
});
async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request.url.split('?')[0], response.clone());
    return response;
  } catch (error) {
    const saved = await cache.match(request.url.split('?')[0]) || (fallback && await caches.match(fallback));
    if (saved) return saved;
    throw error;
  }
}
async function cacheFirst(request) {
  const saved = await caches.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) (await caches.open(SHELL_CACHE)).put(request, response.clone());
  return response;
}
// La web pide guardar todos los datos cuando hay una versión nueva, para tenerlos sin cobertura.
self.addEventListener('message', event => {
  if (event.data?.type === 'guardar-datos') event.waitUntil(saveAll(event.data.urls || []));
  if (event.data?.type === 'guardar-programa') event.waitUntil(saveProgram(event.data.urls || []));
});
async function saveAll(urls) {
  const cache = await caches.open(DATA_CACHE);
  for (const url of urls) {
    try { const response = await fetch(url, {cache: 'no-cache'}); if (response.ok) await cache.put(url, response); } catch {}
  }
}
// Ficheros del programa que la página ya cargó antes de que este trabajador estuviera activo.
async function saveProgram(urls) {
  const cache = await caches.open(SHELL_CACHE);
  for (const url of urls) { try { if (!(await cache.match(url))) await cache.add(url); } catch {} }
}
