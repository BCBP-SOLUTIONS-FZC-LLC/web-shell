import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { stubKeycloakEnv } from '../helpers/load-auth'

describe('shell without Keycloak config', () => {
  it('renders the login page and does not probe Keycloak', async () => {
    vi.resetModules()
    stubKeycloakEnv({
      VITE_KEYCLOAK_URL: ' ',
      VITE_KEYCLOAK_REALM: ' ',
      VITE_KEYCLOAK_CLIENT_ID: ' ',
    })
    const { default: App } = await import('../../src/App')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Login to your account' })).toBeInTheDocument()
    expect(screen.queryByText(/Checking Keycloak/)).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })
})