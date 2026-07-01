const CACHE_NAME = 'bos-app-v7';
const FILES_TO_CACHE = [
  '/BOS-webapp/',
  '/BOS-webapp/index.html',
  '/BOS-webapp/app.js',
  '/BOS-webapp/style.css',
  '/BOS-webapp/manifest.json',
  '/BOS-webapp/sw.js',
  '/BOS-webapp/opencv.js'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then(function(response) {
        // Network se lo aur cache update karo
        let responseClone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(e.request, responseClone);
        });
        return response;
      })
      .catch(function() {
        // Internet nahi hai toh cache se lo
        return caches.match(e.request);
      })
  );
});
