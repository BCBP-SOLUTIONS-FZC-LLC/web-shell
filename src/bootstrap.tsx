// The shell bootstrap, in the SDK's order (design doc §C2; platform-reactcommon
// examples/shell/src/bootstrap.tsx): core → runtime config → (consent: the SDK's default) → tracing, logging, metrics →
// auth → session context → i18n → remote manifest → render inside <PlatformProvider>, then a
// background retry of a session context that failed. Remotes initialise nothing; they read this
// state through the SDK's hooks.
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { initializeCore } from '@bcbp-solutions-fzc-llc/frontend-sdk/core'
import { loadRuntimeConfig, setRuntimeConfig, type RuntimeConfig } from '@bcbp-solutions-fzc-llc/frontend-sdk/config'
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
import { registerNavigator } from '@bcbp-solutions-fzc-llc/frontend-sdk/nav'
import { installTrustedTypesPolicy } from '@bcbp-solutions-fzc-llc/frontend-sdk/security'
import { installGlobalErrorHandlers } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import App from './App'
import type { SignInUseCases } from './application/signIn'
import { requestPasswordResetUseCase } from './application/use-cases/requestPasswordReset'
import { resolveWorkspaceUseCase } from './application/use-cases/resolveWorkspace'
import { loadSessionContextOnce, sessionContextSource, workspaceResolver } from './platform/iam'
import { passwordResetUrl } from './platform/passwordReset'
import { localStorageRememberedEmail } from './platform/rememberedEmail'
import { shellNavigator } from './platform/navigator'
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
import { createStore, isTransient, retrySessionContext } from './platform/sessionContext'
import { ShellRoot } from './platform/ShellRoot'
// Self-hosted fonts (Fontsource, SIL OFL 1.1): served from /assets/, as the platform CSP requires
// (font-src 'self', style-src 'self').
import '@fontsource-variable/geist'
import '@fontsource-variable/inter'
import './index.css'

/** Where the platform's telemetry goes when the runtime config could not be read (its default). */
const DEFAULT_OTLP_BASE_URL = '/otel'

/**
 * Starts the shell. A failure is reported as an essential error before it reaches index.ts's
 * "unavailable" page, so a broken deploy shows up in the platform's logs, not only in the user's
 * console. It goes to the runtime config's collector once that is read, else the default `/otel`.
 */
export async function bootstrap(): Promise<void> {
  let core = false
  const report = { otlpBaseUrl: DEFAULT_OTLP_BASE_URL }
  const identify = (environment: RuntimeConfig['environment'] & string) => {
    initializeCore({ serviceName: 'web-shell', domain: 'portal', environment, buildVersion: __BUILD_VERSION__ })
    core = true
  }
  try {
    installTrustedTypesPolicy()
    // One build for every environment (SDK alpha.6): the deployed runtime.json names its environment,
    // so the config is loaded before the identity and its `environment` becomes the page's. Until every
    // deployed runtime.json has the key, the build-time environment fills in (then it goes away).
    let cfg: RuntimeConfig
    try {
      cfg = await loadRuntimeConfig()
    } catch (error) {
      // No config means no environment from it: identify with the build-time one, so the failure is
      // still reported (WebShellStartupFailures) before the unavailable page.
      identify(__ENVIRONMENT__)
      throw error
    }
    identify(cfg.environment ?? __ENVIRONMENT__)
    await start(cfg, report)
  } catch (error) {
    // Without core there is no identity to report under; the console still has it (index.ts).
    if (core) reportStartupFailure(error, report.otlpBaseUrl)
    throw error
  }
}

function reportStartupFailure(error: unknown, otlpBaseUrl: string): void {
  try {
    initializeLogging({ otlpBaseUrl, level: 'error' }) // no-op when already started
    getLogger().error('the app could not start', { error })
  } catch {
    // Reporting must never hide the unavailable page.
  }
}

async function start(cfg: RuntimeConfig, report: { otlpBaseUrl: string }): Promise<void> {
  setRuntimeConfig(cfg)
  report.otlpBaseUrl = cfg.telemetry.otlpBaseUrl
  // Consent: the SDK's default grants `essential` only (errors and essential warnings), which is the
  // v1 decision (no analytics consent manager). A consent manager would call setConsentProvider here.

  const { otlpBaseUrl, sampleRatio, logLevel } = cfg.telemetry
  initializeTracing({ otlpBaseUrl, sampleRatio, propagationAllowlist: cfg.api.propagationAllowlist })
  initializeLogging({ otlpBaseUrl, level: logLevel })
  initializeMetrics({ otlpBaseUrl })
  installGlobalErrorHandlers()
  startWebVitals()
  setFlagProvider(runtimeConfigFlagProvider())

  // Composition root: the sign-in use cases, built from infrastructure (PUB-1 port, the reset URL,
  // the remembered email in localStorage, browser navigation) and given to the screens.
  const resolveWorkspace = resolveWorkspaceUseCase(workspaceResolver)
  const signInUseCases: SignInUseCases = {
    resolveWorkspace,
    requestPasswordReset: requestPasswordResetUseCase({
      resolveWorkspace,
      resetUrl: passwordResetUrl,
      open: (url) => window.location.assign(url),
    }),
    rememberedEmail: localStorageRememberedEmail,
  }

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
      const choice = known ? { workspace: known, loginHint: signInUseCases.rememberedEmail.get() } : await askForWorkspace(signInUseCases)
      // returnUrl defaults to the current page in the SDK.
      await idp.login({ workspace: choice.workspace, ...(choice.loginHint ? { loginHint: choice.loginHint } : {}) })
    }
    // After a logout, wait for the user: an automatic login would ride the live SSO session.
    if (session.reason === 'signed-out') showSignedOut(signIn)
    else if (session.reason === 'device-clock') showDeviceClock(signIn)
    else await signIn()
    return
  }

  // A trial login through an invitation that landed in another tenant: never cache it, never render.
  if (isWrongWorkspace(session.workspace, session.user)) {
    showWrongWorkspace(idp, signInUseCases)
    return
  }

  let app: Root | undefined
  // Aborted by a sign-out: stops the session-context retry, and the steps below stop instead of
  // mounting the app for a user who is gone (checked after every await).
  const signedOutDuringBoot = new AbortController()
  const signedOut = () => signedOutDuringBoot.signal.aborted
  idp.subscribe((s) => {
    // Expiry happens only during use. Never redirect on our own; the user clicks "Sign in".
    if (s.status === 'expired') {
      showSessionEnded(s, () =>
        signInAgain({
          idp,
          state: s,
          resolver: workspaceResolver,
          cfg: cfg.auth,
          ask: () => askForWorkspace(signInUseCases).then((c) => c.workspace),
        }),
      )
    }
    // Signed out here or in another tab: unmount so the previous user's data is not left under
    // the dialog on a shared device. The SDK makes the next sign-in ask for credentials.
    if (s.status === 'anonymous' && s.reason === 'signed-out') {
      signedOutDuringBoot.abort()
      app?.unmount()
      app = undefined
      showSignedOut(() => idp.login({ workspace: s.workspace ?? session.workspace }))
    }
  })

  // Roles, plan and flags are not in the token. Without them: deny-all, platform flags only.
  setAuthorizer(roleMapAuthorizer(permissions))
  let firstError: unknown
  const context = createStore(
    await sessionContextSource.load().catch((error: unknown) => {
      firstError = error
      getLogger().warn('session context unavailable', { error })
      return undefined
    }),
  )
  if (signedOut()) return
  const applyContext = () => {
    const c = context.get()
    setAuthzSubject(c && { roles: c.roles, tenantId: c.tenantId })
    if (!c) return
    setFlagProvider(sessionContextFlagProvider(c))
    // Cache the workspace with its slug (trial tokens carry none) and move the URL to /t/<slug>/.
    rememberWorkspace({ ...session.workspace, slug: c.slug })
  }
  applyContext()
  // The user's IAM locale first (P-35), else the browser's languages, else the default.
  await initializeI18n({
    defaultLocale: cfg.i18n.defaultLocale,
    supported: cfg.i18n.supportedLocales,
    detect: () => context.get()?.locale,
  })
  if (signedOut()) return
  await loadManifest().catch((error: unknown) => getLogger().error('manifest load failed', { error }))
  if (signedOut()) return
  startVersionPolling()

  // Route under /t/<slug> only when the URL is there (rememberWorkspace moved it, or the user opened it).
  const routerBasename = () => {
    const slug = slugFromPath(window.location.pathname, cfg.auth)
    return slug ? `${cfg.auth.workspacePathPrefix}${slug}` : undefined
  }
  const shell = {
    user: session.user,
    workspace: session.workspace,
    switchWorkspace: async (identifier: string) => {
      const w = await workspaceResolver.resolve(identifier)
      if (!w) {
        showWorkspaceNotFound()
        return
      }
      await idp.switchWorkspace(w)
    },
    signOut: (o?: { global?: boolean }) => idp.logout(o),
  }
  let basename = routerBasename()
  const render = () => {
    const base = basename
    // A remote's navigate() goes through this router when the path is under its basename.
    const onRouter = (navigate: (to: string, o?: { replace?: boolean }) => void) =>
      registerNavigator(shellNavigator(navigate, base))
    app?.render(
      <StrictMode>
        <ShellRoot context={context} shell={shell}>
          {/* Keyed by the basename: a router whose basename changes is a new router. */}
          <App key={base ?? '/'} {...(base ? { basename: base } : {})} onRouter={onRouter} />
        </ShellRoot>
      </StrictMode>,
    )
  }
  hideScreen()
  app = createRoot(document.getElementById('app')!)
  render()

  // A transient failure (the ApiClient's own rule: online network error, timeout, 429, 502-504) is
  // retried 3 times (1 s, 2 s, 4 s), one request each (loadSessionContextOnce); on success
  // the subject, flags and provider get the context. A sign-out stops the retries. A final answer
  // (401, 403, 404: P-35 missing in this environment) is not asked again.
  if (!context.get() && isTransient(firstError)) {
    const retried = await retrySessionContext(loadSessionContextOnce, {
      signal: signedOutDuringBoot.signal,
      onError: (error, attempt) => getLogger().warn('session context unavailable', { error, attempt }),
    })
    if (retried && !signedOut()) {
      context.set(retried)
      applyContext()
      // rememberWorkspace may have moved the URL under /t/<slug>/: route from there.
      const moved = routerBasename()
      if (moved !== basename) {
        basename = moved
        render()
      }
    }
  }
}
