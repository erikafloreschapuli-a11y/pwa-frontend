// frontend/sw.js - Service Worker seguro
const CACHE_NAME = 'sidii-cache-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Si la petición no es HTTP/HTTPS o es de live-server/reload, dejar pasar
    if (!event.request.url.startsWith('http')) return;

    event.respondWith(
        fetch(event.request).catch(() => {
            // Si no hay internet, busca en caché si existe
            return caches.match(event.request);
        })
    );
});