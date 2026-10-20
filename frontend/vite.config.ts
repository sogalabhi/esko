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
    // API_PORT lets the e2e run start its own backend next to a running `npm run dev`.
    proxy: { '/api': `http://127.0.0.1:${process.env.API_PORT ?? '8000'}` },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
    // Screen tests render whole pages; under a full parallel run on a laptop a 1 s test can take 6 s.
    testTimeout: 15000,
  },
})



