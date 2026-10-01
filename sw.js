/* InsureNet 서비스워커
   - 앱 셸을 캐시해 오프라인에서도 화면이 뜨도록 함
   - API 요청(/api/)은 항상 네트워크 우선 (실시간 데이터)
*/
const CACHE = 'insurenet-v1';
const SHELL = [
  './',
  './insurance-intranet-v2.html',
  './manifest.webmanifest',
  './app-icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API와 로그인 등 데이터 요청은 캐시하지 않고 항상 네트워크로
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response(
      JSON.stringify({ error: '오프라인 상태입니다.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    )));
    return;
  }

  if (e.request.method !== 'GET') return;

  // 앱 셸: 캐시 우선, 없으면 네트워크 후 캐시에 저장
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./insurance-intranet-v2.html'))
    )
  );
});
