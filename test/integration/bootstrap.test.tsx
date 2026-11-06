// The bootstrap's order and branches, with every SDK subpath replaced by a recording fake.
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionState, Workspace } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import { NetworkError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'

const calls: string[] = []
const record =
  (name: string, ret?: unknown) =>
  (...args: unknown[]) => {
    calls.push(name)
    sdk[name]?.(...args)
    return ret
  }
const sdk: Record<string, ((...args: unknown[]) => void) | undefined> = {}

const cfg = {
  api: { propagationAllowlist: [] },
  telemetry: { otlpBaseUrl: '/otel', sampleRatio: 1, logLevel: 'info' },
  auth: { workspacePathPrefix: '/t/', paidRealmPrefix: 'tenant-' },
  i18n: { defaultLocale: 'en', supportedLocales: ['en'] },
}
const acme: Workspace = { realm: 'tenant-acme', trial: false, slug: 'acme' }
const user = { sub: 'u-1', email: 'ada@acme.com' }

let initResult: SessionState
let subscriber: ((s: SessionState) => void) | undefined
const idp = {
  init: vi.fn(async () => initResult),
  login: vi.fn(async () => {}),
  logout: vi.fn(async () => {}),
  switchWorkspace: vi.fn(async () => {}),
  subscribe: vi.fn((l: (s: SessionState) => void) => {
    subscriber = l
    return () => {}
  }),
}
const chooseWorkspace = vi.fn<() => Promise<Workspace | undefined>>()
const signInAgain = vi.fn(async (o: { ask: () => Promise<Workspace> }) => {
  await o.ask()
})
const isWrongWorkspace = vi.fn(() => false)
const loadContext = vi.fn()
const resolve = vi.fn<(id: string) => Promise<Workspace | undefined>>()
const logger = { warn: vi.fn(), error: vi.fn() }
const loadManifest = vi.fn(async () => ({}))
const loadRuntimeConfig = vi.fn(async () => cfg)
const initializeCore = vi.fn()
const i18nOptions: { detect?: () => string | undefined }[] = []
let navigator: ((appId: string, path: string) => void) | undefined
let duringI18n: (() => void) | undefined
let shellProps: Record<string, unknown> = {}

vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/core', () => ({
  initializeCore: (...a: unknown[]) => (calls.push('initializeCore'), initializeCore(...a)),
}))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/config', () => ({
  loadRuntimeConfig: () => (calls.push('loadRuntimeConfig'), loadRuntimeConfig()),
  setRuntimeConfig: record('setRuntimeConfig'),
}))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/tracing', () => ({ initializeTracing: record('initializeTracing') }))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/logging', () => ({
  initializeLogging: record('initializeLogging'),
  getLogger: () => logger,
}))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/metrics', () => ({
  initializeMetrics: record('initializeMetrics'),
  startWebVitals: record('startWebVitals'),
}))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/flags', () => ({
  setFlagProvider: record('setFlagProvider'),
  runtimeConfigFlagProvider: () => 'runtime-flags',
  sessionContextFlagProvider: () => 'context-flags',
}))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/auth', () => ({
  createOidcProvider: (...a: unknown[]) => (calls.push('createOidcProvider'), void a, idp),
  initializeAuth: () => (calls.push('initializeAuth'), 'token-source'),
  chooseWorkspace: () => chooseWorkspace(),
  isWrongWorkspace: () => isWrongWorkspace(),
  rememberWorkspace: (w: Workspace & { slug: string }) => {
    calls.push('rememberWorkspace')
    window.history.replaceState({}, '', `/t/${w.slug}${window.location.pathname}`)
  },
  signInAgain: (o: { ask: () => Promise<Workspace> }) => signInAgain(o),
  slugFromPath: (p: string) => /^\/t\/([a-z0-9-]+)/.exec(p)?.[1],
}))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/http', () => ({ setTokenSource: record('setTokenSource') }))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/authz', () => ({
  roleMapAuthorizer: () => 'authorizer',
  setAuthorizer: record('setAuthorizer'),
  setAuthzSubject: record('setAuthzSubject'),
}))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/i18n', async (original) => {
  // The real catalogue functions, for the shell's text; recorded to check they run before any screen.
  const real = await original<typeof import('@bcbp-solutions-fzc-llc/frontend-sdk/i18n')>()
  return {
    ...real,
    registerNamespace: (...a: Parameters<typeof real.registerNamespace>) => (calls.push('registerNamespace'), real.registerNamespace(...a)),
    setLocale: (...a: Parameters<typeof real.setLocale>) => (calls.push('setLocale'), real.setLocale(...a)),
    initializeI18n: async (o: { detect?: () => string | undefined }) => {
      calls.push('initializeI18n')
      i18nOptions.push(o)
      duringI18n?.()
    },
  }
})
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/nav', () => ({
  registerNavigator: (n: (appId: string, path: string) => void) => {
    calls.push('registerNavigator')
    navigator = n
  },
}))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/mfe', () => ({
  loadManifest: () => (calls.push('loadManifest'), loadManifest()),
  startVersionPolling: record('startVersionPolling'),
}))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/security', () => ({
  installTrustedTypesPolicy: record('installTrustedTypesPolicy'),
}))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/react', async (original) => ({
  ...(await original<object>()), // the real useT, for the shell's text
  installGlobalErrorHandlers: record('installGlobalErrorHandlers'),
  useLocale: () => ({ locale: 'en' }),
  PlatformProvider: (p: { shell: Record<string, unknown>; children: unknown }) => {
    shellProps = p.shell
    return p.children
  },
}))
const routerNavigate = vi.fn()
vi.mock('../../src/app/routes/App', async () => {
  const { useEffect } = await import('react')
  return {
    default: function App({ basename, onRouter }: { basename?: string; onRouter?: (n: typeof routerNavigate) => void }) {
      useEffect(() => onRouter?.(routerNavigate), [onRouter])
      return <main>app at {basename ?? '(root)'}</main>
    },
  }
})
vi.mock('../../src/infrastructure/api/iam', () => ({
  workspaceResolver: { resolve: (i: string) => resolve(i) },
  sessionContextSource: { load: () => loadContext() },
  loadSessionContextOnce: () => loadContext(),
}))

const { bootstrap } = await import('../../src/app/bootstrap/bootstrap')
const { resetScreen } = await import('../../src/app/layouts/screen')

async function typeEmail(email: string) {
  const u = userEvent.setup()
  await u.type(await screen.findByRole('textbox', { name: /work email address/i }), email)
  await u.click(screen.getByRole('button', { name: /continue with email/i }))
}

beforeEach(() => {
  calls.length = 0
  i18nOptions.length = 0
  navigator = undefined
  duringI18n = undefined
  subscriber = undefined
  shellProps = {}
  document.body.innerHTML = '<div id="app"></div>'
  window.history.replaceState({}, '', '/')
  initResult = { status: 'authenticated', user, workspace: acme, expiresAt: Date.now() + 60_000 }
  loadContext.mockResolvedValue({ tenantId: 't-1', slug: 'acme', roles: ['member'] })
  chooseWorkspace.mockResolvedValue(undefined)
  isWrongWorkspace.mockReturnValue(false)
  loadManifest.mockResolvedValue({})
  loadRuntimeConfig.mockResolvedValue(cfg)
  initializeCore.mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  act(() => resetScreen())
  vi.clearAllMocks()
})

describe('bootstrap, signed in', () => {
  it('initialises the platform in order and renders the app under /t/<slug>', async () => {
    await act(() => bootstrap())
    expect(calls).toEqual([
      'installTrustedTypesPolicy',
      'loadRuntimeConfig',
      'initializeCore',
      'setRuntimeConfig',
      'initializeTracing',
      'initializeLogging',
      'initializeMetrics',
      'installGlobalErrorHandlers',
      'startWebVitals',
      'setFlagProvider',
      // The shell's text, loaded before any screen can show (the sign-in screens come before initializeI18n).
      'registerNamespace',
      'setLocale',
      'createOidcProvider',
      'initializeAuth',
      'setTokenSource',
      'setAuthorizer',
      'setAuthzSubject',
      'setFlagProvider',
      'rememberWorkspace',
      'initializeI18n',
      'loadManifest',
      'startVersionPolling',
      // StrictMode runs the router bridge's effect twice in development; registering again replaces it.
      'registerNavigator',
      'registerNavigator',
    ])
    expect(screen.getByRole('main')).toHaveTextContent('app at /t/acme')
    expect(shellProps).toMatchObject({ user, workspace: acme, context: { slug: 'acme' }, locale: 'en' })
  })

  it("negotiates the locale from the session context's IAM locale", async () => {
    loadContext.mockResolvedValue({ tenantId: 't-1', slug: 'acme', roles: ['member'], locale: 'ar' })
    await act(() => bootstrap())
    expect(i18nOptions[0]!.detect!()).toBe('ar')
  })

  it("registers the router as the SDK's navigator, inside the /t/<slug> basename", async () => {
    await act(() => bootstrap())
    navigator!('dashboard', '/t/acme/dashboard/members?tab=1')
    expect(routerNavigate).toHaveBeenCalledWith('/dashboard/members?tab=1', {})
  })

  it('renders from the root with deny-all when the session context is unavailable', async () => {
    loadContext.mockRejectedValue(new Error('403'))
    const subjects: unknown[] = []
    sdk.setAuthzSubject = (s) => subjects.push(s)
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    await act(() => bootstrap())
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    delete sdk.setAuthzSubject
    expect(logger.warn).toHaveBeenCalledWith('session context unavailable', { error: expect.any(Error) })
    // A 403-like answer is final: not asked again (no retry), deny-all for the page's life.
    expect(loadContext).toHaveBeenCalledOnce()
    expect(subjects).toEqual([undefined])
    expect(calls).not.toContain('rememberWorkspace')
    expect(screen.getByRole('main')).toHaveTextContent('app at (root)')
  })

  it('retries a transient session-context failure in the background and applies it when it answers', async () => {
    loadContext
      .mockRejectedValueOnce(new NetworkError(false, 'req-1'))
      .mockRejectedValueOnce(new NetworkError(false, 'req-1'))
      .mockResolvedValue({ tenantId: 't-1', slug: 'acme', roles: ['tenant_owner'] })
    const subjects: unknown[] = []
    sdk.setAuthzSubject = (s) => subjects.push(s)
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const started = bootstrap()
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(shellProps).toMatchObject({ context: undefined })
    await act(() => vi.advanceTimersByTimeAsync(1_000 + 2_000))
    await act(() => started)
    delete sdk.setAuthzSubject
    expect(logger.warn).toHaveBeenCalledWith('session context unavailable', { error: expect.any(NetworkError), attempt: 1 })
    expect(subjects).toEqual([undefined, { roles: ['tenant_owner'], tenantId: 't-1' }])
    expect(calls).toContain('rememberWorkspace')
    expect(shellProps).toMatchObject({ context: { roles: ['tenant_owner'] } })
    // The app mounted at the root; the late context moved the URL under /t/acme/, so the router
    // is rebuilt with that basename and the navigator follows it.
    expect(screen.getByRole('main')).toHaveTextContent('app at /t/acme')
    navigator!('dashboard', '/t/acme/dashboard/members')
    expect(routerNavigate).toHaveBeenLastCalledWith('/dashboard/members', {})
  })

  it('keeps the router when a late context leaves the URL where it was', async () => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    loadContext.mockRejectedValueOnce(new NetworkError(false, 'req-1')).mockResolvedValue({ tenantId: 't-1', slug: 'acme', roles: ['member'] })
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const started = bootstrap()
    await act(() => vi.advanceTimersByTimeAsync(1_000))
    await act(() => started)
    expect(screen.getByRole('main')).toHaveTextContent('app at /t/acme')
  })

  it('stops the retries on a sign-out', async () => {
    loadContext.mockRejectedValue(new NetworkError(false, 'req-1'))
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const started = bootstrap()
    await act(() => vi.advanceTimersByTimeAsync(0))
    act(() => subscriber!({ status: 'anonymous', reason: 'signed-out' }))
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    await act(() => started)
    expect(loadContext).toHaveBeenCalledOnce()
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
  })

  it('never mounts the app when the user signs out (another tab) while it boots', async () => {
    loadContext.mockImplementation(async () => {
      subscriber!({ status: 'anonymous', reason: 'signed-out' })
      return { tenantId: 't-1', slug: 'acme', roles: ['member'] }
    })
    await act(() => bootstrap())
    expect(calls).not.toContain('loadManifest')
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'You are signed out' })).toBeInTheDocument()
  })

  it('stops before the manifest when the user signs out during i18n', async () => {
    duringI18n = () => subscriber!({ status: 'anonymous', reason: 'signed-out' })
    await act(() => bootstrap())
    expect(calls).not.toContain('loadManifest')
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
  })

  it('stops before version polling when the user signs out during the manifest load', async () => {
    loadManifest.mockImplementation(async () => {
      subscriber!({ status: 'anonymous', reason: 'signed-out' })
      return {}
    })
    await act(() => bootstrap())
    expect(calls).not.toContain('startVersionPolling')
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
  })

  it('logs a manifest failure and still renders', async () => {
    loadManifest.mockRejectedValue(new Error('404'))
    await act(() => bootstrap())
    expect(logger.error).toHaveBeenCalledWith('manifest load failed', { error: expect.any(Error) })
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('wires sign-out and workspace switching into the shell context', async () => {
    await act(() => bootstrap())
    const shell = shellProps as {
      signOut: (o?: { global?: boolean }) => Promise<void>
      switchWorkspace: (id: string) => Promise<void>
    }
    await shell.signOut({ global: false })
    expect(idp.logout).toHaveBeenCalledWith({ global: false })

    resolve.mockResolvedValueOnce(acme)
    await shell.switchWorkspace('acme')
    expect(idp.switchWorkspace).toHaveBeenCalledWith(acme)

    resolve.mockResolvedValueOnce(undefined)
    await act(() => shell.switchWorkspace('nope'))
    expect(screen.getByRole('alertdialog', { name: 'Workspace not found' })).toBeInTheDocument()
  })

  it('shows the session-ended dialog and signs in again through the email screen', async () => {
    await act(() => bootstrap())
    act(() => subscriber!({ status: 'expired', serverEnded: false, idle: true }))
    expect(screen.getByText(/period of inactivity/)).toBeInTheDocument()
    // No login without a click after an expiry.
    expect(signInAgain).not.toHaveBeenCalled()
    expect(idp.login).not.toHaveBeenCalled()
    resolve.mockResolvedValue(acme)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }))
    await typeEmail('ada@acme.com')
    await waitFor(() => expect(signInAgain).toHaveBeenCalledOnce())
  })

  it('unmounts the app on sign-out and signs back in on click', async () => {
    await act(() => bootstrap())
    act(() => subscriber!({ status: 'anonymous', reason: 'signed-out' }))
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }))
    expect(idp.login).toHaveBeenCalledWith({ workspace: acme })

    const other: Workspace = { realm: 'tenant-other', trial: false }
    act(() => subscriber!({ status: 'anonymous', reason: 'signed-out', workspace: other }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }))
    expect(idp.login).toHaveBeenLastCalledWith(expect.objectContaining({ workspace: other }))
  })

  it('ignores other session changes', async () => {
    await act(() => bootstrap())
    act(() => subscriber!({ status: 'anonymous', reason: 'none' }))
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('never renders the app for a login in the wrong workspace', async () => {
    isWrongWorkspace.mockReturnValue(true)
    await act(() => bootstrap())
    expect(screen.getByRole('alertdialog', { name: /different workspace/ })).toBeInTheDocument()
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
    expect(calls).not.toContain('loadManifest')
  })
})

describe('bootstrap, the environment from runtime.json (SDK alpha.6)', () => {
  const environmentOf = () => (initializeCore.mock.calls.at(-1)?.[0] as { environment: string }).environment

  it("identifies the page with the deployed runtime.json's environment, so one build serves every environment", async () => {
    loadRuntimeConfig.mockResolvedValue({ ...cfg, environment: 'staging' } as typeof cfg)
    await act(() => bootstrap())
    expect(environmentOf()).toBe('staging')
    expect(initializeCore).toHaveBeenCalledWith(expect.objectContaining({ serviceName: 'web-shell', domain: 'portal' }))
  })

  it('falls back to the build-time environment while a runtime.json has no environment key', async () => {
    await act(() => bootstrap())
    expect(environmentOf()).toBe('test') // vitest.config.ts __ENVIRONMENT__
  })

  it('without a config, identifies with the build-time environment so the failure is still reported', async () => {
    loadRuntimeConfig.mockRejectedValue(new Error('config 404'))
    await expect(bootstrap()).rejects.toThrow('config 404')
    expect(environmentOf()).toBe('test')
    expect(logger.error).toHaveBeenCalledWith('the app could not start', { error: expect.any(Error) })
  })
})

describe('bootstrap, start-up failure', () => {
  it('reports a failure as an essential error on the default /otel, then rethrows for the unavailable page', async () => {
    loadRuntimeConfig.mockRejectedValue(new Error('config 404'))
    await expect(bootstrap()).rejects.toThrow('config 404')
    expect(calls).toContain('initializeLogging')
    expect(logger.error).toHaveBeenCalledWith('the app could not start', { error: expect.any(Error) })
  })

  it("reports to the runtime config's collector once the config is loaded", async () => {
    const otlp: unknown[] = []
    sdk.initializeLogging = (o) => otlp.push((o as { otlpBaseUrl: string }).otlpBaseUrl)
    idp.init.mockRejectedValueOnce(new Error('idp down'))
    loadRuntimeConfig.mockResolvedValue({ ...cfg, telemetry: { ...cfg.telemetry, otlpBaseUrl: 'https://collector.example/otel' } })
    await expect(bootstrap()).rejects.toThrow('idp down')
    delete sdk.initializeLogging
    expect(otlp).toEqual(['https://collector.example/otel', 'https://collector.example/otel'])
    expect(logger.error).toHaveBeenCalledWith('the app could not start', { error: expect.any(Error) })
  })

  it('does not report without core (no identity), and a failing report never hides the error', async () => {
    initializeCore.mockImplementation(() => {
      throw new Error('core')
    })
    await expect(bootstrap()).rejects.toThrow('core')
    expect(logger.error).not.toHaveBeenCalled()

    initializeCore.mockImplementation(() => {})
    loadRuntimeConfig.mockRejectedValue(new Error('config 404'))
    logger.error.mockImplementationOnce(() => {
      throw new Error('logger')
    })
    await expect(bootstrap()).rejects.toThrow('config 404')
  })
})

describe('bootstrap, signed out', () => {
  it('asks for the email when no workspace is known, then logs in with it as the hint', async () => {
    initResult = { status: 'anonymous', reason: 'none' }
    resolve.mockResolvedValue(acme)
    void bootstrap()
    await typeEmail('ada@acme.com')
    await waitFor(() =>
      expect(idp.login).toHaveBeenCalledWith({ workspace: acme, loginHint: 'ada@acme.com' }),
    )
  })

  it('goes straight to Keycloak for a known workspace, with the remembered email', async () => {
    initResult = { status: 'anonymous', reason: 'none' }
    chooseWorkspace.mockResolvedValue(acme)
    localStorage.setItem('bcbp.rememberEmail', 'true')
    localStorage.setItem('bcbp.loginEmail', 'ada@acme.com')
    await bootstrap()
    expect(idp.login).toHaveBeenCalledWith({ workspace: acme, loginHint: 'ada@acme.com' })
  })

  it('retries the workspace a failed silent sign-in named, without a hint', async () => {
    initResult = { status: 'anonymous', reason: 'login-required', workspace: acme }
    window.history.replaceState({}, '', '/t/acme/dashboard?x=1')
    await bootstrap()
    expect(chooseWorkspace).not.toHaveBeenCalled()
    expect(idp.login).toHaveBeenCalledWith({ workspace: acme })
  })

  it('waits for a click after a logout', async () => {
    initResult = { status: 'anonymous', reason: 'signed-out' }
    chooseWorkspace.mockResolvedValue(acme)
    await act(() => bootstrap())
    expect(idp.login).not.toHaveBeenCalled()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(idp.login).toHaveBeenCalledOnce())
  })

  it('asks the user to fix the device clock', async () => {
    initResult = { status: 'anonymous', reason: 'device-clock' }
    chooseWorkspace.mockResolvedValue(acme)
    await act(() => bootstrap())
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(idp.login).toHaveBeenCalledOnce())
  })
})
