/* 动物兄弟打卡 · Service Worker（v7 自清理版）
 * 不再做离线缓存，避免旧版本滞留导致页面一直不更新。
 * - 安装即跳过等待，立即接管（skipWaiting）
 * - 激活时清空所有历史缓存（含 v5/v6 等旧的）
 * - 不拦截任何网络请求：所有资源始终走网络，加载最新版
 * 这样就不会再出现「改了代码线上却还是旧页面」的情况。 */
const CACHE = 'animal-checkin-v7';

self.addEventListener('install', (e) => {
  // 装好立即接管，不等用户点击「发现新版本」
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k)))) // 清空全部历史缓存
      .then(() => self.clients.claim())                                 // 接管所有页面
  );
});

// 故意不监听 fetch：所有请求直接走网络，永远用最新文件。
