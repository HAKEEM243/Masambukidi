// Service Worker — Masambukidi Protection E.LU.C.CO.
// v3.0 — PWA complète avec push notifications et cache intelligent

const CACHE_NAME = 'masambukidi-v3';
const STATIC_CACHE = 'masambukidi-static-v3';
const API_CACHE = 'masambukidi-api-v3';

// Ressources à pré-cacher
const PRECACHE_URLS = [
  '/',
  '/signaler',
  '/verifier',
  '/galerie',
  '/autorisation',
  '/qui-sommes-nous',
  '/static/logo-elucco.png',
  '/static/sa-majeste.jpg',
  '/static/sa-majeste-2.jpg',
  '/static/sa-majeste-3.jpg',
  '/manifest.json'
];

// =====================
// INSTALLATION
// =====================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Pré-cache des ressources statiques');
      return cache.addAll(PRECACHE_URLS.map(url => new Request(url, { cache: 'reload' })));
    }).then(() => self.skipWaiting())
  );
});

// =====================
// ACTIVATION
// =====================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter((name) => {
          return name.startsWith('masambukidi-') &&
                 name !== STATIC_CACHE &&
                 name !== API_CACHE;
        }).map((name) => {
          console.log('[SW] Suppression ancien cache :', name);
          return caches.delete(name);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// =====================
// FETCH — Stratégie Cache First pour statiques, Network First pour API
// =====================
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorer les requêtes non-GET et les extensions Chrome
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Stratégie pour les API : Network First, fallback cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(API_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Stratégie pour les pages HTML : Network First
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then((cached) => cached || caches.match('/'));
        })
    );
    return;
  }

  // Stratégie pour les assets statiques : Cache First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});

// =====================
// PUSH NOTIFICATIONS
// =====================
self.addEventListener('push', (event) => {
  let data = {
    title: 'Masambukidi Protection',
    body: 'Nouvelle alerte de protection',
    icon: '/static/logo-elucco.png',
    badge: '/static/logo-elucco.png',
    tag: 'masambukidi-alert',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: '/static/logo-elucco.png',
        badge: '/static/logo-elucco.png',
        tag: payload.tag || 'masambukidi-alert',
        data: { url: payload.url || '/' },
        requireInteraction: payload.priority === 'high',
        actions: [
          {
            action: 'view',
            title: 'Voir',
          },
          {
            action: 'dismiss',
            title: 'Fermer',
          }
        ]
      };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: data.data,
      requireInteraction: data.requireInteraction || false,
      actions: data.actions || []
    })
  );
});

// =====================
// NOTIFICATION CLICK
// =====================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';
  const action = event.action;

  if (action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Si une fenêtre est déjà ouverte, la focuser
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Sinon ouvrir une nouvelle fenêtre
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// =====================
// BACKGROUND SYNC — Signalements en file d'attente
// =====================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-reports') {
    event.waitUntil(syncPendingReports());
  }
  if (event.tag === 'sync-alerts') {
    event.waitUntil(syncAlerts());
  }
});

async function syncPendingReports() {
  try {
    const cache = await caches.open('pending-reports');
    const requests = await cache.keys();
    for (const request of requests) {
      try {
        await fetch(request);
        await cache.delete(request);
        console.log('[SW] Signalement synchronisé :', request.url);
      } catch (e) {
        console.log('[SW] Échec synchronisation :', e);
      }
    }
  } catch (e) {
    console.error('[SW] Erreur sync :', e);
  }
}

async function syncAlerts() {
  try {
    const response = await fetch('/api/monitor/alerts');
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.count > 0) {
        const alert = data.data[0];
        await self.registration.showNotification('Alerte Masambukidi', {
          body: `Mot-clé détecté : "${alert.keyword}" sur ${alert.platform}`,
          icon: '/static/logo-elucco.png',
          badge: '/static/logo-elucco.png',
          tag: 'masambukidi-keyword-alert',
          data: { url: '/#alerts-section' }
        });
      }
    }
  } catch (e) {
    console.log('[SW] Sync alertes non disponible');
  }
}

// =====================
// MESSAGE — Communication avec la page
// =====================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

console.log('[SW] Service Worker Masambukidi v3 chargé');
