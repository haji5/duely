/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    // Mirror the nginx setup in development: /api/* -> backend with the /api prefix stripped
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'build',
    // No public source maps: they would publish the original source next to the bundle.
    sourcemap: false,
    // No manualChunks: Rollup keeps framer-motion in the BracketPage chunk and Firebase in the
    // dynamically imported auth chunk, so neither is on the critical path of other pages.
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
  },
})
