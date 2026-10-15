import base from './playwright.config'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: ['**/perf.spec.ts'],
  projects: [{ name: 'perf', use: { ...base.projects![1].use, serviceWorkers: 'block' } }],
})
