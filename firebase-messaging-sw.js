/* TEAM TOPS — 웹 푸시 알림 서비스 워커 (백그라운드 수신)
   사이트 루트에 위치해야 하며(/firebase-messaging-sw.js), Firebase Hosting으로 함께 배포됩니다. */
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBg8dwkOHXU_lZO3C9k4hvOH0OnatJEWwY",
  authDomain: "team-tops-intranet.firebaseapp.com",
  projectId: "team-tops-intranet",
  storageBucket: "team-tops-intranet.firebasestorage.app",
  messagingSenderId: "529903386122",
  appId: "1:529903386122:web:6244e4459aa084726fa9f3"
});

var messaging = firebase.messaging();

// 앱이 꺼져 있거나 백그라운드일 때 — 데이터 메시지를 받아 직접 알림 표시
messaging.onBackgroundMessage(function (payload) {
  var d = payload.data || {};
  self.registration.showNotification(d.title || 'TEAM TOPS', {
    body: d.body || '',
    icon: 'https://team-tops-intranet.web.app/icon-192.png',
    tag: d.tag || ('tops-' + Date.now()),
    data: { link: d.link || '/' }
  });
});

// 알림 클릭 → 인트라넷 창 열기/포커스
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cl) {
      for (var i = 0; i < cl.length; i++) {
        if ('focus' in cl[i]) { cl[i].focus(); return; }
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
