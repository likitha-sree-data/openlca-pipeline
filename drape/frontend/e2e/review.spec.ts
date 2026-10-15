import { expect, test } from '@playwright/test'
import path from 'node:path'
import { FIXTURES, expectNoA11yViolations, startDemo, tab } from './helpers'

test('demo candidate: similar pieces, works with, save for 48 hours, follow-up @mobile', async ({ page }) => {
  await startDemo(page)
  await tab(page, 'Review')
  await expect(page.getByRole('heading', { name: 'Before you buy.' })).toBeVisible()
  await expectNoA11yViolations(page, 'review')
  await page.getByRole('link', { name: /Navy knit sweater/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Considering: Navy knit sweater' })).toBeVisible()
  const similar = page.getByRole('heading', { name: 'Already in your wardrobe' }).locator('..')
  await expect(similar.getByRole('link').first()).toContainText('Navy cardigan')
  await expect(similar.getByText('Similar color and purpose').first()).toBeVisible()
  const works = page.getByRole('heading', { name: 'Works with' }).locator('..')
  await expect(works.getByText('Beige trousers')).toBeVisible()
  await expect(works.getByText('White trainers')).toBeVisible()
  await expect(page.getByText(/This would add \d+ new outfits? to what you already own/)).toBeVisible()
  await expectNoA11yViolations(page, 'review-detail')

  // Equal weight: both are secondary buttons.
  const save = page.getByRole('button', { name: 'Save for 48 hours' })
  const keep = page.getByRole('button', { name: 'Keep browsing' })
  expect(await save.getAttribute('class')).toBe(await keep.getAttribute('class'))
  await save.click()
  await expect(page.getByText('Saved to your waiting list.')).toBeVisible()
  await expect(page.getByText(/4[78] h \d+ min left/)).toBeVisible()

  // Time passes: the cron marks it due and a reminder appears.
  const aged = await (await page.request.post('/e2e/age-waiting')).json()
  expect(aged.reminders).toBeGreaterThanOrEqual(1)
  await page.goto('/notifications')
  await expect(page.getByText('Still want it?')).toBeVisible()
  await page.getByRole('link', { name: 'Answer' }).first().click()
  const card = page.locator('li[id^="waiting-"]').first()
  await expect(card.getByText('Still want it?')).toBeVisible()
  await card.getByLabel('Note').fill('Already have the navy cardigan')
  await card.getByRole('button', { name: 'Skipped it' }).click()
  await expect(page.getByText('Answer saved')).toBeVisible()
  await expect(card.getByText(/You skipped it/).first()).toBeVisible()
})

test('review a product link, a blocked shop, and a photo', async ({ page }) => {
  test.setTimeout(120_000)
  await startDemo(page)
  await tab(page, 'Review')
  await page.getByRole('button', { name: 'Paste a link' }).click()
  await page.getByLabel('Product link').fill('https://blocked.e2e.test/item/1')
  await page.getByRole('button', { name: 'Compare with my wardrobe' }).click()
  await expect(page.getByRole('alert')).toContainText('Add a screenshot or photo')
  await expect(page.getByRole('button', { name: 'Use a screenshot instead' })).toBeVisible()

  await page.getByLabel('Product link').fill('http://169.254.169.254/latest/meta-data')
  await page.getByRole('button', { name: 'Compare with my wardrobe' }).click()
  await expect(page.getByRole('alert')).toContainText('private')

  await page.getByLabel('Product link').fill('https://shop.e2e.test/p/navy-sweater')
  await page.getByRole('button', { name: 'Compare with my wardrobe' }).click()
  await expect(page.getByRole('heading', { name: 'Considering: Navy knit sweater' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Price 65.00.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Already in your wardrobe' }).locator('..').getByText('Navy cardigan')).toBeVisible()
  await page.getByRole('button', { name: 'Keep browsing' }).click()
  await expect(page.getByText('You chose to keep browsing.')).toBeVisible()

  await tab(page, 'Review')
  await page.getByLabel('Photo or screenshot').setInputFiles(path.join(FIXTURES, 'garment-03-red-top.jpg'))
  await page.getByLabel('Name').fill('Red top')
  await page.getByRole('button', { name: 'Compare with my wardrobe' }).click()
  await expect(page.getByRole('heading', { name: 'Considering: Red top' })).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Save for 48 hours' }).click()
  await tab(page, 'Review')
  await expect(page.getByRole('heading', { name: 'Waiting list' }).locator('..').getByText('Red top')).toBeVisible()
})
