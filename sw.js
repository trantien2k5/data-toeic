// ===== Service Worker: cho phép app chạy offline + tự cập nhật không bị "dính" cache cũ =====
//
// Chiến lược chống trùng/dính cache:
// 1. CACHE_VERSION nằm trong tên cache (toeic-pos-vN). Mỗi khi đổi danh sách
//    file cần cache (thêm/xoá file) thì tăng số này lên — activate sẽ tự xoá
//    hết cache tên cũ, không bao giờ có 2 cache version chạy song song.
// 2. Khi đang online: dùng chiến lược "network-first" cho mọi file cùng gốc
//    (HTML/CSS/JS/JSON) — luôn lấy bản mới nhất từ server rồi mới ghi đè vào
//    cache, nên không cần nhớ bump version mỗi lần chỉ sửa nội dung file.
// 3. Khi mất mạng: fallback sang cache đã lưu, để app vẫn dùng được offline.

const CACHE_PREFIX = 'toeic-pos-v';

const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './css/base.css',
  './css/layout.css',
  './css/exams.css',
  './css/quiz.css',
  './css/result.css',
  './css/stats.css',
  './css/responsive.css',
  './js/modules/constants.js',
  './js/modules/state.js',
  './js/modules/quiz.js',
  './js/modules/stats.js',
  './js/modules/storage.js',
  './js/modules/suffixExam.js',
  './js/modules/utils.js',
  './js/data/nhan-dien-tu-loai-toiec.json',
  './js/data/hau-to.txt',
  './manifest.json',
  './version.json',
  './icons/icon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Đọc version.json để đặt tên cache — chỉ cần bump số trong version.json,
// không phải sửa tay sw.js mỗi lần đổi nội dung CSS/JS. Dùng cache: 'no-store'
// để chắc chắn lấy version.json mới nhất, không phải bản đã cache trước đó.
async function getCacheName() {
  try {
    const res = await fetch('./version.json', { cache: 'no-store' });
    const data = await res.json();
    return CACHE_PREFIX + (data.version || 'unknown');
  } catch (err) {
    return CACHE_PREFIX + 'unknown';
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    getCacheName()
      .then((cacheName) => caches.open(cacheName))
      .then((cache) => cache.addAll(APP_SHELL))
      // Kích hoạt service worker mới ngay, không chờ tất cả tab cũ đóng lại.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    getCacheName().then((cacheName) =>
      caches.keys().then((names) => Promise.all(
        names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== cacheName)
          .map((name) => caches.delete(name))
      ))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Cache Storage chỉ chấp nhận request scheme http/https — bỏ qua mọi
  // request khác (vd "chrome-extension://" do extension trình duyệt của
  // người dùng tự bắn ra, service worker này không liên quan gì tới nó
  // nhưng vẫn nghe được sự kiện fetch chung của trang).
  if (!req.url.startsWith('http')) return;

  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        // Chỉ cache response hợp lệ (status 200, basic/cors) — tránh cache
        // luôn cả response lỗi rồi offline lại trả về lỗi đó.
        if (networkRes && networkRes.status === 200) {
          // clone() PHẢI gọi ngay đồng bộ ở đây — getCacheName() là async
          // (fetch version.json), nên nếu gọi clone() bên trong .then() của
          // nó thì lúc đó trang đã bắt đầu đọc body của networkRes rồi, gây
          // lỗi "Response body is already used".
          const resClone = networkRes.clone();
          getCacheName().then((cacheName) =>
            caches.open(cacheName).then((cache) => cache.put(req, resClone))
          );
        }
        return networkRes;
      })
      .catch(() =>
        getCacheName().then((cacheName) => caches.open(cacheName)).then((cache) =>
          cache.match(req).then((cached) => {
            if (cached) return cached;
            // Điều hướng trang (vd F5 khi mất mạng) mà chưa từng cache thì
            // fallback về index.html đã cache, thay vì màn lỗi trắng.
            if (req.mode === 'navigate') return cache.match('./index.html');
            return Response.error();
          })
        )
      )
  );
});
