// The signed-in shell. The bootstrap renders this only with an authenticated session, so there is
// no signed-out route here: sign-in screens are mounted by the bootstrap outside this tree.
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RemoteBoundary, useRouteTemplate } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'

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
 * Routes under /t/<slug>/ once the workspace has a slug (the SDK moves the URL there after
 * sign-in, from the session context); otherwise from the site root.
 */
export default function App({ basename }: { basename?: string }) {
  return (
    <BrowserRouter {...(basename ? { basename } : {})}>
      <Routes>
        <Route path="/dashboard/*" element={<Dashboard />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
