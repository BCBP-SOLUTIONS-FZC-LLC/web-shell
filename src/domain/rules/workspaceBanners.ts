// Which workspace banners to show (IAM screen spec §5.5, §5.6), from P-1 and P-27, and who sees them.
// UI hints only, like the role map: the audience comes from the UI permissions, never more than IAM
// allows. "Settings still applying" (`realm_sync_pending`) belongs to the SSO settings screen (E6) in
// mfe-admin, not to the shell.
import type { SeatUsage, TenantStatus } from '../repositories/workspaceStatus'

export type WorkspaceBanner =
  /** Everyone, while the trial runs. `days` is whole days left, rounded up; 0 on the last day. */
  | { kind: 'trial'; days: number }
  /** Owner: the payment failed (`past_due`); full access continues. */
  | { kind: 'past-due' }
  /** Owner and tenant admin: every seat is used or invited, so new invites are refused (IAM SEAT-1). */
  | { kind: 'seats-full'; seats: number }
  /** Tenant admin: the workspace has no owner. */
  | { kind: 'ownerless' }

/** Who is looking, from the UI permissions. */
export interface BannerAudience {
  /** The owner (`manage:tenant-settings`). */
  owner: boolean
  /** Owner or tenant admin (`manage:members`). */
  manager: boolean
}

const DAY_MS = 86_400_000

function time(iso: string | undefined): number | undefined {
  const t = iso === undefined ? NaN : Date.parse(iso)
  return Number.isNaN(t) ? undefined : t
}

/** The banners for this user, in display order. */
export function workspaceBanners(
  tenant: TenantStatus | undefined,
  seats: SeatUsage | undefined,
  who: BannerAudience,
  now: number,
): WorkspaceBanner[] {
  const banners: WorkspaceBanner[] = []
  const trialEnd = time(tenant?.trialEndsAt)
  if (tenant?.status === 'trial' && trialEnd !== undefined) {
    banners.push({ kind: 'trial', days: Math.max(0, Math.ceil((trialEnd - now) / DAY_MS)) })
  }
  if (tenant?.status === 'past_due' && who.owner) banners.push({ kind: 'past-due' })
  // No overage exists (IAM CD-54): "all seats used" is the point where an invite starts being refused.
  if (seats && who.manager && seats.licensedSeats > 0 && seats.activeUsers + seats.pendingInvitations >= seats.licensedSeats) {
    banners.push({ kind: 'seats-full', seats: seats.licensedSeats })
  }
  if (tenant?.ownerlessSince !== undefined && who.manager && !who.owner) banners.push({ kind: 'ownerless' })
  return banners
}

/** A cancelled tenant's read-only grace end (RFC 3339), when P-1 gives one. */
export function readOnlyUntil(tenant: TenantStatus | undefined): string | undefined {
  return tenant?.status === 'cancelled' && time(tenant.readOnlyUntil) !== undefined ? tenant.readOnlyUntil : undefined
}

/** How long after a trial converts the welcome (A5) still shows on a device that has not seen it. */
export const UPGRADE_WELCOME_DAYS = 7

/**
 * A trial that converted to paid recently (IAM OM-4: `trial_ends_at` is kept after conversion and
 * `subscription_started_at` is the conversion time; a tenant paid from the start has no trial end).
 */
export function recentlyUpgraded(tenant: TenantStatus | undefined, now: number): boolean {
  const started = time(tenant?.subscriptionStartedAt)
  if (tenant?.trialEndsAt === undefined || started === undefined || tenant.status === 'trial') return false
  return now >= started && now - started < UPGRADE_WELCOME_DAYS * DAY_MS
}
