type DashboardAppProps = {
  userLabel?: string
  onLogout?: () => void
}

export default function DashboardApp({ userLabel, onLogout }: DashboardAppProps) {
  if ((globalThis as { __DASHBOARD_THROW__?: boolean }).__DASHBOARD_THROW__) {
    throw new Error('dashboard remote failed')
  }

  return (
    <div>
      <p>Remote dashboard</p>
      <p>{userLabel}</p>
      <button type="button" onClick={onLogout}>
        Log out
      </button>
    </div>
  )
}
