// The /auth ports over the SDK's ApiClient (SDK design doc §C1 /auth), as in
// platform-reactcommon/examples/shell/src/iam.ts:
// - PUB-1 resolves a company slug or an invitation email to a Keycloak realm.
// - IAM P-35 returns the signed-in user's session context (roles, plan, flags).
import type {
  SessionContext,
  SessionContextSource,
  Workspace,
  WorkspaceResolver,
} from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import { tryGetConfig } from '@bcbp-solutions-fzc-llc/frontend-sdk/config'
import { createApiClient } from '@bcbp-solutions-fzc-llc/frontend-sdk/http'

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
  const prefix = tryGetConfig()?.auth.paidRealmPrefix ?? 'tenant-'
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
