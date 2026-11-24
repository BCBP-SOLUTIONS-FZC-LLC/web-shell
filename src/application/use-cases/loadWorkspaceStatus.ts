// The workspace banners' data (IAM P-1, and P-27 for those who may manage members), loaded in the
// background after the app renders. A failure only means no banners: it is reported and skipped.
import type { SeatUsage, TenantStatus, WorkspaceStatusSource } from '../../domain/repositories/workspaceStatus'

export interface WorkspaceStatus {
  tenant?: TenantStatus
  seats?: SeatUsage
}

export async function loadWorkspaceStatus(
  source: WorkspaceStatusSource,
  tenantId: string,
  o: { seats: boolean; signal?: AbortSignal; onError?: (e: unknown, what: 'tenant' | 'seats') => void },
): Promise<WorkspaceStatus> {
  const settle = <T>(p: Promise<T>, what: 'tenant' | 'seats') =>
    p.catch((e: unknown) => {
      // Aborted by a sign-out: not a failure worth reporting.
      if (!o.signal?.aborted) o.onError?.(e, what)
      return undefined
    })
  const [tenant, seats] = await Promise.all([
    settle(source.tenant(tenantId, o.signal), 'tenant'),
    o.seats ? settle(source.seatUsage(tenantId, o.signal), 'seats') : undefined,
  ])
  return { ...(tenant ? { tenant } : {}), ...(seats ? { seats } : {}) }
}
