// Which workspace banners to show (IAM screen spec §5.5, §5.6), from P-1 and P-27, and who sees them.
// UI hints only, like the role map: the audience comes from the UI permissions, never more than IAM
// allows. "Settings still applying" (`realm_sync_pending`) belongs to the SSO settings screen (E6) in
// mfe-admin, not to the shell.
import type { SeatUsage, TenantStatus } from '../repositories/workspaceStatus'

export type WorkspaceBanner =
  /**
   * Everyone, while the trial runs. `days` is the days left, rounded to the nearest day (a new 14-day
   * trial reads 14), and 0 only in the last 24 hours ("within a day"), so it never shows 0 too early.
   */
  | { kind: 'trial'; days: number }
  /** Everyone: the trial end has passed and IAM has not moved the tenant on yet (still `trial`). */
  | { kind: 'trial-ended' }
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

/** Days left for `remaining` ms (> 0): the nearest whole day, at least 1, and 0 under 24 hours. */
function trialDays(remaining: number): number {
  return remaining < DAY_MS ? 0 : Math.max(1, Math.round(remaining / DAY_MS))
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
    banners.push(trialEnd <= now ? { kind: 'trial-ended' } : { kind: 'trial', days: trialDays(trialEnd - now) })
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
/** How far behind IAM's clock the device's may be and still see the welcome (the SDK's device-clock tolerance). */
export const CLOCK_SKEW_MS = 10 * 60_000

/**
 * A trial that converted to paid recently (IAM OM-4: `trial_ends_at` is kept after conversion and
 * `subscription_started_at` is the conversion time; a tenant paid from the start has no trial end).
 */
export function recentlyUpgraded(tenant: TenantStatus | undefined, now: number): boolean {
  const started = time(tenant?.subscriptionStartedAt)
  // Only while it is on a paid plan (`active`, or `past_due` while the payment is retried): never for a
  // workspace cancelled since, nor one still in its trial.
  if (tenant?.trialEndsAt === undefined || started === undefined || (tenant.status !== 'active' && tenant.status !== 'past_due')) return false
  // The device's clock against IAM's: up to CLOCK_SKEW_MS slow still counts the conversion as begun, so the
  // first load after it (seconds later) welcomes the owner even on a device a little behind.
  return now >= started - CLOCK_SKEW_MS && now - started < UPGRADE_WELCOME_DAYS * DAY_MS
}
