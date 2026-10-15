import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { STUDY_PORT } from '../playwright.config'
import { FIXTURES, expectNoA11yViolations, uniqueEmail } from './helpers'

test.use({ baseURL: `http://127.0.0.1:${STUDY_PORT}` })

async function signInAs(page: import('@playwright/test').Page, email: string) {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: "Today's outfit." })).toBeVisible()
}

test('consent, randomized review, study questions, admin summary and CSV without personal data', async ({ page, browser }) => {
  test.setTimeout(120_000)
  const email = uniqueEmail('participant')
  await signInAs(page, email)
  await page.goto('/study')
  await expect(page.getByText('Replace with IRB-approved text before recruiting anyone.')).toBeVisible()
  await expectNoA11yViolations(page, 'study-consent')
  await expect(page.getByRole('button', { name: 'Join the study' })).toBeDisabled()
  await page.getByLabel('I have read this and I agree to take part.').check()
  await page.getByRole('button', { name: 'Join the study' }).click()
  await expect(page.getByText(/Your participant code is P[A-Z0-9]{6}/)).toBeVisible()
  const code = (await page.getByText(/Your participant code is/).textContent())!.match(/P[A-Z0-9]{6}/)![0]

  await page.goto('/review')
  await page.getByLabel('Photo or screenshot').setInputFiles(path.join(FIXTURES, 'garment-04-blue-top.jpg'))
  await page.getByLabel('Name').fill('Blue top')
  await page.getByRole('button', { name: 'Compare with my wardrobe' }).click()
  await expect(page.getByRole('heading', { name: 'Considering: Blue top' })).toBeVisible({ timeout: 60_000 })
  const treatment = await page.getByRole('heading', { name: 'Already in your wardrobe' }).isVisible()
  await page.getByRole('button', { name: 'Keep browsing' }).click()
  const dialog = page.getByRole('dialog', { name: 'Keeping browsing.' })
  await dialog.getByLabel('Price').check()
  await expect(dialog.getByRole('button', { name: 'Confirm my choice' })).toBeDisabled()
  await dialog.getByText('6', { exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirm my choice' }).click()
  await expect(page.getByText('You chose to keep browsing.')).toBeVisible()

  const adminContext = await browser.newContext({ baseURL: `http://127.0.0.1:${STUDY_PORT}` })
  const admin = await adminContext.newPage()
  await signInAs(admin, 'admin@example.com')
  await admin.goto('/admin')
  await expect(admin.getByRole('heading', { name: 'Study admin.' })).toBeVisible()
  await expectNoA11yViolations(admin, 'admin')
  const cond = treatment ? 'Treatment' : 'Control'
  const table = admin.getByRole('table')
  await expect(table).toContainText('Decisions')
  const headers = await table.locator('thead th').allTextContents()
  expect(headers).toContain(cond)
  const dl = admin.waitForEvent('download')
  await admin.getByRole('button', { name: 'Download CSV, one row per decision' }).click()
  const csv = fs.readFileSync((await (await dl).path())!, 'utf8')
  expect(csv).toContain(code)
  expect(csv).toContain(treatment ? 'treatment' : 'control')
  expect(csv).not.toContain(email)
  expect(csv).not.toContain('@')
  expect(csv).not.toMatch(/\.(png|jpe?g|webp|svg)\b/)
  await adminContext.close()

  // Withdraw and delete study data
  await page.goto('/study')
  await page.getByRole('button', { name: 'Leave the study' }).click()
  await page.getByLabel('Also delete the study data recorded so far').check()
  await page.getByRole('dialog').getByRole('button', { name: 'Leave the study' }).click()
  await expect(page.getByText('You left the study and your study data was deleted')).toBeVisible()
})
