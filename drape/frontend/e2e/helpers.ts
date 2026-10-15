import { expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const FIXTURES = path.resolve(__dirname, 'fixtures')

export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
}

export async function signIn(page: Page, email = uniqueEmail()) {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  return email
}

export async function startDemo(page: Page) {
  await page.goto('/signin')
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('You are in a demo')).toBeVisible()
}

export async function token(page: Page): Promise<string> {
  return (await page.evaluate(() => localStorage.getItem('drape.token'))) ?? ''
}

export async function expectNoA11yViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map((v) => `${label}: ${v.id} ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')})`)).toEqual([])
}

export async function tab(page: Page, name: 'Home' | 'Closet' | 'Review' | 'History') {
  const nav = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true }).first()
  await nav.getByRole('link', { name, exact: true }).click()
}
