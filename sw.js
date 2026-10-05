/* Escaparate · service worker · Ángel Muñiz */
const SHELL = 'escaparate-shell-v3';
const RUNTIME = 'escaparate-runtime-v1';
const SHARE = 'escaparate-share';
const FILES = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const CDN = ['cdn.jsdelivr.net', 'staticimgly.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, RUNTIME, SHARE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Fotos compartidas desde la galería de Android
  if (req.method === 'POST' && url.origin === location.origin && url.search.includes('share')) {
    e.respondWith((async () => {
      const form = await req.formData();
      const files = form.getAll('photos');
      const cache = await caches.open(SHARE);
      let i = 0;
      for (const f of files) {
        const name = encodeURIComponent(f.name || `foto-${i}.jpg`);
        await cache.put(new Request(`./shared/${Date.now()}-${i++}-${name}`), new Response(f, { headers: { 'content-type': f.type || 'image/jpeg' } }));
      }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;

  // Página: primero red, si no hay conexión la copia guardada
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => {
      const copy = r.clone();
      caches.open(SHELL).then((c) => c.put('./index.html', copy));
      return r;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  // Modelo de IA, librerías y fuentes: se descargan una vez y quedan guardados
  if (CDN.some((h) => url.hostname.endsWith(h))) {
    e.respondWith(caches.open(RUNTIME).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) c.put(req, r.clone());
      return r;
    }));
    return;
  }

  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});
