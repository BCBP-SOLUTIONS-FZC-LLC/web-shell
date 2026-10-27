import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import {
  getAuthenticatedUserLabel,
  getOAuthSession,
  hasOAuthCallbackInUrl,
  initKeycloak,
  isOAuthCallbackInProgress,
  keycloakLogout,
} from './auth/keycloak'
import { isKeycloakConfigured } from './auth/keycloak.config'
import LoginPage from './pages/LoginPage'

const DashboardApp = lazy(() => import('app2/App'))

type DashboardBoundaryState = { failed: boolean }

class DashboardBoundary extends Component<{ children: ReactNode }, DashboardBoundaryState> {
  state: DashboardBoundaryState = { failed: false }

  static getDerivedStateFromError(): DashboardBoundaryState {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-dvh items-center justify-center bg-[#030d1b] px-6 text-center font-sans text-white/80">
          Dashboard could not be loaded. Start mfe-dashboard on port 5002, then refresh this page.
        </div>
      )
    }
    return this.props.children
  }
}

function AuthenticatedDashboard() {
  return (
    <DashboardBoundary>
      <Suspense
        fallback={
          <div className="flex min-h-dvh items-center justify-center bg-[#030d1b] font-sans text-white/80">
            Loading dashboard…
          </div>
        }
      >
        <DashboardApp userLabel={getAuthenticatedUserLabel()} onLogout={() => keycloakLogout()} />
      </Suspense>
    </DashboardBoundary>
  )
}

export default function App() {
  const [authReady, setAuthReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const authBootstrapId = useRef(0)

  useEffect(() => {
    const runId = ++authBootstrapId.current

    async function bootstrapAuth() {
      if (!isKeycloakConfigured()) {
        if (runId === authBootstrapId.current) {
          setAuthenticated(false)
          setAuthReady(true)
        }
        return
      }

      const hasSession = Boolean(getOAuthSession()?.accessToken)

      if (!hasOAuthCallbackInUrl() && !hasSession && !isOAuthCallbackInProgress()) {
        if (runId === authBootstrapId.current) {
          setAuthenticated(false)
          setAuthReady(true)
        }
        return
      }

      try {
        const isAuthenticated = await initKeycloak()
        const sessionOk = isAuthenticated || Boolean(getOAuthSession()?.accessToken)
        if (runId === authBootstrapId.current) {
          setAuthenticated(sessionOk)
          if (sessionOk) {
            setAuthError(null)
          }
        }
      } catch (error) {
        if (runId === authBootstrapId.current) {
          setAuthenticated(false)
          setAuthError(
            error instanceof Error ? error.message : 'Failed to complete Keycloak sign-in.',
          )
        }
      } finally {
        if (runId === authBootstrapId.current) {
          setAuthReady(true)
        }
      }
    }

    void bootstrapAuth()
  }, [])

  const completingSignIn =
    !authReady && (hasOAuthCallbackInUrl() || isOAuthCallbackInProgress())

  if (!authReady) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#030d1b] font-sans text-white/80">
        {completingSignIn ? 'Completing sign-in…' : 'Loading…'}
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/dashboard/*"
          element={
            authenticated ? (
              <AuthenticatedDashboard />
            ) : (
              <LoginPage authCallbackError={authError} onDismissAuthError={() => setAuthError(null)} />
            )
          }
        />
        <Route
          path="/"
          element={
            authenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginPage authCallbackError={authError} onDismissAuthError={() => setAuthError(null)} />
            )
          }
        />
        <Route path="*" element={<Navigate to={authenticated ? '/dashboard' : '/'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
