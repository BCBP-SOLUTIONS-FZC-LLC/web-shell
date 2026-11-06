// The P-35 retry: which failures are retried, the backoff, the abort, and the store React reads.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NetworkError, TimeoutError, parseProblemResponse, typeForStatus } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { mockProblem } from '@bcbp-solutions-fzc-llc/frontend-sdk/testing'
import type { SessionContext } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import { createStore, isTransient, retrySessionContext } from '../../src/application/use-cases/loadSessionContext'

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
