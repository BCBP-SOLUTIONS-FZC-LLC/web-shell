// The shell's production build in real engines under the production CSP (test/browser/README.md):
// what happy-dom cannot check. Trusted Types, script-src 'self', integrity on the remote's entry,
// Module Federation's share scope, self-hosted fonts, the sign-out form POST under form-action, the
// start-up failure report, and colour contrast.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, test, type Page } from '@playwright/test'
import type { State } from './server'

const APP = process.env.BROWSER_APP_URL!
const IDP = process.env.BROWSER_IDP_URL!
const EMAIL = 'ada@acme.test'

// The stub remote's cases; the real dashboard's are in dashboard.spec.ts (REMOTE_DIST).
test.skip(!!process.env.REMOTE_DIST, 'REMOTE_DIST: the dashboard contract run')

const state = async (page: Page): Promise<State> => (await page.request.get(`${APP}/__test/state`)).json()

/** securitypolicyviolation events in every document the page loads (an init script runs before CSP applies). */
async function watchViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __violations: string[] }
    w.__violations = []
    document.addEventListener('securitypolicyviolation', (e) => w.__violations.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
}
const violations = (page: Page) => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)

async function signIn(page: Page): Promise<void> {
  await page.goto(`${APP}/`)
  await page.getByRole('textbox', { name: /work email address/i }).fill(EMAIL)
  await page.getByRole('button', { name: /continue with email/i }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard for Ada Lovelace in acme' })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await page.request.get(`${APP}/__test/reset`)
  await watchViolations(page)
})

test.afterEach(async ({ page }) => {
  expect((await state(page)).cspReports, 'CSP reports at /csp-report').toEqual([])
})

test('the login page renders under the production CSP with its self-hosted fonts and hashed images', async ({ page }) => {
  const thirdParty: string[] = []
  page.on('request', (r) => {
    const origin = new URL(r.url()).origin
    if (origin !== APP && origin !== IDP && !r.url().startsWith('data:')) thirdParty.push(r.url())
  })
  await page.goto(`${APP}/`)
  await expect(page.getByRole('textbox', { name: /work email address/i })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.fonts.check('16px "Geist Variable"'))).toBe(true)
  const slide = page.locator('img.object-cover').first()
  await expect(slide).toHaveAttribute('src', /^\/assets\/image1\.[0-9a-f]+\.jpg$/)
  expect(await slide.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  expect(thirdParty).toEqual([])
  expect(await violations(page)).toEqual([])
})

test('signs in through Keycloak (PKCE) and loads the dashboard remote with its integrity, keeping tokens out of storage', async ({ page }) => {
  await signIn(page)
  expect(page.url()).toBe(`${APP}/t/acme/dashboard`)
  await expect(page.getByRole('button', { name: 'Invite' })).toBeVisible() // tenant_owner via the role map
  expect((await state(page)).tokenRequests).toBe(1)
  const stored = await page.evaluate(() =>
    [localStorage, sessionStorage].flatMap((s) => Object.keys(s).map((k) => `${k}=${s.getItem(k)}`)).join('\n'),
  )
  expect(stored).not.toMatch(/at-|eyJ|refresh/)
  expect(await violations(page)).toEqual([])
})

test("a remote's navigate() stays in the single-page app", async ({ page }) => {
  await signIn(page)
  await page.evaluate(() => ((window as unknown as { __samePage: boolean }).__samePage = true))
  await page.getByRole('button', { name: 'Members' }).click()
  await expect(page).toHaveURL(`${APP}/t/acme/dashboard/members`)
  expect(await page.evaluate(() => (window as unknown as { __samePage?: boolean }).__samePage)).toBe(true)
})

test('sign-out POSTs to Keycloak under form-action, ends the SSO session and waits for a click', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'You are signed out' })).toBeVisible()
  const { logouts } = await state(page)
  expect(logouts).toHaveLength(1)
  expect(logouts[0]).toMatchObject({ client_id: 'tender-web', post_logout_redirect_uri: `${APP}/` })
  expect(logouts[0]!.id_token_hint).toBeTruthy()
  expect(page.url()).toBe(`${APP}/`) // Keycloak sent the browser back; no token in any URL
  expect(await violations(page)).toEqual([])

  // Sign in again: credentials are asked for (prompt=login), not a silent pass on a live session.
  const authorize = page.waitForRequest((r) => r.url().startsWith(`${IDP}/realms/tenant-acme/protocol/openid-connect/auth`))
  await page.getByRole('button', { name: 'Sign in' }).click()
  expect(new URL((await authorize).url()).searchParams.get('prompt')).toBe('login')
})

test('a deploy without its runtime config shows the unavailable page and reports it to /otel', async ({ page }) => {
  await page.route('**/config/runtime.json', (r) => r.fulfill({ status: 404, body: 'Not Found' }))
  await page.goto(`${APP}/`)
  await expect(page.getByRole('alert')).toContainText('The app is unavailable right now')
  // The record goes on the next export or the page-hide beacon, whichever is first.
  await page.goto('about:blank')
  await expect
    .poll(async () => (await state(page)).otel.filter((o) => o.path === '/otel/v1/logs').map((o) => o.body).join('\n'), {
      timeout: 15_000,
    })
    .toContain('the app could not start')
})

test.describe('colour contrast (axe, WCAG 2 AA)', () => {
  // axe is injected as a script, which the production CSP (and WebKit's Trusted Types even under
  // bypassCSP) rightly refuses: this one test serves the page without its CSP. The others keep it.
  const axe = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')

  test('the login page has no contrast failures', async ({ page }) => {
    await page.route(`${APP}/`, async (route) => {
      const response = await route.fetch()
      const headers = { ...response.headers() }
      delete headers['content-security-policy']
      await route.fulfill({ response, headers })
    })
    await page.goto(`${APP}/`)
    await expect(page.getByRole('textbox', { name: /work email address/i })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.addScriptTag({ content: axe })
    const result = await page.evaluate(async () => {
      // The "BCBP SOLUTIONS" logotype is exempt (WCAG 1.4.3: text that is part of a logo); all other text is checked.
      const r = await (
        window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: unknown[] }> } }
      ).axe.run({ exclude: [['[data-logotype]']] }, { runOnly: { type: 'rule', values: ['color-contrast'] } })
      return (r.violations as { nodes: { target: string[]; any: { message: string }[] }[] }[]).flatMap((v) =>
        v.nodes.map((n) => `${n.target.join(' ')}: ${n.any[0]?.message ?? ''}`),
      )
    })
    expect(result).toEqual([])
  })
})
