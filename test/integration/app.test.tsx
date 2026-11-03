import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const signOut = vi.fn(async () => {})
const currentUser = vi.fn()
const routeTemplate = vi.fn()
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/react', () => ({
  useCurrentUser: () => currentUser(),
  useSignOut: () => signOut,
  useRouteTemplate: (t: string) => routeTemplate(t),
  RemoteBoundary: (p: {
    remote: string
    module: string
    fallback: unknown
    props: { userLabel: string; onLogout: () => void }
  }) => (
    <div data-testid="remote" data-remote={p.remote} data-module={p.module}>
      <div data-testid="fallback">{p.fallback as never}</div>
      {p.props.userLabel}
      <button type="button" onClick={p.props.onLogout}>
        Log out
      </button>
    </div>
  ),
}))

const { default: App, DASHBOARD_REMOTE } = await import('../../src/App')

describe('App', () => {
  beforeEach(() => {
    signOut.mockClear()
    currentUser.mockReturnValue({ sub: 'u', email: 'ada@acme.com', name: 'Ada' })
  })

  it('renders the dashboard remote under the workspace basename', () => {
    window.history.replaceState({}, '', '/t/acme/dashboard/tickets')
    render(<App basename="/t/acme" />)
    const remote = screen.getByTestId('remote')
    expect(remote).toHaveAttribute('data-remote', DASHBOARD_REMOTE)
    expect(remote).toHaveAttribute('data-module', './App')
    expect(remote).toHaveTextContent('ada@acme.com')
    expect(routeTemplate).toHaveBeenCalledWith('/t/:slug/dashboard')
    expect(screen.getByTestId('fallback')).toHaveTextContent('Loading dashboard…')
  })

  it('redirects any other path to the dashboard', () => {
    window.history.replaceState({}, '', '/t/acme/elsewhere')
    render(<App basename="/t/acme" />)
    expect(window.location.pathname).toBe('/t/acme/dashboard')
  })

  it('works from the site root without a basename', () => {
    window.history.replaceState({}, '', '/')
    render(<App />)
    expect(window.location.pathname).toBe('/dashboard')
    expect(screen.getByTestId('remote')).toBeInTheDocument()
  })

  it.each([
    [{ sub: 'u', name: 'Ada' }, 'Ada'],
    [{ sub: 'u' }, 'User'],
    [undefined, 'User'],
  ])('labels the user %o as %s', (user, label) => {
    currentUser.mockReturnValue(user)
    window.history.replaceState({}, '', '/dashboard')
    render(<App />)
    expect(screen.getByTestId('remote')).toHaveTextContent(label)
  })

  it('signs out globally from the remote', async () => {
    window.history.replaceState({}, '', '/dashboard')
    render(<App />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Log out' }))
    expect(signOut).toHaveBeenCalledWith()
  })
})
