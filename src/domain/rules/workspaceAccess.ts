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
