// frontend/sw.js - Service Worker seguro (con modo offline)
// Sube el número (v3, v4...) cada vez que cambies archivos del frontend.
const CACHE_NAME = 'sidii-cache-v2';

// Archivos propios que se guardan al instalar la app
const APP_SHELL = [
    './',
    './index.html',
    './app.js',
    './manifest.json',
    './style/style.css',
    './js/db.js',
    './js/captura.js',
    './js/inicio.js',
    './pages/index.html',
    './pages/captura.html',
    './pages/evidencias.html',
    './pages/gestion.html',
    './pages/graficas.html',
    './assets/icons/icon.png',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png'
];

// Librerías externas que las páginas necesitan para verse bien
const CDN_ASSETS = [
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);

        // Si un archivo falla (por ejemplo, un ícono que no existe), no se rompe la instalación
        await Promise.all(APP_SHELL.map(url => cache.add(url).catch(() => {})));
        await Promise.all(CDN_ASSETS.map(async (url) => {
            try {
                await cache.put(url, await fetch(url, { mode: 'no-cors' }));
            } catch (error) { /* se guardará más tarde al usarse */ }
        }));

        self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // Borra cachés de versiones anteriores
        const nombres = await caches.keys();
        await Promise.all(nombres.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)));
        await clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Si la petición no es HTTP/HTTPS, dejar pasar
    if (!req.url.startsWith('http')) return;

    // Solo se guardan lecturas. POST, PUT y DELETE pasan directo:
    // los registros sin conexión los maneja la app con IndexedDB (js/db.js)
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    const esMismoOrigen = url.origin === self.location.origin;
    const esApi = url.hostname.endsWith('onrender.com');

    if (esMismoOrigen || esApi) {
        // Tus archivos y la API: primero internet (siempre lo más nuevo); sin internet, la copia guardada
        event.respondWith(redPrimero(req, esApi));
    } else {
        // Librerías externas, fuentes e imágenes: primero la copia guardada (carga rápida y offline)
        event.respondWith(cachePrimero(req));
    }
});

function guardar(req, res) {
    if (res && (res.ok || res.type === 'opaque')) {
        const copia = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copia)).catch(() => {});
    }
}

async function redPrimero(req, esApi) {
    try {
        const res = await fetch(req);

        // Si la API responde con error de servidor, se usa la última copia buena si existe
        if (esApi && res.status >= 500) {
            const guardado = await caches.match(req);
            if (guardado) return guardado;
        }

        guardar(req, res);
        return res;
    } catch (error) {
        // Si no hay internet, busca en caché si existe
        const guardado = await caches.match(req, { ignoreSearch: !esApi });
        if (guardado) return guardado;

        // Páginas no guardadas: abre el inicio en lugar de mostrar el error del navegador
        if (req.mode === 'navigate') {
            const inicio = await caches.match('./pages/index.html');
            if (inicio) return inicio;
        }

        if (esApi) {
            return new Response(
                JSON.stringify({ success: false, offline: true, message: 'Sin conexión' }),
                { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
        }
        return Response.error();
    }
}

async function cachePrimero(req) {
    const guardado = await caches.match(req);
    if (guardado) return guardado;

    try {
        const res = await fetch(req);
        guardar(req, res);
        return res;
    } catch (error) {
        return Response.error();
    }
}