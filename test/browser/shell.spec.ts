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
const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Workspace and sections' })

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
  await page.getByRole('textbox', { name: /work email or workspace name/i }).fill(EMAIL)
  await page.getByRole('button', { name: /^continue$/i }).click()
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
  await expect(page.getByRole('textbox', { name: /work email or workspace name/i })).toBeVisible()
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

test("a reload checks the saved paid realm's discovery document under the production CSP, then restores silently", async ({ page }) => {
  await signIn(page)
  expect((await state(page)).discoveries).toEqual([])
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Dashboard for Ada Lovelace in acme' })).toBeVisible()
  // SDK alpha.9: the realm still exists, so no PUB-1 re-check; connect-src allows the IdP origin.
  expect((await state(page)).discoveries).toEqual(['tenant-acme'])
  expect(await violations(page)).toEqual([])
})

test("a remote's navigate() stays in the single-page app, and the mounted remote follows it", async ({ page }) => {
  await signIn(page)
  await expect(page.getByText('Mounted at /t/acme/dashboard')).toBeVisible()
  await page.evaluate(() => ((window as unknown as { __samePage: boolean }).__samePage = true))
  await page.getByRole('button', { name: 'Members' }).click()
  await expect(page).toHaveURL(`${APP}/t/acme/dashboard/members`)
  // The dashboard is already mounted and its router does not see the shell's navigation: the shell mounts it
  // again at the new path (handoff §3.3), still without a page load.
  await expect(page.getByText('Mounted at /t/acme/dashboard/members')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __samePage?: boolean }).__samePage)).toBe(true)
  expect(await violations(page)).toEqual([])
})

test('sign-out POSTs to Keycloak under form-action, ends the SSO session and waits for a click', async ({ page }) => {
  await signIn(page)
  // The remote's own Sign out (in the page), not the sidebar's.
  await page.getByRole('main').getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'You are signed out' })).toBeVisible()
  // The dialog shows as soon as the SDK reports the sign-out, before the form POST reaches
  // Keycloak and the browser comes back: wait for the POST, not for the dialog.
  await expect.poll(async () => (await state(page)).logouts.length).toBe(1)
  const { logouts } = await state(page)
  expect(logouts[0]).toMatchObject({ client_id: 'tender-web', post_logout_redirect_uri: `${APP}/` })
  expect(logouts[0]!.id_token_hint).toBeTruthy()
  // Keycloak sends the browser back to the app root (no token in any URL); that page load shows
  // the dialog again, and that is the one to click.
  await expect(page).toHaveURL(`${APP}/`)
  await expect(page.getByRole('heading', { name: 'You are signed out' })).toBeVisible()
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
  // The user stays on the unavailable page: the record goes with the SDK's next export (every 5 s).
  // Not by leaving the page: WebKit sometimes drops the page-hide beacon (the SDK's engine notes),
  // which made this case fail about once in 90 runs; delivery on unload is the SDK's to test.
  await expect
    .poll(async () => (await state(page)).otel.filter((o) => o.path === '/otel/v1/logs').map((o) => o.body).join('\n'), {
      timeout: 15_000,
    })
    .toContain('the app could not start')
})

/**
 * WCAG 2 contrast ratio of an element's text on its background (or on `background`'s, for text on a
 * transparent element), read in the page (a canvas turns any CSS colour, oklch included, into sRGB).
 */
async function contrastRatio(page: Page, selector: string, background?: string): Promise<number> {
  const [fg, bg] = await page.locator(selector).first().evaluate((el, background) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const rgb = (c: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
    }
    const back = background ? el.closest(background)! : el
    return [rgb(getComputedStyle(el).color), rgb(getComputedStyle(back).backgroundColor)]
  }, background)
  const luminance = (c: number[]) =>
    c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((l, v, i) => l + v * [0.2126, 0.7152, 0.0722][i]!, 0)
  const [hi, lo] = [luminance(fg!), luminance(bg!)].sort((a, b) => b - a)
  return (hi! + 0.05) / (lo! + 0.05)
}

test('the workspace banner (IAM P-1) shows under the production CSP with AA contrast', async ({ page }) => {
  await page.route('**/api/v1/tenants/*', (route) =>
    route.request().url().endsWith('/seat-usage')
      ? route.fallback()
      : route.fulfill({ json: { name: 'Acme', status: 'trial', trial_ends_at: new Date(Date.now() + 3 * 86_400_000 + 60_000).toISOString() } }),
  )
  await signIn(page)
  const banner = page.getByRole('status')
  await expect(banner).toHaveText('3 days left in your trial')
  expect(await contrastRatio(page, '[role="status"]')).toBeGreaterThanOrEqual(4.5)
  expect(await violations(page)).toEqual([])
  // The stack sits at the bottom of the window, and scrolled to the end the remote's content ends above
  // it: the banners never cover the remote's last controls.
  await page.setViewportSize({ width: 800, height: 300 })
  const layout = await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight)
    const stack = document.querySelector('[role="status"]')!.parentElement!
    const content = stack.previousElementSibling!
    return {
      contentBottom: content.getBoundingClientRect().bottom,
      stackTop: stack.getBoundingClientRect().top,
      stackBottom: stack.getBoundingClientRect().bottom,
      view: window.innerHeight,
      published: getComputedStyle(document.documentElement).getPropertyValue('--shell-notices-height'),
      height: stack.offsetHeight,
    }
  })
  // The stack's height reaches remotes as a CSS variable, set through the CSSOM under the production CSP.
  expect(layout.published).toBe(`${layout.height}px`)
  expect(layout.height).toBeGreaterThan(0)
  expect(layout.contentBottom).toBeLessThanOrEqual(layout.stackTop + 0.5)
  expect(Math.abs(layout.stackBottom - layout.view)).toBeLessThanOrEqual(0.5)
})

test("the shell's sidebar shows beside the page under the production CSP with AA contrast, and publishes its width", async ({ page }) => {
  await signIn(page)
  const sidebar = page.getByRole('complementary', { name: 'Workspace and sections' })
  await expect(sidebar.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
  expect(await contrastRatio(page, 'aside nav a[aria-current="page"] [data-label]')).toBeGreaterThanOrEqual(4.5)
  // The first button, the workspace switcher: #fafafa on the panel's colour.
  expect(await contrastRatio(page, 'aside button', 'aside')).toBeGreaterThanOrEqual(4.5)
  expect(await violations(page)).toEqual([])
  // Beside the page on a wide screen: full height, the page's content starts after it, and its width reaches
  // remotes as --shell-sidebar-width (CSSOM, allowed by the CSP); no bar at the top (--shell-header-height 0px).
  const layout = await page.evaluate(() => {
    const aside = document.querySelector('aside')!
    const main = document.querySelector('main')!
    const root = getComputedStyle(document.documentElement)
    return {
      width: aside.offsetWidth,
      height: aside.getBoundingClientRect().height,
      view: window.innerHeight,
      mainLeft: main.getBoundingClientRect().left,
      published: root.getPropertyValue('--shell-sidebar-width'),
      bar: root.getPropertyValue('--shell-header-height'),
    }
  })
  expect(layout.width).toBeGreaterThan(200)
  expect(layout.published).toBe(`${layout.width}px`)
  expect(Math.abs(layout.height - layout.view)).toBeLessThanOrEqual(0.5)
  expect(layout.mainLeft).toBeGreaterThanOrEqual(layout.width - 0.5)
  expect(layout.bar).toBe('0px')
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden()
  // Collapsed to the icon rail: narrower, and the published width follows.
  await sidebar.getByRole('button', { name: 'Collapse sidebar' }).click()
  await expect
    .poll(() => page.evaluate(() => [document.querySelector('aside')!.offsetWidth, getComputedStyle(document.documentElement).getPropertyValue('--shell-sidebar-width')]))
    .toEqual([64, '64px'])
  await expect(sidebar.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('title', 'Dashboard')
  // The choice is saved (SDK storage, this workspace): a reload starts collapsed.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Dashboard for Ada Lovelace in acme' })).toBeVisible()
  await expect(sidebar.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
  expect(await page.evaluate(() => document.querySelector('aside')!.offsetWidth)).toBe(64)
  expect(await violations(page)).toEqual([])
})

test("on a phone the sidebar is a drawer: the bar opens it, a link closes it, and the sizes follow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await signIn(page)
  const sidebar = page.getByRole('complementary', { name: 'Workspace and sections' })
  await expect(sidebar).toBeHidden()
  const sizes = () =>
    page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      return { bar: root.getPropertyValue('--shell-header-height'), width: root.getPropertyValue('--shell-sidebar-width') }
    })
  const closed = await sizes()
  expect(closed.width).toBe('0px')
  expect(parseFloat(closed.bar)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(sidebar).toBeVisible()
  expect(await contrastRatio(page, 'aside button', 'aside')).toBeGreaterThanOrEqual(4.5)
  // Modal: focus moved into it, and Tab past its last control stays out of the inert page behind it.
  await expect(sidebar.getByRole('button', { name: /^Switch workspace:/ })).toBeFocused()
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab')
  expect(await page.evaluate(() => !!document.activeElement?.closest('main'))).toBe(false)
  // Close menu stays in view above it, and a real click on it closes it.
  await page.getByRole('button', { name: 'Close menu' }).click()
  await expect(sidebar).toBeHidden()
  // Escape from inside the drawer closes it and puts focus back on the menu button (WebKit's Tab skips links,
  // so focus is put in the drawer directly).
  await page.getByRole('button', { name: 'Open menu' }).click()
  await sidebar.getByRole('link', { name: 'Dashboard' }).focus()
  await page.keyboard.press('Escape')
  await expect(sidebar).toBeHidden()
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused()
  await page.getByRole('button', { name: 'Open menu' }).click()
  await sidebar.getByRole('link', { name: 'Dashboard' }).click()
  await expect(sidebar).toBeHidden()
  expect(await violations(page)).toEqual([])
})

test('the new-version notice heads the page beside the sidebar, and under the bar on a phone, with Reload clickable', async ({ page }) => {
  // A short poll and a newer /version.json than the build's.
  await page.route('**/config/runtime.json', async (route) => {
    const response = await route.fetch()
    const json = await response.json()
    await route.fulfill({ response, json: { ...json, appUpdate: { ...json.appUpdate, pollIntervalMs: 10_000 } } })
  })
  await page.route('**/version.json', (route) => route.fulfill({ json: { version: 'newer' } }))
  await signIn(page)
  const notice = page.getByRole('status').filter({ hasText: 'A new version is available.' })
  await expect(notice).toBeVisible({ timeout: 25_000 })
  const at = (sel: string) => page.locator(sel).first().evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect)
  // Wide: it starts after the sidebar, which stays uncovered.
  expect((await at('[role="status"]')).left).toBeGreaterThanOrEqual((await at('aside')).width - 0.5)
  await sidebar(page).getByRole('button', { name: /^Switch workspace:/ }).click()
  await expect(sidebar(page).getByLabel('Work email or workspace name')).toBeVisible()
  // Phone: under the bar, and Reload takes a real click.
  await page.setViewportSize({ width: 390, height: 780 })
  await page.keyboard.press('Escape')
  const bar = await page.getByRole('button', { name: 'Open menu' }).evaluate((el) => el.parentElement!.getBoundingClientRect().bottom)
  expect((await at('[role="status"]')).top).toBeGreaterThanOrEqual(bar - 0.5)
  const reloaded = page.waitForEvent('framenavigated')
  await notice.getByRole('button', { name: 'Reload' }).click()
  await reloaded
  expect(await violations(page)).toEqual([])
})

// A clicked button is not focused in WebKit: Switch workspace must work with a real mouse click in every engine.
test("the sidebar's Switch workspace works with a mouse click", async ({ page }) => {
  await signIn(page)
  const sidebar = page.getByRole('complementary', { name: 'Workspace and sections' })
  await sidebar.getByRole('button', { name: /^Switch workspace:/ }).click()
  await sidebar.getByLabel('Work email or workspace name').fill(EMAIL)
  const authorize = page.waitForRequest((r) => r.url().startsWith(`${IDP}/realms/tenant-acme/protocol/openid-connect/auth`))
  // The click lands: PUB-1 resolves the name and the browser leaves for that workspace's sign-in.
  await sidebar.getByRole('button', { name: 'Continue' }).click()
  await authorize
})

test("the sidebar's Sign out works with a mouse click", async ({ page }) => {
  await signIn(page)
  await page.getByRole('complementary', { name: 'Workspace and sections' }).getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'You are signed out' })).toBeVisible()
  await expect.poll(async () => (await state(page)).logouts.length).toBe(1)
})

test('the read-only notice shows under the production CSP with AA contrast', async ({ page }) => {
  await page.route('**/api/v1/me/session-context', async (route) => {
    const response = await route.fetch()
    if (!response.ok()) return route.fulfill({ response })
    return route.fulfill({ response, json: { ...(await response.json()), read_only: true } })
  })
  await signIn(page)
  const notice = page.getByRole('status')
  await expect(notice).toHaveText('Workspace is read-only (subscription ended)')
  // axe cannot be injected into the signed-in page (it keeps its CSP), so the ratio is measured here.
  expect(await contrastRatio(page, '[role="status"]')).toBeGreaterThanOrEqual(4.5)
  expect(await violations(page)).toEqual([])
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
    await expect(page.getByRole('textbox', { name: /work email or workspace name/i })).toBeVisible()
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
