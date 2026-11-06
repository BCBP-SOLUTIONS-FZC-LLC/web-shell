import { useShellText } from '../../shared/i18n'

/**
 * Without IAM's session context the shell runs with deny-all permissions, so actions are hidden. Say
 * so instead of leaving the user to guess, and offer a reload (the bootstrap loads it again).
 */
export function ContextUnavailable({ onReload }: { onReload: () => void }) {
  const text = useShellText()
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center justify-center gap-3 bg-amber-50 px-4 py-2 text-center font-sans text-sm text-amber-900 shadow"
    >
      <span>{text('app.contextUnavailable')}</span>
      <button
        type="button"
        onClick={onReload}
        className="cursor-pointer rounded border border-amber-300 bg-white px-3 py-1 font-medium text-amber-900"
      >
        {text('common.reload')}
      </button>
    </div>
  )
}
