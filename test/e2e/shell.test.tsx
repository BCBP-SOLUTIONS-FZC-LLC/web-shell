// The shell booted end to end in-process, as platform-reactcommon test/e2e/shell.test.tsx does for
// its reference shell: the real bootstrap, screens, App and the real SDK (nothing mocked), against a
// FakeNetwork (runtime config, manifest, IAM PUB-1, P-35, P-1 and P-27) and a FakeKeycloak (PKCE).
//
// Each load() is a page load in the same tab: storage is kept, the SDK starts from nothing (its
// runtime global is cleared and every module is evaluated again), and the bootstrap runs.
//
// Stubbed seams, and why:
// - the remote's entry <script>: happy-dom does not run remoteEntry.js. The stub defines the
//   `__platform_mfe_<name>` container global the way the entry does (the preset's containerName since
//   alpha.4), exposing a dashboard (or the tenders remote) built only on the SDK's hooks, as
//   mfe-dashboard's (mfe-tender's) is.
// - location.assign/replace: a redirect is recorded instead of leaving the page.
// - HTMLFormElement#submit: the global sign-out's form POST to Keycloak is recorded (URL and fields)
//   instead of leaving the page.
// - react-dom/client's createRoot is wrapped only to unmount the app between page loads.
import { createElement, type ComponentType } from 'react'
import type { Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockProblem } from '@bcbp-solutions-fzc-llc/frontend-sdk/testing'
import { PlatformProblemTypes } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { FakeBroadcastChannel, FakeKeycloak, IDP } from '../fixtures/keycloak'
import { FakeNetwork } from '../fixtures/network'

const roots = vi.hoisted(() => [] as Root[])
vi.mock('react-dom/client', async (importOriginal) => {
  const m = await importOriginal<typeof import('react-dom/client')>()
  return {
    ...m,
    createRoot: (container: Element | DocumentFragment, o?: Parameters<typeof m.createRoot>[1]) => {
      const root = m.createRoot(container, o)
      roots.push(root)
      return root
    },
  }
})

const ORIGIN = window.location.origin
const RUNTIME_KEY = Symbol.for('@bcbp-solutions-fzc-llc/frontend-sdk')
const ENTRY = '/remotes/dashboard/1.0.0/remoteEntry.js'
/** The global the dashboard's remoteEntry.js defines: `__platform_mfe_<name>` (SDK alpha.4). */
const CONTAINER = '__platform_mfe_dashboard'
const TENDERS_ENTRY = '/remotes/tenders/1.0.0/remoteEntry.js'
/** The global mfe-tender's remoteEntry.js defines. */
const TENDERS_CONTAINER = '__platform_mfe_tenders'
/** mfe-drafting and mfe-workflow-designer: each a remote on the SDK's hooks, named by its manifest key. */
const OTHER_REMOTES = ['drafting', 'workflows'] as const
const otherEntry = (name: string) => `/remotes/${name}/1.0.0/remoteEntry.js`
const TENANT = '7d3c1f9e-2b4a-4c6d-8e0f-1a2b3c4d5e6f'
const EMAIL = 'ada@acme.test'

/** The image's /config/runtime.json, pointed at the fake Keycloak, with no remote load retries. */
const RUNTIME_CONFIG = (() => {
  const c = JSON.parse(readFileSync(join(import.meta.dirname, '../../public/config/runtime.json'), 'utf8'))
  return { ...c, auth: { ...c.auth, idpOrigin: IDP }, remotes: { ...c.remotes, retries: 0 } }
})()

let kc: FakeKeycloak
let net: FakeNetwork
let assigned: string[]
/** Form POST navigations (the global sign-out). */
let posted: { url: string; fields: Record<string, string> }[]
let injected: string[]
let roles: string[]
/** How the next container.get answers; the hooks-only dashboard by default. */
let exposeModule: (module: string) => Promise<() => unknown>
let bootError: unknown

/** The dashboard remote: reads the user, permissions and sign-out from the shell's SDK, gets no props. */
async function dashboardModule(): Promise<{ default: ComponentType }> {
  const { useCurrentUser, useHasPermission, useSignOut, useWorkspace } = await import(
    '@bcbp-solutions-fzc-llc/frontend-sdk/react'
  )
  function Dashboard() {
    const user = useCurrentUser()
    const workspace = useWorkspace()
    const canManage = useHasPermission('manage', 'members')
    const canView = useHasPermission('read', 'members')
    const signOut = useSignOut()
    return createElement(
      'main',
      null,
      createElement('h1', null, `Dashboard for ${user?.name ?? 'nobody'} in ${workspace?.slug ?? '?'}`),
      canView ? createElement('a', { href: '#members' }, 'User management') : null,
      canManage ? createElement('button', { type: 'button' }, 'Invite') : null,
      createElement('button', { type: 'button', onClick: () => void signOut() }, 'Sign out'),
    )
  }
  return { default: Dashboard }
}

/** The tenders remote (mfe-tender): its optional props unset, it reads the user from the shell's SDK. */
async function tendersModule(): Promise<{ default: ComponentType }> {
  const { useCurrentUser, useWorkspace } = await import('@bcbp-solutions-fzc-llc/frontend-sdk/react')
  function Tenders() {
    const user = useCurrentUser()
    const workspace = useWorkspace()
    return createElement('h1', null, `Tenders for ${user?.name ?? 'nobody'} in ${workspace?.slug ?? '?'}`)
  }
  return { default: Tenders }
}

/** A remote (drafting, workflows) that reads the user and the workspace from the shell's SDK. */
async function otherModule(name: string): Promise<{ default: ComponentType }> {
  const { useCurrentUser, useWorkspace } = await import('@bcbp-solutions-fzc-llc/frontend-sdk/react')
  function Remote() {
    const user = useCurrentUser()
    const workspace = useWorkspace()
    return createElement('h1', null, `${name} for ${user?.name ?? 'nobody'} in ${workspace?.slug ?? '?'}`)
  }
  return { default: Remote }
}

/** The document goes: every root unmounted, the body emptied. */
async function unload(): Promise<void> {
  await act(async () => {
    for (const r of roots.splice(0)) r.unmount()
  })
  document.body.replaceChildren()
}

/** A page load at `path` (or the current URL): a fresh SDK and the shell's bootstrap. */
async function load(path?: string): Promise<void> {
  await unload()
  delete (globalThis as Record<symbol, unknown>)[RUNTIME_KEY]
  delete (globalThis as Record<string, unknown>)[CONTAINER]
  delete (globalThis as Record<string, unknown>)[TENDERS_CONTAINER]
  for (const name of OTHER_REMOTES) delete (globalThis as Record<string, unknown>)[`__platform_mfe_${name}`]
  vi.resetModules()
  if (path) window.history.replaceState(null, '', path)
  const app = document.createElement('div')
  app.id = 'app'
  document.body.appendChild(app)
  const { bootstrap } = await import('../../src/app/bootstrap/bootstrap')
  // An anonymous page never settles bootstrap: it waits for the user, then for the redirect.
  await act(async () => void bootstrap().catch((e: unknown) => (bootError = e)))
}

/** The user signs in at Keycloak; the browser follows the redirect back to the callback. */
async function approveLogin(): Promise<void> {
  const authorize = assigned.at(-1)!
  assigned.length = 0
  const cb = new URL(kc.approve(authorize))
  await load(cb.pathname + cb.search)
}

async function until(done: () => boolean, what: string): Promise<void> {
  await waitFor(
    () => {
      if (bootError) throw bootError
      if (!done()) throw new Error(`not yet: ${what}; the page shows: ${document.body.textContent}`)
    },
    { timeout: 5_000 },
  )
}

// A page load boots the real SDK before the email screen shows: allow it the suite's 5 s, not
// Testing Library's default 1 s (a slow CI runner took just over 1 s once).
const emailBox = () => screen.findByRole('textbox', { name: /work email or workspace name/i }, { timeout: 5_000 })
const continueButton = () => screen.getByRole('button', { name: /^continue$/i })
const bearerOf = (r: Request) => r.headers.get('authorization')
const storedValues = () =>
  [localStorage, sessionStorage].flatMap((s) => Object.keys(s).map((k) => `${k}=${s.getItem(k)}`)).join('\n')

/** Signs in through the email screen and waits for the dashboard. */
async function signInByEmail(): Promise<void> {
  await load('/')
  await userEvent.type(await emailBox(), EMAIL)
  await userEvent.click(continueButton())
  await until(() => assigned.length > 0, 'the redirect to Keycloak')
  await approveLogin()
  await screen.findByRole('heading', { name: /Dashboard for Ada Lovelace/ }, { timeout: 5_000 })
}

beforeEach(() => {
  kc = new FakeKeycloak()
  net = new FakeNetwork(kc, ORIGIN)
  assigned = []
  posted = []
  injected = []
  roles = ['member', 'tenant_owner']
  bootError = undefined
  exposeModule = async (module) => {
    if (module !== './App') throw new Error(`Module "${module}" does not exist in container.`)
    const m = await dashboardModule()
    return () => m
  }
  net
    .on('GET /config/runtime.json', RUNTIME_CONFIG)
    .on('GET /version.json', { version: 'test' })
    .on('GET /remotes/manifest.json', {
      dashboard: { entry: ENTRY, version: '1.0.0', ownerDomain: 'portal' },
      tenders: { entry: TENDERS_ENTRY, version: '1.0.0', ownerDomain: 'tender_management' },
      ...Object.fromEntries(OTHER_REMOTES.map((name) => [name, { entry: otherEntry(name), version: '1.0.0', ownerDomain: 'portal' }])),
    })
    .on('GET /api/v1/public/tenants/resolve', (req) => {
      const id = new URL(req.url).searchParams.get('identifier')
      return Response.json(
        id === EMAIL || id === 'acme' ? { found: true, realm: 'tenant-acme', strategy: 'dedicated' } : { found: false },
      )
    })
    .on('GET /api/v1/me/session-context', (req) =>
      bearerOf(req)
        ? Response.json({ tenant_id: TENANT, slug: 'acme', roles, feature_flags: [], read_only: false, locale: 'en' })
        : mockProblem(PlatformProblemTypes.Unauthorized),
    )
    // IAM P-1 and P-27 for the banners: a paid workspace with free seats shows none.
    .on(`GET /api/v1/tenants/${TENANT}`, { name: 'Acme', status: 'active' })
    .on(`GET /api/v1/tenants/${TENANT}/seat-usage`, { active_users: 3, pending_invitations: 0, licensed_seats: 10 })
  vi.stubGlobal('fetch', net.fetch)
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
  const record = (u: string | URL) => void assigned.push(String(u))
  vi.spyOn(window.location, 'assign').mockImplementation(record)
  vi.spyOn(window.location, 'replace').mockImplementation(record)
  vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
    const fields = Object.fromEntries([...new FormData(this)].map(([k, v]) => [k, String(v)]))
    posted.push({ url: `${this.method.toUpperCase()} ${this.action}`, fields })
  })
  // The remote's entry script: define the container as remoteEntry.js would, then fire load.
  const append = document.head.appendChild.bind(document.head)
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    if (!(node instanceof HTMLScriptElement)) return append(node)
    const src = new URL(node.src, ORIGIN)
    injected.push(src.pathname)
    if (src.pathname === TENDERS_ENTRY) {
      ;(globalThis as Record<string, unknown>)[TENDERS_CONTAINER] = {
        init: () => {},
        get: async (m: string) => {
          if (m !== './App') throw new Error(`Module "${m}" does not exist in container.`)
          const t = await tendersModule()
          return () => t
        },
      }
    } else if (OTHER_REMOTES.some((name) => src.pathname === otherEntry(name))) {
      const name = OTHER_REMOTES.find((n) => src.pathname === otherEntry(n))!
      ;(globalThis as Record<string, unknown>)[`__platform_mfe_${name}`] = {
        init: () => {},
        get: async (m: string) => {
          if (m !== './App') throw new Error(`Module "${m}" does not exist in container.`)
          const r = await otherModule(name)
          return () => r
        },
      }
    } else {
      ;(globalThis as Record<string, unknown>)[CONTAINER] = { init: () => {}, get: (m: string) => exposeModule(m) }
    }
    setTimeout(() => node.onload?.(new Event('load')))
    return node
  })
})

afterEach(async () => {
  await unload()
  delete (globalThis as Record<symbol, unknown>)[RUNTIME_KEY]
  delete (globalThis as Record<string, unknown>)[CONTAINER]
  delete (globalThis as Record<string, unknown>)[TENDERS_CONTAINER]
  FakeBroadcastChannel.reset()
})

describe('the shell, end to end', () => {
  it('email → PUB-1 → Keycloak (PKCE) → callback → the dashboard remote under /t/<slug>/', async () => {
    await load('/')
    const email = await emailBox()
    expect(screen.queryByRole('heading', { name: /Dashboard/ })).toBeNull()

    await userEvent.type(email, EMAIL)
    await userEvent.click(continueButton())
    await until(() => assigned.length > 0, 'the redirect to Keycloak')

    // PUB-1 resolved the email without a token; login went to the workspace's realm with PKCE.
    const [resolve] = net.sent('/api/v1/public/tenants/resolve')
    expect(new URL(resolve!.url).searchParams.get('identifier')).toBe(EMAIL)
    expect(bearerOf(resolve!)).toBeNull()
    const authorize = new URL(assigned[0]!)
    expect(`${authorize.origin}${authorize.pathname}`).toBe(`${IDP}/realms/tenant-acme/protocol/openid-connect/auth`)
    expect(authorize.searchParams.get('client_id')).toBe('tender-web')
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
    expect(authorize.searchParams.get('redirect_uri')).toBe(`${ORIGIN}/auth/callback`)
    expect(authorize.searchParams.get('login_hint')).toBe(EMAIL)

    await approveLogin()
    await screen.findByRole('heading', { name: 'Dashboard for Ada Lovelace in acme' }, { timeout: 5_000 })

    expect(kc.requests.map((r) => r.grant)).toEqual(['authorization_code'])
    expect(kc.requests[0]!.body.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(bearerOf(net.sent('/api/v1/me/session-context')[0]!)).toMatch(/^Bearer at-/)
    expect(window.location.pathname).toBe('/t/acme/dashboard')
    expect(injected).toEqual([ENTRY])
    // Tokens live in memory only.
    expect(storedValues()).not.toMatch(/at-[0-9a-f]|eyJ|refresh/)
  })

  it('a deep link to /t/<slug>/ skips the email screen and returns to the page after sign-in', async () => {
    await load('/t/acme/dashboard')
    await until(() => assigned.length > 0, 'the redirect to Keycloak')
    expect(screen.queryByRole('textbox', { name: /work email or workspace name/i })).toBeNull()
    expect(new URL(net.sent('/api/v1/public/tenants/resolve')[0]!.url).searchParams.get('identifier')).toBe('acme')

    await approveLogin()
    await screen.findByRole('heading', { name: /Dashboard for Ada Lovelace/ }, { timeout: 5_000 })
    expect(window.location.pathname).toBe('/t/acme/dashboard')
  })

  it('a deep link to /t/<slug>/tenders/… loads only the tenders remote, there, after sign-in', async () => {
    await load('/t/acme/tenders/T-1/documents')
    await until(() => assigned.length > 0, 'the redirect to Keycloak')
    await approveLogin()
    await screen.findByRole('heading', { name: 'Tenders for Ada Lovelace in acme' }, { timeout: 5_000 })
    expect(window.location.pathname).toBe('/t/acme/tenders/T-1/documents')
    expect(injected).toEqual([TENDERS_ENTRY])
    expect(screen.queryByRole('heading', { name: /Dashboard/ })).toBeNull()
  })

  it.each([
    ['drafting', '/t/acme/drafting/sections/S-1'],
    ['workflows', '/t/acme/workflows/W-1/editor'],
  ])('a deep link to /t/<slug>/%s/… loads only that remote, there, after sign-in', async (name, path) => {
    await load(path)
    await until(() => assigned.length > 0, 'the redirect to Keycloak')
    await approveLogin()
    await screen.findByRole('heading', { name: `${name} for Ada Lovelace in acme` }, { timeout: 5_000 })
    expect(window.location.pathname).toBe(path)
    expect(injected).toEqual([otherEntry(name)])
  })

  it("gives the remote the role map's permissions: an owner may invite, a member may only view", async () => {
    await signInByEmail()
    expect(screen.getByRole('link', { name: 'User management' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument()

    roles = ['member']
    await load('/t/acme/dashboard')
    await until(() => assigned.length > 0, 'the silent re-sign-in redirect')
    await approveLogin()
    await screen.findByRole('heading', { name: /Dashboard for Ada Lovelace/ }, { timeout: 5_000 })
    expect(screen.getByRole('link', { name: 'User management' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull()
  })

  it('renders with deny-all permissions when the session context is unavailable, and says so', async () => {
    // A final answer (IAM's endpoint missing in this environment): no retry.
    net.on('GET /api/v1/me/session-context', () => mockProblem(PlatformProblemTypes.NotFound))
    await load('/t/acme/dashboard')
    await until(() => assigned.length > 0, 'the redirect to Keycloak')
    await approveLogin()
    await screen.findByRole('heading', { name: /Dashboard for Ada Lovelace/ }, { timeout: 5_000 })
    expect(screen.queryByRole('link', { name: 'User management' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent("We couldn't load your permissions")
  })

  it.each([
    ['TENANT_TRIAL_EXPIRED', 'Your trial has ended'],
    ['MEMBER_SUSPENDED', 'Your access is paused'],
    ['DENY_MEMBER_SUSPENDED', 'Your access is paused'],
    ['DENY_UNRESOLVABLE_SUBJECT', "You don't have access to this workspace"],
  ])('P-35 %s shows "%s" instead of the app, and Sign out ends the SSO session', { timeout: 15_000 }, async (errorCode, title) => {
    net.on('GET /api/v1/me/session-context', (req) =>
      bearerOf(req) ? mockProblem(PlatformProblemTypes.Forbidden, { errorCode }) : mockProblem(PlatformProblemTypes.Unauthorized),
    )
    await load('/t/acme/dashboard')
    await until(() => assigned.length > 0, 'the redirect to Keycloak')
    await approveLogin()
    // A membership refusal is asked once more after 5 s (IAM's caches may lag a change); a tenant state is final at once.
    await screen.findByRole('alertdialog', { name: title }, { timeout: 10_000 })
    expect(injected).toEqual([])
    expect(net.sent('/api/v1/me/session-context')).toHaveLength(errorCode === 'TENANT_TRIAL_EXPIRED' ? 1 : 2)
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await until(() => posted.length > 0, 'the logout form POST')
    expect(posted[0]!.url).toBe(`POST ${IDP}/realms/tenant-acme/protocol/openid-connect/logout`)
  })

  it("a trial deep link whose session is another trial tenant's shows the wrong-workspace screen, never the app (SDK alpha.7)", async () => {
    // Every trial tenant shares one realm: the session (P-35 slug acme) is not the one /t/beta named.
    net.on('GET /api/v1/public/tenants/resolve', (req) =>
      Response.json(new URL(req.url).searchParams.get('identifier') === 'beta' ? { found: true, realm: 'trial', strategy: 'shared' } : { found: false }),
    )
    await load('/t/beta/dashboard')
    await until(() => assigned.length > 0, 'the redirect to Keycloak')
    expect(new URL(assigned[0]!).pathname).toBe('/realms/trial/protocol/openid-connect/auth')
    await approveLogin()
    await screen.findByRole('alertdialog', { name: /different workspace/ }, { timeout: 5_000 })
    expect(injected).toEqual([])
    expect(window.location.pathname).toBe('/t/beta/dashboard')
    expect(net.sent(`/api/v1/tenants/${TENANT}`)).toHaveLength(0)
  })

  it("a trial session whose P-35 never loads shows \"We couldn't load your workspace\", never the app", { timeout: 20_000 }, async () => {
    net.on('GET /api/v1/public/tenants/resolve', (req) =>
      Response.json(new URL(req.url).searchParams.get('identifier') === 'beta' ? { found: true, realm: 'trial', strategy: 'shared' } : { found: false }),
    )
    net.on('GET /api/v1/me/session-context', () => mockProblem(PlatformProblemTypes.ServiceUnavailable))
    await load('/t/beta/dashboard')
    await until(() => assigned.length > 0, 'the redirect to Keycloak')
    await approveLogin()
    await screen.findByRole('alertdialog', { name: "We couldn't load your workspace" }, { timeout: 15_000 })
    expect(injected).toEqual([])
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('a silent restore of a trial workspace PUB-1 no longer knows asks for the email, never another saved workspace', { timeout: 15_000 }, async () => {
    // Two saved workspaces: acme (paid), then the trial beta (P-35 slug beta).
    await signInByEmail()
    let betaKnown = true
    net.on('GET /api/v1/public/tenants/resolve', (req) => {
      const id = new URL(req.url).searchParams.get('identifier')
      return Response.json(
        id === 'beta' && betaKnown ? { found: true, realm: 'trial', strategy: 'shared' } : id === 'acme' ? { found: true, realm: 'tenant-acme', strategy: 'dedicated' } : { found: false },
      )
    })
    net.on('GET /api/v1/me/session-context', (req) =>
      bearerOf(req) ? Response.json({ tenant_id: TENANT, slug: 'beta', roles, feature_flags: [], read_only: false, locale: 'en' }) : mockProblem(PlatformProblemTypes.Unauthorized),
    )
    await load('/t/beta/dashboard')
    await until(() => assigned.length > 0, 'the redirect to Keycloak')
    await approveLogin()
    await screen.findByRole('heading', { name: /Dashboard for Ada Lovelace in beta/ }, { timeout: 5_000 })

    // The trial was deleted or moved: Keycloak answers login_required, PUB-1 no longer knows beta.
    betaKnown = false
    await load('/t/beta/dashboard')
    await until(() => assigned.length > 0, 'the silent re-sign-in redirect')
    const silent = new URL(assigned.at(-1)!)
    expect(silent.searchParams.get('prompt')).toBe('none')
    assigned.length = 0
    const resolvesBefore = net.sent('/api/v1/public/tenants/resolve').length
    const cb = new URL(silent.searchParams.get('redirect_uri')!)
    cb.searchParams.set('error', 'login_required')
    cb.searchParams.set('state', silent.searchParams.get('state')!)
    cb.searchParams.set('iss', kc.issuer('trial'))
    await load(cb.pathname + cb.search)
    expect(await emailBox()).toBeInTheDocument()
    expect(assigned).toEqual([])
    // init()'s one re-check answered "not found"; the shell asked, without another PUB-1 call.
    expect(net.sent('/api/v1/public/tenants/resolve').slice(resolvesBefore).map((r) => new URL(r.url).searchParams.get('identifier'))).toEqual(['beta'])
  })

  it('a reload of a paid workspace Keycloak still serves asks PUB-1 nothing (SDK alpha.9 realm probe)', async () => {
    await signInByEmail()
    const resolvesBefore = net.sent('/api/v1/public/tenants/resolve').length
    await load('/t/acme/dashboard')
    await until(() => assigned.length > 0, 'the silent restore redirect')
    const silent = new URL(assigned.at(-1)!)
    expect(silent.pathname).toBe('/realms/tenant-acme/protocol/openid-connect/auth')
    expect(silent.searchParams.get('prompt')).toBe('none')
    expect(kc.discoveries).toEqual(['tenant-acme'])
    expect(net.sent('/api/v1/public/tenants/resolve')).toHaveLength(resolvesBefore)
  })

  it('after a revert deletes the paid realm, a reload restores into the trial realm PUB-1 names, never Keycloak\'s 404 (SDK alpha.9)', async () => {
    await signInByEmail()
    // Realm Provisioner reverts the conversion: tenant-acme is deleted and PUB-1 names the shared trial realm.
    kc.deleted.add('tenant-acme')
    net.on('GET /api/v1/public/tenants/resolve', (req) =>
      Response.json(new URL(req.url).searchParams.get('identifier') === 'acme' ? { found: true, realm: 'trial', strategy: 'shared', tenant_id: TENANT } : { found: false }),
    )
    const resolvesBefore = net.sent('/api/v1/public/tenants/resolve').length
    await load('/t/acme/dashboard')
    await until(() => assigned.length > 0, 'the silent restore redirect')
    const silent = new URL(assigned.at(-1)!)
    expect(silent.pathname).toBe('/realms/trial/protocol/openid-connect/auth')
    expect(silent.searchParams.get('prompt')).toBe('none')
    // The paid realm failed like a missing realm (no CORS), the trial realm answered: gone, so one PUB-1 call.
    expect(kc.discoveries).toEqual(['tenant-acme', 'trial'])
    expect(net.sent('/api/v1/public/tenants/resolve').slice(resolvesBefore).map((r) => new URL(r.url).searchParams.get('identifier'))).toEqual(['acme'])
  })

  it('a WAF challenge page in place of the PUB-1 re-check keeps the saved trial workspace, never drops it as unknown (SDK alpha.8)', { timeout: 15_000 }, async () => {
    await signInByEmail()
    let challenge = false
    net.on('GET /api/v1/public/tenants/resolve', (req) => {
      const id = new URL(req.url).searchParams.get('identifier')
      if (id === 'beta' && challenge) return new Response('<html>challenge</html>', { status: 202, headers: { 'content-type': 'text/html' } })
      return Response.json(id === 'beta' ? { found: true, realm: 'trial', strategy: 'shared' } : { found: true, realm: 'tenant-acme', strategy: 'dedicated' })
    })
    net.on('GET /api/v1/me/session-context', (req) =>
      bearerOf(req) ? Response.json({ tenant_id: TENANT, slug: 'beta', roles, feature_flags: [], read_only: false, locale: 'en' }) : mockProblem(PlatformProblemTypes.Unauthorized),
    )
    await load('/t/beta/dashboard')
    await until(() => assigned.length > 0, 'the redirect to Keycloak')
    await approveLogin()
    await screen.findByRole('heading', { name: /Dashboard for Ada Lovelace in beta/ }, { timeout: 5_000 })

    // Keycloak answers login_required; the gateway's WAF answers the re-check with a 202 challenge page.
    challenge = true
    await load('/t/beta/dashboard')
    await until(() => assigned.length > 0, 'the silent re-sign-in redirect')
    const silent = new URL(assigned.at(-1)!)
    assigned.length = 0
    const cb = new URL(silent.searchParams.get('redirect_uri')!)
    cb.searchParams.set('error', 'login_required')
    cb.searchParams.set('state', silent.searchParams.get('state')!)
    cb.searchParams.set('iss', kc.issuer('trial'))
    await load(cb.pathname + cb.search)
    // The saved entry survives: sign-in goes on to the trial realm, not back to the email screen.
    await until(() => assigned.length > 0, 'the sign-in redirect to the saved trial realm')
    expect(new URL(assigned.at(-1)!).pathname).toBe('/realms/trial/protocol/openid-connect/auth')
    expect(screen.queryByRole('textbox', { name: /work email or workspace name/i })).toBeNull()
  })

  it('a read-only workspace (P-35 read_only) loads with the read-only notice over the remote', async () => {
    net.on('GET /api/v1/me/session-context', (req) =>
      bearerOf(req)
        ? Response.json({ tenant_id: TENANT, slug: 'acme', roles, feature_flags: [], read_only: true, locale: 'en' })
        : mockProblem(PlatformProblemTypes.Unauthorized),
    )
    await signInByEmail()
    expect(screen.getByRole('status')).toHaveTextContent('Workspace is read-only (subscription ended)')
  })

  it('a trial workspace shows the days left over the remote (P-1), loaded with the token after the app renders', async () => {
    net.on(`GET /api/v1/tenants/${TENANT}`, (req) =>
      bearerOf(req) ? Response.json({ name: 'Acme', status: 'trial', trial_ends_at: new Date(Date.now() + 5 * 86_400_000 + 60_000).toISOString() }) : mockProblem(PlatformProblemTypes.Unauthorized),
    )
    await signInByEmail()
    expect(await screen.findByRole('status')).toHaveTextContent('5 days left in your trial')
  })

  it('an owner sees "all seats used" from P-27', async () => {
    net.on(`GET /api/v1/tenants/${TENANT}/seat-usage`, { active_users: 8, pending_invitations: 2, licensed_seats: 10 })
    await signInByEmail()
    expect(await screen.findByRole('status')).toHaveTextContent('All 10 seats are in use.')
  })

  it('a member is never sent to P-27 (owner and tenant admin only)', async () => {
    roles = ['member']
    await signInByEmail()
    await until(() => net.sent(`/api/v1/tenants/${TENANT}`).length > 0, 'the P-1 request')
    expect(net.sent(`/api/v1/tenants/${TENANT}/seat-usage`)).toEqual([])
  })

  it('a cancelled workspace says when read-only access ends (P-1 read_only_until)', async () => {
    net
      .on('GET /api/v1/me/session-context', (req) =>
        bearerOf(req)
          ? Response.json({ tenant_id: TENANT, slug: 'acme', roles, feature_flags: [], read_only: true, locale: 'en' })
          : mockProblem(PlatformProblemTypes.Unauthorized),
      )
      .on(`GET /api/v1/tenants/${TENANT}`, { name: 'Acme', status: 'cancelled', read_only_until: '2026-12-24T10:00:00Z' })
    await signInByEmail()
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Access ends on Dec 24, 2026.'))
  })

  it('welcomes users once after the trial converted (A5), and not on the next page load', async () => {
    net.on(`GET /api/v1/tenants/${TENANT}`, {
      name: 'Acme',
      status: 'active',
      trial_ends_at: '2026-01-01T00:00:00Z',
      subscription_started_at: new Date(Date.now() - 86_400_000).toISOString(),
    })
    await signInByEmail()
    await userEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(screen.queryByRole('dialog', { name: 'Welcome to your upgraded workspace' })).toBeNull()
    await load('/t/acme/dashboard')
    await until(() => assigned.length > 0 || screen.queryByRole('heading', { name: /Dashboard for Ada Lovelace/ }) !== null, 'the restore')
    if (assigned.length > 0) await approveLogin()
    await screen.findByRole('heading', { name: /Dashboard for Ada Lovelace/ }, { timeout: 5_000 })
    await until(() => net.sent(`/api/v1/tenants/${TENANT}`).length > 1, 'the second P-1 request')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a writable workspace shows no read-only notice', async () => {
    await signInByEmail()
    expect(screen.queryByText('Workspace is read-only (subscription ended)')).toBeNull()
  })

  it('a session context outage (503) is retried in the background, and the permissions appear when IAM is back', async () => {
    let iamDown = true
    net.on('GET /api/v1/me/session-context', (req) =>
      iamDown
        ? mockProblem(PlatformProblemTypes.ServiceUnavailable)
        : bearerOf(req)
          ? Response.json({ tenant_id: TENANT, slug: 'acme', roles, feature_flags: [], read_only: false, locale: 'en' })
          : mockProblem(PlatformProblemTypes.Unauthorized),
    )
    await load('/t/acme/dashboard')
    await until(() => assigned.length > 0, 'the redirect to Keycloak')
    await approveLogin()
    await screen.findByRole('heading', { name: /Dashboard for Ada Lovelace/ }, { timeout: 5_000 })
    expect(screen.getByRole('status')).toHaveTextContent("We couldn't load your permissions")
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull()

    // IAM recovers: the shell's next retry answers, the owner's actions appear and the notice goes, no reload.
    iamDown = false
    await screen.findByRole('button', { name: 'Invite' }, { timeout: 8_000 })
    expect(screen.queryByText("We couldn't load your permissions", { exact: false })).toBeNull()
    expect(assigned).toEqual([])
  }, 15_000)

  it('a remote that fails to load stays inside its boundary, and Try again recovers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    exposeModule = async () => {
      throw new Error('the remote deploy is broken')
    }
    await load('/t/acme/dashboard')
    await until(() => assigned.length > 0, 'the redirect to Keycloak')
    await approveLogin()
    const alert = await screen.findByRole('alert', {}, { timeout: 5_000 })
    expect(alert).toHaveTextContent('Something went wrong.')
    expect(assigned).toEqual([])

    exposeModule = async () => {
      const m = await dashboardModule()
      return () => m
    }
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: /Dashboard for Ada Lovelace/ }, { timeout: 5_000 })
    expect(injected).toEqual([ENTRY])
  })

  it("the remote's Sign out ends the SSO session, unmounts the app, and back on the app it waits for a click", async () => {
    await signInByEmail()
    const otherTab: unknown[] = []
    new FakeBroadcastChannel('platform-auth').addEventListener('message', (e) =>
      otherTab.push((e as MessageEvent).data),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('heading', { name: 'You are signed out' }, { timeout: 5_000 })
    expect(screen.queryByRole('heading', { name: /Dashboard/ })).toBeNull()
    expect(document.getElementById('app')!.childElementCount).toBe(0)
    expect(otherTab).toEqual([{ type: 'logout' }])

    // Global sign-out: a form POST to Keycloak's end-session endpoint (the ID token stays out of URLs
    // and history; CSP form-action must allow the IdP), which returns to the app.
    expect(assigned).toEqual([])
    expect(posted).toHaveLength(1)
    const { url, fields } = posted[0]!
    expect(url).toBe(`POST ${IDP}/realms/tenant-acme/protocol/openid-connect/logout`)
    expect(fields.client_id).toBe('tender-web')
    expect(fields.id_token_hint).toBeTruthy()
    expect(fields.post_logout_redirect_uri).toBe(`${ORIGIN}/`)
    await load(new URL(fields.post_logout_redirect_uri!).pathname)
    await screen.findByRole('heading', { name: 'You are signed out' }, { timeout: 5_000 })
    expect(assigned).toEqual([]) // no silent sign-in on the live SSO session

    // Signing in again asks for credentials (a shared device).
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await until(() => assigned.length > 0, 'the redirect to Keycloak')
    const again = new URL(assigned[0]!)
    expect(again.pathname).toBe('/realms/tenant-acme/protocol/openid-connect/auth')
    expect(again.searchParams.get('prompt')).toBe('login')
  })

  it("a device clock 20 minutes off: the shell asks to check the clock and doesn't retry on its own", async () => {
    kc.now = () => Date.now() - 20 * 60_000
    await load('/t/acme/dashboard')
    await until(() => assigned.length > 0, 'the redirect to Keycloak')
    await approveLogin()
    await screen.findByRole('alertdialog', { name: "Check your device's clock" }, { timeout: 5_000 })
    expect(assigned).toEqual([])
  })

  it("takes the page's environment from the deployed runtime.json (one build, SDK alpha.6), not the build", async () => {
    net.on('GET /config/runtime.json', { ...RUNTIME_CONFIG, environment: 'dev' })
    await load('/t/acme/dashboard')
    await until(() => assigned.length > 0, 'the redirect to Keycloak')
    const { getIdentity } = await import('@bcbp-solutions-fzc-llc/frontend-sdk/core')
    expect(getIdentity()).toMatchObject({ serviceName: 'web-shell', domain: 'portal', environment: 'dev' })
  })

  it("Forgot your password? resolves the email and opens the realm's Keycloak reset page", async () => {
    await load('/')
    await userEvent.type(await emailBox(), EMAIL)
    await userEvent.click(screen.getByRole('button', { name: 'Forgot your password?' }))
    await until(() => assigned.length > 0, 'the redirect to the reset page')
    const reset = new URL(assigned[0]!)
    expect(`${reset.origin}${reset.pathname}`).toBe(`${IDP}/realms/tenant-acme/login-actions/reset-credentials`)
    expect(reset.searchParams.get('client_id')).toBe('tender-web')
    expect(kc.requests).toEqual([]) // no sign-in was started
  })

  it('an unknown email keeps the email screen up with the generic message, and never redirects', async () => {
    await load('/')
    await userEvent.type(await emailBox(), 'nobody@else.test')
    await userEvent.click(continueButton())
    await screen.findByText(/We couldn't find a workspace for that\./, {}, { timeout: 5_000 })
    expect(assigned).toEqual([])
  })

  it.each([
    ['a workspace name', ' Acme '],
    ['a pasted workspace URL', 'https://app.example.test/t/acme/dashboard/members'],
    ['a pasted workspace URL without its scheme', 'app.example.test/t/acme'],
    ['a pasted workspace URL with an @ in it', 'https://app.example.test/t/acme/members/ada@acme.test'],
  ])('%s → PUB-1 with the slug → Keycloak without a login_hint', async (_, typed) => {
    await load('/')
    await userEvent.type(await emailBox(), typed)
    await userEvent.click(continueButton())
    await until(() => assigned.length > 0, 'the redirect to Keycloak')
    expect(net.sent('/api/v1/public/tenants/resolve').map((r) => new URL(r.url).searchParams.get('identifier'))).toEqual(['acme'])
    const authorize = new URL(assigned[0]!)
    expect(authorize.pathname).toBe('/realms/tenant-acme/protocol/openid-connect/auth')
    expect(authorize.searchParams.has('login_hint')).toBe(false)
  })

  it('a pasted URL with no workspace in it asks PUB-1 nothing and shows the generic message', async () => {
    await load('/')
    await userEvent.type(await emailBox(), 'https://app.example.test/dashboard')
    await userEvent.click(continueButton())
    await screen.findByText(/We couldn't find a workspace for that\./, {}, { timeout: 5_000 })
    expect(net.sent('/api/v1/public/tenants/resolve')).toEqual([])
    expect(assigned).toEqual([])
  })
})
