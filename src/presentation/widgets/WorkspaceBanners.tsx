import { useShellText, type ShellKey } from '../../shared/i18n'

/** One banner (the domain's WorkspaceBanner, by shape: widgets take their state as props). */
export type BannerProps = { kind: 'trial'; days: number } | { kind: 'past-due' } | { kind: 'seats-full'; seats: number } | { kind: 'ownerless' }

function trialKey(days: number): ShellKey {
  return days === 0 ? 'app.banner.trialEndsToday' : days === 1 ? 'app.banner.trialOneDay' : 'app.banner.trialDays'
}

/**
 * The workspace's state from IAM (spec §5.6): trial days left, a payment problem (owner), all seats
 * used (owner, tenant admin), no owner (tenant admin). Information only: the actions they point to
 * live in the remotes or with support, so none is a button here.
 */
export function WorkspaceBanners({ banners }: { banners: readonly BannerProps[] }) {
  const text = useShellText()
  return (
    <>
      {banners.map((b) => (
        <div key={b.kind} role="status" className="bg-indigo-50 px-4 py-2 text-center font-sans text-sm text-indigo-950 shadow">
          {b.kind === 'trial'
            ? text(trialKey(b.days), { days: b.days })
            : b.kind === 'past-due'
              ? text('app.banner.pastDue')
              : b.kind === 'seats-full'
                ? text('app.banner.seatsFull', { seats: b.seats })
                : text('app.banner.ownerless')}
        </div>
      ))}
    </>
  )
}
