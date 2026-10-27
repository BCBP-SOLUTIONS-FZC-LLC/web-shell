import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { stubKeycloakEnv } from '../helpers/load-auth'

describe('login page without Keycloak config', () => {
  it('asks for env variables instead of redirecting', async () => {
    vi.resetModules()
    stubKeycloakEnv({
      VITE_KEYCLOAK_URL: ' ',
      VITE_KEYCLOAK_REALM: ' ',
      VITE_KEYCLOAK_CLIENT_ID: ' ',
    })
    const { default: LoginPage } = await import('../../src/pages/LoginPage')
    const user = userEvent.setup()
    const onDismissAuthError = vi.fn()

    render(<LoginPage onDismissAuthError={onDismissAuthError} />)
    expect(screen.queryByText(/Checking Keycloak/)).not.toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: /work email address/i }), 'ada@bcbp.com')
    await user.click(screen.getByRole('button', { name: /continue with email/i }))

    expect(
      screen.getByText(/Keycloak is not configured. Add VITE_KEYCLOAK_\* variables/),
    ).toBeInTheDocument()
    expect(onDismissAuthError).toHaveBeenCalled()
    expect(window.location.replace).not.toHaveBeenCalled()
  })
})
