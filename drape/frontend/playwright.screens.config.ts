import base from './playwright.config'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: ['**/screens.spec.ts'],
  projects: [{ name: 'screens', use: { ...base.projects![1].use } }],
})
