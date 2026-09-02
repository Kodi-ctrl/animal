/* 动物兄弟打卡 · Service Worker（离线缓存 + 版本更新）
 * - 安装时预缓存核心资源（HTML/JS/CSS/图标），保证可离线打开
 * - 导航请求：network-first，失败回落缓存
 * - 静态资源（含卡图）：stale-while-revalidate（先用缓存，后台更新）
 * - 版本更新：改下方 CACHE 版本号即可触发；新版本等待用户点击「点此更新」后生效
 */
const CACHE = 'animal-checkin-v6';
const CORE = [
  'index.html',
  'css/style.css',
  'js/config.js',
  'js/store.js',
  'js/app.js',
  'js/admin.js',
  'manifest.webmanifest',
  'img/hero.png',
  'img/apple-touch-icon.png',
  'img/icon-192.png',
  'img/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
  // 注意：安装后不自动 skipWaiting，让更新版进入 waiting，由用户点击「点此更新」接管
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 导航请求：network-first，失败回退缓存 / 首页
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => caches.match(req).then((m) => m || caches.match('index.html')))
    );
    return;
  }

  // 其余静态资源：stale-while-revalidate
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => { cachePut(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});

function cachePut(req, res) {
  if (res && res.status === 200 && res.type !== 'opaque') {
    caches.open(CACHE).then((c) => c.put(req, res));
  }
}

// 收到「点此更新」消息后，立即接管并触发页面刷新
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
