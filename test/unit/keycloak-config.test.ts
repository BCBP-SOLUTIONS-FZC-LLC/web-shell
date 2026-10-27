import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadAuthModules, stubKeycloakEnv } from '../helpers/load-auth'

describe('keycloak config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('treats a fully populated env as configured', async () => {
    stubKeycloakEnv()
    const { config } = await loadAuthModules()

    expect(config.isKeycloakConfigured()).toBe(true)
    expect(config.keycloakConfig).toEqual({
      url: 'http://localhost:8080',
      realm: 'bcbp',
      clientId: 'web-shell',
    })
  })

  it.each([
    [{ VITE_KEYCLOAK_URL: '   ' }, 'blank url'],
    [{ VITE_KEYCLOAK_REALM: '  ' }, 'blank realm'],
    [{ VITE_KEYCLOAK_CLIENT_ID: ' ' }, 'blank client id'],
  ])('is not configured when $1 is only whitespace', async (overrides) => {
    stubKeycloakEnv(overrides)
    const { config } = await loadAuthModules()
    expect(config.isKeycloakConfigured()).toBe(false)
  })

  it('trims surrounding whitespace from env values', async () => {
    stubKeycloakEnv({
      VITE_KEYCLOAK_URL: '  http://localhost:8080  ',
      VITE_KEYCLOAK_REALM: '  bcbp ',
      VITE_KEYCLOAK_CLIENT_ID: ' web-shell ',
    })
    const { config } = await loadAuthModules()
    expect(config.keycloakConfig).toEqual({
      url: 'http://localhost:8080',
      realm: 'bcbp',
      clientId: 'web-shell',
    })
  })

  it('uses the configured redirect URI when one is set', async () => {
    stubKeycloakEnv({ VITE_KEYCLOAK_REDIRECT_URI: ' https://shell.example/dashboard ' })
    const { config } = await loadAuthModules()
    expect(config.getKeycloakRedirectUri()).toBe('https://shell.example/dashboard')
  })

  it('defaults the redirect URI to the shell origin /dashboard', async () => {
    stubKeycloakEnv({ VITE_KEYCLOAK_REDIRECT_URI: '   ' })
    const { config } = await loadAuthModules()
    expect(config.getKeycloakRedirectUri()).toBe(`${window.location.origin}/dashboard`)
  })
})
