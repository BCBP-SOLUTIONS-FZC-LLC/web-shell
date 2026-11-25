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
  type SessionContext,
  type Workspace,
} from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import { setTokenSource } from '@bcbp-solutions-fzc-llc/frontend-sdk/http'
import { hasPermission, roleMapAuthorizer, setAuthorizer, setAuthzSubject } from '@bcbp-solutions-fzc-llc/frontend-sdk/authz'
import { initializeI18n } from '@bcbp-solutions-fzc-llc/frontend-sdk/i18n'
import { loadManifest, startVersionPolling } from '@bcbp-solutions-fzc-llc/frontend-sdk/mfe'
import { registerNavigator } from '@bcbp-solutions-fzc-llc/frontend-sdk/nav'
import { installTrustedTypesPolicy } from '@bcbp-solutions-fzc-llc/frontend-sdk/security'
import { installGlobalErrorHandlers } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import App, { type AppNotices } from '../routes/App'
import type { SignInUseCases } from '../../application/signIn'
import { requestPasswordResetUseCase } from '../../application/use-cases/requestPasswordReset'
import { resolveWorkspaceUseCase } from '../../application/use-cases/resolveWorkspace'
import { isEmailIdentifier, toIdentifier } from '../../domain/rules/identifier'
import { loadSessionContextOnce, sessionContextSource, workspaceResolver, workspaceStatusSource } from '../../infrastructure/api/iam'
import { upgradeWelcomeStorage } from '../../infrastructure/storage/upgradeWelcome'
import { loadWorkspaceStatus } from '../../application/use-cases/loadWorkspaceStatus'
import { readOnlyUntil, recentlyUpgraded, workspaceBanners } from '../../domain/rules/workspaceBanners'
import { passwordResetUrl } from '../../infrastructure/auth/passwordReset'
import { localStorageRememberedEmail } from '../../infrastructure/storage/rememberedEmail'
import { shellNavigator } from '../../infrastructure/federation/navigator'
import { permissions } from '../../domain/rules/permissions'
import {
  askForWorkspace,
  showDeviceClock,
  showSessionEnded,
  showSignedOut,
  showUpgradeWelcome,
  showWorkspaceNotFound,
  showWorkspaceLoadFailed,
  showWorkspaceLoading,
  showWorkspaceUnavailable,
  showWrongWorkspace,
} from '../layouts/sessionScreens'
import { hideScreen, isScreenShown } from '../layouts/screen'
import {
  blockedWorkspace,
  createStore,
  isTransient,
  refusalIsReasked,
  retrySessionContext,
  settleRefusal,
} from '../../application/use-cases/loadSessionContext'
import { ShellRoot } from '../providers/ShellRoot'
import { registerShellMessages } from '../../infrastructure/i18n/shellMessages'
// Self-hosted fonts (Fontsource, SIL OFL 1.1): served from /assets/, as the platform CSP requires
// (font-src 'self', style-src 'self').
import '@fontsource-variable/geist'
import '@fontsource-variable/inter'
import '../../shared/ui/index.css'

/**
 * A trial workspace that nothing can check after sign-in: no slug to compare with P-35's, and no tenant
 * id hint for isWrongWorkspace. The shared trial realm's SSO session could be another user's.
 */
function uncheckable(w: Workspace): boolean {
  return w.trial && w.slug === undefined && w.tenantIdHint === undefined
}

/** `prompt: 'login'` for a workspace nothing can check after sign-in (`uncheckable`), else nothing. */
function credentialsFor(w: Workspace): { prompt?: 'login' } {
  return uncheckable(w) ? { prompt: 'login' } : {}
}

/** How often the banners are worked out again from the loaded P-1 and P-27 (the trial's days left). */
const BANNER_REFRESH_MS = 3_600_000
/**
 * The session context (P-35) is asked again when the page gets focus, at most this often, so a role or
 * plan change made elsewhere (another tab, another admin) reaches the hints without a reload.
 */
export const CONTEXT_REFRESH_MS = 60_000

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
  // The shell's text, loaded before the first screen (initializeI18n, after sign-in, picks the locale).
  await registerShellMessages(cfg.i18n.defaultLocale)

  // Composition root: the sign-in use cases, built from infrastructure (PUB-1 port, the reset URL,
  // the remembered email in localStorage, browser navigation) and given to the screens.
  const resolveWorkspace = resolveWorkspaceUseCase(workspaceResolver, { slugFromPath: (pathname) => slugFromPath(pathname, cfg.auth) })
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
      // A failed silent attempt names its workspace (a trial one re-checked with PUB-1). Without one, PUB-1
      // no longer knows it (the SDK dropped it): ask for the email, never another cached workspace (SDK
      // alpha.7 SessionState). Otherwise /t/<slug> → cached or resolved workspace, else the most recent
      // cached one, else ask for the email.
      const known: Workspace | undefined =
        session.reason === 'login-required'
          ? session.workspace
          : await chooseWorkspace({ pathname: window.location.pathname, resolver: workspaceResolver, cfg: cfg.auth })
      // The remembered value may be a workspace name: only an email becomes login_hint.
      const remembered = signInUseCases.rememberedEmail.get()
      const choice = known
        ? { workspace: known, ...(isEmailIdentifier(remembered) ? { loginHint: remembered } : {}) }
        : await askForWorkspace(signInUseCases)
      // returnUrl defaults to the current page in the SDK.
      await idp.login({
        workspace: choice.workspace,
        ...(choice.loginHint ? { loginHint: choice.loginHint } : {}),
        // A trial workspace with neither a slug nor a tenant id hint (an invitation email, if IAM drops the
        // hint: OQ-10) cannot be checked after sign-in: credentials, never another user's live SSO session.
        // Every other way in does the same: signInAgain (its `prompt` callback) and a remote's switch.
        ...credentialsFor(choice.workspace),
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
    showWrongWorkspace(idp, signInUseCases)
    return
  }

  let app: Root | undefined
  // Aborted by a sign-out: stops the session-context retry, and the steps below stop instead of
  // mounting the app for a user who is gone (checked after every await).
  const signedOutDuringBoot = new AbortController()
  const signedOut = () => signedOutDuringBoot.signal.aborted
  // Set once the session expired during use: "Session ended" is up and nothing may replace it.
  let expired = false
  // Set once a refusal screen replaced the app or the boot (A6/A8, wrong workspace, not loaded): it stays.
  let refused = false
  const refuse = (show: () => void) => {
    refused = true
    show()
  }
  // The boot steps stop on any of them: nothing may mount, cover the screen that is up, or keep working
  // for an app that is gone (the hourly banner refresh).
  const stopped = () => signedOut() || expired || refused
  idp.subscribe((s) => {
    // Expiry happens only during use. Never redirect on our own; the user clicks "Sign in".
    // A refusal screen stays: "Session ended" over it would sign in again to the same session (a foreign
    // trial one, say), and the screen's own Sign out and Switch already ask for credentials.
    if (s.status === 'expired' && !refused) {
      expired = true
      showSessionEnded(s, () =>
        signInAgain({
          idp,
          state: s,
          prompt: (w) => credentialsFor(w).prompt,
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
  if (stopped()) return
  // IAM refuses this user the workspace (trial ended, suspended, access paused, not a member): the app
  // is never rendered and the shell remembers nothing (no rememberWorkspace, no /t/<slug>/ move); sign
  // out or switch. A membership refusal is asked once more first: IAM's caches may lag a change.
  if (firstError !== undefined) {
    // A membership refusal's second ask waits 5 s: say so, without anything of the session. A tenant state
    // settles at once, so its screen comes with no loading screen before it.
    if (refusalIsReasked(firstError)) showWorkspaceLoading()
    const settled = await settleRefusal(firstError, loadSessionContextOnce, { signal: signedOutDuringBoot.signal })
    if (stopped()) return
    if ('block' in settled) {
      refuse(() => showWorkspaceUnavailable(settled.block, idp, signInUseCases))
      return
    }
    if ('context' in settled) context.set(settled.context)
    else firstError = settled.error
  }
  // A transient failure (the ApiClient's own rule: online network error, timeout, 429, 502-504) is
  // retried 3 times (1 s, 2 s, 4 s), one request each (loadSessionContextOnce). A sign-out stops the
  // retries. A final answer (401, 403, 404: P-35 missing in this environment) is not asked again, except
  // on a trial's check (`anyFailure`: offline, 500 and 404 too). A retry answered with a workspace state
  // (A6/A8) ends the retries and is returned as `refusal`.
  const retryContext = async (anyFailure = false, signal = signedOutDuringBoot.signal) => {
    let refusal: unknown
    const retried = await retrySessionContext(loadSessionContextOnce, {
      signal,
      ...(anyFailure ? { retryable: (e: unknown) => blockedWorkspace(e) === undefined } : {}),
      onError: (error, attempt) => {
        getLogger().warn('session context unavailable', { error, attempt })
        if (blockedWorkspace(error)) refusal = error
      },
    })
    return { retried, refusal }
  }
  // A trial session is checked against the workspace it was for (SDK alpha.7): every trial tenant shares
  // one realm, so a silent restore can ride another trial tenant's SSO session, and a cached entry has no
  // tenantIdHint for isWrongWorkspace. So P-35 (its slug) is awaited before anything mounts: nothing of
  // a possibly foreign session shows. Only a trial with a slug can be checked; the other sessions'
  // P-35 is retried in the background, after the render.
  const w = session.workspace
  if (w.trial && w.slug !== undefined) {
    if (!context.get()) {
      showWorkspaceLoading()
      // Every failure but a workspace state is retried first: without P-35 the app never renders here.
      const tried = await retryContext(true)
      let { retried } = tried
      if (stopped()) return
      // Settled like the first load's refusal: a membership refusal is asked once more after 5 s.
      if (tried.refusal !== undefined) {
        const settled = await settleRefusal(tried.refusal, loadSessionContextOnce, { signal: signedOutDuringBoot.signal })
        if (stopped()) return
        if ('block' in settled) {
          refuse(() => showWorkspaceUnavailable(settled.block, idp, signInUseCases))
          return
        }
        if ('context' in settled) retried = settled.context
        else {
          // The second ask failed otherwise (a 503, say): retried like every other failure here, as the first
          // load's would be. A refusal now has been asked twice: it is final.
          const again = await retryContext(true)
          if (stopped()) return
          const block = blockedWorkspace(again.refusal)
          if (block) {
            refuse(() => showWorkspaceUnavailable(block, idp, signInUseCases))
            return
          }
          retried = again.retried
        }
      }
      // Unchecked: never the app. Sign out, switch, or try again (a reload).
      if (!retried) {
        refuse(() => showWorkspaceLoadFailed(idp, signInUseCases))
        return
      }
      context.set(retried)
    }
    // A mismatch caches nothing (no rememberWorkspace) and keeps the URL.
    if (context.get()!.slug !== w.slug) {
      refuse(() => showWrongWorkspace(idp, signInUseCases))
      return
    }
  }
  const applyContext = () => {
    const c = context.get()
    setAuthzSubject(c && { roles: c.roles, tenantId: c.tenantId })
    if (!c) return
    setFlagProvider(sessionContextFlagProvider(c))
    // Cache the workspace with its slug (trial tokens carry none) and move the URL to /t/<slug>/.
    rememberWorkspace({ ...w, slug: c.slug })
  }
  applyContext()
  // The user's IAM locale first (P-35), else the browser's languages, else the default.
  await initializeI18n({
    defaultLocale: cfg.i18n.defaultLocale,
    supported: cfg.i18n.supportedLocales,
    detect: () => context.get()?.locale,
  })
  if (stopped()) return
  await loadManifest().catch((error: unknown) => getLogger().error('manifest load failed', { error }))
  if (stopped()) return
  startVersionPolling()

  // Route under /t/<slug> only when the URL is there (rememberWorkspace moved it, or the user opened it).
  const routerBasename = () => {
    const slug = slugFromPath(window.location.pathname, cfg.auth)
    return slug ? `${cfg.auth.workspacePathPrefix}${slug}` : undefined
  }
  const shell = {
    user: session.user,
    workspace: session.workspace,
    // What a remote passes is cleaned up as the sign-in box's input is (a name lower-cased, a URL's slug),
    // so a trial slug compares equal to P-35's after the switch. Only "not found" (or an identifier that
    // names no workspace) shows that dialog; PUB-1 unreachable or rate-limited rejects, so the remote can
    // offer a retry.
    // After a sign-out, an expiry or a refusal it does nothing: "Session ended" or the refusal screen stays.
    switchWorkspace: async (identifier: string) => {
      if (stopped()) return
      const id = toIdentifier(identifier, (pathname) => slugFromPath(pathname, cfg.auth))
      const target = id === undefined ? undefined : await workspaceResolver.resolve(id)
      if (stopped()) return
      if (!target) {
        showWorkspaceNotFound()
        return
      }
      await idp.switchWorkspace(target, credentialsFor(target))
    },
    signOut: (o?: { global?: boolean }) => idp.logout(o),
  }
  // The workspace banners and the read-only grace date (IAM P-1, P-27 for owners and tenant admins),
  // loaded once in the background when the context is known: a failure only means no banners.
  const notices = createStore<AppNotices>({ banners: [] })
  let noticesRequested = false
  const loadNotices = async () => {
    const c = context.get()
    if (!c || noticesRequested) return
    noticesRequested = true
    const who = { owner: hasPermission('manage', 'tenant-settings'), manager: hasPermission('manage', 'members') }
    const status = await loadWorkspaceStatus(workspaceStatusSource, c.tenantId, {
      seats: who.manager,
      signal: signedOutDuringBoot.signal,
      onError: (error, what) => getLogger().warn('workspace status unavailable', { error, what }),
    })
    if (stopped()) return
    const now = Date.now()
    const until = readOnlyUntil(status.tenant)
    const show = (at: number) =>
      notices.set({ banners: workspaceBanners(status.tenant, status.seats, who, at), ...(until ? { readOnlyUntil: until } : {}) })
    show(now)
    // The trial's days left move with the clock: worked out again every hour while the page is open
    // (P-1 is not asked again), until a sign-out or an expiry.
    const refresh = setInterval(() => (stopped() ? clearInterval(refresh) : show(Date.now())), BANNER_REFRESH_MS)
    signedOutDuringBoot.signal.addEventListener('abort', () => clearInterval(refresh), { once: true })
    // A trial that just converted (A5): welcome the user once on this device.
    // Never over another screen (session ended, workspace not found) or after the session expired:
    // the welcome's Continue would hide that screen and leave the user without its action.
    if (status.tenant && recentlyUpgraded(status.tenant, now) && !expired && !isScreenShown() && !upgradeWelcomeStorage.seen()) {
      // Seen once shown: another screen (Session ended, a late refusal) may replace it before Continue.
      upgradeWelcomeStorage.markSeen()
      showUpgradeWelcome(status.tenant.name)
    }
  }
  const startNotices = () => void loadNotices().catch((error: unknown) => getLogger().warn('workspace status unavailable', { error }))

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
          <App key={base ?? '/'} {...(base ? { basename: base } : {})} onRouter={onRouter} notices={notices} />
        </ShellRoot>
      </StrictMode>,
    )
  }
  hideScreen()
  app = createRoot(document.getElementById('app')!)
  render()
  startNotices()

  // A context that changed: the subject, flags and provider get it, then the banners (once) and the router
  // (rememberWorkspace may have moved the URL under /t/<slug>/). Shared by the background retry and the
  // focus refresh.
  const takeContext = (next: SessionContext) => {
    context.set(next)
    applyContext()
    startNotices()
    const moved = routerBasename()
    if (moved !== basename) {
      basename = moved
      render()
    }
  }
  // A refusal received after render: the app goes (its data must not stay under the screen; a sign-out already
  // unmounted it), then the refusal's screen, unless "Session ended" or "You are signed out" is up.
  const unmountApp = () => {
    app?.unmount()
    app = undefined
  }
  const refuseApp = (show: () => void) => {
    unmountApp()
    if (!stopped()) refuse(show)
  }

  // The focus refresh: on focus or when the tab becomes visible, at most once a minute, P-35 is asked again
  // (one request, no retries: the next focus tries again). A changed context is applied; the same one changes
  // nothing. A refusal is settled as on the first load (a membership refusal asked once more after 5 s), then
  // its screen replaces the app; a context for another workspace shows the wrong-workspace screen. A failure
  // keeps the context the page has. Never after a sign-out, an expiry or a refusal.
  // The background retry below ends once a focus refresh has applied a context: an answer it then gets may
  // have been read before a role change the refresh already shows, so it must not overwrite it. A sign-out
  // ends it too.
  const backgroundRetry = new AbortController()
  signedOutDuringBoot.signal.addEventListener('abort', () => backgroundRetry.abort(), { once: true })
  let refreshed = false
  const applyRefreshed = (next: SessionContext) => {
    refreshed = true
    backgroundRetry.abort()
    takeContext(next)
  }

  let lastAsked = Date.now()
  let refreshing = false
  const refreshContext = async () => {
    if (refreshing || Date.now() - lastAsked < CONTEXT_REFRESH_MS) return
    refreshing = true
    lastAsked = Date.now()
    try {
      let next: SessionContext | undefined
      try {
        next = await loadSessionContextOnce(signedOutDuringBoot.signal)
      } catch (error) {
        // As the background retry: a refusal received after an expiry still unmounts the app (not asked
        // again), and "Session ended" stays on top; after a sign-out or a refusal screen, nothing.
        if (stopped()) {
          if (blockedWorkspace(error) !== undefined) unmountApp()
          return
        }
        if (blockedWorkspace(error) === undefined) {
          getLogger().warn('session context refresh failed', { error })
          return
        }
        const settled = await settleRefusal(error, loadSessionContextOnce, { signal: signedOutDuringBoot.signal })
        if ('block' in settled) {
          const { block } = settled
          refuseApp(() => showWorkspaceUnavailable(block, idp, signInUseCases))
          return
        }
        if (stopped()) return
        if (!('context' in settled)) {
          getLogger().warn('session context refresh failed', { error: settled.error })
          return
        }
        next = settled.context
      }
      if (stopped()) return
      const current = context.get()
      // The workspace this page is for: never rebind it to another one. Compared only when both slugs are
      // known: a P-35 body without one keeps its context (§4.2), as on the first load.
      const expected = current?.slug ?? w.slug
      if (next.slug !== undefined && expected !== undefined && next.slug !== expected) {
        refuseApp(() => showWrongWorkspace(idp, signInUseCases))
        return
      }
      if (JSON.stringify(next) !== JSON.stringify(current)) applyRefreshed(next)
    } finally {
      refreshing = false
    }
  }
  const onFocus = () => {
    if (stopped()) {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
      return
    }
    void refreshContext()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') onFocus()
  }
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onVisible)
  signedOutDuringBoot.signal.addEventListener('abort', () => {
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onVisible)
  }, { once: true })

  // The background retry (retryContext above; never a trial with a slug, whose P-35 was awaited): on
  // success the subject, flags and provider get the context.
  if (!context.get() && isTransient(firstError)) {
    const tried = await retryContext(false, backgroundRetry.signal)
    if (refreshed) return
    let { retried } = tried
    // A refusal is settled like the first load's (a membership refusal is asked once more after 5 s;
    // the deny-all app stays meanwhile), then a workspace state replaces the app with its screen.
    let late: ReturnType<typeof blockedWorkspace>
    if (tried.refusal !== undefined) {
      if (stopped()) late = blockedWorkspace(tried.refusal)
      else {
        const settled = await settleRefusal(tried.refusal, loadSessionContextOnce, { signal: backgroundRetry.signal })
        if (refreshed) return
        if ('block' in settled) late = settled.block
        else if ('context' in settled) retried = settled.context
      }
    }
    // A refusal received unmounts the app (a sign-out already did). After an expiry "Session ended" stays on
    // top, with nothing of the workspace under it: its Sign in leaves the page, and the next load meets the
    // refusal again. Otherwise the refusal's own screen replaces the app.
    if (late) {
      refuseApp(() => showWorkspaceUnavailable(late, idp, signInUseCases))
      return
    }
    if (retried && !stopped()) takeContext(retried)
  }
}
