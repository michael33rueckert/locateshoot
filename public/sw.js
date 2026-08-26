// Bump this whenever notification icon assets change so old
// installs pull the new PNGs on next visit instead of continuing
// to serve the cached-blank icon.
const CACHE = 'locateshoot-v4'
const PRECACHE = ['/dashboard', '/explore', '/share', '/profile', '/icon-192.png', '/icon-512.png', '/icon-512-maskable.png', '/apple-touch-icon.png', '/notification-icon-96.png', '/notification-icon-192.png']

// Install — precache core pages
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

// Fetch — network first, fall back to cache
self.addEventListener('fetch', e => {
  // Skip non-GET and external requests
  if (e.request.method !== 'GET') return
  if (!e.request.url.startsWith(self.location.origin)) return
  // Skip API calls and Supabase — always network
  if (e.request.url.includes('/api/') || e.request.url.includes('supabase')) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache successful HTML/JS/CSS responses
        if (res.status === 200) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      .catch(() => caches.match(e.request))
  )
})

// Push notifications
self.addEventListener('push', e => {
  const data = e.data?.json?.() ?? {}
  e.waitUntil(
    self.registration.showNotification(data.title ?? 'LocateShoot', {
      body:  data.body  ?? 'You have a new notification',
      // Large icon shown in the notification body — white disc with
      // an L cutout, works on iOS + as the body icon on Android.
      icon:  '/notification-icon-192.png',
      // Small status-bar / lock-screen badge on Android. Android
      // reads only the alpha channel and re-tints with the theme
      // accent, so the L stays punched-through and the surrounding
      // circle picks up the system color instead of rendering the
      // full-color app icon (which showed as a blank white disc
      // before). iOS ignores badge; it uses icon.
      badge: '/notification-icon-96.png',
      tag:   data.tag   ?? 'locateshoot',
      data:  { url: data.url ?? '/dashboard' },
      actions: [{ action: 'view', title: 'View' }],
    })
  )
})

// Notification click → open app
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url ?? '/dashboard'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin))
      if (existing) { existing.focus(); existing.navigate(url) }
      else clients.openWindow(url)
    })
  )
})