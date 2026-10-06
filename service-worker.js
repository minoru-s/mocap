// キャッシュ名をユニークにするためにバージョンを付けます。ファイルを更新した際には、このバージョン番号を上げてください。
const CACHE_PREFIX = 'mocap-plus-cache-';
const CACHE_NAME = 'mocap-plus-cache-20261006-v3.3.1';
const LEGACY_CACHE_NAMES = ['mp-pwa-cache-20260501'];
const urlsToCache = [
  './',
  './index.html',
  './css/style.css',
  './js/analysis.js',
  './js/viewer.js',
  './js/csv-loader.js',
  './js/csv-worker.js',
  './js/vendor/papaparse.js',
  './js/vendor/three.min.js',
  './js/vendor/LineSegmentsGeometry.js',
  './js/vendor/LineMaterial.js',
  './js/vendor/LineSegments2.js',
  './js/vendor/OrbitControls.js',
  './js/vendor/hammer.min.js',
  './icons/newicon-192.png',
  './icons/newicon-512.png',
  './img/simpleForward.png',
  './img/simpleHopping.png',
  './img/complex.png',
  './img/simpleUpDown.png',
  './img/v-caputure2.png',
  './img/exp.png'
];

// Service Workerのインストール時に実行される
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // 新しいService Workerをすぐに有効化する
        return self.skipWaiting();
      })
  );
});

// Service Workerが有効化されたときに実行される
self.addEventListener('activate', event => {
  let replacingOldVersion = false;
  event.waitUntil(
    caches.keys().then(cacheNames => {
      const isOldAppCache = name => name !== CACHE_NAME && (name.startsWith(CACHE_PREFIX) || LEGACY_CACHE_NAMES.includes(name));
      replacingOldVersion = cacheNames.some(isOldAppCache);
      return Promise.all(
        cacheNames.map(cacheName => {
          // 新しいキャッシュ名でなければ、古いキャッシュを削除する
          if (isOldAppCache(cacheName)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // ページをすぐに制御下に置く
      return self.clients.claim();
    }).then(async () => {
      if (!replacingOldVersion) return;
      // Reload this app's open windows once when replacing a cached version.
      // Initial installation and subsequent activations do not reload them.
      const windows = await self.clients.matchAll({ type: 'window' });
      await Promise.allSettled(windows
        .filter(client => client.url.startsWith(self.registration.scope))
        .map(client => client.navigate(client.url)));
    })
  );
});

// リクエストがあった場合に実行される
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => cache.match(event.request))
      .then(response => {
        // キャッシュにヒットすればそれを返す。なければネットワークから取得する。
        return response || fetch(event.request);
      })
  );
});
