import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const tryGetConfig = vi.fn()
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/http', () => ({ createApiClient: () => ({ get }) }))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/config', () => ({ tryGetConfig: () => tryGetConfig() }))

const { sessionContextSource, toSessionContext, toWorkspace, workspaceResolver } = await import('../../src/platform/iam')

describe('toWorkspace (PUB-1)', () => {
  beforeEach(() => tryGetConfig.mockReturnValue(undefined))

  it('rejects a not-found or malformed response', () => {
    expect(toWorkspace('acme', { found: false })).toBeUndefined()
    expect(toWorkspace('acme', { found: true })).toBeUndefined()
    expect(toWorkspace('acme', { found: true, realm: '' })).toBeUndefined()
  })

  it('maps a paid realm to its slug with the default prefix', () => {
    expect(toWorkspace('ada@acme.com', { found: true, realm: 'tenant-acme', strategy: 'dedicated' })).toEqual({
      realm: 'tenant-acme',
      trial: false,
      slug: 'acme',
    })
  })

  it('uses the configured prefix and leaves an unprefixed realm without a slug', () => {
    tryGetConfig.mockReturnValue({ auth: { paidRealmPrefix: 'org-' } })
    expect(toWorkspace('x', { found: true, realm: 'org-acme' })).toEqual({ realm: 'org-acme', trial: false, slug: 'acme' })
    expect(toWorkspace('x', { found: true, realm: 'tenant-acme' })).toEqual({ realm: 'tenant-acme', trial: false })
  })

  it('maps a trial: slug only when the identifier was one, tenant hint when present', () => {
    const r = { found: true, realm: 'trial', strategy: 'shared' as const, tenant_id: 't-1' }
    expect(toWorkspace('acme', r)).toEqual({ realm: 'trial', trial: true, slug: 'acme', tenantIdHint: 't-1' })
    expect(toWorkspace('ada@acme.com', { ...r, tenant_id: undefined })).toEqual({ realm: 'trial', trial: true })
  })
})

describe('toSessionContext (P-35)', () => {
  it('fills defaults for absent lists and flags', () => {
    expect(toSessionContext({ tenant_id: 't', slug: 's', roles: null, feature_flags: null })).toEqual({
      tenantId: 't',
      slug: 's',
      roles: [],
      departments: [],
      featureFlags: [],
      readOnly: false,
    })
  })

  it('maps every optional field', () => {
    expect(
      toSessionContext({
        tenant_id: 't',
        slug: 's',
        roles: ['member'],
        departments: [{ id: 'd', level: 'l' }],
        plan: 'pro',
        feature_flags: ['f'],
        read_only: true,
        mfa_freshness_seconds: 30,
        locale: 'ar',
      }),
    ).toEqual({
      tenantId: 't',
      slug: 's',
      roles: ['member'],
      departments: [{ id: 'd', level: 'l' }],
      plan: 'pro',
      featureFlags: ['f'],
      readOnly: true,
      mfaFreshnessSeconds: 30,
      locale: 'ar',
    })
  })
})

describe('ports', () => {
  beforeEach(() => get.mockReset())

  it('resolves through the public endpoint without a token, passing the signal', async () => {
    get.mockResolvedValue({ data: { found: true, realm: 'tenant-acme' } })
    const signal = new AbortController().signal
    await expect(workspaceResolver.resolve('acme', signal)).resolves.toEqual({ realm: 'tenant-acme', trial: false, slug: 'acme' })
    expect(get).toHaveBeenCalledWith('/v1/public/tenants/resolve', { query: { identifier: 'acme' }, auth: false, signal })
    await workspaceResolver.resolve('acme')
    expect(get).toHaveBeenLastCalledWith('/v1/public/tenants/resolve', { query: { identifier: 'acme' }, auth: false })
  })

  it('loads the session context, with and without a signal', async () => {
    get.mockResolvedValue({ data: { tenant_id: 't', slug: 's' } })
    const signal = new AbortController().signal
    await expect(sessionContextSource.load(signal)).resolves.toMatchObject({ tenantId: 't', slug: 's' })
    expect(get).toHaveBeenCalledWith('/v1/me/session-context', { signal })
    await sessionContextSource.load()
    expect(get).toHaveBeenLastCalledWith('/v1/me/session-context', {})
  })
})
