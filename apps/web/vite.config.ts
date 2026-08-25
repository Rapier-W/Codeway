import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '同路行',
        short_name: '同路行',
        description: '日常同路出行匹配服务',
        theme_color: '#13233A',
        background_color: '#F6F8FB',
        display: 'standalone',
        icons: [],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'] },
    }),
  ],
  server: {
    proxy: {
      // Task 3 integration: forward /api to the local NestJS backend.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
