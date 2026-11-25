// What the banners read about the workspace: IAM P-1 (the tenant) and P-27 (seat usage). The shell
// defines this port; infrastructure/api/iam.ts implements it.

/** The tenant's subscription state (P-1 `GET /api/v1/tenants/:id`), only the fields the shell uses. */
export interface TenantStatus {
  name: string
  /** `trial`, `active`, `past_due` or `cancelled` on a 200 (IAM may add states; unknown ones show nothing). */
  status: string
  /** RFC 3339. Kept after a trial converts, so with `subscriptionStartedAt` it marks a converted tenant. */
  trialEndsAt?: string
  /** RFC 3339: when the tenant became paid. */
  subscriptionStartedAt?: string
  /** RFC 3339: set while the workspace has no owner. */
  ownerlessSince?: string
  /** RFC 3339: a cancelled tenant's read-only grace end, when it becomes suspended. */
  readOnlyUntil?: string
}

/** P-27 `GET /api/v1/tenants/:id/seat-usage` (owner and tenant admin only). */
export interface SeatUsage {
  activeUsers: number
  pendingInvitations: number
  licensedSeats: number
}

export interface WorkspaceStatusSource {
  tenant(tenantId: string, signal?: AbortSignal): Promise<TenantStatus>
  seatUsage(tenantId: string, signal?: AbortSignal): Promise<SeatUsage>
}

/** Whether this device has shown the "workspace upgraded" welcome (A5) for the signed-in workspace. */
export interface UpgradeWelcomeRepository {
  seen(): boolean
  markSeen(): void
}
