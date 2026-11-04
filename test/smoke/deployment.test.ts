// Smoke tests of the served shell, as platform-reactcommon test/smoke/deployment.test.ts does for the
// web distribution: the document, the SPA rule, the runtime files validated by the SDK, the hashed
// assets and their integrity. GET only, against SMOKE_BASE_URL (test/smoke/README.md):
// - image: the nginx image on its own (.github/scripts/smoke-tests.sh). nginx's exact behaviour is
//   checked: 404 for missing API, config, remote and asset paths, Cache-Control per location, no maps.
// - live: a deployment behind CloudFront. The platform's security headers are checked too; the
//   gateway answers /api, so only "never index.html" is asserted there.
import { createHash } from 'node:crypto'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { RuntimeConfigError, setRuntimeConfig, tryGetConfig } from '@bcbp-solutions-fzc-llc/frontend-sdk/config'
import { initializeCore } from '@bcbp-solutions-fzc-llc/frontend-sdk/core'
import { loadManifest } from '@bcbp-solutions-fzc-llc/frontend-sdk/mfe'
import { smokeenv } from './env'

const { baseUrl, mode, environment } = smokeenv
const image = mode === 'image'

interface Fetched {
  url: string
  status: number
  headers: Headers
  body: Buffer
  text: string
}

/** GET `path` (resolved against `from`, default the base URL); never follows redirects. */
async function get(path: string, from: string = baseUrl): Promise<Fetched> {
  const url = new URL(path, from).href
  let res: Response
  try {
    res = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(20_000) })
  } catch (cause) {
    throw new Error(`GET ${url} failed: ${String((cause as Error)?.cause ?? cause)}`, { cause })
  }
  const body = Buffer.from(await res.arrayBuffer())
  return { url, status: res.status, headers: res.headers, body, text: body.toString('utf8') }
}

const where = (r: Fetched, what = '') => `GET ${r.url}${what ? `: ${what}` : ''}`
const contentType = (r: Fetched) => r.headers.get('content-type') ?? ''
const cacheControl = (r: Fetched) => r.headers.get('cache-control') ?? ''
const JS = /^(text|application)\/(javascript|ecmascript|x-javascript)\b/i
const JSON_TYPE = /^application\/([a-z.+-]*\+)?json\b/i
const HTML = /^text\/html\b/i
const APP_ROOT = /<div id=["']?app\b/

function json(r: Fetched): unknown {
  try {
    return JSON.parse(r.text) as unknown
  } catch {
    throw new Error(`${where(r)} is not JSON: ${r.text.slice(0, 200)}`)
  }
}

function expectNoCache(r: Fetched): void {
  expect(cacheControl(r), where(r, 'Cache-Control')).toMatch(/\bno-(cache|store)\b/)
}

/** The <script> tags of the document; fails on an inline one (CSP script-src 'self'). */
function scripts(r: Fetched): { src: string; integrity: string | undefined }[] {
  const out: { src: string; integrity: string | undefined }[] = []
  for (const [, attrs = '', body = ''] of r.text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    expect(body.trim(), where(r, `inline script <script${attrs}>`)).toBe('')
    const attr = (name: string) =>
      new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)?.slice(1).find(Boolean)
    const src = attr('src')
    expect(src, where(r, `<script${attrs}> has no src`)).toBeDefined()
    out.push({ src: src!, integrity: attr('integrity') })
  }
  return out
}

/** CSP directive → values. */
function directives(csp: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const part of csp.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/)
    if (name) out.set(name.toLowerCase(), values)
  }
  return out
}

/** /config/runtime.json validated by the SDK (schema and environment rules) and set as the page config. */
async function ensureConfig(): Promise<void> {
  if (tryGetConfig()) return
  initializeCore({ serviceName: 'web-shell-smoke', domain: 'portal', environment })
  const r = await get('/config/runtime.json')
  expect(r.status, where(r)).toBe(200)
  try {
    setRuntimeConfig(json(r) as Parameters<typeof setRuntimeConfig>[0])
  } catch (e) {
    if (e instanceof RuntimeConfigError) throw new Error(`${where(r)} fails the SDK's validation: ${e.message}`, { cause: e })
    throw e
  }
}

beforeAll(async () => {
  const r = await get('/').catch((e: unknown) => {
    throw new Error(`smoke: nothing answers at ${baseUrl} (${String(e)}). See test/smoke/README.md.`)
  })
  expect(r.status, where(r)).toBe(200)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe(`web-shell smoke (${mode}, ${baseUrl})`, () => {
  describe('the shell document', () => {
    it('GET / is index.html: the app root, uncached, every script external with its integrity', async () => {
      const r = await get('/')
      expect(r.status, where(r)).toBe(200)
      expect(contentType(r), where(r, 'Content-Type')).toMatch(HTML)
      expect(r.text, where(r)).toMatch(APP_ROOT)
      expectNoCache(r)
      const tags = scripts(r)
      expect(tags.length, where(r, 'external scripts')).toBeGreaterThan(0)
      for (const t of tags) expect(t.integrity, where(r, `<script src=${t.src}> integrity`)).toMatch(/^sha384-/)
      expect(r.text, where(r, 'inline event handler attribute')).not.toMatch(/<[^>]+\son[a-z]+\s*=/i)
    })

    it.each(['/t/acme/dashboard', '/t/acme/dashboard/members', '/auth/callback?code=x&state=y'])(
      'the deep link %s is index.html, uncached (SPA rule)',
      async (path) => {
        const [index, r] = [await get('/'), await get(path)]
        expect(r.status, where(r)).toBe(200)
        expect(contentType(r), where(r, 'Content-Type')).toMatch(HTML)
        expect(r.text, where(r, 'body equals GET /')).toBe(index.text)
        expectNoCache(r)
      },
    )

    it("each script loads same-origin, as JavaScript, immutable, and matches its integrity", async () => {
      const doc = await get('/')
      for (const { src, integrity } of scripts(doc)) {
        const r = await get(src, doc.url)
        expect(new URL(r.url).origin, where(r, 'same origin')).toBe(new URL(baseUrl).origin)
        expect(r.status, where(r)).toBe(200)
        expect(contentType(r), where(r, 'Content-Type')).toMatch(JS)
        expect(cacheControl(r), where(r, 'Cache-Control')).toMatch(/\bimmutable\b/)
        const [alg, expected] = [integrity!.slice(0, 6), integrity!.slice(7)]
        expect(createHash(alg).update(r.body).digest('base64'), where(r, `integrity ${integrity}`)).toBe(expected)
        // Hidden source maps are deleted from the image.
        const map = await get(`${src}.map`, doc.url)
        expect(map.status, where(map)).toBeGreaterThanOrEqual(400)
      }
    })

    it.each(['/missing.0123456789abcdef.js', '/assets/missing.0123456789abcdef.js', '/image/missing.png'])(
      'a missing file (%s) is an error, not index.html',
      async (path) => {
        const r = await get(path)
        expect(r.status, where(r)).toBeGreaterThanOrEqual(400)
        expect(r.text, where(r)).not.toMatch(APP_ROOT)
        if (image) expect(r.status, where(r)).toBe(404)
      },
    )
  })

  describe('/api/*', () => {
    it('an unknown API path is never the SPA index.html', async () => {
      const r = await get('/api/does-not-exist')
      expect(r.status, where(r)).toBeGreaterThanOrEqual(400)
      expect(r.text, where(r)).not.toMatch(APP_ROOT)
      if (image) expect(r.status, where(r)).toBe(404)
    })

    it.skipIf(!image).each(['/otel/v1/traces', '/csp-report', '/config/missing.json', '/remotes/missing/remoteEntry.js'])(
      'the image never answers %s with index.html',
      async (path) => {
        const r = await get(path)
        expect(r.status, where(r)).toBe(404)
        expect(r.text, where(r)).not.toMatch(APP_ROOT)
      },
    )
  })

  describe('/config/runtime.json', () => {
    it('is served uncached and passes the SDK runtime-config validation', async () => {
      const r = await get('/config/runtime.json')
      expect(r.status, where(r)).toBe(200)
      expect(contentType(r), where(r, 'Content-Type')).toMatch(JSON_TYPE)
      expectNoCache(r)
      await ensureConfig()
      expect(tryGetConfig()?.auth.clientId, where(r, 'auth.clientId')).toBeTruthy()
    })
  })

  describe('/version.json', () => {
    it('is uncached and names the shell version', async () => {
      const r = await get('/version.json')
      expect(r.status, where(r)).toBe(200)
      expect(contentType(r), where(r, 'Content-Type')).toMatch(JSON_TYPE)
      expectNoCache(r)
      const v = json(r) as { version?: unknown }
      expect(typeof v.version === 'string' && v.version.length > 0, `${where(r)}: { "version": "…" }`).toBe(true)
    })
  })

  describe('/remotes/manifest.json', () => {
    it('is uncached, every entry passes loadManifest, and each remoteEntry.js loads with its integrity', async () => {
      const r = await get('/remotes/manifest.json')
      expect(r.status, where(r)).toBe(200)
      expect(contentType(r), where(r, 'Content-Type')).toMatch(JSON_TYPE)
      expectNoCache(r)
      const raw = json(r)
      expect(typeof raw === 'object' && raw !== null && !Array.isArray(raw), `${where(r)} is a JSON object`).toBe(true)

      // loadManifest checks entries against the page's origin and remotes.allowedOrigins.
      await ensureConfig()
      const page = new URL('/', baseUrl)
      vi.stubGlobal('location', { href: page.href, origin: page.origin })
      const manifest = await loadManifest(r.url)
      const dropped = Object.keys(raw as object).filter((name) => !(name in manifest))
      expect(dropped, `${where(r)}: remotes loadManifest drops`).toEqual([])

      for (const [name, e] of Object.entries(manifest)) {
        const entry = await get(e.entry, page.href)
        expect(entry.status, `${name}: ${where(entry)}`).toBe(200)
        expect(contentType(entry), `${name}: ${where(entry, 'Content-Type')}`).toMatch(JS)
        if (e.integrity) {
          const [alg, expected] = [e.integrity.slice(0, 6), e.integrity.slice(7)]
          expect(createHash(alg).update(entry.body).digest('base64'), `${name}: integrity ${e.integrity}`).toBe(expected)
        }
      }
    })
  })

  describe('the image', () => {
    it.skipIf(!image)('answers /healthz with ok', async () => {
      const r = await get('/healthz')
      expect(r.status, where(r)).toBe(200)
      expect(r.text.trim(), where(r)).toBe('ok')
    })

    it.skipIf(!image)('serves unhashed public files uncached', async () => {
      for (const path of ['/favicon.png', '/index.html']) {
        const r = await get(path)
        expect(r.status, where(r)).toBe(200)
        expectNoCache(r)
      }
    })
  })

  describe('a deployment', () => {
    it.skipIf(image).each(['/', '/t/acme/dashboard', '/config/runtime.json'])(
      'GET %s carries the platform security headers',
      async (path) => {
        const r = await get(path)
        const h = (n: string) => r.headers.get(n)
        const csp = h('content-security-policy')
        expect(csp, where(r, 'Content-Security-Policy (enforced)')).toBeTruthy()
        const d = directives(csp!)
        const script = d.get('script-src') ?? d.get('default-src')
        expect(script, where(r, 'CSP script-src')).not.toContain("'unsafe-inline'")
        expect(script, where(r, 'CSP script-src')).not.toContain("'unsafe-eval'")
        expect(d.get('require-trusted-types-for'), where(r, 'CSP require-trusted-types-for')).toEqual(["'script'"])
        expect(d.get('frame-ancestors'), where(r, 'CSP frame-ancestors')).toEqual(["'none'"])
        expect(Number(/max-age=(\d+)/i.exec(h('strict-transport-security') ?? '')?.[1] ?? 0), where(r, 'HSTS')).toBeGreaterThanOrEqual(
          31_536_000,
        )
        expect(h('x-content-type-options'), where(r, 'X-Content-Type-Options')).toBe('nosniff')
      },
    )
  })
})
