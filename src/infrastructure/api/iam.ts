// The /auth ports over the SDK's ApiClient (SDK design doc §C1 /auth), as in
// platform-reactcommon/examples/shell/src/iam.ts:
// - PUB-1 resolves a company slug or an invitation email to a Keycloak realm.
// - IAM P-35 returns the signed-in user's session context (roles, plan, flags).
// - IAM P-1 (tenant) and P-27 (seat usage) feed the workspace banners.
import type {
  SessionContext,
  SessionContextSource,
  Workspace,
  WorkspaceResolver,
} from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import { getConfig } from '@bcbp-solutions-fzc-llc/frontend-sdk/config'
import { createApiClient } from '@bcbp-solutions-fzc-llc/frontend-sdk/http'
import type { SeatUsage, TenantStatus, WorkspaceStatusSource } from '../../domain/repositories/workspaceStatus'

export interface ResolveResponse {
  found?: boolean
  realm?: string
  strategy?: 'shared' | 'dedicated'
  tenant_id?: string
}

export interface SessionContextResponse {
  tenant_id: string
  slug: string
  roles?: string[] | null
  departments?: { id: string; level: string }[] | null
  plan?: string
  feature_flags?: string[] | null
  read_only?: boolean
  mfa_freshness_seconds?: number
  locale?: string
}

/** PUB-1 → Workspace: 'shared' is the trial realm; a paid slug is the realm after paidRealmPrefix. */
export function toWorkspace(identifier: string, r: ResolveResponse): Workspace | undefined {
  if (r.found !== true || typeof r.realm !== 'string' || r.realm === '') return undefined
  const trial = r.strategy === 'shared'
  const prefix = getConfig().auth.paidRealmPrefix
  // An email never names the slug; a trial result has one only when the identifier was the slug.
  const slug = trial
    ? identifier.includes('@')
      ? undefined
      : identifier
    : r.realm.startsWith(prefix)
      ? r.realm.slice(prefix.length)
      : undefined
  return {
    realm: r.realm,
    trial,
    ...(slug ? { slug } : {}),
    ...(trial && typeof r.tenant_id === 'string' ? { tenantIdHint: r.tenant_id } : {}),
  }
}

/** P-35 → SessionContext (snake_case → camelCase; lists are never null). */
export function toSessionContext(r: SessionContextResponse): SessionContext {
  return {
    tenantId: r.tenant_id,
    slug: r.slug,
    roles: r.roles ?? [],
    departments: r.departments ?? [],
    ...(r.plan !== undefined ? { plan: r.plan } : {}),
    featureFlags: r.feature_flags ?? [],
    readOnly: r.read_only === true,
    ...(r.mfa_freshness_seconds !== undefined ? { mfaFreshnessSeconds: r.mfa_freshness_seconds } : {}),
    ...(r.locale !== undefined ? { locale: r.locale } : {}),
  }
}

// Created on first use: createApiClient reads the runtime config, which the bootstrap loads first.
let api: ReturnType<typeof createApiClient> | undefined
const client = () => (api ??= createApiClient())

export const workspaceResolver: WorkspaceResolver = {
  async resolve(identifier, signal) {
    // Public endpoint on the same origin, rate-limited per IP: no token.
    const res = await client().get<ResolveResponse>('/v1/public/tenants/resolve', {
      query: { identifier },
      auth: false,
      ...(signal ? { signal } : {}),
    })
    return toWorkspace(identifier, res.data)
  },
}

export const sessionContextSource: SessionContextSource = {
  async load(signal) {
    const res = await client().get<SessionContextResponse>('/v1/me/session-context', signal ? { signal } : {})
    return toSessionContext(res.data)
  },
}

/**
 * One P-35 request without the ApiClient's own retries, for the bootstrap's background retry, which
 * spaces its attempts itself: the SDK retries the first load (honouring Retry-After); a retry of a
 * retry would multiply requests during an outage.
 */
export async function loadSessionContextOnce(signal?: AbortSignal): Promise<SessionContext> {
  const res = await client().get<SessionContextResponse>('/v1/me/session-context', { retry: false, ...(signal ? { signal } : {}) })
  return toSessionContext(res.data)
}

/** P-1 `GET /api/v1/tenants/:id`: the fields the banners use (absent optional keys mean no value). */
export interface TenantResponse {
  name: string
  status: string
  trial_ends_at?: string
  subscription_started_at?: string
  ownerless_since?: string
  read_only_until?: string
}

/** P-27 `GET /api/v1/tenants/:id/seat-usage`. */
export interface SeatUsageResponse {
  active_users: number
  pending_invitations: number
  licensed_seats: number
}

/** P-1 → TenantStatus (snake_case → camelCase; an absent or null optional field stays absent). */
export function toTenantStatus(r: TenantResponse): TenantStatus {
  const optional = (key: keyof TenantStatus, v: string | null | undefined) => (typeof v === 'string' ? { [key]: v } : {})
  return {
    name: r.name,
    status: r.status,
    ...optional('trialEndsAt', r.trial_ends_at),
    ...optional('subscriptionStartedAt', r.subscription_started_at),
    ...optional('ownerlessSince', r.ownerless_since),
    ...optional('readOnlyUntil', r.read_only_until),
  }
}

export function toSeatUsage(r: SeatUsageResponse): SeatUsage {
  return { activeUsers: r.active_users, pendingInvitations: r.pending_invitations, licensedSeats: r.licensed_seats }
}

/** P-1 and P-27 for the banners. The tenant id is P-35's `tenant_id`; IAM refuses any other. */
export const workspaceStatusSource: WorkspaceStatusSource = {
  async tenant(tenantId, signal) {
    const res = await client().get<TenantResponse>('/v1/tenants/:id', { params: { id: tenantId }, ...(signal ? { signal } : {}) })
    return toTenantStatus(res.data)
  },
  async seatUsage(tenantId, signal) {
    const res = await client().get<SeatUsageResponse>('/v1/tenants/:id/seat-usage', { params: { id: tenantId }, ...(signal ? { signal } : {}) })
    return toSeatUsage(res.data)
  },
}
