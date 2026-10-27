import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'
import { setUrl } from '../helpers/load-auth'

const initKeycloak = vi.hoisted(() => vi.fn())

vi.mock('../../src/auth/keycloak', async () => {
  const actual = await vi.importActual<typeof import('../../src/auth/keycloak')>(
    '../../src/auth/keycloak',
  )
  return { ...actual, initKeycloak }
})

describe('shell auth failures', () => {
  beforeEach(() => {
    setUrl('/?code=abc&state=state-1')
    initKeycloak.mockReset()
  })

  it('shows an Error message from Keycloak init', async () => {
    initKeycloak.mockRejectedValue(new Error('token boom'))
    render(<App />)
    expect(await screen.findByText('token boom')).toBeInTheDocument()
  })

  it('shows a fallback message when init rejects with a non-error', async () => {
    initKeycloak.mockRejectedValue('nope')
    render(<App />)
    expect(await screen.findByText('Failed to complete Keycloak sign-in.')).toBeInTheDocument()
  })
})
