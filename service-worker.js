const CACHE_NAME = 'zeiterfassung-cache-v1';
const urlsToCache = [
    './index.html',
    './css/style.css',
    './js/db.js',
    './js/pdf-export.js',
    './js/app.js',
    './manifest.webmanifest'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(urlsToCache);
        })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});