// Why IAM refuses the signed-in user this workspace, from the answer to P-35 (session context).
// Codes as IAM sends them (2026-11-24 replies to web-shell; iam-org-membership #64, iam-authz-enrichment
// #44): Org & Membership checks the tenant first, then the member; the gateway refuses a member who is
// not active before the request reaches Org & Membership. Any other refusal (INSUFFICIENT_ROLE, a
// DENY_* the table does not name) is not a workspace state: the shell keeps the permissions notice.

/**
 * - `trial-expired`: the workspace's trial ended (spec A6).
 * - `tenant-unavailable`: the workspace is suspended or closed (A8).
 * - `member-paused`: this user's membership is suspended (A8 "access paused").
 * - `no-access`: this user is not, or no longer, a member. While a gateway without IAM's
 *   DENY_MEMBER_SUSPENDED is still deployed, a suspended member gets this one too (A8).
 */
export type WorkspaceBlock = 'trial-expired' | 'tenant-unavailable' | 'member-paused' | 'no-access'

const BLOCKS: Readonly<Record<string, { status: number; block: WorkspaceBlock }>> = {
  TENANT_TRIAL_EXPIRED: { status: 403, block: 'trial-expired' },
  TENANT_SUSPENDED: { status: 403, block: 'tenant-unavailable' },
  TENANT_NOT_FOUND: { status: 404, block: 'tenant-unavailable' },
  MEMBER_SUSPENDED: { status: 403, block: 'member-paused' },
  DENY_MEMBER_SUSPENDED: { status: 403, block: 'member-paused' },
  DENY_UNRESOLVABLE_SUBJECT: { status: 403, block: 'no-access' },
  MEMBER_NOT_FOUND: { status: 404, block: 'no-access' },
}

/**
 * The workspace state a P-35 refusal means, or undefined when it is not one. IAM sends the codes in
 * upper case; they are compared without case, as IAM's spec says. The status must match too, so a
 * code on an unexpected status is not taken as a final state.
 */
export function workspaceBlock(status: number, errorCode: string | undefined): WorkspaceBlock | undefined {
  const known = errorCode ? BLOCKS[errorCode.toUpperCase()] : undefined
  return known?.status === status ? known.block : undefined
}

/** What the refresh check needs of a session context (IAM P-35) and of the page's workspace. */
interface PageContext {
  readonly tenantId: string
  readonly slug?: string | null | undefined
}
interface PageWorkspace {
  readonly trial: boolean
  readonly slug?: string | undefined
}

/**
 * Whether a session context that a refresh loaded is for the workspace this page was opened for, so the
 * page never rebinds to another one.
 * - A trial with a slug: P-35's slug must equal it, as on the first load (§5 step 11b); a body without one
 *   fails, since every trial tenant shares one realm.
 * - Otherwise, against the context the page has: the same tenant, and the same slug when both name one (a
 *   body without a slug keeps its context, §4.2).
 * - Otherwise (no context yet, not a trial with a slug): nothing to compare, as on the first load.
 */
export function isPageWorkspace(next: PageContext, current: PageContext | undefined, w: PageWorkspace): boolean {
  if (w.trial && w.slug !== undefined) return next.slug === w.slug
  if (!current) return true
  if (next.tenantId !== current.tenantId) return false
  return typeof next.slug !== 'string' || typeof current.slug !== 'string' || next.slug === current.slug
}
