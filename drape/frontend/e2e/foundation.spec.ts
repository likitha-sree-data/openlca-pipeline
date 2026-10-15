import { expect, test } from '@playwright/test'
import { expectNoA11yViolations, signIn, tab } from './helpers'

test('sign in and every tab renders @mobile', async ({ page }) => {
  await signIn(page)
  await expect(page.getByRole('heading', { name: "Today's outfit." })).toBeVisible()
  await tab(page, 'Closet')
  await expect(page.getByRole('heading', { name: 'My wardrobe.' })).toBeVisible()
  await tab(page, 'Review')
  await expect(page.getByRole('heading', { name: 'Before you buy.' })).toBeVisible()
  await tab(page, 'History')
  await expect(page.getByRole('heading', { name: 'Outfit history.' })).toBeVisible()
  await tab(page, 'Home')
  await expectNoA11yViolations(page, 'home')
})

test('sign out returns to sign in', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in.' })).toBeVisible()
  await page.goto('/closet')
  await expect(page).toHaveURL(/signin/)
})

test('sign-in page is accessible @mobile', async ({ page }) => {
  await page.goto('/signin')
  await expect(page.getByRole('heading', { name: 'Sign in.' })).toBeVisible()
  await expectNoA11yViolations(page, 'signin')
})

test('demo starts with illustrated closet', async ({ page }) => {
  await page.goto('/signin')
  await page.getByRole('button', { name: 'Try the demo' }).click()
  await expect(page.getByText('You are in a demo')).toBeVisible()
})
