import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '../../src/shared/i18n/en.json'

const routeTemplate = vi.fn()
const boundaryProps = vi.fn()
let context: unknown = { roles: ['member'] }
const appUpdate = { available: false, reload: vi.fn() }
let readOnly = false
// The header's SDK values (Frame in App.tsx).
const frame = {
  user: { sub: 'u-1', name: 'Ada Lovelace', email: 'ada@acme.com' } as { sub: string; name?: string; email?: string } | undefined,
  workspace: { realm: 'tenant-acme', trial: false, slug: 'acme' } as { realm: string; trial: boolean; slug?: string } | undefined,
  admin: false,
  on: true,
  signOut: vi.fn(() => Promise.resolve()),
  switchWorkspace: vi.fn<(identifier: string) => Promise<void>>(() => Promise.resolve()),
}
const permissionAsked = vi.fn()
const remoteMounted = vi.fn()
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/react', async (original) => {
  const { useEffect } = await import('react')
  return {
  ...(await original<object>()), // the real useT, for the shell's text
  useRouteTemplate: (t: string) => routeTemplate(t),
  useSessionContext: () => context,
  useAppUpdate: () => appUpdate,
  useReadOnly: () => readOnly,
  useCurrentUser: () => frame.user,
  useWorkspace: () => frame.workspace,
  useSignOut: () => frame.signOut,
  useSwitchWorkspace: () => frame.switchWorkspace,
  useHasPermission: (action: string, resource: string) => {
    permissionAsked(`${action}:${resource}`)
    return frame.admin
  },
  useFeatureFlag: (key: string, fallback: unknown) => (key === 'shell.frame' ? frame.on : fallback),
  RemoteBoundary: (p: { remote: string; module: string; fallback: unknown; props?: unknown }) => {
    boundaryProps(p.props)
    useEffect(() => remoteMounted(p.remote), [p.remote])
    return (
      <div data-testid="remote" data-remote={p.remote} data-module={p.module}>
        <div data-testid="fallback">{p.fallback as never}</div>
      </div>
    )
  },
  }
})

const { default: App, ACCOUNT_REMOTE, ADMIN_REMOTE, DASHBOARD_REMOTE, DRAFTING_REMOTE, TENDERS_REMOTE, WORKFLOWS_REMOTE, sectionOf } = await import('../../src/app/routes/App')
const { createStore } = await import('../../src/application/use-cases/loadSessionContext')
type AppNotices = import('../../src/app/routes/App').AppNotices
type RouterNavigate = import('../../src/app/routes/App').RouterNavigate

describe('App', () => {
  it('renders the dashboard remote under the workspace basename, with no props', () => {
    window.history.replaceState({}, '', '/t/acme/dashboard/tickets')
    render(<App basename="/t/acme" />)
    const remote = screen.getByTestId('remote')
    expect(remote).toHaveAttribute('data-remote', DASHBOARD_REMOTE)
    expect(remote).toHaveAttribute('data-module', './App')
    expect(screen.getByTestId('fallback')).toHaveTextContent('Loading dashboard…')
    expect(routeTemplate).toHaveBeenCalledWith('/t/:slug/dashboard')
    // The dashboard remote reads the user and sign-out from the SDK (useCurrentUser, useSignOut).
    expect(boundaryProps).toHaveBeenLastCalledWith(undefined)
  })

  it('renders the tenders remote under /tenders/*, with no props', () => {
    window.history.replaceState({}, '', '/t/acme/tenders/T-1/documents')
    render(<App basename="/t/acme" />)
    const remote = screen.getByTestId('remote')
    expect(remote).toHaveAttribute('data-remote', TENDERS_REMOTE)
    expect(TENDERS_REMOTE).toBe('tenders') // mfe-tender's container name and manifest key
    expect(remote).toHaveAttribute('data-module', './App')
    expect(screen.getByTestId('fallback')).toHaveTextContent('Loading tenders…')
    expect(routeTemplate).toHaveBeenCalledWith('/t/:slug/tenders')
    // mfe-tender's userLabel and onLogout are optional and default to the SDK's useCurrentUser and useSignOut.
    expect(boundaryProps).toHaveBeenLastCalledWith(undefined)
    expect(window.location.pathname).toBe('/t/acme/tenders/T-1/documents')
  })

  it.each([
    ['drafting', DRAFTING_REMOTE, 'mfe-drafting', '/t/acme/drafting/sections/S-1', 'Loading drafting…'],
    ['workflows', WORKFLOWS_REMOTE, 'mfe-workflow-designer', '/t/acme/workflows/W-1/editor', 'Loading workflows…'],
  ])('renders the %s remote under /%s/*, with no props', (name, remote, repo, path, loading) => {
    window.history.replaceState({}, '', path)
    render(<App basename="/t/acme" />)
    const boundary = screen.getByTestId('remote')
    expect(boundary).toHaveAttribute('data-remote', remote)
    expect(remote, repo).toBe(name) // the remote's container name and manifest key
    expect(boundary).toHaveAttribute('data-module', './App')
    expect(screen.getByTestId('fallback')).toHaveTextContent(loading)
    expect(routeTemplate).toHaveBeenCalledWith(`/t/:slug/${name}`)
    // Each reads the user and sign-out from the SDK (its props are optional).
    expect(boundaryProps).toHaveBeenLastCalledWith(undefined)
    expect(window.location.pathname).toBe(path)
  })

  it('redirects any other path to the dashboard', () => {
    window.history.replaceState({}, '', '/t/acme/elsewhere')
    render(<App basename="/t/acme" />)
    expect(window.location.pathname).toBe('/t/acme/dashboard')
  })

  it('says when permissions could not be loaded, and offers a reload', () => {
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    window.history.replaceState({}, '', '/t/acme/dashboard')
    context = undefined
    try {
      render(<App basename="/t/acme" />)
      expect(screen.getByRole('status')).toHaveTextContent("We couldn't load your permissions")
      fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
      expect(reload).toHaveBeenCalledOnce()
    } finally {
      context = { roles: ['member'] }
    }
  })

  it('shows no notice when the session context is loaded', () => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    render(<App basename="/t/acme" />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says the workspace is read-only while the SDK says so (spec §7.10), with no action', () => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    readOnly = true
    try {
      render(<App basename="/t/acme" />)
      expect(screen.getByRole('status')).toHaveTextContent('Workspace is read-only (subscription ended)')
      // The header's user menu is the page's only button.
      expect(within(screen.getByRole('status').parentElement!).queryByRole('button')).toBeNull()
    } finally {
      readOnly = false
    }
  })

  it('stacks the read-only and missing-permissions notices instead of overlapping them', () => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    readOnly = true
    context = undefined
    try {
      render(<App basename="/t/acme" />)
      const notices = screen.getAllByRole('status')
      expect(notices.map((n) => n.textContent)).toEqual([
        'Workspace is read-only (subscription ended)',
        expect.stringContaining("We couldn't load your permissions"),
      ])
      expect(notices[0]!.parentElement).toBe(notices[1]!.parentElement)
      // In the page's flow after the remote, sticky at the bottom: never fixed over the remote's last controls.
      const stack = notices[0]!.parentElement!
      expect(stack).toHaveClass('sticky', 'bottom-0')
      expect(stack).not.toHaveClass('fixed')
      expect(stack.previousElementSibling!.compareDocumentPosition(stack) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(stack.previousElementSibling).toHaveClass('flex-1')
    } finally {
      readOnly = false
      context = { roles: ['member'] }
    }
  })

  it('publishes the header and notice stack heights (--shell-header-height, --shell-notices-height) for remotes, and follows their size', () => {
    let observed: (() => void) | undefined
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: () => void) {
        observed = cb
      }
      observe() {}
      disconnect = disconnect
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(40)
    window.history.replaceState({}, '', '/t/acme/dashboard')
    const { unmount } = render(<App basename="/t/acme" />)
    const root = document.documentElement.style
    expect(root.getPropertyValue('--shell-notices-height')).toBe('40px')
    expect(root.getPropertyValue('--shell-header-height')).toBe('40px')
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(72)
    observed!()
    // The last observer made is the notice stack's (the header's comes first in the page).
    expect(root.getPropertyValue('--shell-notices-height')).toBe('72px')
    unmount()
    expect(disconnect).toHaveBeenCalledTimes(2)
    expect(root.getPropertyValue('--shell-notices-height')).toBe('')
    expect(root.getPropertyValue('--shell-header-height')).toBe('')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows the workspace banners in the same bottom stack, and follows the store when they arrive', () => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    const notices = createStore<AppNotices>({ banners: [] })
    render(<App basename="/t/acme" notices={notices} />)
    expect(screen.queryByRole('status')).toBeNull()
    act(() =>
      notices.set({
        banners: [{ kind: 'trial', days: 12 }, { kind: 'past-due' }, { kind: 'seats-full', seats: 25 }, { kind: 'ownerless' }],
      }),
    )
    expect(screen.getAllByRole('status').map((n) => n.textContent)).toEqual([
      '12 days left in your trial',
      en['app.banner.pastDue'],
      'All 25 seats are in use. New invitations will be refused until seats are added.',
      en['app.banner.ownerless'],
    ])
    expect(within(screen.getAllByRole('status')[0]!.parentElement!).queryByRole('button')).toBeNull()
  })

  it.each([
    [1, '1 day left in your trial'],
    [0, 'Your trial ends within a day'],
  ])('says %i trial days left in words', (days, words) => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    render(<App basename="/t/acme" notices={createStore<AppNotices>({ banners: [{ kind: 'trial', days }] })} />)
    expect(screen.getByRole('status')).toHaveTextContent(words)
  })

  it('says the trial has ended once its end has passed', () => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    render(<App basename="/t/acme" notices={createStore<AppNotices>({ banners: [{ kind: 'trial-ended' }] })} />)
    expect(screen.getByRole('status')).toHaveTextContent('Your trial has ended')
  })

  it("adds the grace end date to the read-only notice when IAM gives one (P-1 read_only_until)", () => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    readOnly = true
    try {
      render(<App basename="/t/acme" notices={createStore<AppNotices>({ banners: [], readOnlyUntil: '2026-12-24T10:00:00Z' })} />)
      expect(screen.getByRole('status')).toHaveTextContent('Workspace is read-only (subscription ended). Access ends on Dec 24, 2026.')
    } finally {
      readOnly = false
    }
  })

  it('offers a reload when a new version is live, and only then', () => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    const { rerender } = render(<App basename="/t/acme" />)
    expect(screen.queryByText('A new version is available.')).toBeNull()
    appUpdate.available = true
    try {
      rerender(<App basename="/t/acme" />)
      expect(screen.getByRole('status')).toHaveTextContent('A new version is available.')
      fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
      expect(appUpdate.reload).toHaveBeenCalledOnce()
    } finally {
      appUpdate.available = false
    }
  })

  it('works from the site root without a basename', () => {
    window.history.replaceState({}, '', '/')
    render(<App />)
    expect(window.location.pathname).toBe('/dashboard')
    expect(screen.getByTestId('remote')).toBeInTheDocument()
  })
})

describe('App, when its own screens fail to render', () => {
  // Logging and the web-error count under `mfe` are the SDK boundary's own behaviour (tested in the SDK).
  it('shows the error page (words from the catalogue, not the error), and Try again recovers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}) // React reports the caught render error
    let fail = true
    boundaryProps.mockImplementation(() => {
      if (fail) throw new Error('internal detail the user must not see')
    })
    window.history.replaceState({}, '', '/t/acme/dashboard')
    render(<App basename="/t/acme" />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong on this page.')
    expect(alert).not.toHaveTextContent('internal detail')
    expect(alert).toHaveFocus()

    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('remote')).toHaveAttribute('data-remote', DASHBOARD_REMOTE)
    boundaryProps.mockReset()
  })
})

describe('App header (app-chrome handoff, option A)', () => {
  const ALL = new Set(['dashboard', 'tenders', 'drafting', 'workflows', 'admin', 'me'])
  const nav = () => within(screen.getByRole('navigation', { name: 'Sections' }))
  const menu = () => screen.getByRole('button', { name: /Account menu/ })

  afterEach(() => {
    frame.admin = false
    frame.on = true
    frame.user = { sub: 'u-1', name: 'Ada Lovelace', email: 'ada@acme.com' }
    frame.workspace = { realm: 'tenant-acme', trial: false, slug: 'acme' }
    frame.signOut.mockClear()
    frame.switchWorkspace.mockReset().mockResolvedValue(undefined)
    remoteMounted.mockClear()
    permissionAsked.mockClear()
  })

  it('links to each served remote under the basename, and marks the current section', () => {
    window.history.replaceState({}, '', '/t/acme/tenders/T-1')
    render(<App basename="/t/acme" remotes={new Set(['dashboard', 'tenders'])} />)
    const links = nav().getAllByRole('link')
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Dashboard', '/t/acme/dashboard'],
      ['Tenders', '/t/acme/tenders'],
    ])
    expect(nav().getByRole('link', { name: 'Tenders' })).toHaveAttribute('aria-current', 'page')
    expect(nav().getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  it('lists the sections in a fixed order, and none when the manifest serves none', () => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    const { unmount } = render(<App basename="/t/acme" remotes={ALL} />)
    expect(nav().getAllByRole('link').map((l) => l.textContent)).toEqual(['Dashboard', 'Tenders', 'Drafting', 'Workflows'])
    unmount()
    render(<App basename="/t/acme" />)
    expect(nav().queryAllByRole('link')).toEqual([])
  })

  it('shows Admin only to a user who may manage members, and only when mfe-admin is served', () => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    const { rerender } = render(<App basename="/t/acme" remotes={ALL} />)
    expect(nav().queryByRole('link', { name: 'Admin' })).toBeNull()
    expect(permissionAsked).toHaveBeenCalledWith('manage:members')
    frame.admin = true
    rerender(<App basename="/t/acme" remotes={ALL} />)
    expect(nav().getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/t/acme/admin')
    rerender(<App basename="/t/acme" remotes={new Set(['dashboard'])} />)
    expect(nav().queryByRole('link', { name: 'Admin' })).toBeNull()
  })

  it.each([
    ['admin', '/t/acme/admin/users', 'Loading admin…'],
    ['me', '/t/acme/me/profile', 'Loading your account…'],
  ])('renders the %s remote under its route, with no props', (name, path, loading) => {
    window.history.replaceState({}, '', path)
    render(<App basename="/t/acme" />)
    const boundary = screen.getByTestId('remote')
    expect(boundary).toHaveAttribute('data-remote', name)
    expect([ADMIN_REMOTE, ACCOUNT_REMOTE]).toContain(name)
    expect(screen.getByTestId('fallback')).toHaveTextContent(loading)
    expect(routeTemplate).toHaveBeenCalledWith(`/t/:slug/${name}`)
    expect(boundaryProps).toHaveBeenLastCalledWith(undefined)
    expect(window.location.pathname).toBe(path)
  })

  it('follows a link with its own router (no page load), and opens the start of the section the user is in', () => {
    window.history.replaceState({}, '', '/t/acme/tenders/T-1')
    render(<App basename="/t/acme" remotes={ALL} />)
    expect(remoteMounted).toHaveBeenCalledTimes(1)
    const click = fireEvent.click(nav().getByRole('link', { name: 'Dashboard' }))
    expect(click).toBe(false) // default prevented: no page load
    expect(window.location.pathname).toBe('/t/acme/dashboard')
    expect(screen.getByTestId('remote')).toHaveAttribute('data-remote', DASHBOARD_REMOTE)
    expect(nav().getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page')
    // The remote runs its own router: the same section's link mounts it again at its start page.
    fireEvent.click(nav().getByRole('link', { name: 'Dashboard' }))
    expect(remoteMounted).toHaveBeenCalledTimes(3)
    expect(remoteMounted).toHaveBeenLastCalledWith(DASHBOARD_REMOTE)
  })

  it("hands the SDK's navigator a navigate that remounts the section already mounted (handoff §3.3)", async () => {
    window.history.replaceState({}, '', '/t/acme/admin/settings')
    let navigate!: RouterNavigate
    render(<App basename="/t/acme" onRouter={(n) => (navigate = n)} />)
    expect(remoteMounted).toHaveBeenCalledTimes(1)
    // Another path in the same remote: the remote's own router would not follow, so it mounts again there.
    await act(async () => navigate('/admin/users'))
    expect(window.location.pathname).toBe('/t/acme/admin/users')
    expect(remoteMounted).toHaveBeenCalledTimes(2)
    expect(remoteMounted).toHaveBeenLastCalledWith(ADMIN_REMOTE)
    // Another section: that remote mounts once, as a route change does anyway.
    await act(async () => navigate('/me/profile', { replace: true }))
    expect(window.location.pathname).toBe('/t/acme/me/profile')
    expect(remoteMounted).toHaveBeenCalledTimes(3)
    expect(remoteMounted).toHaveBeenLastCalledWith(ACCOUNT_REMOTE)
  })

  it("decides by the section the shell's routes show, not the address bar a remote's own router moved", async () => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    let navigate!: RouterNavigate
    render(<App basename="/t/acme" onRouter={(n) => (navigate = n)} />)
    expect(remoteMounted).toHaveBeenCalledTimes(1)
    // The dashboard's own router moves to a tenders path: the shell's routes still show the dashboard.
    window.history.pushState({}, '', '/t/acme/tenders/T-1')
    await act(async () => navigate('/dashboard/x'))
    // The dashboard element stays, so it is mounted again at the new path.
    expect(window.location.pathname).toBe('/t/acme/dashboard/x')
    expect(remoteMounted).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('remote')).toHaveAttribute('data-remote', DASHBOARD_REMOTE)
  })

  it('remounts nothing for a move that changes neither the path nor the query (no lost state, no loop)', async () => {
    window.history.replaceState({}, '', '/t/acme/admin/users?tab=1')
    let navigate!: RouterNavigate
    render(<App basename="/t/acme" onRouter={(n) => (navigate = n)} />)
    await act(async () => navigate('/admin/users?tab=1', { replace: true }))
    await act(async () => navigate('/admin/users?tab=1#row-3'))
    expect(remoteMounted).toHaveBeenCalledTimes(1)
    // A new query is a new page for the remote: it is mounted again there.
    await act(async () => navigate('/admin/users?tab=2'))
    expect(remoteMounted).toHaveBeenCalledTimes(2)
  })

  it('remounts the section already mounted from the site root too (no basename)', async () => {
    window.history.replaceState({}, '', '/tenders/T-1')
    let navigate!: RouterNavigate
    render(<App onRouter={(n) => (navigate = n)} />)
    expect(remoteMounted).toHaveBeenCalledTimes(1)
    await act(async () => navigate('/tenders/T-2'))
    expect(window.location.pathname).toBe('/tenders/T-2')
    expect(remoteMounted).toHaveBeenCalledTimes(2)
  })

  it('names a path’s section by its first segment', () => {
    expect(sectionOf('/tenders/T-1/documents')).toBe('/tenders')
    expect(sectionOf('/admin?tab=1')).toBe('/admin')
    expect(sectionOf('/me#top')).toBe('/me')
    expect(sectionOf('/')).toBe('/')
    expect(sectionOf('')).toBe('/')
  })

  it('leaves a new-tab click to the browser', () => {
    window.history.replaceState({}, '', '/t/acme/tenders')
    render(<App basename="/t/acme" remotes={ALL} />)
    // Seen after the shell's handler, then stopped so the test DOM does not follow the link itself.
    let prevented: boolean | undefined
    const record = (e: Event) => {
      prevented = e.defaultPrevented
      e.preventDefault()
    }
    document.addEventListener('click', record)
    try {
      fireEvent.click(nav().getByRole('link', { name: 'Dashboard' }), { ctrlKey: true })
    } finally {
      document.removeEventListener('click', record)
    }
    expect(prevented).toBe(false)
    expect(window.location.pathname).toBe('/t/acme/tenders')
    expect(screen.getByTestId('remote')).toHaveAttribute('data-remote', TENDERS_REMOTE)
  })

  it('names the user and the workspace in the user menu, and links My account when mfe-me is served', () => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    const notices = createStore<AppNotices>({ banners: [] })
    render(<App basename="/t/acme" remotes={ALL} notices={notices} />)
    expect(menu()).toHaveAccessibleName('Account menu: Ada Lovelace')
    expect(menu()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(menu())
    expect(menu()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('ada@acme.com')).toBeInTheDocument()
    expect(screen.getByText('Workspace: acme')).toBeInTheDocument()
    // P-1's name replaces the slug once loaded.
    act(() => notices.set({ banners: [], workspaceName: 'Acme Ltd' }))
    expect(screen.getByText('Workspace: Acme Ltd')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'My account' }))
    expect(window.location.pathname).toBe('/t/acme/me')
    expect(screen.getByTestId('remote')).toHaveAttribute('data-remote', ACCOUNT_REMOTE)
    expect(menu()).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the email when the user has no name, and no My account without mfe-me', () => {
    frame.user = { sub: 'u-1', email: 'ada@acme.com' }
    frame.workspace = { realm: 'trial', trial: true }
    window.history.replaceState({}, '', '/dashboard')
    render(<App remotes={new Set(['dashboard'])} />)
    expect(menu()).toHaveAccessibleName('Account menu: ada@acme.com')
    fireEvent.click(menu())
    expect(screen.queryByRole('link', { name: 'My account' })).toBeNull()
    expect(screen.queryByText(/^Workspace:/)).toBeNull()
  })

  it('shows the name alone when the user has no email', () => {
    frame.user = { sub: 'u-1', name: 'Ada Lovelace' }
    window.history.replaceState({}, '', '/t/acme/dashboard')
    render(<App basename="/t/acme" />)
    fireEvent.click(menu())
    const panel = document.getElementById(menu().getAttribute('aria-controls')!)!
    expect([...panel.firstElementChild!.children].map((p) => p.textContent)).toEqual(['Ada Lovelace', 'Workspace: acme'])
  })

  it('shows the workspace alone when the SDK has no user', () => {
    frame.user = undefined
    window.history.replaceState({}, '', '/t/acme/dashboard')
    render(<App basename="/t/acme" />)
    fireEvent.click(menu())
    const panel = document.getElementById(menu().getAttribute('aria-controls')!)!
    expect([...panel.firstElementChild!.children].map((p) => p.textContent)).toEqual(['Workspace: acme'])
  })

  it('names the menu when the SDK has no user, and shows no identity block without a user or a workspace', () => {
    frame.user = undefined
    frame.workspace = undefined
    window.history.replaceState({}, '', '/t/acme/dashboard')
    render(<App basename="/t/acme" />)
    expect(menu()).toHaveAccessibleName('Account menu')
    fireEvent.click(menu())
    const panel = document.getElementById(menu().getAttribute('aria-controls')!)!
    expect(panel.firstElementChild!.tagName).toBe('UL')
    expect(within(panel).getAllByRole('button').map((b) => b.textContent)).toEqual(['Switch workspace', 'Sign out'])
  })

  it('closes the menu on Escape, when focus moves out of it, and on a press outside it', () => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    render(<App basename="/t/acme" remotes={ALL} />)
    fireEvent.click(menu())
    fireEvent.keyDown(menu(), { key: 'Escape' })
    expect(menu()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(menu(), { key: 'Escape' })
    fireEvent.click(menu())
    fireEvent.blur(menu(), { relatedTarget: screen.getByRole('button', { name: 'Sign out' }) })
    expect(menu()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.blur(menu(), { relatedTarget: document.body })
    expect(menu()).toHaveAttribute('aria-expanded', 'false')
    // A blur with no new focus (WebKit does not focus a clicked button) leaves it open; a press outside closes it.
    fireEvent.click(menu())
    fireEvent.blur(menu(), { relatedTarget: null })
    expect(menu()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Sign out' }))
    expect(menu()).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerDown(document.body)
    expect(menu()).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(menu())
    fireEvent.click(menu())
    expect(menu()).toHaveAttribute('aria-expanded', 'false')
  })

  it("signs out through the SDK's useSignOut (global)", () => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    render(<App basename="/t/acme" />)
    fireEvent.click(menu())
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(frame.signOut).toHaveBeenCalledWith()
  })

  it("switches workspace through the SDK's useSwitchWorkspace with what the user typed", async () => {
    window.history.replaceState({}, '', '/t/acme/dashboard')
    render(<App basename="/t/acme" />)
    fireEvent.click(menu())
    fireEvent.click(screen.getByRole('button', { name: 'Switch workspace' }))
    const input = screen.getByLabelText('Work email or workspace name')
    expect(input).toHaveFocus()
    // Nothing typed: nothing asked.
    fireEvent.submit(input)
    expect(frame.switchWorkspace).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '  globex ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(frame.switchWorkspace).toHaveBeenCalledWith('globex')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled())
    expect(screen.queryByRole('alert')).toBeNull()
    // Cancel returns to the menu.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Switch workspace' })).toBeInTheDocument()
  })

  it('says so when the workspace service cannot answer, and lets the user try again', async () => {
    frame.switchWorkspace.mockRejectedValueOnce(new Error('PUB-1 unreachable'))
    window.history.replaceState({}, '', '/t/acme/dashboard')
    render(<App basename="/t/acme" />)
    fireEvent.click(menu())
    fireEvent.click(screen.getByRole('button', { name: 'Switch workspace' }))
    fireEvent.change(screen.getByLabelText('Work email or workspace name'), { target: { value: 'globex' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't reach the workspace service. Try again.")
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    // A second submit while the first is pending is ignored.
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(frame.switchWorkspace).toHaveBeenCalledTimes(2)
  })

  it('is off where the runtime config sets shell.frame to false', () => {
    frame.on = false
    window.history.replaceState({}, '', '/t/acme/dashboard')
    render(<App basename="/t/acme" remotes={ALL} />)
    expect(screen.queryByRole('banner')).toBeNull()
    expect(document.documentElement.style.getPropertyValue('--shell-header-height')).toBe('')
    expect(screen.getByTestId('remote')).toBeInTheDocument()
  })
})
