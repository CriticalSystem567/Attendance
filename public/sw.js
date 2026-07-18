// Minimal service worker — its only job is to exist and control the page,
// which is what makes Chrome/Android/desktop treat this as an installable
// app. It deliberately does no offline caching (this app talks to Supabase
// live, so an offline cache would just show stale data) — every request
// just passes straight through to the network.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
