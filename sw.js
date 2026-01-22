self.addEventListener('install', (e) => {
  console.log('Service Worker Installato');
});

self.addEventListener('fetch', (e) => {
  // Questo permette all'app di funzionare anche con rete instabile
  e.respondWith(fetch(e.request));
});
