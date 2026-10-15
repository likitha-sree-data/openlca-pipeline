import { expect, test } from '@playwright/test'
import { expectNoA11yViolations, startDemo, tab, token } from './helpers'

test("today's outfit: swap, save, plan, more outfits, wear today @mobile", async ({ page }) => {
  await startDemo(page)
  const flat = page.getByRole('group', { name: /Outfit:/ })
  await expect(flat).toBeVisible()
  await expect(page.getByRole('heading', { name: 'From your wardrobe.' })).toBeVisible()
  await expectNoA11yViolations(page, 'home')

  // Swap the shoes.
  const shoesBefore = await page.getByRole('button', { name: /^Swap / }).nth(-1).getAttribute('aria-label')
  await page.getByRole('button', { name: /^Shoes / }).click()
  const options = page.getByRole('list', { name: 'Alternatives for Shoes' }).getByRole('button')
  await expect(options.first()).toBeVisible()
  const pick = (await options.first().getAttribute('aria-label'))!.replace('Use ', '')
  await options.first().click()
  await expect(page.getByRole('button', { name: `Swap ${pick}` })).toBeVisible()
  expect(`Swap ${pick}`).not.toBe(shoesBefore)

  // Save this look.
  await page.getByRole('button', { name: 'Save this look' }).click()
  await expect(page.getByText('Look saved')).toBeVisible()
  const looks = await (await page.request.get('/api/outfits', { headers: { Authorization: `Bearer ${await token(page)}` } })).json()
  expect(looks.some((l: { pieces: { garment: { name: string } }[] }) => l.pieces.some((p) => p.garment.name === pick))).toBe(true)

  // Plan another day.
  await page.getByRole('button', { name: 'Plan another day' }).click()
  await expect(page.getByRole('dialog', { name: 'Plan another day.' })).toBeVisible()
  await page.getByLabel('Occasion').last().selectOption('meeting')
  await page.getByRole('button', { name: 'Plan this outfit' }).click()
  await expect(page.getByText(/^Planned for/)).toBeVisible()
  await page.reload()
  const planned = page.getByRole('heading', { name: 'Planned days' }).locator('..')
  await expect(planned.getByRole('img', { name: 'Meeting' })).toBeVisible()

  // More outfits from these pieces.
  const more = page.getByRole('heading', { name: 'More outfits from these pieces.' }).locator('..')
  await expect(more.getByRole('button', { name: /Use this outfit/ })).toHaveCount(3)
  await more.getByRole('button', { name: /Use this outfit/ }).first().click()

  // Wear this today asks first and only then records.
  const t = await token(page)
  const before = await (await page.request.get('/api/garments', { headers: { Authorization: `Bearer ${t}` } })).json()
  await page.getByRole('button', { name: 'Wear this today' }).click()
  await expect(page.getByRole('dialog', { name: 'Wear this today?' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  const unchanged = await (await page.request.get('/api/garments', { headers: { Authorization: `Bearer ${t}` } })).json()
  expect(unchanged.items.map((g: { wear_count: number }) => g.wear_count)).toEqual(before.items.map((g: { wear_count: number }) => g.wear_count))
  await page.getByRole('button', { name: 'Wear this today' }).click()
  await page.getByRole('button', { name: 'Yes, I am wearing this' }).click()
  await expect(page.getByText('Recorded as worn today')).toBeVisible()
  const after = await (await page.request.get('/api/garments', { headers: { Authorization: `Bearer ${t}` } })).json()
  const total = (r: { items: { wear_count: number }[] }) => r.items.reduce((a, g) => a + g.wear_count, 0)
  expect(total(after) - total(before)).toBeGreaterThanOrEqual(3)
})

test('choose colors, versatility, weather and occasion', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 52.37, longitude: 4.9 })
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({ json: { current: { temperature_2m: 7.2, weather_code: 3 } } }),
  )
  await startDemo(page)
  await expect(page.getByRole('heading', { name: 'Pieces that work in several outfits.' })).toBeVisible()
  await expect(page.getByText(/These \d+ pieces make \d+ outfits together/)).toBeVisible()

  await page.getByRole('button', { name: 'Use my local weather' }).click()
  await expect(page.getByText(/7°C and cloudy/)).toBeVisible()
  await expect(page.getByText(/Warm enough for 7°C with a layer/)).toBeVisible()

  await page.getByRole('button', { name: 'Formal', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Formal', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('link', { name: 'Choose colors' }).click()
  await expect(page.getByRole('heading', { name: 'Choose colors.' })).toBeVisible()
  await expectNoA11yViolations(page, 'colors')
  await page.getByRole('list', { name: 'Colors to avoid' }).getByRole('button', { name: 'Navy' }).click()
  await tab(page, 'Home')
  await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible()
  await page.getByRole('button', { name: 'Stay on this page' }).click()
  await page.getByRole('button', { name: 'Save colors' }).click()
  await expect(page.getByText('Color preferences saved')).toBeVisible()
  await tab(page, 'Home')
  await expect(page.getByRole('group', { name: /Outfit:/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'From your wardrobe.' }).locator('..').getByText(/Navy/)).toHaveCount(0)
})

test('pinned piece from a nudge: Style it', async ({ page }) => {
  await startDemo(page)
  const t = await token(page)
  const items = (await (await page.request.get('/api/garments', { headers: { Authorization: `Bearer ${t}` } })).json()).items
  const olive = items.find((g: { name: string }) => g.name === 'Olive cardigan')
  await page.goto(`/?pin=${olive.id}`)
  await expect(page.getByText('Styling your olive cardigan.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Swap Olive cardigan' })).toBeVisible()
})
