// The session context (IAM P-35) with bounded retries, and the store the shell's provider reads it
// from. Without it the subject is deny-all and only platform flags apply, so one transient failure
// at boot must not last for the page's life: the shell renders deny-all and keeps trying in the
// background. As platform-reactcommon examples/shell/src/session-context.ts (SDK alpha.4).
import type { SessionContext } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import { NetworkError, TimeoutError, isProblemError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { workspaceBlock, type WorkspaceBlock } from '../../domain/rules/workspaceAccess'

export type { WorkspaceBlock }

/**
 * The workspace state behind a failed P-35 load (trial ended, workspace suspended, access paused, not
 * a member), or undefined for any other failure. Such an answer is final: the app is not rendered.
 */
export function blockedWorkspace(e: unknown): WorkspaceBlock | undefined {
  return isProblemError(e) ? workspaceBlock(e.status, e.errorCode) : undefined
}

/**
 * The SDK ApiClient's own rule for a failure worth another try (its RETRY_STATUSES, which it does not
 * export): a network failure while online, a timeout, or 429, 502, 503, 504. Anything else (other
 * 4xx, 500, 501, offline) is final, as it is for the ApiClient.
 */
const RETRY_STATUSES = new Set([429, 502, 503, 504])
export function isTransient(e: unknown): boolean {
  if (e instanceof NetworkError) return !e.offline
  if (e instanceof TimeoutError) return true
  return isProblemError(e) && RETRY_STATUSES.has(e.status)
}

export interface RetryOptions {
  /** Further tries after the first failure. Default 3. */
  attempts?: number
  /** The delay before the first retry; it doubles each time. Default 1000 ms. */
  baseDelayMs?: number
  /** Stops the retries (sign-out). */
  signal?: AbortSignal
  /** Each failed retry, for the log. */
  onError?: (e: unknown, attempt: number) => void
}

/** Resolves after `ms`, or at once when `signal` is (or becomes) aborted; leaves no listener behind. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve()
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Retries `load` after a failed first load: up to `attempts` times, waiting baseDelayMs, then twice
 * that, and so on. Resolves to the context, or undefined when the tries run out, an error is not
 * transient, or `signal` aborts.
 */
export async function retrySessionContext(
  load: (signal?: AbortSignal) => Promise<SessionContext>,
  o: RetryOptions = {},
): Promise<SessionContext | undefined> {
  const attempts = o.attempts ?? 3
  let delay = o.baseDelayMs ?? 1000
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await sleep(delay, o.signal)
    if (o.signal?.aborted) return undefined
    try {
      const context = await load(o.signal)
      return o.signal?.aborted ? undefined : context
    } catch (e) {
      if (o.signal?.aborted) return undefined
      o.onError?.(e, attempt)
      if (!isTransient(e)) return undefined
    }
    delay *= 2
  }
  return undefined
}

/** How a failed first P-35 load ends: a context after all, a workspace state, or another failure. */
export type SettledLoad = { context: SessionContext } | { block: WorkspaceBlock } | { error: unknown }

/**
 * Settles a failed first P-35 load. A membership refusal (`member-paused`, `no-access`) can be IAM's
 * caches lagging a change by a few seconds: a member just reactivated (the gateway keeps its answer
 * 5 s), added or invited. So it is asked once more after `delayMs` (default 5000, IAM's advice)
 * before it is taken as final. A tenant state is final at once; any other failure is returned as is.
 */
export async function settleRefusal(
  error: unknown,
  load: (signal?: AbortSignal) => Promise<SessionContext>,
  o: { delayMs?: number; signal?: AbortSignal } = {},
): Promise<SettledLoad> {
  const block = blockedWorkspace(error)
  if (!block) return { error }
  if (block !== 'member-paused' && block !== 'no-access') return { block }
  await sleep(o.delayMs ?? 5000, o.signal)
  if (o.signal?.aborted) return { error }
  try {
    return { context: await load(o.signal) }
  } catch (e) {
    const again = blockedWorkspace(e)
    return again ? { block: again } : { error: e }
  }
}

/** A value React reads with useSyncExternalStore: the session context, set when a retry succeeds. */
export interface Store<T> {
  get(): T
  set(v: T): void
  subscribe(l: () => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(v) {
      value = v
      for (const l of [...listeners]) l()
    },
    subscribe(l) {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
  }
}
