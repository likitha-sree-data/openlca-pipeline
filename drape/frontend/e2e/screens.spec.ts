/**
 * Screenshots of every screen at 390px and 1280px, saved to docs/screenshots.
 * Uses the demo sandbox so screens have content.
 */
import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/screenshots')

type Screen = { name: string; path: string; ready?: (page: Page) => Promise<void>; action?: (page: Page) => Promise<void> }

const SCREENS: Screen[] = [
  { name: 'home', path: '/' },
  { name: 'closet', path: '/closet' },
  { name: 'add-garment', path: '/closet/add' },
  { name: 'garment-detail', path: '/closet', action: async (p) => { await p.getByRole('button', { name: /Olive cardigan/ }).first().click() } },
  { name: 'review', path: '/review' },
  { name: 'history', path: '/history' },
  { name: 'compare', path: '/compare' },
  { name: 'ask', path: '/ask' },
  { name: 'settings', path: '/settings' },
  { name: 'colors', path: '/settings/colors' },
  { name: 'notifications', path: '/notifications' },
]

const only = process.env.SCREENS?.split(',')

for (const width of [390, 1280]) {
  test(`screens at ${width}px`, async ({ page }) => {
    test.setTimeout(240_000)
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 })
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Try the demo' }).click()
    await expect(page.getByText('You are in a demo')).toBeVisible()
    for (const s of SCREENS.filter((x) => !only || only.includes(x.name))) {
      await page.goto(s.path)
      await page.waitForLoadState('networkidle')
      if (s.action) {
        await s.action(page)
        await page.waitForLoadState('networkidle')
      }
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${OUT}/${s.name}-${width}.png`, fullPage: true })
    }
    await page.goto('/signin')
    await page.evaluate(() => localStorage.clear())
    await page.goto('/signin')
    await page.screenshot({ path: `${OUT}/signin-${width}.png`, fullPage: true })
  })
}
