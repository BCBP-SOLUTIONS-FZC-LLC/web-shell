// The P-35 retry: which failures are retried, the backoff, the abort, and the store React reads.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetworkError, PlatformProblemTypes, TimeoutError, parseProblemResponse, typeForStatus } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { createApiClient } from '@bcbp-solutions-fzc-llc/frontend-sdk/http'
import { createTestPlatform, mockApi, mockProblem } from '@bcbp-solutions-fzc-llc/frontend-sdk/testing'
import type { SessionContext } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import { isPageWorkspace, workspaceBlock } from '../../src/domain/rules/workspaceAccess'
import { blockedWorkspace, createStore, isTransient, refusalIsReasked, retrySessionContext, settleRefusal } from '../../src/application/use-cases/loadSessionContext'

const ctx = { tenantId: 't-1', slug: 'acme', roles: ['member'] } as unknown as SessionContext
/**
 * The ProblemError the SDK's ApiClient would produce for `status`: the platform's response for it
 * (mockProblem), or, for a status with no platform type (502), the synthetic problem the SDK builds
 * from a bare response, as it does in production.
 */
const problem = (status: number) => {
  const type = typeForStatus(status)
  return parseProblemResponse(type ? mockProblem(type) : new Response(null, { status }))
}

afterEach(() => vi.useRealTimers())

describe('isTransient', () => {
  it("retries what the SDK ApiClient retries: online network failures, timeouts, 429, 502, 503, 504", async () => {
    expect(isTransient(new NetworkError(false, 'req-1'))).toBe(true)
    expect(isTransient(new TimeoutError(1000, 'req-1'))).toBe(true)
    expect(isTransient(await problem(429))).toBe(true)
    expect(isTransient(await problem(503))).toBe(true)
    expect(isTransient(await problem(502))).toBe(true)
    expect(isTransient(await problem(504))).toBe(true)
    // The ApiClient's own rule: offline, 500 and 501 are not worth another try.
    expect(isTransient(new NetworkError(true, 'req-1'))).toBe(false)
    expect(isTransient(await problem(500))).toBe(false)
    expect(isTransient(await problem(501))).toBe(false)
    expect(isTransient(await problem(401))).toBe(false)
    expect(isTransient(new Error('bug'))).toBe(false)
  })
})

describe('isTransient agrees with the SDK ApiClient', () => {
  // isTransient copies the ApiClient's retry rule because the SDK does not export it. This runs the
  // real client against each status and fails when the two disagree, so an SDK upgrade that changes
  // the rule breaks here instead of silently (then: import the SDK's predicate if it now has one).
  const STATUSES = [400, 403, 404, 408, 409, 422, 429, 500, 501, 502, 503, 504]

  it.each(STATUSES)('status %i', async (status) => {
    createTestPlatform()
    let calls = 0
    mockApi({
      'GET /probe': () => {
        calls++
        // Retry-After: 0 makes a retry immediate, so no timers are needed.
        return new Response(null, { status, headers: { 'Retry-After': '0' } })
      },
    })
    const error = await createApiClient()
      .get('/probe', { retry: { attempts: 1 } })
      .then(
        () => undefined,
        (e: unknown) => e,
      )
    expect(error).toBeDefined()
    const clientRetried = calls === 2
    expect(isTransient(error)).toBe(clientRetried)
  })
})

describe('retrySessionContext', () => {
  it('waits 1 s, 2 s, 4 s between tries and stops after 3', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => {
      throw new NetworkError(false, 'req-1')
    })
    const errors: number[] = []
    const done = retrySessionContext(load, { onError: (_e, n) => errors.push(n) })
    await vi.advanceTimersByTimeAsync(999)
    expect(load).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(4_000)
    await expect(done).resolves.toBeUndefined()
    expect(load).toHaveBeenCalledTimes(3)
    expect(errors).toEqual([1, 2, 3])
  })

  it('answers the context once a try succeeds', async () => {
    const load = vi.fn<() => Promise<SessionContext>>().mockRejectedValueOnce(await problem(502)).mockResolvedValue(ctx)
    await expect(retrySessionContext(load, { baseDelayMs: 1 })).resolves.toBe(ctx)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('stops at a final answer', async () => {
    const load = vi.fn(async () => {
      throw await problem(403)
    })
    await expect(retrySessionContext(load, { baseDelayMs: 1 })).resolves.toBeUndefined()
    expect(load).toHaveBeenCalledOnce()
  })

  it('stops at once on an abort: before, during the wait, and around a try', async () => {
    const before = new AbortController()
    before.abort()
    const never = vi.fn(async () => ctx)
    await expect(retrySessionContext(never, { signal: before.signal })).resolves.toBeUndefined()
    expect(never).not.toHaveBeenCalled()

    vi.useFakeTimers()
    const during = new AbortController()
    const waiting = retrySessionContext(never, { signal: during.signal })
    during.abort()
    await expect(waiting).resolves.toBeUndefined()
    expect(never).not.toHaveBeenCalled()
    vi.useRealTimers()

    const ok = new AbortController()
    await expect(
      retrySessionContext(async () => (ok.abort(), ctx), { signal: ok.signal, baseDelayMs: 1 }),
    ).resolves.toBeUndefined()
    const failing = new AbortController()
    const onError = vi.fn()
    await expect(
      retrySessionContext(
        async () => {
          failing.abort()
          throw new NetworkError(false, 'req-1')
        },
        { signal: failing.signal, baseDelayMs: 1, onError },
      ),
    ).resolves.toBeUndefined()
    expect(onError).not.toHaveBeenCalled()
  })
})

describe('createStore', () => {
  it('notifies subscribers on set until they unsubscribe', () => {
    const store = createStore<number>(1)
    const seen: number[] = []
    const off = store.subscribe(() => seen.push(store.get()))
    store.set(2)
    off()
    store.set(3)
    expect(seen).toEqual([2])
    expect(store.get()).toBe(3)
  })
})

describe('blockedWorkspace (P-35 refusals that are workspace states)', () => {
  const forbidden = (errorCode: string) => parseProblemResponse(mockProblem(PlatformProblemTypes.Forbidden, { errorCode }))
  const notFound = (errorCode: string) => parseProblemResponse(mockProblem(PlatformProblemTypes.NotFound, { errorCode }))

  it("maps IAM's codes to the screen they need", async () => {
    expect(blockedWorkspace(await forbidden('TENANT_TRIAL_EXPIRED'))).toBe('trial-expired')
    expect(blockedWorkspace(await forbidden('TENANT_SUSPENDED'))).toBe('tenant-unavailable')
    expect(blockedWorkspace(await notFound('TENANT_NOT_FOUND'))).toBe('tenant-unavailable')
    expect(blockedWorkspace(await forbidden('MEMBER_SUSPENDED'))).toBe('member-paused')
    expect(blockedWorkspace(await forbidden('DENY_MEMBER_SUSPENDED'))).toBe('member-paused')
    expect(blockedWorkspace(await forbidden('DENY_UNRESOLVABLE_SUBJECT'))).toBe('no-access')
    expect(blockedWorkspace(await notFound('MEMBER_NOT_FOUND'))).toBe('no-access')
  })

  it('compares the code without case', async () => {
    expect(blockedWorkspace(await forbidden('member_suspended'))).toBe('member-paused')
  })

  it('keeps every other failure on the permissions notice', async () => {
    // Any other non-active membership: IAM keeps INSUFFICIENT_ROLE, which is not "access paused".
    expect(blockedWorkspace(await forbidden('INSUFFICIENT_ROLE'))).toBeUndefined()
    expect(blockedWorkspace(await forbidden('DENY_ROLE_INSUFFICIENT'))).toBeUndefined()
    expect(blockedWorkspace(await problem(403))).toBeUndefined()
    // P-35 missing in an environment: a 404 without IAM's code.
    expect(blockedWorkspace(await notFound('ROUTE_NOT_FOUND'))).toBeUndefined()
    // A known code on a status IAM never sends it with is not taken as final.
    expect(blockedWorkspace(await notFound('TENANT_SUSPENDED'))).toBeUndefined()
    expect(blockedWorkspace(await problem(503))).toBeUndefined()
    expect(blockedWorkspace(new NetworkError(false, 'req-1'))).toBeUndefined()
    expect(blockedWorkspace(new Error('403'))).toBeUndefined()
    // A problem with no errorCode at all.
    expect(workspaceBlock(403, undefined)).toBeUndefined()
  })
})

describe('refusalIsReasked (whether the bootstrap shows "Loading your workspace…" while settleRefusal waits)', () => {
  it('is true only for a membership refusal, which settleRefusal asks again after its delay', async () => {
    const refusal = async (errorCode: string, status = 403) =>
      parseProblemResponse(mockProblem(status === 404 ? PlatformProblemTypes.NotFound : PlatformProblemTypes.Forbidden, { errorCode }))
    expect(refusalIsReasked(await refusal('MEMBER_SUSPENDED'))).toBe(true)
    expect(refusalIsReasked(await refusal('DENY_UNRESOLVABLE_SUBJECT'))).toBe(true)
    expect(refusalIsReasked(await refusal('MEMBER_NOT_FOUND', 404))).toBe(true)
    // A tenant state settles at once: its screen comes with no loading screen first.
    expect(refusalIsReasked(await refusal('TENANT_TRIAL_EXPIRED'))).toBe(false)
    expect(refusalIsReasked(await refusal('TENANT_SUSPENDED'))).toBe(false)
    expect(refusalIsReasked(await refusal('INSUFFICIENT_ROLE'))).toBe(false)
    expect(refusalIsReasked(new Error('500'))).toBe(false)
  })
})

describe('settleRefusal (a membership refusal is asked once more)', () => {
  const forbidden = (errorCode: string) => parseProblemResponse(mockProblem(PlatformProblemTypes.Forbidden, { errorCode }))

  it('takes a tenant state as final at once, without asking again', async () => {
    const load = vi.fn<() => Promise<SessionContext>>()
    expect(await settleRefusal(await forbidden('TENANT_TRIAL_EXPIRED'), load)).toEqual({ block: 'trial-expired' })
    expect(load).not.toHaveBeenCalled()
  })

  it('returns any other failure as it is', async () => {
    const error = new Error('bug')
    expect(await settleRefusal(error, vi.fn())).toEqual({ error })
  })

  it('asks once more after 5 s: a member reactivated in the meantime gets the context', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => ctx)
    const settled = settleRefusal(await forbidden('DENY_MEMBER_SUSPENDED'), load)
    await vi.advanceTimersByTimeAsync(4_999)
    expect(load).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(await settled).toEqual({ context: ctx })
  })

  it('takes the second answer: still refused, now another state, or another failure', async () => {
    const again = async (e: unknown) => settleRefusal(await forbidden('DENY_UNRESOLVABLE_SUBJECT'), () => Promise.reject(e), { delayMs: 0 })
    expect(await again(await forbidden('MEMBER_SUSPENDED'))).toEqual({ block: 'member-paused' })
    const outage = await problem(503)
    expect(await again(outage)).toEqual({ error: outage })
  })

  it('stops on a sign-out without asking again', async () => {
    const stop = new AbortController()
    stop.abort()
    const first = await forbidden('MEMBER_SUSPENDED')
    const load = vi.fn<() => Promise<SessionContext>>()
    expect(await settleRefusal(first, load, { signal: stop.signal })).toEqual({ error: first })
    expect(load).not.toHaveBeenCalled()
  })
})

describe('isPageWorkspace (a refreshed session context never rebinds the page)', () => {
  const paid = { trial: false, slug: 'acme' }
  const acme = { tenantId: 't-1', slug: 'acme' }

  it('a trial with a slug: P-35 must name that slug, as on the first load (one realm for every trial tenant)', () => {
    const trial = { trial: true, slug: 'beta' }
    expect(isPageWorkspace({ tenantId: 't-9', slug: 'beta' }, undefined, trial)).toBe(true)
    expect(isPageWorkspace({ tenantId: 't-9', slug: 'gamma' }, { tenantId: 't-9', slug: 'beta' }, trial)).toBe(false)
    expect(isPageWorkspace({ tenantId: 't-9' }, { tenantId: 't-9', slug: 'beta' }, trial)).toBe(false)
  })

  it('otherwise the same tenant as the context the page has, and the same slug when both name one', () => {
    expect(isPageWorkspace(acme, acme, paid)).toBe(true)
    expect(isPageWorkspace({ tenantId: 't-2', slug: 'globex' }, acme, paid)).toBe(false)
    // Another tenant without a slug: still refused.
    expect(isPageWorkspace({ tenantId: 't-2' }, acme, paid)).toBe(false)
    expect(isPageWorkspace({ tenantId: 't-1', slug: 'other' }, acme, paid)).toBe(false)
  })

  it('a body without a slug, or with a null one, keeps its context (LLD §4.2)', () => {
    expect(isPageWorkspace({ tenantId: 't-1' }, acme, paid)).toBe(true)
    expect(isPageWorkspace({ tenantId: 't-1', slug: null }, acme, paid)).toBe(true)
    expect(isPageWorkspace(acme, { tenantId: 't-1', slug: null }, paid)).toBe(true)
  })

  it('nothing to compare without a context yet (a deny-all page), as on the first load: a realm name in another case passes', () => {
    expect(isPageWorkspace({ tenantId: 't-1', slug: 'acme' }, undefined, { trial: false, slug: 'Acme' })).toBe(true)
    expect(isPageWorkspace({ tenantId: 't-9', slug: 'beta' }, undefined, { trial: true })).toBe(true)
  })
})
