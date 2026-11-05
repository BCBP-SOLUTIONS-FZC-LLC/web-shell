// The contract with the real dashboard: this shell's production build loading a real mfe-dashboard
// build (REMOTE_DIST, a built dist/ with remote-manifest-entry.json) in Chromium, Firefox and WebKit
// under the production CSP. It catches what the stub in shell.spec.ts cannot: a container global,
// share scope, SDK version, integrity, CSS or CSP mismatch between the two repos' builds.
//
//   (cd ../mfe-dashboard && npm ci && npm run build)
//   REMOTE_DIST=../mfe-dashboard/dist npm run test-contract
import { expect, test, type Page } from '@playwright/test'
import type { State } from './server'

test.skip(!process.env.REMOTE_DIST, 'needs REMOTE_DIST (a built mfe-dashboard dist/)')

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

async function signIn(page: Page): Promise<void> {
  await page.goto(`${APP}/`)
  await page.getByRole('textbox', { name: /work email address/i }).fill(EMAIL)
  await page.getByRole('button', { name: /continue with email/i }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
}

test('the real dashboard loads in the shell: integrity, share scope, CSS, no CSP violation', async ({ page }) => {
  const failed: string[] = []
  page.on('requestfailed', (r) => failed.push(r.url()))
  page.on('response', (r) => void (r.status() >= 400 && r.url().includes('/remotes/') && failed.push(`${r.status()} ${r.url()}`)))
  await signIn(page)
  expect(page.url()).toBe(`${APP}/t/acme/dashboard`)
  // The remote's own stylesheet applied (its CSS chunk loaded under style-src 'self' and its integrity).
  const remoteCss = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => (l as HTMLLinkElement).href).filter((h) => h.includes('/remotes/dashboard/')),
  )
  expect(remoteCss.length).toBeGreaterThan(0)
  expect(failed).toEqual([])
  expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([])
})

test("every image the dashboard shows loads (its assets resolve under the remote, not the shell's origin)", async ({ page }) => {
  await signIn(page)
  await expect(page.locator('img').first()).toBeAttached()
  // A root-relative src (/image/x.png) resolves against the shell's origin, where the remote's files are not.
  const broken = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('img')]
    const settled = (i: HTMLImageElement) =>
      new Promise<void>((r) => {
        if (i.complete) return r()
        i.addEventListener('load', () => r(), { once: true })
        i.addEventListener('error', () => r(), { once: true })
        setTimeout(r, 5_000)
      })
    await Promise.all(imgs.map(settled))
    return imgs.filter((i) => i.naturalWidth === 0).map((i) => `${i.alt || '(no alt)'}: ${i.getAttribute('src')}`)
  })
  expect(broken).toEqual([])
})

test("the shell's role map reaches the dashboard, and its navigation stays in the page", async ({ page }) => {
  await signIn(page)
  await page.evaluate(() => ((window as unknown as { __samePage: boolean }).__samePage = true))
  // tenant_owner reads members (the shell's role map), so the dashboard shows the link.
  await page.getByRole('link', { name: 'User management' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'User management' })).toBeVisible()
  await expect(page).toHaveURL(`${APP}/t/acme/dashboard/user-management`)
  expect(await page.evaluate(() => (window as unknown as { __samePage?: boolean }).__samePage)).toBe(true)
})

test("the dashboard's Logout signs out globally through the shell (form POST to Keycloak)", async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Logout' }).first().click()
  await expect(page.getByRole('heading', { name: 'You are signed out' })).toBeVisible()
  // The dialog shows as soon as the SDK reports the sign-out, before the form POST reaches
  // Keycloak and the browser comes back: wait for the POST, not for the dialog.
  await expect.poll(async () => (await state(page)).logouts.length).toBe(1)
  const { logouts } = await state(page)
  expect(logouts[0]).toMatchObject({ client_id: 'tender-web', post_logout_redirect_uri: `${APP}/` })
  await expect(page).toHaveURL(`${APP}/`)
  await expect(page.getByRole('heading', { name: 'You are signed out' })).toBeVisible()
})
