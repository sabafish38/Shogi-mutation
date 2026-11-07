// Service Worker for 無法将棋 (SHOGI: MUTATION)
// ネットワークファースト戦略（最新コードを確実に配信し、オフライン時のみキャッシュフォールバック）
const CACHE_NAME = 'muhou-shogi-v30';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './online.js',
  './manifest.json',
  './favicon.svg',
  './icon-192.svg',
  './icon-512.svg'
];

self.addEventListener('install', (event) => {
  // 新しいService Workerを即座にアクティブ化
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  // 古いバージョンのキャッシュ（v17以前等）を完全削除
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // ネットワークファースト戦略：常にサーバーから最新版を取得
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      })
      .catch(() => {
        // オフライン時のみキャッシュから返す
        return caches.match(event.request);
      })
  );
});
