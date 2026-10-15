import { defineConfig, devices } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.E2E_PORT ?? 7861)
const venv = path.resolve(__dirname, '../.venv/bin/python')
const python = process.env.E2E_PYTHON ?? (fs.existsSync(venv) ? venv : 'python')
const chromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/screens.spec.ts'],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: fs.existsSync(chromium) && !process.env.CI ? { executablePath: chromium } : {},
  },
  projects: [
    { name: 'mobile', grep: /@mobile/, use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
  ],
  webServer: {
    command: `${python} scripts/serve_e2e.py`,
    cwd: path.resolve(__dirname, '../backend'),
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { E2E_PORT: String(PORT), E2E_STUDY_MODE: process.env.E2E_STUDY_MODE ?? 'false' },
  },
})
