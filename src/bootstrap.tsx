// The shell bootstrap, in the SDK's order (design doc §C2; platform-reactcommon
// examples/shell/src/bootstrap.tsx): core → runtime config → consent → tracing, logging, metrics →
// auth → session context → i18n → remote manifest → render inside <PlatformProvider>.
// Remotes initialise nothing; they read this state through the SDK's hooks.
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { initializeCore, setConsentProvider } from '@bcbp-solutions-fzc-llc/frontend-sdk/core'
import { loadRuntimeConfig, setRuntimeConfig } from '@bcbp-solutions-fzc-llc/frontend-sdk/config'
import { initializeTracing } from '@bcbp-solutions-fzc-llc/frontend-sdk/tracing'
import { getLogger, initializeLogging } from '@bcbp-solutions-fzc-llc/frontend-sdk/logging'
import { initializeMetrics, startWebVitals } from '@bcbp-solutions-fzc-llc/frontend-sdk/metrics'
import {
  runtimeConfigFlagProvider,
  sessionContextFlagProvider,
  setFlagProvider,
} from '@bcbp-solutions-fzc-llc/frontend-sdk/flags'
import {
  chooseWorkspace,
  createOidcProvider,
  initializeAuth,
  isWrongWorkspace,
  rememberWorkspace,
  signInAgain,
  slugFromPath,
  type Workspace,
} from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import { setTokenSource } from '@bcbp-solutions-fzc-llc/frontend-sdk/http'
import { roleMapAuthorizer, setAuthorizer, setAuthzSubject } from '@bcbp-solutions-fzc-llc/frontend-sdk/authz'
import { initializeI18n } from '@bcbp-solutions-fzc-llc/frontend-sdk/i18n'
import { loadManifest, startVersionPolling } from '@bcbp-solutions-fzc-llc/frontend-sdk/mfe'
import { installTrustedTypesPolicy } from '@bcbp-solutions-fzc-llc/frontend-sdk/security'
import { installGlobalErrorHandlers, PlatformProvider } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import App from './App'
import { getRememberedEmail } from './pages/rememberEmail'
import { cmp } from './platform/consent'
import { sessionContextSource, workspaceResolver } from './platform/iam'
import { permissions } from './platform/permissions'
import {
  askForWorkspace,
  showDeviceClock,
  showSessionEnded,
  showSignedOut,
  showWorkspaceNotFound,
  showWrongWorkspace,
} from './platform/SessionScreens'
import { hideScreen } from './platform/screen'
import './index.css'

const returnUrl = () => window.location.pathname + window.location.search

export async function bootstrap(): Promise<void> {
  installTrustedTypesPolicy()
  initializeCore({
    serviceName: 'web-shell',
    domain: 'portal',
    environment: __ENVIRONMENT__,
    buildVersion: __BUILD_VERSION__,
  })

  const cfg = await loadRuntimeConfig()
  setRuntimeConfig(cfg)
  setConsentProvider(cmp)

  const { otlpBaseUrl, sampleRatio, logLevel } = cfg.telemetry
  initializeTracing({ otlpBaseUrl, sampleRatio, propagationAllowlist: cfg.api.propagationAllowlist })
  initializeLogging({ otlpBaseUrl, level: logLevel })
  initializeMetrics({ otlpBaseUrl })
  installGlobalErrorHandlers()
  startWebVitals()
  setFlagProvider(runtimeConfigFlagProvider())

  const idp = createOidcProvider(cfg.auth, workspaceResolver)
  setTokenSource(initializeAuth(idp))
  // May redirect once with prompt=none on a reload or a new tab, and then never settles.
  const session = await idp.init()

  if (session.status === 'anonymous') {
    // init() has already moved the URL off the callback path to the page the user opened.
    const signIn = async () => {
      // A failed silent attempt names its workspace; otherwise /t/<slug> → cached or resolved
      // workspace, else the most recent cached one, else ask for the email.
      const known: Workspace | undefined =
        (session.reason === 'login-required' ? session.workspace : undefined) ??
        (await chooseWorkspace({ pathname: window.location.pathname, resolver: workspaceResolver, cfg: cfg.auth }))
      const choice = known ? { workspace: known, loginHint: getRememberedEmail() } : await askForWorkspace()
      await idp.login({
        workspace: choice.workspace,
        returnUrl: returnUrl(),
        ...(choice.loginHint ? { loginHint: choice.loginHint } : {}),
      })
    }
    // After a logout, wait for the user: an automatic login would ride the live SSO session.
    if (session.reason === 'signed-out') showSignedOut(signIn)
    else if (session.reason === 'device-clock') showDeviceClock(signIn)
    else await signIn()
    return
  }

  // A trial login through an invitation that landed in another tenant: never cache it, never render.
  if (isWrongWorkspace(session.workspace, session.user)) {
    showWrongWorkspace(idp)
    return
  }

  let app: Root | undefined
  idp.subscribe((s) => {
    // Expiry happens only during use. Never redirect on our own; the user clicks "Sign in".
    if (s.status === 'expired') {
      showSessionEnded(s, () =>
        signInAgain({
          idp,
          state: s,
          resolver: workspaceResolver,
          cfg: cfg.auth,
          ask: () => askForWorkspace().then((c) => c.workspace),
        }),
      )
    }
    // Signed out here or in another tab: unmount so the previous user's data is not left under
    // the dialog on a shared device. The next sign-in asks for credentials (prompt=login).
    if (s.status === 'anonymous' && s.reason === 'signed-out') {
      app?.unmount()
      app = undefined
      showSignedOut(() =>
        idp.login({ workspace: s.workspace ?? session.workspace, returnUrl: returnUrl(), prompt: 'login' }),
      )
    }
  })

  // Roles, plan and flags are not in the token. Without them: deny-all, platform flags only.
  const context = await sessionContextSource.load().catch((error: unknown) => {
    getLogger().warn('session context unavailable', { error })
    return undefined
  })
  setAuthorizer(roleMapAuthorizer(permissions))
  setAuthzSubject(context && { roles: context.roles, tenantId: context.tenantId })
  if (context) {
    setFlagProvider(sessionContextFlagProvider(context))
    // Cache the workspace with its slug (trial tokens carry none) and move the URL to /t/<slug>/.
    rememberWorkspace({ ...session.workspace, slug: context.slug })
  }
  await initializeI18n({ defaultLocale: cfg.i18n.defaultLocale, supported: cfg.i18n.supportedLocales })
  await loadManifest().catch((error: unknown) => getLogger().error('manifest load failed', { error }))
  startVersionPolling()

  // Route under /t/<slug> only when the URL is there (rememberWorkspace moved it, or the user opened it).
  const slug = slugFromPath(window.location.pathname, cfg.auth)
  const basename = slug ? `${cfg.auth.workspacePathPrefix}${slug}` : undefined
  hideScreen()
  app = createRoot(document.getElementById('app')!)
  app.render(
    <StrictMode>
      <PlatformProvider
        shell={{
          user: session.user,
          workspace: session.workspace,
          context,
          locale: document.documentElement.lang,
          switchWorkspace: async (identifier) => {
            const w = await workspaceResolver.resolve(identifier)
            if (!w) {
              showWorkspaceNotFound()
              return
            }
            await idp.switchWorkspace(w)
          },
          signOut: (o) => idp.logout(o),
        }}
      >
        <App {...(basename ? { basename } : {})} />
      </PlatformProvider>
    </StrictMode>,
  )
}
