/* eslint-env serviceworker */

/*
 * This file (which will be your service worker)
 * is picked up by the build system ONLY if
 * quasar.config.js > pwa > workboxMode is set to "injectManifest"
 */

import { clientsClaim, setCacheNameDetails } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// Configure cache names
setCacheNameDetails({ prefix: 'lemonade-pass-manager' })

// clientsClaim makes the SW take control of existing clients when activated
clientsClaim()

// NOTE: We do NOT call self.skipWaiting() here - we wait for user confirmation via dialog

// Use with precache injection
precacheAndRoute(self.__WB_MANIFEST)

// Clean up obsolete caches
cleanupOutdatedCaches()

// Non-SSR fallback to index.html
// Production SSR fallback to offline.html (except for dev)
if (process.env.MODE !== 'ssr' || process.env.PROD) {
  registerRoute(
    new NavigationRoute(
      createHandlerBoundToURL(process.env.PWA_FALLBACK_HTML),
      { denylist: [/sw\.js$/, /workbox-(.)*\.js$/, /\/__\//] }
    )
  )
}

// Cache strategies for images
registerRoute(
  /\.(png|jpg|jpeg|svg|webp|gif)$/,
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  }),
  'GET'
)

// Cache for Google Fonts
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-stylesheets',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  }),
  'GET'
)

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  }),
  'GET'
)

// Handle client messages
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// When the SW takes control, notify the client
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATED' })
      })
    })
  )
})
