// @vitest-environment node
// config/dev-platform.mjs: the dev server's stand-in for CloudFront and the IAM ports. Its PUB-1 and
// P-35 answers must map through the shell's own iam.ts, or local sign-in breaks.
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { devPlatformMiddleware } from '../../config/dev-platform.mjs'
import { toSessionContext, toWorkspace, type ResolveResponse, type SessionContextResponse } from '../../src/platform/iam'

const ROOT = join(import.meta.dirname, '../..')
let server: Server
let base: string
let nextCalls: number

async function start(): Promise<void> {
  const mw = devPlatformMiddleware(ROOT)
  server = createServer((req, res) =>
    mw(req, res, () => {
      nextCalls++
      res.statusCode = 299
      res.end('next')
    }),
  )
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

interface Reply {
  status: number
  headers: Record<string, string | string[] | undefined>
  text: string
  json(): unknown
}

/** node:http, so a reply's headers and status are read exactly as sent. */
function get(path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = request(new URL(path, base), { method: init.method ?? 'GET', headers: init.headers, agent: false }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (c: string) => (text += c))
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, text, json: () => JSON.parse(text) }))
    })
    req.on('error', reject)
    req.end(init.body)
  })
}

beforeEach(async () => {
  nextCalls = 0
  vi.unstubAllEnvs()
  vi.stubEnv('DEV_API_URL', '')
})
afterEach(async () => {
  server?.closeAllConnections()
  await new Promise((r) => server?.close(r))
  vi.unstubAllEnvs()
})

describe('dev platform middleware', () => {
  it('serves the local runtime config and remote manifest uncached', async () => {
    await start()
    for (const [path, file] of [
      ['/config/runtime.json', 'runtime.local.json'],
      ['/remotes/manifest.json', 'remotes.local.json'],
    ] as const) {
      const r = await get(path)
      expect(r.status).toBe(200)
      expect(r.headers['cache-control']).toBe('no-cache')
      expect(r.json()).toEqual((await import(join(ROOT, 'config', file), { with: { type: 'json' } })).default)
    }
  })

  it('accepts and drops telemetry', async () => {
    await start()
    const r = await get('/otel/v1/traces', { method: 'POST', body: '{}' })
    expect(r.status).toBe(204)
  })

  it('resolves any identifier to the local realm, which iam.ts maps to a paid workspace', async () => {
    await start()
    const r = await get('/api/v1/public/tenants/resolve?identifier=ada%40bcbp.com')
    const body = r.json() as ResolveResponse
    expect(body).toEqual({ found: true, realm: 'tenant-bcbp', strategy: 'dedicated' })
    expect(toWorkspace('bcbp', body)).toEqual({ realm: 'tenant-bcbp', trial: false, slug: 'bcbp' })

    const empty = await get('/api/v1/public/tenants/resolve?identifier=%20')
    expect(empty.json()).toEqual({ found: false })
  })

  it('honours DEV_REALM and DEV_ROLES', async () => {
    vi.stubEnv('DEV_REALM', 'tenant-acme')
    vi.stubEnv('DEV_ROLES', 'member')
    await start()
    const resolve = (await get('/api/v1/public/tenants/resolve?identifier=x')).json() as ResolveResponse
    expect(resolve.realm).toBe('tenant-acme')
    const ctx = (await get('/api/v1/me/session-context', { headers: { authorization: 'Bearer t' } })).json() as SessionContextResponse
    expect(ctx).toMatchObject({ slug: 'acme', roles: ['member'] })
  })

  it('answers the session context only with a bearer token, as the signup owner by default', async () => {
    await start()
    const anon = await get('/api/v1/me/session-context')
    expect(anon.status).toBe(401)
    expect(anon.headers['content-type']).toBe('application/problem+json')

    const r = await get('/api/v1/me/session-context', { headers: { authorization: 'Bearer token' } })
    const ctx = toSessionContext(r.json() as SessionContextResponse)
    expect(ctx).toMatchObject({ tenantId: 'local-tenant', slug: 'bcbp', roles: ['member', 'tenant_owner'], readOnly: false })
  })

  it('answers other API paths 404 and passes non-API paths on', async () => {
    await start()
    expect((await get('/api/v1/tenders')).status).toBe(404)
    const page = await get('/t/bcbp/dashboard')
    expect(page.status).toBe(299)
    expect(nextCalls).toBe(1)
  })

  it('proxies /api to DEV_API_URL, body and headers included, and reports an unreachable upstream as 502', async () => {
    const seen: { method?: string; url?: string; auth?: string; body?: string } = {}
    const upstream = createServer((req, res) => {
      let body = ''
      req.on('data', (c: Buffer) => (body += c))
      req.on('end', () => {
        Object.assign(seen, { method: req.method, url: req.url, auth: req.headers.authorization, body })
        res.setHeader('x-upstream', 'yes')
        res.statusCode = 201
        res.end('{"ok":true}')
      })
    })
    await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r))
    vi.stubEnv('DEV_API_URL', `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`)
    await start()

    const r = await get('/api/v1/tenders?x=1', { method: 'POST', headers: { authorization: 'Bearer t' }, body: '{"a":1}' })
    expect(r.status).toBe(201)
    expect(r.headers['x-upstream']).toBe('yes')
    expect(seen).toEqual({ method: 'POST', url: '/api/v1/tenders?x=1', auth: 'Bearer t', body: '{"a":1}' })

    upstream.closeAllConnections()
    await new Promise((res) => upstream.close(res))
    const down = await get('/api/v1/tenders')
    expect(down.status).toBe(502)
    expect(down.headers['content-type']).toBe('application/problem+json')
  })
})
