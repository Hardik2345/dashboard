import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      devOptions: {
        enabled: true
      },
      registerType: 'autoUpdate',
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkOnly',
          },
        ],
      },
      includeAssets: ['favicon.png', 'brand-logo-final.png'],
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: /^\/api/,
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
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // Remove the /api prefix because backend routes are mounted at root
        rewrite: (path) => path.replace(/^\/api/, ''),
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
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // Remove the /api prefix because backend routes are mounted at root
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
