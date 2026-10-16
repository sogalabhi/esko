/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Pre-bundle the lazily imported heavy deps up front so Vite doesn't re-optimise
  // mid-session (which breaks open pages with "Failed to fetch dynamically imported module").
  optimizeDeps: {
    include: ['pdfjs-dist', 'three', '@react-three/fiber', '@react-three/drei'],
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
  },
})



