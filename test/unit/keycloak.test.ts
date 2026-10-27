import { beforeEach, describe, expect, it, vi } from 'vitest'
import { idToken, jsonResponse, loadAuthModules, setUrl, stubKeycloakEnv } from '../helpers/load-auth'

describe('keycloak facade', () => {
  beforeEach(() => {
    stubKeycloakEnv()
  })

  it('returns an existing session without calling Keycloak', async () => {
    const { keycloak } = await loadAuthModules()
    sessionStorage.setItem(
      'app1.oauth.session',
      JSON.stringify({ accessToken: 'already', email: 'ada@bcbp.com' }),
    )

    await expect(keycloak.initKeycloak()).resolves.toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('stays signed out when the url has no callback', async () => {
    const { keycloak } = await loadAuthModules()
    setUrl('/')
    await expect(keycloak.initKeycloak()).resolves.toBe(false)
  })

  it('completes a callback into an authenticated session', async () => {
    const { keycloak, oauth } = await loadAuthModules()
    setUrl('/?code=abc&state=state-1')
    sessionStorage.setItem(
      'app1.oauth.pending.state-1',
      JSON.stringify({ verifier: 'verifier', redirectUri: 'http://localhost:5001/dashboard' }),
    )
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        access_token: 'access',
        id_token: idToken({ email: 'ada@bcbp.com', preferred_username: 'ada' }),
      }),
    )

    await expect(keycloak.initKeycloak()).resolves.toBe(true)
    expect(oauth.getOAuthSession()?.email).toBe('ada@bcbp.com')
  })

  it('is not authenticated when the exchanged session has no access token', async () => {
    const { keycloak } = await loadAuthModules()
    setUrl('/?code=abc&state=state-1')
    sessionStorage.setItem('app1.oauth.exchanged_code', 'abc')

    await expect(keycloak.initKeycloak()).resolves.toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('redirects the browser to the authorize url', async () => {
    const { keycloak } = await loadAuthModules()
    await keycloak.redirectToKeycloakLogin('ada@bcbp.com')
    expect(window.location.replace).toHaveBeenCalledWith(
      expect.stringContaining('/protocol/openid-connect/auth?'),
    )
  })

  it('exposes no keycloak-js instance', async () => {
    const { keycloak } = await loadAuthModules()
    expect(keycloak.getKeycloak()).toBeNull()
  })

  it('logs out through the OAuth end-session endpoint', async () => {
    const { keycloak } = await loadAuthModules()
    keycloak.keycloakLogout()
    expect(window.location.assign).toHaveBeenCalledWith(
      expect.stringContaining('/protocol/openid-connect/logout?'),
    )
  })

  it('returns a remembered email only when the flag is set', async () => {
    const { keycloak } = await loadAuthModules()
    expect(keycloak.getRememberedEmail()).toBe('')

    localStorage.setItem('bcbp.rememberEmail', 'true')
    expect(keycloak.getRememberedEmail()).toBe('')

    localStorage.setItem('bcbp.loginEmail', 'ada@bcbp.com')
    expect(keycloak.getRememberedEmail()).toBe('ada@bcbp.com')
  })

  it('persists or clears the remembered email', async () => {
    const { keycloak } = await loadAuthModules()
    keycloak.persistRememberEmail('  ada@bcbp.com  ', true)
    expect(localStorage.getItem('bcbp.rememberEmail')).toBe('true')
    expect(localStorage.getItem('bcbp.loginEmail')).toBe('ada@bcbp.com')

    keycloak.persistRememberEmail('ada@bcbp.com', false)
    expect(localStorage.getItem('bcbp.rememberEmail')).toBeNull()
    expect(localStorage.getItem('bcbp.loginEmail')).toBeNull()
  })

  it.each([
    [{ accessToken: 't', email: 'ada@bcbp.com', username: 'ada' }, 'ada@bcbp.com'],
    [{ accessToken: 't', username: 'ada' }, 'ada'],
    [{ accessToken: 't' }, 'User'],
    [null, 'User'],
  ])('labels the signed-in user from the session %#', async (session, label) => {
    const { keycloak } = await loadAuthModules()
    if (session) {
      sessionStorage.setItem('app1.oauth.session', JSON.stringify(session))
    }
    expect(keycloak.getAuthenticatedUserLabel()).toBe(label)
  })
})
