import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Snor Live',
        short_name: 'Snor',
        start_url: '/',
        display: 'standalone',
        background_color: '#080810',
        theme_color: '#00d4ff',
        icons: [{ src: '/icon.png', sizes: '192x192', type: 'image/png' }]
      }
    })
  ],
})