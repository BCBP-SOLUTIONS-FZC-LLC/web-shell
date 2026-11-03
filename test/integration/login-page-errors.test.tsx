import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginLatest from '../../src/pages/LoginPage'
import LoginPrevious from '../../src/pages/LoginPage1'

const pages = [
  ['latest', LoginLatest],
  ['login1', LoginPrevious],
] as const

const redirectToKeycloakLogin = vi.hoisted(() => vi.fn())

vi.mock('../../src/auth/keycloak', async () => {
  const actual = await vi.importActual<typeof import('../../src/auth/keycloak')>(
    '../../src/auth/keycloak',
  )
  return { ...actual, redirectToKeycloakLogin }
})

describe.each(pages)('login page sign-in errors %s', (_name, LoginPage) => {
  beforeEach(() => {
    redirectToKeycloakLogin.mockReset()
  })

  async function submit() {
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: /work email address/i }), 'ada@bcbp.com')
    await user.click(screen.getByRole('button', { name: /continue with email/i }))
  }

  it('shows the Docker steps when Keycloak cannot be reached', async () => {
    redirectToKeycloakLogin.mockRejectedValue(new Error('Cannot reach Keycloak at http://localhost:8080'))
    render(<LoginPage />)
    await submit()
    expect(await screen.findByText(/Cannot reach Keycloak/)).toBeInTheDocument()
    expect(screen.getByText(/Open Docker Desktop/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue with email/i })).toBeEnabled()
  })

  it('shows a generic message when sign-in fails with a non-error', async () => {
    redirectToKeycloakLogin.mockRejectedValue('nope')
    render(<LoginPage />)
    await submit()
    expect(await screen.findByText('Unable to start sign-in.')).toBeInTheDocument()
    expect(screen.queryByText(/Open Docker Desktop/)).not.toBeInTheDocument()
  })

  it('shows Redirecting while the authorize request is still running', async () => {
    redirectToKeycloakLogin.mockImplementation(() => new Promise(() => {}))
    render(<LoginPage />)
    await submit()
    expect(await screen.findByRole('button', { name: 'Redirecting…' })).toBeDisabled()
  })
})
