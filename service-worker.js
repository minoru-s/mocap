// キャッシュ名をユニークにするためにバージョンを付けます。ファイルを更新した際には、このバージョン番号を上げてください。
const CACHE_NAME = 'mp-pwa-cache-20260314'; 
const urlsToCache = [
  './',
  './index.html',
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
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // 新しいキャッシュ名でなければ、古いキャッシュを削除する
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        // ページをすぐに制御下に置く
        return self.clients.claim();
    })
  );
});

// リクエストがあった場合に実行される
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュにヒットすればそれを返す。なければネットワークから取得する。
        return response || fetch(event.request);
      })
  );
});