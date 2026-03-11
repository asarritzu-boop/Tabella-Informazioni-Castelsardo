// ============================================================
// SERVICE WORKER OTTIMIZZATO — Tabella Informazioni Castelsardo
// Strategia: Cache-First per asset statici,
//            Stale-While-Revalidate per i dati Drive
// ============================================================

const CACHE_NAME = 'castelsardo-v2';
const DATA_CACHE = 'castelsardo-data-v2';

// Asset statici da pre-cachare all'installazione
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icona-192.png',
  '/icona-512.png',
  '/iconaweb.png',
  '/iphone.png',
  '/xandroid.png',
  '/eventi.json'
];

// URL dello script Google Apps Script (dati Drive)
const DRIVE_SCRIPT_ORIGIN = 'https://script.google.com';

// ── INSTALL: pre-cacha tutti gli asset statici ──────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching asset statici...');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Attiva subito senza aspettare che le tab vecchie vengano chiuse
  self.skipWaiting();
});

// ── ACTIVATE: elimina cache vecchie ────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== DATA_CACHE)
          .map((k) => {
            console.log('[SW] Eliminazione cache obsoleta:', k);
            return caches.delete(k);
          })
      )
    )
  );
  // Prende il controllo di tutte le tab aperte immediatamente
  self.clients.claim();
});

// ── FETCH: strategia differenziata per tipo di richiesta ────
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // 1. Dati Drive (Google Apps Script) → Stale-While-Revalidate
  //    Risponde subito dalla cache, poi aggiorna in background
  if (url.origin === DRIVE_SCRIPT_ORIGIN) {
    e.respondWith(staleWhileRevalidate(e.request, DATA_CACHE));
    return;
  }

  // 2. eventi.json → Stale-While-Revalidate con bust del cache
  if (url.pathname.includes('eventi.json')) {
    // Normalizza l'URL rimuovendo il query string (?v=timestamp)
    const cleanRequest = new Request(url.origin + url.pathname);
    e.respondWith(staleWhileRevalidate(cleanRequest, DATA_CACHE));
    return;
  }

  // 3. Font Google → Cache-First (non cambiano mai)
  if (url.origin === 'https://fonts.googleapis.com' ||
      url.origin === 'https://fonts.gstatic.com') {
    e.respondWith(cacheFirst(e.request, CACHE_NAME));
    return;
  }

  // 4. Asset statici locali → Cache-First con fallback alla rete
  e.respondWith(cacheFirst(e.request, CACHE_NAME));
});

// ── STRATEGIE ───────────────────────────────────────────────

/**
 * Cache-First: risponde dalla cache se disponibile,
 * altrimenti va in rete e salva il risultato.
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Rete non disponibile e nessuna cache: restituisce risposta vuota
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

/**
 * Stale-While-Revalidate: risponde SUBITO dalla cache (se presente),
 * poi aggiorna la cache in background per la prossima visita.
 * Se non c'è cache, attende la rete con timeout di 8 secondi.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Avvia il fetch in background comunque (per aggiornare la cache)
  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => null);

  if (cached) {
    // Risponde immediatamente con i dati cached (anche se vecchi)
    // Il fetch in background aggiornerà la cache per la prossima apertura
    return cached;
  }

  // Nessuna cache: aspetta la rete con timeout
  return Promise.race([
    fetchPromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), 8000)
    )
  ]).catch(() =>
    new Response(JSON.stringify({ error: 'Dati non disponibili offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })
  );
}
