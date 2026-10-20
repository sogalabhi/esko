import { defineConfig, devices } from '@playwright/test'

// Own ports, so the run works next to a running `npm run dev` (8000 / 5173).
const API = process.env.E2E_API_PORT ?? '8010'
const WEB = process.env.E2E_WEB_PORT ?? '5183'

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1, // the backend store is in memory and shared
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${WEB}`, trace: 'retain-on-failure', viewport: { width: 1280, height: 800 } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: [
    {
      command: 'uv run --directory ../backend python ../e2e/fake_server.py',
      env: { E2E_API_PORT: API },
      url: `http://127.0.0.1:${API}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev --prefix ../frontend -- --host 127.0.0.1 --port ${WEB} --strictPort`,
      env: { API_PORT: API },
      url: `http://127.0.0.1:${WEB}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
