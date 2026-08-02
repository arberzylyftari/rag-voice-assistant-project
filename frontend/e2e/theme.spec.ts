import { expect, test } from '@playwright/test'

import { stubBackend } from './support'

function isDark(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains('dark'))
}

test.describe('the theme', () => {
  test.use({ colorScheme: 'light' })

  test('follows the system preference when nothing is stored', async ({ page }) => {
    await stubBackend(page)
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())

    await page.emulateMedia({ colorScheme: 'dark' })
    await page.reload()
    expect(await isDark(page)).toBe(true)

    await page.emulateMedia({ colorScheme: 'light' })
    await page.reload()
    expect(await isDark(page)).toBe(false)
  })

  test('toggles, and a stored choice outranks the system preference', async ({ page }) => {
    await stubBackend(page)
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()

    expect(await isDark(page)).toBe(false)

    await page.getByRole('button', { name: /temen e erret/i }).click()
    // The wipe covers the viewport before the theme swaps, so give it time.
    await expect.poll(() => isDark(page), { timeout: 5000 }).toBe(true)
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark')

    // The system says light; the stored choice must win.
    await page.emulateMedia({ colorScheme: 'light' })
    await page.reload()
    expect(await isDark(page)).toBe(true)
  })

  test('applies the stored theme before first paint', async ({ page }) => {
    await stubBackend(page)
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('theme', 'dark'))

    // An inline script in index.html sets the class before React mounts, so a
    // reload never flashes the wrong theme. Checking at DOMContentLoaded is
    // the earliest point a test can observe that.
    await page.goto('/', { waitUntil: 'commit' })
    await page.waitForFunction(() => document.readyState !== 'loading')

    expect(await isDark(page)).toBe(true)
  })

  test('is shared by the chat and admin pages', async ({ page }) => {
    await stubBackend(page)
    await page.route('**/admin/documents**', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"x"}' }),
    )
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('theme', 'dark'))

    await page.goto('/admin')
    expect(await isDark(page)).toBe(true)
    await expect(page.getByRole('button', { name: /temen/i })).toBeVisible()
  })
})
