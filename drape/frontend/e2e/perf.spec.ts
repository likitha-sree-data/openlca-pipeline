/**
 * Closet with 100 garments on an emulated mid-range phone over fast 4G.
 * Run with: npm run perf
 */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/perf-closet-100.json')

test('closet with 100 items is usable within 2 seconds on fast 4G with a 4x slower CPU', async ({ page, context }) => {
  test.setTimeout(300_000)
  const email = `perf-${Date.now()}@example.com`
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: "Today's outfit." })).toBeVisible()
  const seeded = await page.request.post(`/e2e/seed-closet?email=${encodeURIComponent(email)}&n=100`, { timeout: 240_000 })
  expect((await seeded.json()).seeded).toBe(100)

  const cdp = await context.newCDPSession(page)
  // Chrome DevTools "Fast 4G" preset and a 4x CPU slowdown for a mid-range phone.
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 })
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.setViewportSize({ width: 390, height: 844 })

  const runs: { usable_ms: number; lcp_ms: number; first_images_ms: number; transferred_kb: number }[] = []
  for (let i = 0; i < 3; i++) {
    let bytes = 0
    const onResp = async (r: import('@playwright/test').Response) => {
      const len = Number(r.headers()['content-length'] ?? 0)
      bytes += Number.isFinite(len) ? len : 0
    }
    page.on('response', onResp)
    const t0 = Date.now()
    await page.goto('/closet', { waitUntil: 'commit' })
    await expect(page.getByText('100 pieces you own.')).toBeVisible({ timeout: 30_000 })
    const usable = Date.now() - t0
    await page.waitForFunction(() => {
      const imgs = Array.from(document.querySelectorAll('ul[aria-label="Garments"] img')).slice(0, 4) as HTMLImageElement[]
      return imgs.length === 4 && imgs.every((im) => im.complete && im.naturalWidth > 0)
    }, null, { timeout: 30_000 })
    const images = Date.now() - t0
    const lcp = await page.evaluate(() => new Promise<number>((resolve) => {
      new PerformanceObserver((list) => {
        const e = list.getEntries()
        resolve(e[e.length - 1].startTime)
      }).observe({ type: 'largest-contentful-paint', buffered: true })
      setTimeout(() => resolve(-1), 3000)
    }))
    page.off('response', onResp)
    runs.push({ usable_ms: usable, lcp_ms: Math.round(lcp), first_images_ms: images, transferred_kb: Math.round(bytes / 1024) })
  }
  const lazy = await page.evaluate(() => Array.from(document.querySelectorAll('ul[aria-label="Garments"] img')).every((i) => (i as HTMLImageElement).loading === 'lazy'))
  const installability = await cdp.send('Page.getInstallabilityErrors').catch(() => ({ installabilityErrors: [{ errorId: 'unavailable' }] }))
  const manifest = await (await page.request.get('/manifest.webmanifest')).json()
  const median = (k: keyof (typeof runs)[number]) => runs.map((r) => r[k]).sort((a, b) => a - b)[1]
  const report = {
    measured_at: new Date().toISOString(),
    conditions: 'Chromium, 390x844, Fast 4G (9 Mbps down, 1.5 Mbps up, 60 ms latency), 4x CPU slowdown, HTTP cache disabled, service worker blocked, 100 garments',
    runs,
    median_usable_ms: median('usable_ms'),
    median_lcp_ms: median('lcp_ms'),
    median_first_images_ms: median('first_images_ms'),
    thumbnails_lazy: lazy,
    pwa_installability_errors: installability.installabilityErrors,
    manifest_name: manifest.name,
  }
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  expect(lazy).toBe(true)
  expect(report.median_usable_ms).toBeLessThan(2000)
})
