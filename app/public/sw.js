// Service worker MyLocalMatch : l'appli et les derniers matchs restent disponibles sans réseau.
const CACHE = 'mlm-v1';
const DATA = /(raw\.githubusercontent\.com|cdn\.jsdelivr\.net)\/.*\.json/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()),
));

// Réseau d'abord (données fraîches), sinon dernière version enregistrée.
async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw new Error('hors connexion');
  }
}

// Fichiers de l'appli (noms uniques par version) : enregistrés au premier passage.
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, new URL('./', self.registration.scope).href));
  } else if (DATA.test(req.url)) {
    url.search = ''; // les données sont demandées avec ?t=… : une seule copie enregistrée
    e.respondWith(networkFirst(req, url.href));
  } else if (url.origin === self.location.origin) {
    e.respondWith(cacheFirst(req));
  }
});
