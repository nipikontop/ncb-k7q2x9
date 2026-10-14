// NCB Controller – Offline-Speicher (App startet auch ohne Internet)
const CACHE = 'ncb-controller-2.1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './fonts/orbitron-500.woff2', './fonts/orbitron-700.woff2', './fonts/orbitron-800.woff2',
  './fonts/rajdhani-500.woff2', './fonts/rajdhani-600.woff2', './fonts/rajdhani-700.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // App-Seite: erst Netz (damit Updates sofort da sind), sonst Speicher
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); }   // nur echte App speichern
      return r;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  // eigene Dateien: Speicher zuerst
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
    return;
  }
});

// Benachrichtigung: STOPP-Taste -> laufende App stoppt die Motoren; Antippen -> App öffnen
const TAG = 'ncb-run';
function ask(c) {                                   // App um STOPP bitten, auf Rückmeldung warten
  return new Promise((res) => {
    const ch = new MessageChannel(), t = setTimeout(() => res(false), 1500);
    ch.port1.onmessage = () => { clearTimeout(t); res(true); };
    try { c.postMessage({ type: 'ncb-stop' }, [ch.port2]); } catch (e) { clearTimeout(t); res(false); }
  });
}
async function focusOrOpen(list, url) {
  for (const c of list) { if ('focus' in c) { try { return await c.focus(); } catch (e) { /* nächster */ } } }
  if (self.clients.openWindow) return self.clients.openWindow(url);
}
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const run = (async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (e.action === 'stop') {
      const ok = (await Promise.all(list.map(ask))).some(Boolean);
      if (!ok) await focusOrOpen(list, './?stop=1');   // App zu oder eingefroren: öffnen, dort wird gestoppt
      return;
    }
    await focusOrOpen(list, './');
  })();
  try { e.waitUntil(run); } catch (er) { /* nur bei Test-Ereignissen */ }
});

// App wurde geschlossen: Meldung wegräumen bzw. Text anpassen (Controller läuft mit "Weiterlaufen" weiter)
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type !== 'ncb-close' && d.type !== 'ncb-closed-keep') return;
  const run = (async () => {
    const list = await self.registration.getNotifications({ tag: TAG });
    list.forEach((n) => n.close());
    if (d.type === 'ncb-closed-keep') {
      await self.registration.showNotification('NCB Controller läuft weiter', { tag: TAG, icon: 'icon-192.png', silent: true,
        body: 'App geschlossen – läuft bis Auto-Aus. STOPP öffnet die App und stoppt beim Verbinden.', actions: [{ action: 'stop', title: 'STOPP' }] });
    }
  })();
  try { e.waitUntil(run); } catch (er) { /* egal */ }
});
