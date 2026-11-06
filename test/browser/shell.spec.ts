// The shell's production build in real engines under the production CSP (test/browser/README.md):
// what happy-dom cannot check. Trusted Types, script-src 'self', integrity on the remote's entry,
// Module Federation's share scope, self-hosted fonts, the sign-out form POST under form-action, the
// start-up failure report, the first-visit welcome intro, the sign-in hero's one-time opening and
// reduced motion, and colour contrast.
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

/** A returning visitor: the first-visit welcome intro is already seen, so / shows the sign-in form. */
async function returningVisitor(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('bcbp.welcomeSeen', '1'))
}

/** A first visit: removes the flag (init scripts run in order, so this undoes returningVisitor). */
async function firstVisit(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.removeItem('bcbp.welcomeSeen'))
}

test.beforeEach(async ({ page }) => {
  await page.request.get(`${APP}/__test/reset`)
  await watchViolations(page)
  await returningVisitor(page)
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

/** Every CSS animation and transition in the page, with its play state (the hero's opening is the only one on /). */
const animations = (page: Page) =>
  page.evaluate(() =>
    document.getAnimations().map((a) => `${(a as Partial<CSSAnimation>).animationName ?? 'transition'}:${a.playState}`),
  )

test('the sign-in hero opens in about 2.4 s and is then still; the form takes input from the first frame', async ({ page }) => {
  await page.goto(`${APP}/`)
  // Hold the opening mid-frame (bars, grain and hidden copy on screen): the email field already takes input.
  const held = await page.evaluate(() => {
    const opening = document.getAnimations().filter((a) => (a as Partial<CSSAnimation>).animationName?.startsWith('cine-'))
    const unfinished = opening.filter((a) => a.playState !== 'finished').length
    opening.forEach((a) => a.pause())
    return unfinished
  })
  expect(held).toBeGreaterThan(0)
  const email = page.getByRole('textbox', { name: /work email address/i })
  await email.fill(EMAIL)
  await expect(email).toHaveValue(EMAIL)
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
  // Every animation of the opening ends by 2.5 s (its own timing, not the wall clock); then nothing runs.
  const ends = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => (a as Partial<CSSAnimation>).animationName?.startsWith('cine-'))
      .map((a) => Number(a.effect?.getComputedTiming().endTime)),
  )
  expect(ends.length).toBeGreaterThan(0)
  expect(Math.max(...ends)).toBeLessThanOrEqual(2500)
  await expect.poll(() => animations(page), { timeout: 10_000 }).not.toContainEqual(expect.stringMatching(/:running$/))
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('opacity', '1')
  await expect(page.locator('.cine-bar').first()).toHaveCSS('transform', /matrix\(1, 0, 0, 0,/)
  expect(await violations(page)).toEqual([])
})

test('under prefers-reduced-motion the sign-in hero shows its final frame with no animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${APP}/`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('opacity', '1')
  expect(await animations(page)).toEqual([])
  await expect(page.locator('.cine-bar').first()).toBeHidden()
  await expect(page.getByText(/Access your unified workspace/)).toHaveCSS('opacity', '1')
})

test('a first visit shows the welcome intro under the production CSP: dust on the canvas, facts counted, Pause, then Continue to the form', async ({ page }) => {
  await firstVisit(page)
  await page.goto(`${APP}/`)
  await expect(page.getByRole('heading', { level: 1, name: 'Construction tenders, from first bid to handover.' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: /work email address/i })).toHaveCount(0)
  // The facts count up once the card has landed (2.0 s + 1.2 s).
  const forecasting = page.locator('dd', { has: page.locator('.sr-only', { hasText: '95%' }) }).locator('[aria-hidden]')
  await expect(forecasting).toHaveText('95%', { timeout: 6000 })
  // The dust draws on the canvas (same origin, so its pixels are readable).
  await expect
    .poll(() =>
      page.locator('canvas').evaluate((c: HTMLCanvasElement) => {
        const px = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
        for (let i = 3; i < px.length; i += 4) if (px[i]! > 0) return true
        return false
      }),
    )
    .toBe(true)
  // The call to action's glow runs; Pause holds it (and the dust), nothing else.
  await expect.poll(() => animations(page)).toContainEqual('cta-glow:running')
  await page.getByRole('button', { name: 'Pause animation' }).click()
  await expect.poll(() => animations(page)).toContainEqual('cta-glow:paused')
  await page.getByRole('button', { name: 'Continue to sign in' }).click()
  // The form replaces the intro and takes focus.
  await expect(page.getByRole('textbox', { name: /work email address/i })).toBeFocused()
  expect(await page.evaluate(() => localStorage.getItem('bcbp.welcomeSeen'))).toBe('1')
  expect(await violations(page)).toEqual([])
})

test('Pause early in the welcome intro still lets its content arrive: nothing stays hidden', async ({ page }) => {
  await firstVisit(page)
  await page.goto(`${APP}/`)
  await page.getByRole('button', { name: 'Pause animation' }).click()
  for (const element of [
    page.getByRole('heading', { level: 1 }),
    page.getByRole('region', { name: 'What the platform covers' }),
    page.getByRole('button', { name: 'Continue to sign in' }),
  ]) {
    await expect(element).toHaveCSS('opacity', '1', { timeout: 5000 })
  }
})

test('under prefers-reduced-motion the welcome intro shows its final frame: no canvas, no animation, facts in full', async ({ page }) => {
  await firstVisit(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`${APP}/`)
  await expect(page.getByRole('heading', { level: 1, name: 'Construction tenders, from first bid to handover.' })).toHaveCSS('opacity', '1')
  await expect(page.locator('canvas')).toHaveCount(0)
  expect(await animations(page)).toEqual([])
  await expect(page.locator('dd [aria-hidden]').first()).toHaveText('95%')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('textbox', { name: /work email address/i })).toBeVisible()
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
    // Check the hero's resting frame, not a frame of its opening.
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
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

  test('the first-visit welcome intro has no contrast failures', async ({ page }) => {
    await firstVisit(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route(`${APP}/`, async (route) => {
      const response = await route.fetch()
      const headers = { ...response.headers() }
      delete headers['content-security-policy']
      await route.fulfill({ response, headers })
    })
    await page.goto(`${APP}/`)
    await expect(page.getByRole('button', { name: 'Continue to sign in' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.addScriptTag({ content: axe })
    const result = await page.evaluate(async () => {
      const r = await (
        window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: unknown[] }> } }
      ).axe.run({ exclude: [['[data-logotype]']] }, { runOnly: { type: 'rule', values: ['color-contrast'] } })
      return (r.violations as { nodes: { target: string[]; any: { message: string }[] }[] }[]).flatMap((v) =>
        v.nodes.map((n) => `${n.target.join(' ')}: ${n.any[0]?.message ?? ''}`),
      )
    })
    expect(result).toEqual([])
    // axe leaves the call to action incomplete (daisyUI's .btn has a background image): its text and
    // fill are measured here, each colour painted on a canvas and read back as sRGB.
    const cta = await page.getByRole('button', { name: 'Continue to sign in' }).evaluate((el) => {
      const s = getComputedStyle(el)
      const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
      const rgb = (color: string) => {
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = color
        ctx.fillRect(0, 0, 1, 1)
        return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)]
      }
      const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
      const lum = ([r, g, b]: number[]) => 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!)
      const [a, b] = [lum(rgb(s.color)), lum(rgb(s.backgroundColor))]
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    })
    expect(cta).toBeGreaterThanOrEqual(4.5)
  })

  // axe leaves text over a photograph "incomplete", so the hero is measured from pixels: on each of
  // the 9 slides at rest, the text is made transparent, its box is captured, and the 98th-percentile
  // brightest background pixel is held against the text colour (WCAG 2 AA: 3:1 large, 4.5:1 normal).
  test('the sign-in hero text keeps AA contrast over every photograph', async ({ page }) => {
    test.setTimeout(90_000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route(`${APP}/`, async (route) => {
      const response = await route.fetch()
      const headers = { ...response.headers() }
      delete headers['content-security-policy']
      await route.fulfill({ response, headers })
    })
    await page.goto(`${APP}/`)
    await page.evaluate(() => document.fonts.ready)
    const targets = [
      { name: 'headline', locator: page.getByRole('heading', { level: 1 }), fg: [255, 255, 255, 1], min: 3 },
      { name: 'subline', locator: page.locator('[aria-live] p'), fg: [255, 255, 255, 0.8], min: 4.5 },
      { name: 'facts', locator: page.locator('section li'), fg: [255, 255, 255, 1], min: 4.5 },
    ] as const
    const failures: string[] = []
    for (let n = 1; n <= 9; n++) {
      if (n > 1) await page.getByRole('button', { name: `Show slide ${n}` }).click()
      // At rest: the slide's photograph decoded and on top, no animation or transition running.
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              [...document.querySelectorAll<HTMLImageElement>('section img.opacity-100')].some(
                (img) => img.complete && img.naturalWidth > 0,
              ) && document.getAnimations().every((a) => a.playState !== 'running'),
          ),
        )
        .toBe(true)
      await page.waitForTimeout(1000)
      for (const t of targets) {
        for (const element of await t.locator.all()) {
          await element.evaluate((el: HTMLElement) => el.style.setProperty('color', 'transparent', 'important'))
          const png = (await element.screenshot({ animations: 'disabled' })).toString('base64')
          await element.evaluate((el: HTMLElement) => el.style.removeProperty('color'))
          const ratio = await page.evaluate(
            async ({ png, fg }) => {
              const img = new Image()
              img.src = `data:image/png;base64,${png}`
              await img.decode()
              const canvas = document.createElement('canvas')
              canvas.width = img.naturalWidth
              canvas.height = img.naturalHeight
              const ctx = canvas.getContext('2d')!
              ctx.drawImage(img, 0, 0)
              const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data
              const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
              const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
              const ratios: number[] = []
              for (let i = 0; i < px.length; i += 4) {
                const [r, g, b] = [px[i]!, px[i + 1]!, px[i + 2]!]
                const a = fg[3]!
                const text = lum(fg[0]! * a + r * (1 - a), fg[1]! * a + g * (1 - a), fg[2]! * a + b * (1 - a))
                const ground = lum(r, g, b)
                ratios.push((Math.max(text, ground) + 0.05) / (Math.min(text, ground) + 0.05))
              }
              ratios.sort((x, y) => x - y)
              return ratios[Math.floor(ratios.length * 0.02)]!
            },
            { png, fg: [...t.fg] },
          )
          if (ratio < t.min) failures.push(`slide ${n} ${t.name}: ${ratio.toFixed(2)} < ${t.min}`)
        }
      }
    }
    expect(failures).toEqual([])
  })
})
