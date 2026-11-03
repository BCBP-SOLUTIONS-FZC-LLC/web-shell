// The bootstrap's order and branches, with every SDK subpath replaced by a recording fake.
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionState, Workspace } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'

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
let shellProps: Record<string, unknown> = {}

vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/core', () => ({
  initializeCore: record('initializeCore'),
  setConsentProvider: record('setConsentProvider'),
}))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/config', () => ({
  loadRuntimeConfig: async () => (calls.push('loadRuntimeConfig'), cfg),
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
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/i18n', () => ({ initializeI18n: async () => void calls.push('initializeI18n') }))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/mfe', () => ({
  loadManifest: () => (calls.push('loadManifest'), loadManifest()),
  startVersionPolling: record('startVersionPolling'),
}))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/security', () => ({
  installTrustedTypesPolicy: record('installTrustedTypesPolicy'),
}))
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/react', () => ({
  installGlobalErrorHandlers: record('installGlobalErrorHandlers'),
  PlatformProvider: (p: { shell: Record<string, unknown>; children: unknown }) => {
    shellProps = p.shell
    return p.children
  },
}))
vi.mock('../../src/App', () => ({
  default: ({ basename }: { basename?: string }) => <main>app at {basename ?? '(root)'}</main>,
}))
vi.mock('../../src/platform/iam', () => ({
  workspaceResolver: { resolve: (i: string) => resolve(i) },
  sessionContextSource: { load: () => loadContext() },
}))

const { bootstrap } = await import('../../src/bootstrap')
const { resetScreen } = await import('../../src/platform/screen')

async function typeEmail(email: string) {
  const u = userEvent.setup()
  await u.type(await screen.findByRole('textbox', { name: /work email address/i }), email)
  await u.click(screen.getByRole('button', { name: /continue with email/i }))
}

beforeEach(() => {
  calls.length = 0
  subscriber = undefined
  shellProps = {}
  document.body.innerHTML = '<div id="app"></div>'
  window.history.replaceState({}, '', '/')
  initResult = { status: 'authenticated', user, workspace: acme, expiresAt: Date.now() + 60_000 }
  loadContext.mockResolvedValue({ tenantId: 't-1', slug: 'acme', roles: ['member'] })
  chooseWorkspace.mockResolvedValue(undefined)
  isWrongWorkspace.mockReturnValue(false)
  loadManifest.mockResolvedValue({})
})

afterEach(() => {
  act(() => resetScreen())
  vi.clearAllMocks()
})

describe('bootstrap, signed in', () => {
  it('initialises the platform in order and renders the app under /t/<slug>', async () => {
    await act(() => bootstrap())
    expect(calls).toEqual([
      'installTrustedTypesPolicy',
      'initializeCore',
      'loadRuntimeConfig',
      'setRuntimeConfig',
      'setConsentProvider',
      'initializeTracing',
      'initializeLogging',
      'initializeMetrics',
      'installGlobalErrorHandlers',
      'startWebVitals',
      'setFlagProvider',
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
    ])
    expect(screen.getByRole('main')).toHaveTextContent('app at /t/acme')
    expect(shellProps).toMatchObject({ user, workspace: acme, context: { slug: 'acme' } })
  })

  it('renders from the root with deny-all when the session context is unavailable', async () => {
    loadContext.mockRejectedValue(new Error('503'))
    const subjects: unknown[] = []
    sdk.setAuthzSubject = (s) => subjects.push(s)
    await act(() => bootstrap())
    delete sdk.setAuthzSubject
    expect(logger.warn).toHaveBeenCalledWith('session context unavailable', { error: expect.any(Error) })
    expect(subjects).toEqual([undefined])
    expect(calls).not.toContain('rememberWorkspace')
    expect(screen.getByRole('main')).toHaveTextContent('app at (root)')
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
    resolve.mockResolvedValue(acme)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }))
    await typeEmail('ada@acme.com')
    await waitFor(() => expect(signInAgain).toHaveBeenCalledOnce())
  })

  it('unmounts the app on sign-out and signs back in with prompt=login on click', async () => {
    await act(() => bootstrap())
    act(() => subscriber!({ status: 'anonymous', reason: 'signed-out' }))
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign in' }))
    expect(idp.login).toHaveBeenCalledWith({ workspace: acme, returnUrl: '/t/acme/', prompt: 'login' })

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

describe('bootstrap, signed out', () => {
  it('asks for the email when no workspace is known, then logs in with it as the hint', async () => {
    initResult = { status: 'anonymous', reason: 'none' }
    resolve.mockResolvedValue(acme)
    void bootstrap()
    await typeEmail('ada@acme.com')
    await waitFor(() =>
      expect(idp.login).toHaveBeenCalledWith({ workspace: acme, returnUrl: '/', loginHint: 'ada@acme.com' }),
    )
  })

  it('goes straight to Keycloak for a known workspace, with the remembered email', async () => {
    initResult = { status: 'anonymous', reason: 'none' }
    chooseWorkspace.mockResolvedValue(acme)
    localStorage.setItem('bcbp.rememberEmail', 'true')
    localStorage.setItem('bcbp.loginEmail', 'ada@acme.com')
    await bootstrap()
    expect(idp.login).toHaveBeenCalledWith({ workspace: acme, returnUrl: '/', loginHint: 'ada@acme.com' })
  })

  it('retries the workspace a failed silent sign-in named, without a hint', async () => {
    initResult = { status: 'anonymous', reason: 'login-required', workspace: acme }
    window.history.replaceState({}, '', '/t/acme/dashboard?x=1')
    await bootstrap()
    expect(chooseWorkspace).not.toHaveBeenCalled()
    expect(idp.login).toHaveBeenCalledWith({ workspace: acme, returnUrl: '/t/acme/dashboard?x=1' })
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
