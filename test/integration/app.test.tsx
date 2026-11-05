import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const routeTemplate = vi.fn()
const boundaryProps = vi.fn()
let context: unknown = { roles: ['member'] }
const appUpdate = { available: false, reload: vi.fn() }
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/react', () => ({
  useRouteTemplate: (t: string) => routeTemplate(t),
  useSessionContext: () => context,
  useAppUpdate: () => appUpdate,
  RemoteBoundary: (p: { remote: string; module: string; fallback: unknown; props?: unknown }) => {
    boundaryProps(p.props)
    return (
      <div data-testid="remote" data-remote={p.remote} data-module={p.module}>
        <div data-testid="fallback">{p.fallback as never}</div>
      </div>
    )
  },
}))

const { default: App, DASHBOARD_REMOTE } = await import('../../src/App')

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
