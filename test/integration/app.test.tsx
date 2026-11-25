import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import en from '../../src/shared/i18n/en.json'

const routeTemplate = vi.fn()
const boundaryProps = vi.fn()
let context: unknown = { roles: ['member'] }
const appUpdate = { available: false, reload: vi.fn() }
let readOnly = false
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/react', async (original) => ({
  ...(await original<object>()), // the real useT, for the shell's text
  useRouteTemplate: (t: string) => routeTemplate(t),
  useSessionContext: () => context,
  useAppUpdate: () => appUpdate,
  useReadOnly: () => readOnly,
  RemoteBoundary: (p: { remote: string; module: string; fallback: unknown; props?: unknown }) => {
    boundaryProps(p.props)
    return (
      <div data-testid="remote" data-remote={p.remote} data-module={p.module}>
        <div data-testid="fallback">{p.fallback as never}</div>
      </div>
    )
  },
}))

const { default: App, DASHBOARD_REMOTE, TENDERS_REMOTE } = await import('../../src/app/routes/App')
const { createStore } = await import('../../src/application/use-cases/loadSessionContext')
type AppNotices = import('../../src/app/routes/App').AppNotices

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
      expect(screen.queryByRole('button')).toBeNull()
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

  it('publishes the notice stack height as --shell-notices-height for remotes, and follows its size', () => {
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
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(72)
    observed!()
    expect(root.getPropertyValue('--shell-notices-height')).toBe('72px')
    unmount()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(root.getPropertyValue('--shell-notices-height')).toBe('')
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
    expect(screen.queryByRole('button')).toBeNull()
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
