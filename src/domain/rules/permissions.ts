// UI permissions per tenant-level role, read from the session context's `roles` (IAM P-35). These are
// UI hints only: the gateway and services authorise every request.
//
// Keys are IAM's closed role set (iam-org-membership LLD §5.4 P-35, rev 2.47): `member` (every active
// member), `tenant_owner`, `tenant_admin`, `tender_admin`. Department levels (`preparator`, `reviewer`,
// `approver`) are never roles; they are in `departments[].level`. Grants follow IAM's §10.4 and the IAM
// screen spec v0.1 §2.2 and §4.3, and must never exceed them:
// - members: any active member may view them; only `tenant_owner` or `tenant_admin` may manage them
//   (invite, edit, suspend, remove, departments).
// - granting or removing `tenant_owner` / `tenant_admin` (`manage:admin-roles`; the spec's
//   `manage:roles:admin` has two colons, which the SDK's roleMapAuthorizer rejects) and the tenant
//   settings block (`manage:tenant-settings`): owner only. IAM's code lets `tenant_admin` grant admin roles,
//   but the HLD (§6.4) says owner only; the UI follows the HLD until IAM-FE-Q14 is answered.
// - SSO, the delegation policy and the audit log: `tenant_admin` and `tenant_owner`. SSO also needs
//   the plan's feature flag, which the screens check; the role map does not.
// - restricted-tender access grants (`manage:tender-access`, TAC-1/2/3): `tender_admin` and above.
// - tenders: not IAM's to decide. These grants are provisional until Tender Service confirms them.
export const IAM_ROLES = ['member', 'tenant_owner', 'tenant_admin', 'tender_admin'] as const

type Role = (typeof IAM_ROLES)[number]
type Permission = `${string}:${string}`

const MEMBER: readonly Permission[] = ['read:tender', 'read:members']
const TENDER_ADMIN: readonly Permission[] = [...MEMBER, 'update:tender', 'delete:tender', 'manage:tender-access']
const TENANT_ADMIN: readonly Permission[] = [
  ...TENDER_ADMIN,
  'manage:members',
  'manage:sso',
  'manage:delegation-policy',
  'read:audit',
]
// The signup owner usually holds tenant_owner without tenant_admin, so the owner gets every admin
// right plus the owner-only ones.
const TENANT_OWNER: readonly Permission[] = [...TENANT_ADMIN, 'manage:admin-roles', 'manage:tenant-settings']

export const permissions: Record<Role, readonly Permission[]> = {
  member: MEMBER,
  tender_admin: TENDER_ADMIN,
  tenant_admin: TENANT_ADMIN,
  tenant_owner: TENANT_OWNER,
}

/** IAM's admin grants in this map: the rights mfe-admin's screens (`/admin/*`) are for. */
export const ADMIN_PERMISSIONS: readonly Permission[] = TENANT_OWNER.filter((p) => !TENDER_ADMIN.includes(p))

/**
 * What shows the Admin entry point in the shell's sidebar. mfe-admin's rule (`useAdminAccess`) is
 * `manage:members` or any admin permission; in this map every role holding an admin grant holds
 * `manage:members` (test/unit/platform-misc.test.tsx proves it), so this one check is the same rule.
 */
export const ADMIN_ENTRY = { action: 'manage', resource: 'members' } as const
