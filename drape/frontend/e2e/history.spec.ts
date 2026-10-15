import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { FIXTURES, expectNoA11yViolations, signIn, startDemo, tab, token } from './helpers'

async function wearCounts(page: Page) {
  const r = await page.request.get('/api/garments', { headers: { Authorization: `Bearer ${await token(page)}` } })
  return Object.fromEntries((await r.json()).items.map((g: { name: string; wear_count: number }) => [g.name, g.wear_count]))
}

test('outfit photo: wear counts change only after confirming, once per garment', async ({ page }) => {
  test.setTimeout(180_000)
  await signIn(page)
  await page.goto('/closet/add')
  const files = ['garment-01-cream-top.jpg', 'garment-03-red-top.jpg', 'garment-05-navy-bottom.jpg', 'garment-06-beige-bottom.jpg', 'garment-10-white-shoes.jpg', 'garment-11-brown-shoes.jpg']
  await page.locator('#files-input').setInputFiles(files.map((f) => path.join(FIXTURES, f)))
  await expect(page.getByText('1 of 6 to review')).toBeVisible({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Save all 6' }).click()
  await expect(page.getByRole('heading', { name: 'All saved.' })).toBeVisible({ timeout: 60_000 })
  const names = Object.keys(await wearCounts(page))
  expect(names).toHaveLength(6)

  await tab(page, 'History')
  await expect(page.getByText('No outfits logged yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Save an outfit photo' }).first().click()
  await page.getByLabel('Photo', { exact: true }).setInputFiles(path.join(FIXTURES, 'outfit-cream-navy-white.jpg'))
  await expect(page.getByLabel('Keep my original photo')).not.toBeChecked()
  await page.getByRole('button', { name: 'Find my garments' }).click()
  await expect(page.getByRole('heading', { name: 'Review garment matches.' })).toBeVisible({ timeout: 60_000 })
  await expectNoA11yViolations(page, 'match-review')

  const before = await wearCounts(page)
  expect(Object.values(before).every((n) => n === 0)).toBe(true)
  // Pick "Not in my wardrobe" for anything Drape was unsure about, keep the confident matches.
  const items = page.getByRole('listitem').filter({ has: page.getByText('Which piece is this?') })
  const n = await items.count()
  expect(n).toBeGreaterThanOrEqual(3)
  for (let i = 0; i < n; i++) {
    const item = items.nth(i)
    if ((await item.getByRole('radio', { checked: true }).count()) === 0) {
      await item.getByRole('radio').first().check({ force: true })
    }
  }
  // Still nothing counted while reviewing.
  expect(await wearCounts(page)).toEqual(before)
  await page.getByRole('button', { name: 'Confirm and record wears' }).click()
  await expect(page.getByRole('heading', { name: 'Outfit history.' })).toBeVisible()
  await expect(page.getByText('Garments confirmed.').first()).toBeVisible()

  const after = await wearCounts(page)
  const changed = Object.keys(after).filter((k) => after[k] !== before[k])
  expect(changed.length).toBe(n)
  for (const k of changed) expect(after[k]).toBe(before[k] + 1)
  expect(after['Cream top'] ?? after[Object.keys(after).find((x) => /cream/i.test(x))!]).toBe(1)

  const hist = await (await page.request.get('/api/history', { headers: { Authorization: `Bearer ${await token(page)}` } })).json()
  const photo = await (await page.request.get(`/api/history/photos/${hist.entries[0].photo.id}`, { headers: { Authorization: `Bearer ${await token(page)}` } })).json()
  expect(photo.has_original).toBe(false)
  await expectNoA11yViolations(page, 'history')
})

test('history cards, insights traceability, manual log and resave @mobile', async ({ page }) => {
  await startDemo(page)
  await tab(page, 'History')
  const list = page.getByRole('list', { name: 'Outfit history' })
  await expect(list.getByText('Monday Office')).toBeVisible()
  await expect(list.getByText('Tuesday Everyday')).toBeVisible()
  await expect(list.getByText('Wednesday Meeting')).toBeVisible()
  await expect(list.getByText('Garments confirmed.')).toHaveCount(3)

  await page.getByText('Show as a table, with the wear logs behind each number').click()
  await page.getByRole('button', { name: '2 wears' }).first().click()
  await expect(page.getByText(/logged by you/).first()).toBeVisible()

  await page.getByRole('button', { name: 'Open Monday Office' }).click()
  await page.getByRole('button', { name: 'Save as a look' }).click()
  await expect(page.getByText('Saved as a look')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()

  const before = await wearCounts(page)
  await page.getByRole('button', { name: 'Log without a photo' }).click()
  const dialog = page.getByRole('dialog', { name: 'What did you wear?' })
  await dialog.getByRole('button', { name: 'Olive cardigan' }).click()
  await dialog.getByRole('button', { name: 'Grey crew tee' }).click()
  await dialog.getByRole('button', { name: 'Navy straight jeans' }).click()
  await dialog.getByRole('button', { name: 'White trainers' }).click()
  await dialog.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Log these pieces as worn' }).click()
  await expect(page.getByText('Outfit logged')).toBeVisible()
  const after = await wearCounts(page)
  expect(after['Olive cardigan']).toBe(before['Olive cardigan'] + 1)
  expect(after['Black blazer']).toBe(before['Black blazer'])
})
