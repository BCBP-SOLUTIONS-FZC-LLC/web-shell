// UI permissions per tenant-level role, read from the session context's `roles` (IAM P-35). These are
// UI hints only: the gateway and services authorise every request.
//
// Keys are IAM's closed role set (iam-org-membership LLD §5.4 P-35, rev 2.47): `member` (every active
// member), `tenant_owner`, `tenant_admin`, `tender_admin`. Department levels (`preparator`, `reviewer`,
// `approver`) are never roles; they are in `departments[].level`. Grants follow IAM's §10.4 and must
// never exceed it:
// - members: any active member may view them; only `tenant_owner` or `tenant_admin` may manage them
//   (invite, edit, suspend, remove).
// - tenders: not IAM's to decide. These grants are provisional until Tender Service confirms them.
export const IAM_ROLES = ['member', 'tenant_owner', 'tenant_admin', 'tender_admin'] as const

type Role = (typeof IAM_ROLES)[number]
type Permission = `${string}:${string}`

const MEMBER: readonly Permission[] = ['read:tender', 'read:members']
const TENDER_ADMIN: readonly Permission[] = [...MEMBER, 'update:tender', 'delete:tender']
const TENANT_ADMIN: readonly Permission[] = [...TENDER_ADMIN, 'manage:members']

export const permissions: Record<Role, readonly Permission[]> = {
  member: MEMBER,
  tender_admin: TENDER_ADMIN,
  tenant_admin: TENANT_ADMIN,
  // The signup owner usually holds tenant_owner without tenant_admin; IAM grants both the same
  // member-management rights.
  tenant_owner: TENANT_ADMIN,
}
