import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { idToken, jsonResponse, setUrl } from '../helpers/load-auth'

const SESSION_KEY = 'app1.oauth.session'

function signIn(session: Record<string, string>) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

describe('shell routing', () => {
  beforeEach(() => {
    ;(globalThis as { __DASHBOARD_THROW__?: boolean }).__DASHBOARD_THROW__ = false
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('shows the login page when nobody is signed in', async () => {
    setUrl('/')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Login to your account' })).toBeInTheDocument()
  })

  it('shows the login page for an anonymous dashboard section and can start sign-in', async () => {
    setUrl('/dashboard/team')
    render(<App />)
    const user = userEvent.setup()
    await user.type(await screen.findByRole('textbox', { name: /work email address/i }), 'ada@bcbp.com')
    await user.click(screen.getByRole('button', { name: /continue with email/i }))
    await waitFor(() => {
      expect(window.location.replace).toHaveBeenCalledWith(
        expect.stringContaining('login_hint=ada%40bcbp.com'),
      )
    })
  })

  it('sends an anonymous visit to /dashboard back to the login page', async () => {
    setUrl('/dashboard')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Login to your account' })).toBeInTheDocument()
  })

  it('sends an anonymous unknown route back to the login page', async () => {
    setUrl('/settings')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Login to your account' })).toBeInTheDocument()
  })

  it('opens the remote dashboard for a stored session', async () => {
    signIn({ accessToken: 'token', email: 'ada@bcbp.com' })
    setUrl('/')
    render(<App />)
    expect(await screen.findByText('Remote dashboard')).toBeInTheDocument()
    expect(screen.getByText('ada@bcbp.com')).toBeInTheDocument()
  })

  it('keeps a signed-in user on /dashboard', async () => {
    signIn({ accessToken: 'token', username: 'ada' })
    setUrl('/dashboard')
    render(<App />)
    expect(await screen.findByText('ada')).toBeInTheDocument()
  })

  it('sends a signed-in unknown route to the dashboard', async () => {
    signIn({ accessToken: 'token' })
    setUrl('/elsewhere')
    render(<App />)
    expect(await screen.findByText('User')).toBeInTheDocument()
  })

  it('shows Completing sign-in until the token exchange finishes', async () => {
    setUrl('/?code=abc&state=state-1')
    sessionStorage.setItem(
      'app1.oauth.pending.state-1',
      JSON.stringify({ verifier: 'verifier', redirectUri: 'http://localhost:5001/dashboard' }),
    )
    let release: (response: Response) => void = () => {}
    vi.mocked(fetch).mockImplementation(
      (input) =>
        new Promise((resolve) => {
          if (String(input).includes('/token') || String(input).includes('openid-connect/token')) {
            release = resolve
            return
          }
          resolve(jsonResponse({}))
        }),
    )

    render(<App />)
    expect(screen.getByText('Completing sign-in…')).toBeInTheDocument()

    release(
      jsonResponse({
        access_token: 'access',
        id_token: idToken({ email: 'ada@bcbp.com' }),
      }),
    )
    expect(await screen.findByText('ada@bcbp.com')).toBeInTheDocument()
  })

  it('shows the login page when a callback does not produce a session', async () => {
    setUrl('/?code=abc&state=state-1')
    sessionStorage.setItem('app1.oauth.exchanged_code', 'abc')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Login to your account' })).toBeInTheDocument()
  })

  it('shows the callback error and clears it when sign-in starts again', async () => {
    setUrl('/?code=abc')
    render(<App />)
    expect(await screen.findByText(/Missing OAuth state/)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: /work email address/i }), 'ada@bcbp.com')
    await user.click(screen.getByRole('button', { name: /continue with email/i }))
    await waitFor(() => {
      expect(screen.queryByText(/Missing OAuth state/)).not.toBeInTheDocument()
    })
  })

  it('explains a failed remote and still offers logout from a healthy remote', async () => {
    ;(globalThis as { __DASHBOARD_THROW__?: boolean }).__DASHBOARD_THROW__ = true
    signIn({ accessToken: 'token', email: 'ada@bcbp.com' })
    const broken = render(<App />)
    expect(await screen.findByText(/Dashboard could not be loaded/)).toBeInTheDocument()
    broken.unmount()

    ;(globalThis as { __DASHBOARD_THROW__?: boolean }).__DASHBOARD_THROW__ = false
    render(<App />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Log out' }))
    expect(window.location.assign).toHaveBeenCalledWith(
      expect.stringContaining('/protocol/openid-connect/logout?'),
    )
  })

  it('ignores a stale bootstrap when the effect runs twice', async () => {
    setUrl('/?code=abc&state=state-1')
    sessionStorage.setItem(
      'app1.oauth.pending.state-1',
      JSON.stringify({ verifier: 'verifier', redirectUri: 'http://localhost:5001/dashboard' }),
    )
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes('token')) {
        return jsonResponse({ access_token: 'access', id_token: idToken({ email: 'ada@bcbp.com' }) })
      }
      return jsonResponse({})
    })

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    expect(await screen.findByText('ada@bcbp.com')).toBeInTheDocument()
  })
})
