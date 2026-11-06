// The shell's PUB-1 and P-35 ports against the SDK's own contract cases (shipped in
// @bcbp-solutions-fzc-llc/frontend-sdk/contracts and checked there against IAM's swagger), through
// the real ApiClient, as platform-reactcommon's examples/shell/test/iam.test.ts does.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestPlatform, mockApi, mockProblem } from '@bcbp-solutions-fzc-llc/frontend-sdk/testing'
import { PlatformProblemTypes } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { loadSessionContextOnce, sessionContextSource, toSessionContext, toWorkspace, workspaceResolver } from '../../src/infrastructure/api/iam'

interface Cases<C> {
  path: string
  cases: C[]
}
const sdkRoot = dirname(createRequire(import.meta.url).resolve('@bcbp-solutions-fzc-llc/frontend-sdk/package.json'))
const contract = <C>(name: string): Cases<C> =>
  JSON.parse(readFileSync(join(sdkRoot, 'contracts', name), 'utf8')) as Cases<C>
const RESOLVE = contract<{ name: string; identifier: string; response: unknown; expected: unknown }>('tenant-resolve-cases.json')
const SESSION = contract<{ name: string; response: unknown; expected: unknown }>('session-context-cases.json')

let platform: ReturnType<typeof createTestPlatform>
beforeEach(() => {
  platform = createTestPlatform()
})
afterEach(() => platform.reset())

describe('workspaceResolver (PUB-1)', () => {
  it('calls the contract path on the API base', () => {
    expect(RESOLVE.path).toBe('/api/v1/public/tenants/resolve')
  })

  it.each(RESOLVE.cases.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
    let seen: Request | undefined
    mockApi({
      'GET /v1/public/tenants/resolve': (req) => {
        seen = req
        return Response.json(c.response)
      },
    })
    expect((await workspaceResolver.resolve(c.identifier)) ?? null).toEqual(c.expected)
    expect(new URL(seen!.url).searchParams.get('identifier')).toBe(c.identifier)
    // A public endpoint: never a token.
    expect(seen!.headers.get('authorization')).toBeNull()
  })

  it('passes the caller abort signal through', async () => {
    mockApi({ 'GET /v1/public/tenants/resolve': () => Response.json({ found: false }) })
    const controller = new AbortController()
    await expect(workspaceResolver.resolve('acme', controller.signal)).resolves.toBeUndefined()
  })

  it('uses the configured paid realm prefix', () => {
    platform.reset()
    platform = createTestPlatform({ config: { auth: { paidRealmPrefix: 'org-' } as never } })
    expect(toWorkspace('x', { found: true, realm: 'org-acme' })).toEqual({ realm: 'org-acme', trial: false, slug: 'acme' })
  })
})

describe('sessionContextSource (P-35)', () => {
  it('calls the contract path on the API base', () => {
    expect(SESSION.path).toBe('/api/v1/me/session-context')
  })

  it.each(SESSION.cases.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
    mockApi({ 'GET /v1/me/session-context': () => Response.json(c.response) })
    expect(await sessionContextSource.load(new AbortController().signal)).toEqual(c.expected)
  })

  it('loads without a signal', async () => {
    mockApi({ 'GET /v1/me/session-context': () => Response.json(SESSION.cases[0]!.response) })
    await expect(sessionContextSource.load()).resolves.toEqual(SESSION.cases[0]!.expected)
  })
})

describe('edge cases the contract does not list', () => {
  it('uses the default tenant- prefix, and leaves an unprefixed realm without a slug', () => {
    expect(toWorkspace('x', { found: true, realm: 'tenant-acme' })).toEqual({ realm: 'tenant-acme', trial: false, slug: 'acme' })
    expect(toWorkspace('x', { found: true, realm: 'acme' })).toEqual({ realm: 'acme', trial: false })
  })

  it('gives a trial found by email no slug, and no tenant hint when none is sent', () => {
    expect(toWorkspace('ada@acme.com', { found: true, realm: 'trial', strategy: 'shared' })).toEqual({ realm: 'trial', trial: true })
  })

  it('maps a minimal session context with lists defaulted and optional fields absent', () => {
    expect(toSessionContext({ tenant_id: 't', slug: 's' })).toEqual({
      tenantId: 't', slug: 's', roles: [], departments: [], featureFlags: [], readOnly: false,
    })
  })
})

describe('P-35 retries: the SDK ApiClient once, never a retry of a retry', () => {
  const outage = () => {
    let calls = 0
    mockApi({
      'GET /v1/me/session-context': () => {
        calls++
        return mockProblem(PlatformProblemTypes.ServiceUnavailable)
      },
    })
    return () => calls
  }

  it("the first load keeps the ApiClient's own retries (503 is in its retry set)", async () => {
    const calls = outage()
    await expect(sessionContextSource.load()).rejects.toMatchObject({ status: 503 })
    expect(calls()).toBeGreaterThan(1)
  })

  it('a background attempt (loadSessionContextOnce) sends exactly one request; the bootstrap spaces them', async () => {
    const calls = outage()
    await expect(loadSessionContextOnce()).rejects.toMatchObject({ status: 503 })
    expect(calls()).toBe(1)
  })

  it('and maps a 200 like the port does', async () => {
    mockApi({ 'GET /v1/me/session-context': () => Response.json(SESSION.cases[0]!.response) })
    expect(await loadSessionContextOnce()).toEqual(SESSION.cases[0]!.expected)
  })
})

