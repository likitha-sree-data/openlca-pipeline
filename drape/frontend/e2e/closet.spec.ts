import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { FIXTURES, expectNoA11yViolations, signIn, tab } from './helpers'

const garmentPhotos = () =>
  fs.readdirSync(FIXTURES).filter((f) => f.startsWith('garment-')).sort().map((f) => path.join(FIXTURES, f))

test('add 12 photos in one batch, fix a category, filter, search, survive reload', async ({ page }) => {
  test.setTimeout(180_000)
  await signIn(page)
  await tab(page, 'Closet')
  await expect(page.getByText('Your closet is empty.')).toBeVisible()
  await expectNoA11yViolations(page, 'closet-empty')
  await page.getByRole('link', { name: 'Add garment' }).click()
  await expect(page.getByRole('heading', { name: 'Add garment.' })).toBeVisible()
  await expectNoA11yViolations(page, 'add-garment')

  const files = garmentPhotos()
  expect(files).toHaveLength(12)
  await page.locator('#files-input').setInputFiles(files)
  await expect(page.getByText(/Scanning \d+ of 12 photos/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Review details' })).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText('1 of 12 to review')).toBeVisible({ timeout: 120_000 })

  // Nothing is in the closet yet.
  const listing = await page.request.get('/api/garments', { headers: { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('drape.token'))}` } })
  expect((await listing.json()).total).toBe(0)

  // Review the first draft: give it a name and a deliberately wrong category.
  const firstForm = page.getByRole('form').first()
  await firstForm.getByLabel('Name').fill('Cream cotton shirt')
  await firstForm.getByLabel('Category').selectOption('shoes')
  await expectNoA11yViolations(page, 'review-details')
  // A refresh keeps the draft and the edits.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Review details' })).toBeVisible()
  await expect(page.getByRole('form').first().getByLabel('Name')).toHaveValue('Cream cotton shirt')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('1 of 11 to review')).toBeVisible()

  // Save the rest in one go.
  await page.getByRole('button', { name: 'Save all 11' }).click()
  await expect(page.getByRole('heading', { name: 'All saved.' })).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'See my wardrobe' }).click()
  await expect(page.getByText('12 pieces you own.')).toBeVisible()
  await expectNoA11yViolations(page, 'closet-full')

  // Correct the wrong category.
  await page.getByRole('button', { name: /Cream cotton shirt/ }).click()
  await expect(page.getByRole('heading', { name: 'Cream cotton shirt' })).toBeVisible()
  await expectNoA11yViolations(page, 'garment-detail')
  await page.getByLabel('Category').selectOption('top')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Changes saved')).toBeVisible()
  await tab(page, 'Closet')

  // Filter and search.
  await page.getByRole('button', { name: 'Tops', exact: true }).click()
  await expect(page.getByRole('button', { name: /Cream cotton shirt/ })).toBeVisible()
  const tops = await page.getByRole('list', { name: 'Garments' }).getByRole('listitem').count()
  expect(tops).toBeGreaterThanOrEqual(1)
  await page.getByRole('button', { name: 'Shoes', exact: true }).click()
  await expect(page.getByRole('button', { name: /Cream cotton shirt/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.getByLabel('Search by name or color').fill('cream')
  await page.getByLabel('Search by name or color').press('Enter')
  await expect(page.getByRole('list', { name: 'Garments' }).getByRole('listitem')).toHaveCount(1)

  // Everything survives a reload.
  await page.getByLabel('Search by name or color').fill('')
  await page.reload()
  await expect(page.getByText('12 pieces you own.')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Garments' }).getByRole('listitem')).toHaveCount(12)
})

test('unsaved edits on garment details warn before leaving @mobile', async ({ page }) => {
  await page.goto('/signin')
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await expect(page.getByText('You are in a demo')).toBeVisible()
  await tab(page, 'Closet')
  await page.getByRole('button', { name: /Olive cardigan/ }).click()
  await page.getByLabel('Name').fill('Olive cardigan, edited')
  await tab(page, 'Home')
  await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible()
  await page.getByRole('button', { name: 'Stay on this page' }).click()
  await expect(page.getByLabel('Name')).toHaveValue('Olive cardigan, edited')
  await tab(page, 'Home')
  await page.getByRole('button', { name: 'Leave without saving' }).click()
  await expect(page.getByRole('heading', { name: "Today's outfit." })).toBeVisible()
})

test('delete a garment after confirming', async ({ page }) => {
  await page.goto('/signin')
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await tab(page, 'Closet')
  await page.getByRole('button', { name: /Sage linen shirt/ }).click()
  await page.getByRole('button', { name: 'Delete garment' }).click()
  await expect(page.getByRole('dialog', { name: 'Delete Sage linen shirt?' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete garment' }).click()
  await expect(page.getByRole('heading', { name: 'My wardrobe.' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Sage linen shirt/ })).toHaveCount(0)
})
