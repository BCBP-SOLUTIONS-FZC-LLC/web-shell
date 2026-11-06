// The signed-in shell. The bootstrap renders this only with an authenticated session, so there is
// no signed-out route here: sign-in screens are mounted by the bootstrap outside this tree.
import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom'
import {
  MFEErrorBoundary,
  RemoteBoundary,
  useAppUpdate,
  useRouteTemplate,
  useSessionContext,
} from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useShellText } from '../../shared/i18n'
import { AppError } from '../../presentation/widgets/AppError'
import { ContextUnavailable } from '../../presentation/widgets/ContextUnavailable'
import { UpdateAvailable } from '../../presentation/widgets/UpdateAvailable'

/** The remote that renders the dashboard, as named in /remotes/manifest.json. */
export const DASHBOARD_REMOTE = 'dashboard'

/** The shell's own name in error logs and web-error metrics (the dashboard reports as `dashboard`). */
export const SHELL_MFE = 'web-shell'

function Loading({ children }: { children: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#030d1b] font-sans text-white/80">
      {children}
    </div>
  )
}

/**
 * The dashboard remote reads the signed-in user and sign-out itself (useCurrentUser, useSignOut)
 * from the SDK this shell provides, so it gets no props.
 */
function Dashboard() {
  useRouteTemplate('/t/:slug/dashboard')
  const text = useShellText()
  return <RemoteBoundary remote={DASHBOARD_REMOTE} module="./App" fallback={<Loading>{text('app.loadingDashboard')}</Loading>} />
}

/** The update notice, with the SDK's update state (presentation takes it as props). */
function Update() {
  const update = useAppUpdate()
  return <UpdateAvailable available={update.available} onReload={() => update.reload()} />
}

/** Hands the router's navigate to the bootstrap, which registers it as the SDK's navigator. */
function RouterBridge({ onRouter }: { onRouter: (navigate: NavigateFunction) => void }) {
  const navigate = useNavigate()
  useEffect(() => onRouter(navigate), [navigate, onRouter])
  return null
}

/**
 * Routes under /t/<slug>/ once the workspace has a slug (the SDK moves the URL there after
 * sign-in, from the session context); otherwise from the site root.
 */
export default function App({
  basename,
  onRouter,
}: {
  basename?: string
  onRouter?: (navigate: NavigateFunction) => void
}) {
  const context = useSessionContext()
  // The shell's own screens in an error boundary (the SDK's): a render error is logged and counted
  // under `web-shell` and replaced by AppError instead of a blank page. The remote has its own
  // (RemoteBoundary), so a dashboard error never reaches this one.
  return (
    <MFEErrorBoundary mfe={SHELL_MFE} fallback={(e) => <AppError reference={e.traceId ?? e.requestId} onRetry={e.retry} />}>
      <BrowserRouter {...(basename ? { basename } : {})}>
        {onRouter ? <RouterBridge onRouter={onRouter} /> : null}
        <Update />
        {context ? null : <ContextUnavailable onReload={() => window.location.reload()} />}
        <Routes>
          <Route path="/dashboard/*" element={<Dashboard />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </MFEErrorBoundary>
  )
}
