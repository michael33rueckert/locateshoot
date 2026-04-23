const CACHE = 'locateshoot-v3'
const PRECACHE = ['/dashboard', '/explore', '/share', '/profile', '/icon-192.png', '/icon-512.png', '/icon-512-maskable.png', '/apple-touch-icon.png']

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
      icon:  '/icon-192.png',
      badge: '/icon-192.png',
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