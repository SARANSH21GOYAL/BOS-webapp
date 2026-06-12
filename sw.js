const CACHE_NAME = 'bos-app-v1';
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json'
  '/opencv.js'
];

// Install — save all files to cache
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

// Fetch — serve from cache when offline
self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(response) {
      return response || fetch(e.request);
    })
  );
});