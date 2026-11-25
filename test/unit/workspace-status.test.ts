// The workspace banners: which ones show to whom (spec §5.5, §5.6), the P-1 and P-27 ports through the
// real ApiClient, the background load, and the A5 "seen on this device" flag in the SDK's storage().
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestPlatform, mockApi, mockProblem } from '@bcbp-solutions-fzc-llc/frontend-sdk/testing'
import { PlatformProblemTypes } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import type { SeatUsage, TenantStatus, WorkspaceStatusSource } from '../../src/domain/repositories/workspaceStatus'
import { readOnlyUntil, recentlyUpgraded, workspaceBanners } from '../../src/domain/rules/workspaceBanners'
import { toSeatUsage, toTenantStatus, workspaceStatusSource } from '../../src/infrastructure/api/iam'
import { loadWorkspaceStatus } from '../../src/application/use-cases/loadWorkspaceStatus'
import { upgradeWelcomeStorage } from '../../src/infrastructure/storage/upgradeWelcome'

const NOW = Date.parse('2026-11-24T12:00:00Z')
const DAY = 86_400_000
const iso = (t: number) => new Date(t).toISOString()
const owner = { owner: true, manager: true }
const admin = { owner: false, manager: true }
const member = { owner: false, manager: false }
const tenant = (t: Partial<TenantStatus>): TenantStatus => ({ name: 'Acme', status: 'active', ...t })
const seats = (activeUsers: number, pendingInvitations: number, licensedSeats: number): SeatUsage => ({ activeUsers, pendingInvitations, licensedSeats })

describe('workspaceBanners (spec §5.6)', () => {
  it('shows trial days left to everyone, to the nearest day, and 0 only in the last 24 hours', () => {
    const banner = (end: number) => workspaceBanners(tenant({ status: 'trial', trialEndsAt: iso(end) }), undefined, member, NOW)
    // A new 14-day trial reads 14, not 13.
    expect(banner(NOW + 14 * DAY - 5)).toEqual([{ kind: 'trial', days: 14 }])
    expect(banner(NOW + 13.2 * DAY)).toEqual([{ kind: 'trial', days: 13 }])
    expect(banner(NOW + 1.6 * DAY)).toEqual([{ kind: 'trial', days: 2 }])
    expect(banner(NOW + 1.4 * DAY)).toEqual([{ kind: 'trial', days: 1 }])
    expect(banner(NOW + DAY)).toEqual([{ kind: 'trial', days: 1 }])
    expect(banner(NOW + DAY - 1)).toEqual([{ kind: 'trial', days: 0 }])
    expect(banner(NOW + 1000)).toEqual([{ kind: 'trial', days: 0 }])
  })

  it('says the trial has ended once its end has passed, while IAM still says trial', () => {
    expect(workspaceBanners(tenant({ status: 'trial', trialEndsAt: iso(NOW) }), undefined, member, NOW)).toEqual([{ kind: 'trial-ended' }])
    expect(workspaceBanners(tenant({ status: 'trial', trialEndsAt: iso(NOW - DAY) }), undefined, member, NOW)).toEqual([{ kind: 'trial-ended' }])
  })

  it('shows no trial banner without a readable end date, or once the tenant is paid', () => {
    expect(workspaceBanners(tenant({ status: 'trial' }), undefined, member, NOW)).toEqual([])
    expect(workspaceBanners(tenant({ status: 'trial', trialEndsAt: 'soon' }), undefined, member, NOW)).toEqual([])
    expect(workspaceBanners(tenant({ status: 'active', trialEndsAt: iso(NOW + DAY) }), undefined, member, NOW)).toEqual([])
  })

  it('shows a payment problem to the owner only', () => {
    expect(workspaceBanners(tenant({ status: 'past_due' }), undefined, owner, NOW)).toEqual([{ kind: 'past-due' }])
    expect(workspaceBanners(tenant({ status: 'past_due' }), undefined, admin, NOW)).toEqual([])
  })

  it('shows "all seats used" to owners and admins once seats in use and invited reach the licence (no overage, IAM CD-54)', () => {
    expect(workspaceBanners(undefined, seats(20, 5, 25), admin, NOW)).toEqual([{ kind: 'seats-full', seats: 25 }])
    expect(workspaceBanners(undefined, seats(20, 4, 25), admin, NOW)).toEqual([])
    expect(workspaceBanners(undefined, seats(20, 5, 25), member, NOW)).toEqual([])
    // No licence count (P-27 answered 0): nothing to say.
    expect(workspaceBanners(undefined, seats(0, 0, 0), owner, NOW)).toEqual([])
  })

  it('tells tenant admins the workspace has no owner (an owner never sees it)', () => {
    const t = tenant({ ownerlessSince: iso(NOW - DAY) })
    expect(workspaceBanners(t, undefined, admin, NOW)).toEqual([{ kind: 'ownerless' }])
    expect(workspaceBanners(t, undefined, owner, NOW)).toEqual([])
    expect(workspaceBanners(t, undefined, member, NOW)).toEqual([])
  })

  it('shows nothing without P-1 or P-27', () => {
    expect(workspaceBanners(undefined, undefined, owner, NOW)).toEqual([])
  })
})

describe('readOnlyUntil and recentlyUpgraded', () => {
  it("gives a cancelled tenant's grace end, and nothing in any other state or without a date", () => {
    const until = iso(NOW + 30 * DAY)
    expect(readOnlyUntil(tenant({ status: 'cancelled', readOnlyUntil: until }))).toBe(until)
    expect(readOnlyUntil(tenant({ status: 'cancelled' }))).toBeUndefined()
    expect(readOnlyUntil(tenant({ status: 'cancelled', readOnlyUntil: 'later' }))).toBeUndefined()
    expect(readOnlyUntil(tenant({ status: 'active', readOnlyUntil: until }))).toBeUndefined()
    expect(readOnlyUntil(undefined)).toBeUndefined()
  })

  it('marks a trial converted to paid within 7 days (IAM OM-4: trial end kept, subscription start set)', () => {
    const converted = (startedAgo: number, t: Partial<TenantStatus> = {}) =>
      recentlyUpgraded(tenant({ trialEndsAt: iso(NOW - 20 * DAY), subscriptionStartedAt: iso(NOW - startedAgo), ...t }), NOW)
    expect(converted(DAY)).toBe(true)
    expect(converted(7 * DAY - 1)).toBe(true)
    expect(converted(7 * DAY)).toBe(false)
    // A device up to 10 minutes behind IAM still welcomes the first load after the conversion; further ahead
    // than that the start is not "recent".
    expect(converted(-5 * 60_000)).toBe(true)
    expect(converted(-10 * 60_000)).toBe(true)
    expect(converted(-10 * 60_000 - 1)).toBe(false)
    expect(converted(-DAY)).toBe(false)
    // Paid from the start: no trial end.
    expect(converted(DAY, { trialEndsAt: undefined })).toBe(false)
    expect(converted(DAY, { status: 'trial' })).toBe(false)
    // Only while on a paid plan: a payment being retried still counts, a cancellation since does not.
    expect(converted(DAY, { status: 'past_due' })).toBe(true)
    expect(converted(DAY, { status: 'cancelled' })).toBe(false)
    expect(recentlyUpgraded(tenant({ trialEndsAt: iso(NOW) }), NOW)).toBe(false)
    expect(recentlyUpgraded(undefined, NOW)).toBe(false)
  })
})

describe('P-1 and P-27 ports', () => {
  let platform: ReturnType<typeof createTestPlatform> | undefined
  afterEach(() => platform?.reset())

  it('maps P-1, leaving absent and null optional fields out', () => {
    expect(toTenantStatus({ name: 'Acme', status: 'trial', trial_ends_at: '2026-12-01T00:00:00Z' })).toEqual({ name: 'Acme', status: 'trial', trialEndsAt: '2026-12-01T00:00:00Z' })
    expect(
      toTenantStatus({
        name: 'Acme',
        status: 'cancelled',
        subscription_started_at: 'a',
        ownerless_since: 'b',
        read_only_until: 'c',
        trial_ends_at: null as unknown as string,
      }),
    ).toEqual({ name: 'Acme', status: 'cancelled', subscriptionStartedAt: 'a', ownerlessSince: 'b', readOnlyUntil: 'c' })
    expect(toSeatUsage({ active_users: 1, pending_invitations: 2, licensed_seats: 3 })).toEqual(seats(1, 2, 3))
  })

  it('calls GET /tenants/:id and /tenants/:id/seat-usage with the token, the id escaped, and the abort signal', async () => {
    platform = createTestPlatform()
    const seen: Request[] = []
    mockApi({
      'GET /v1/tenants/:id': (req) => (seen.push(req), Response.json({ name: 'Acme', status: 'active' })),
      'GET /v1/tenants/:id/seat-usage': (req) => (seen.push(req), Response.json({ active_users: 1, pending_invitations: 0, licensed_seats: 5 })),
    })
    const stop = new AbortController()
    expect(await workspaceStatusSource.tenant('t 1')).toEqual({ name: 'Acme', status: 'active' })
    expect(await workspaceStatusSource.seatUsage('t-1', stop.signal)).toEqual(seats(1, 0, 5))
    expect(await workspaceStatusSource.tenant('t-1', stop.signal)).toEqual({ name: 'Acme', status: 'active' })
    expect(await workspaceStatusSource.seatUsage('t-1')).toEqual(seats(1, 0, 5))
    expect(new URL(seen[0]!.url).pathname).toBe('/api/v1/tenants/t%201')
    expect(new URL(seen[1]!.url).pathname).toBe('/api/v1/tenants/t-1/seat-usage')
    expect(seen[0]!.headers.get('authorization')).toMatch(/^Bearer /)
  })
})

describe('loadWorkspaceStatus', () => {
  const source = (o: { tenant?: () => Promise<TenantStatus>; seats?: () => Promise<SeatUsage> } = {}): WorkspaceStatusSource => ({
    tenant: vi.fn(o.tenant ?? (async () => tenant({}))),
    seatUsage: vi.fn(o.seats ?? (async () => seats(1, 0, 5))),
  })

  it('loads P-1, and P-27 only when asked (owners and tenant admins)', async () => {
    const s = source()
    expect(await loadWorkspaceStatus(s, 't-1', { seats: false })).toEqual({ tenant: tenant({}) })
    expect(s.seatUsage).not.toHaveBeenCalled()
    expect(await loadWorkspaceStatus(s, 't-1', { seats: true })).toEqual({ tenant: tenant({}), seats: seats(1, 0, 5) })
    expect(s.tenant).toHaveBeenCalledWith('t-1', undefined)
  })

  it('reports and skips each failure: a failure means no banner, never an error', async () => {
    const onError = vi.fn()
    const forbidden = await mockProblem(PlatformProblemTypes.Forbidden).json()
    const s = source({ tenant: () => Promise.reject(forbidden), seats: () => Promise.reject(new Error('down')) })
    expect(await loadWorkspaceStatus(s, 't-1', { seats: true, onError })).toEqual({})
    expect(onError).toHaveBeenCalledWith(forbidden, 'tenant')
    expect(onError).toHaveBeenCalledWith(new Error('down'), 'seats')
    expect(await loadWorkspaceStatus(s, 't-1', { seats: true })).toEqual({})
  })

  it('reports nothing once aborted (a sign-out)', async () => {
    const onError = vi.fn()
    const stop = new AbortController()
    stop.abort()
    const s = source({ tenant: () => Promise.reject(new Error('aborted')), seats: () => Promise.reject(new Error('aborted')) })
    expect(await loadWorkspaceStatus(s, 't-1', { seats: true, signal: stop.signal, onError })).toEqual({})
    expect(onError).not.toHaveBeenCalled()
  })
})

describe('upgradeWelcomeStorage (A5 once per device and workspace)', () => {
  let platform: ReturnType<typeof createTestPlatform> | undefined
  afterEach(() => platform?.reset())

  it('remembers that the welcome was seen, per workspace', () => {
    platform = createTestPlatform({ storageNamespace: 'tenant-acme' })
    expect(upgradeWelcomeStorage.seen()).toBe(false)
    upgradeWelcomeStorage.markSeen()
    expect(upgradeWelcomeStorage.seen()).toBe(true)
    platform = createTestPlatform({ storageNamespace: 'tenant-globex' })
    expect(upgradeWelcomeStorage.seen()).toBe(false)
  })
})
