import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/ 
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Disable automatic service worker generation during `vite` dev server runs
      // so `dev-dist/sw.js` and workbox files aren't rewritten on every reload.
      devOptions: {
        enabled: false
      },
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'brand-logo-final.png'],
      workbox: {
        // Exclude auth/API routes from service worker to prevent OAuth redirect caching issues
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
        // Don't cache API responses
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'Datum',
        short_name: 'Datum',
        description: 'Datum Dashboard',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'favicon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'favicon.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api/external-pagespeed': {
        target: 'https://speed-audit-service.onrender.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/external-pagespeed/, '/api'),
      },
      // Target Staging API for all /api requests
      // Auth service
      '/api/auth/': {
        target: 'https://api.trytechit.co/staging',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Author service (part of analytics)
      '/api/author': {
        target: 'https://api.trytechit.co/staging',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, '/analytics'),
      },
      // Alerts service
      '/api/alerts': {
        target: 'https://api.trytechit.co/staging',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Analytics service (default)
      '/api': {
        target: 'https://api.trytechit.co/staging',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, '/analytics'),
      },
    },
  },
  preview: {
    proxy: {
      '/api/external-pagespeed': {
        target: 'https://speed-audit-service.onrender.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/external-pagespeed/, '/api'),
      },
      '/api/auth/': {
        target: 'http://localhost:18080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Alerts now live at gateway /alerts
      '/api/alerts': {
        target: 'http://localhost:80/alerts',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Route all app API calls through the gateway analytics prefix (preview)
      '/api': {
        target: 'http://localhost:18080/analytics',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
