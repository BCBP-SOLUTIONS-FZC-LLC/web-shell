import { useShellText } from '../../shared/i18n'

/**
 * A newer deployment is live (the bootstrap's startVersionPolling found a new /version.json). Offer
 * the reload instead of forcing it: the user may be mid-task in the remote.
 */
export function UpdateAvailable({ available, onReload }: { available: boolean; onReload: () => void }) {
  const text = useShellText()
  if (!available) return null
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-40 flex flex-wrap items-center justify-center gap-3 bg-[#1a1030] px-4 py-2 text-center font-sans text-sm text-white shadow"
    >
      <span>{text('app.updateAvailable')}</span>
      <button
        type="button"
        onClick={onReload}
        className="cursor-pointer rounded border border-white/30 bg-white px-3 py-1 font-medium text-[#1a1030]"
      >
        {text('common.reload')}
      </button>
    </div>
  )
}
