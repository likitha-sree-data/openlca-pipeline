import { expect, test } from '@playwright/test'
import { expectNoA11yViolations, startDemo } from './helpers'

const ROUTES = ['/', '/closet', '/closet/add', '/review', '/history', '/compare', '/ask', '/settings', '/settings/colors', '/notifications', '/does-not-exist']

test('axe finds no serious issues on any screen @mobile', async ({ page }) => {
  test.setTimeout(120_000)
  await startDemo(page)
  for (const r of ROUTES) {
    await page.goto(r)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('main h1').first()).toBeVisible()
    await expectNoA11yViolations(page, r)
  }
  // a garment detail and a review detail
  await page.goto('/closet')
  await page.getByRole('button', { name: /Olive cardigan/ }).click()
  await expectNoA11yViolations(page, 'garment detail')
  await page.goto('/review')
  await page.getByRole('link', { name: /Navy knit sweater/ }).first().click()
  await expectNoA11yViolations(page, 'review detail')
})

test('keyboard: skip link and visible focus', async ({ page }) => {
  await startDemo(page)
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  const outline = await skip.evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(outline).not.toBe('none')
})
