// 超シンプルなService Worker（まずは「インストールできる化」）
const CACHE_NAME = "vocab-app-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/data/books.json",
];

// インストール時に最低限キャッシュ
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 古いキャッシュ掃除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// 基本はネット優先、失敗したらキャッシュ
self.addEventListener("fetch", (event) => {
  const req = event.request;
  event.respondWith(
    fetch(req).catch(() => caches.match(req).then((res) => res || caches.match("/")))
  );
});
