import { shellDate, useShellText } from '../../shared/i18n'

/**
 * The workspace is read-only (P-35 `read_only`, e.g. a cancelled subscription in its grace period, or a
 * DENY_TENANT_READ_ONLY answer seen on this page): say so for the whole page, so a disabled or refused
 * action is not a surprise (IAM screen spec §7.10). The remotes disable their own actions; this only
 * tells the user why. No action: nothing the user does here changes it. `until` (RFC 3339, IAM P-1
 * `read_only_until`) is when the grace ends and the workspace is suspended; shown when known.
 */
export function ReadOnlyNotice({ until }: { until?: string | undefined } = {}) {
  const text = useShellText()
  return (
    <div role="status" className="bg-slate-800 px-4 py-2 text-center font-sans text-sm text-white shadow">
      {until ? text('app.readOnlyUntil', { date: shellDate(until) }) : text('app.readOnly')}
    </div>
  )
}
