// The signed-in shell. The bootstrap renders this only with an authenticated session, so there is
// no signed-out route here: sign-in screens are mounted by the bootstrap outside this tree.
import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom'
import {
  RemoteBoundary,
  useAppUpdate,
  useRouteTemplate,
  useSessionContext,
} from '@bcbp-solutions-fzc-llc/frontend-sdk/react'

/** The remote that renders the dashboard, as named in /remotes/manifest.json. */
export const DASHBOARD_REMOTE = 'app2'

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
  return <RemoteBoundary remote={DASHBOARD_REMOTE} module="./App" fallback={<Loading>Loading dashboard…</Loading>} />
}

/**
 * Without IAM's session context the shell runs with deny-all permissions, so actions are hidden. Say
 * so instead of leaving the user to guess, and offer a reload (the bootstrap loads it again).
 */
function ContextUnavailable() {
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center justify-center gap-3 bg-amber-50 px-4 py-2 text-center font-sans text-sm text-amber-900 shadow"
    >
      <span>We couldn't load your permissions, so some actions are hidden.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="cursor-pointer rounded border border-amber-300 bg-white px-3 py-1 font-medium text-amber-900"
      >
        Reload
      </button>
    </div>
  )
}

/**
 * A newer deployment is live (the bootstrap's startVersionPolling found a new /version.json). Offer
 * the reload instead of forcing it: the user may be mid-task in the remote.
 */
function UpdateAvailable() {
  const update = useAppUpdate()
  if (!update.available) return null
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-40 flex flex-wrap items-center justify-center gap-3 bg-[#1a1030] px-4 py-2 text-center font-sans text-sm text-white shadow"
    >
      <span>A new version is available.</span>
      <button
        type="button"
        onClick={() => update.reload()}
        className="cursor-pointer rounded border border-white/30 bg-white px-3 py-1 font-medium text-[#1a1030]"
      >
        Reload
      </button>
    </div>
  )
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
  return (
    <BrowserRouter {...(basename ? { basename } : {})}>
      {onRouter ? <RouterBridge onRouter={onRouter} /> : null}
      <UpdateAvailable />
      {context ? null : <ContextUnavailable />}
      <Routes>
        <Route path="/dashboard/*" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
