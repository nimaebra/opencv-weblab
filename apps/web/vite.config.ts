import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  base: process.env.ROVERAN_BASE_PATH || '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: [
        'samples/*',
        'runtime/opencv.js',
        'runtime/LICENSE.txt',
        'engine-worker.js',
        'icon.svg',
      ],
      manifest: {
        name: 'Roveran — OpenCV learning lab',
        short_name: 'Roveran',
        description: 'Build image pipelines and understand every step. Images stay on your device.',
        theme_color: '#3f694c',
        background_color: '#f4f5f1',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff,woff2,svg,png,jpg,webp}'],
        globIgnores: ['**/*.map'],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: false,
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: { port: 5173 },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules') && (id.includes('@xyflow') || id.includes('/d3-')))
            return 'graph';
          if (
            id.includes('node_modules') &&
            (id.includes('/react-dom@') || id.includes('/react@') || id.includes('/scheduler@'))
          )
            return 'react';
        },
      },
    },
  },
});
