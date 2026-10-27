import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '../../src/pages/LoginPage'

function deferredFetch() {
  let release: (response: Response) => void = () => {}
  const pending = new Promise<Response>((resolve) => {
    release = resolve
  })
  vi.mocked(fetch).mockImplementation(() => pending)
  return (response: Response) => release(response)
}

describe('login page', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('shows the brand, feature list, and a Keycloak status while the check is in flight', async () => {
    const release = deferredFetch()
    render(<LoginPage />)

    expect(screen.getByRole('img', { name: 'Beyond Code' })).toBeInTheDocument()
    expect(screen.getByText('95% Accuracy Forecasting')).toBeInTheDocument()
    expect(screen.getByText('Real-time Site Monitoring')).toBeInTheDocument()
    expect(screen.getByText('Safety & Compliance')).toBeInTheDocument()
    expect(screen.getByText('Checking Keycloak…')).toBeInTheDocument()

    release(new Response('{}', { status: 200 }))
    expect(await screen.findByText(/Keycloak ready \(realm bcbp\)/)).toBeInTheDocument()
  })

  it('warns when Keycloak does not respond and checks again on focus', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    render(<LoginPage />)

    expect(await screen.findByText(/not responding on port 8080/)).toBeInTheDocument()

    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }))
    window.dispatchEvent(new Event('focus'))
    expect(await screen.findByText(/Keycloak ready \(realm bcbp\)/)).toBeInTheDocument()
  })

  it('ignores a status response that arrives after the page unmounts', async () => {
    const release = deferredFetch()
    const view = render(<LoginPage />)
    expect(screen.getByText('Checking Keycloak…')).toBeInTheDocument()
    view.unmount()
    release(new Response('{}', { status: 200 }))
    await waitFor(() => {
      expect(screen.queryByText(/Keycloak ready/)).not.toBeInTheDocument()
    })
  })

  it('prefills a remembered email', () => {
    localStorage.setItem('bcbp.rememberEmail', 'true')
    localStorage.setItem('bcbp.loginEmail', 'ada@bcbp.com')
    render(<LoginPage />)
    expect(screen.getByRole('textbox', { name: /work email address/i })).toHaveValue('ada@bcbp.com')
    expect(screen.getByRole('checkbox', { name: /remember email/i })).toBeChecked()
  })

  it('shows an auth callback error and strips a leftover state param', async () => {
    window.history.replaceState({}, '', '/?state=leftover')
    render(<LoginPage authCallbackError="Sign-in state mismatch. Try again." />)
    expect(screen.getByText('Sign-in state mismatch. Try again.')).toBeInTheDocument()
    await waitFor(() => {
      expect(window.location.search).toBe('')
    })
  })

  it('leaves the callback url intact while the code is still present', () => {
    window.history.replaceState({}, '', '/?code=abc&state=s')
    render(<LoginPage authCallbackError="still exchanging" />)
    expect(window.location.search).toContain('code=abc')
  })

  it('stores the email and redirects to Keycloak', async () => {
    const user = userEvent.setup()
    const onDismissAuthError = vi.fn()
    render(<LoginPage authCallbackError="old" onDismissAuthError={onDismissAuthError} />)
    releaseOnline()

    await user.type(screen.getByRole('textbox', { name: /work email address/i }), 'ada@bcbp.com')
    await user.click(screen.getByRole('checkbox', { name: /remember email/i }))
    await user.click(screen.getByRole('button', { name: /continue with email/i }))

    await waitFor(() => {
      expect(window.location.replace).toHaveBeenCalledWith(
        expect.stringContaining('login_hint=ada%40bcbp.com'),
      )
    })
    expect(localStorage.getItem('bcbp.loginEmail')).toBe('ada@bcbp.com')
    expect(onDismissAuthError).toHaveBeenCalled()
  })

  it('clears a remembered email when the box is unchecked', async () => {
    localStorage.setItem('bcbp.rememberEmail', 'true')
    localStorage.setItem('bcbp.loginEmail', 'ada@bcbp.com')
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.click(screen.getByRole('checkbox', { name: /remember email/i }))
    await user.click(screen.getByRole('button', { name: /continue with email/i }))

    await waitFor(() => {
      expect(window.location.replace).toHaveBeenCalled()
    })
    expect(localStorage.getItem('bcbp.rememberEmail')).toBeNull()
    expect(localStorage.getItem('bcbp.loginEmail')).toBeNull()
  })

  it('submits without a dismiss callback', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)
    await user.type(screen.getByRole('textbox', { name: /work email address/i }), 'ada@bcbp.com')
    await user.click(screen.getByRole('button', { name: /continue with email/i }))
    await waitFor(() => {
      expect(window.location.replace).toHaveBeenCalled()
    })
  })
})

function releaseOnline() {
  vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 200 }))
}
