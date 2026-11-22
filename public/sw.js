const cacheName = 'kg-shell-v1';
const shell = ['/', '/app.js', '/ui.js', '/catalog.js', '/games/literowe-zdania.js', '/style.css',
  '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(shell))));
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('kg-shell-') && key !== cacheName).map(key => caches.delete(key))))
));
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !shell.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(url.pathname, response.clone());
      return response;
    } catch (error) {
      const saved = await cache.match(url.pathname);
      if (saved) return saved;
      throw error;
    }
  })());
});
