const CACHE_NAME = 'rendrax-shell-v1';
const SHELL_URLS = [
  '/',
  '/assets/rendrax-redesign.css',
  '/assets/rendrax-motion.js',
  '/assets/rendrax-logo.svg',
  '/assets/rendrax-logo-dark.svg',
  '/favicon.ico',
  '/favicon.png',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png'
];

const SHELL_PATHS = new Set(SHELL_URLS);

function cacheKeyFor(url) {
  return new Request(new URL(url.pathname, self.location.origin).href, {
    method: 'GET',
    credentials: 'same-origin'
  });
}

function isApiRequest(url) {
  return url.pathname === '/api' || url.pathname.startsWith('/api/');
}

function isCacheableShellRequest(request, url) {
  return request.method === 'GET' &&
    url.origin === self.location.origin &&
    !isApiRequest(url) &&
    SHELL_PATHS.has(url.pathname);
}

async function storeShellResponse(cache, request, response) {
  if (!response || !response.ok || response.type !== 'basic') return;
  const cacheControl = response.headers.get('Cache-Control') || '';
  if (/no-store/i.test(cacheControl)) return;
  const url = new URL(request.url);
  await cache.put(cacheKeyFor(url), response.clone());
}

async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(SHELL_URLS.map(async path => {
    try {
      const request = new Request(new URL(path, self.location.origin).href, {
        method: 'GET',
        cache: 'reload',
        credentials: 'same-origin'
      });
      const response = await fetch(request);
      await storeShellResponse(cache, request, response);
    } catch (error) {
      // Une ressource indisponible ne doit pas empêcher l'installation du SW.
    }
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('rendrax-shell-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function withOfflineNotice(response) {
  return response.text().then(html => {
    const notice = '<div role="alert" style="position:sticky;top:0;z-index:2147483647;padding:12px 16px;background:#fff0d8;color:#6b4300;border-bottom:1px solid #e6c58f;text-align:center;font:600 14px/1.4 system-ui,sans-serif">Connexion requise pour convertir. Reconnecte-toi à Internet pour lancer ou suivre une conversion.</div>';
    const updated = /<body\b[^>]*>/i.test(html)
      ? html.replace(/<body\b[^>]*>/i, match => match + notice)
      : notice + html;
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('Content-Type', 'text/html; charset=utf-8');
    return new Response(updated, { status: 200, headers });
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Les API, les uploads, les vidéos, les requêtes non-GET et les domaines
  // externes ne sont jamais servis depuis le cache de l'application.
  if (!isCacheableShellRequest(request, url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cacheKey = cacheKeyFor(url);

    try {
      const response = await fetch(request);
      await storeShellResponse(cache, request, response);
      return response;
    } catch (error) {
      const cached = await cache.match(cacheKey);
      if (!cached) {
        return new Response(
          'Connexion requise pour convertir. Reconnecte-toi à Internet pour utiliser RENDRAX.',
          { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
        );
      }
      if (request.mode === 'navigate') return withOfflineNotice(cached);
      return cached;
    }
  })());
});
