// The contract with the real mfe-me: this shell's production build loading a real mfe-me build (ME_DIST, a
// built dist/ with remote-manifest-entry.json) under the production CSP and Trusted Types. It catches what no
// single repo's tests can: a container global, share scope (the SDK subpaths mfe-me takes from the shell,
// including /security), SDK version, integrity, CSS, CSP or router mismatch between the two builds.
//
//   (cd ../mfe-me && npm ci && npm run build)
//   ME_DIST=../mfe-me/dist npm run test-contract -- --project=chromium
import { expect, test, type Page } from '@playwright/test'
import type { State } from './server'

test.skip(!process.env.ME_DIST, 'needs ME_DIST (a built mfe-me dist/)')

const APP = process.env.BROWSER_APP_URL!
const EMAIL = 'ada@acme.test'
const state = async (page: Page): Promise<State> => (await page.request.get(`${APP}/__test/state`)).json()

test.beforeEach(async ({ page }) => {
  await page.request.get(`${APP}/__test/reset`)
  await page.addInitScript(() => {
    const w = window as unknown as { __violations: string[] }
    w.__violations = []
    document.addEventListener('securitypolicyviolation', (e) => w.__violations.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
})

test.afterEach(async ({ page }) => {
  expect((await state(page)).cspReports, 'CSP reports at /csp-report').toEqual([])
})

async function openAccount(page: Page): Promise<void> {
  await page.goto(`${APP}/`)
  await page.getByRole('textbox', { name: /work email or workspace name/i }).fill(EMAIL)
  await page.getByRole('button', { name: /^continue$/i }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await page.getByRole('link', { name: 'My account' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
}

test('the real mfe-me loads in the shell: integrity, share scope, CSS, no CSP violation', async ({ page }) => {
  const failed: string[] = []
  // Only the remote's own files: the IAM routes this fake server does not serve (the profile, the departments) are not the contract.
  page.on('requestfailed', (r) => void (r.url().includes('/remotes/') && failed.push(r.url())))
  page.on('response', (r) => void (r.status() >= 400 && r.url().includes('/remotes/') && failed.push(`${r.status()} ${r.url()}`)))
  await openAccount(page)
  expect(page.url()).toBe(`${APP}/t/acme/me`)
  const remoteCss = await page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => (l as HTMLLinkElement).href).filter((h) => h.includes('/remotes/me/')))
  expect(remoteCss.length).toBeGreaterThan(0)
  expect(failed).toEqual([])
  expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([])
})

test('the section tabs move between sections under the shell\'s router, from a nested page too, and a reload stays put', async ({ page }) => {
  await openAccount(page)
  const tabs = page.getByRole('navigation', { name: 'My account sections' })
  await expect(tabs.getByRole('link')).toHaveText(['Profile', 'Availability', 'Delegations', 'AI preferences', 'Notifications', 'Security'])
  await tabs.getByRole('link', { name: 'Delegations' }).click()
  await expect(page).toHaveURL(`${APP}/t/acme/me/delegations`)
  await expect(page.getByRole('heading', { level: 1, name: 'Delegations' })).toBeVisible()
  // From a nested page the next tab must not stack onto the path (the splat-route bug).
  await tabs.getByRole('link', { name: 'Security' }).click()
  await expect(page).toHaveURL(`${APP}/t/acme/me/security`)
  await expect(page.getByRole('heading', { level: 1, name: 'Security' })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([])
})

test('G6 opens the account console of this workspace\'s realm in a new tab, safely', async ({ page }) => {
  await openAccount(page)
  await page.getByRole('navigation', { name: 'My account sections' }).getByRole('link', { name: 'Security' }).click()
  const link = page.getByRole('link', { name: /Manage sign-in/ })
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(await link.getAttribute('href')).toMatch(/\/realms\/tenant-acme\/account\/?$/)
})
