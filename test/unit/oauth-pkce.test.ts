import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  idToken,
  jsonResponse,
  loadAuthModules,
  setUrl,
  stubKeycloakEnv,
} from '../helpers/load-auth'

const PENDING = 'app1.oauth.pending.state-1'
const VERIFIER_KEY = 'app1.oauth.pkce_verifier'
const STATE_KEY = 'app1.oauth.state'
const REDIRECT_KEY = 'app1.oauth.redirect_uri'
const EXCHANGED_KEY = 'app1.oauth.exchanged_code'
const SESSION_KEY = 'app1.oauth.session'

function pending(state: string, verifier: string, redirectUri: string) {
  const payload = JSON.stringify({ verifier, redirectUri })
  sessionStorage.setItem(`app1.oauth.pending.${state}`, payload)
}

async function load() {
  stubKeycloakEnv()
  return loadAuthModules()
}

describe('oauth pkce', () => {
  beforeEach(() => {
    stubKeycloakEnv()
  })

  it('documents how to start the local Keycloak', async () => {
    const { oauth } = await load()
    expect(oauth.KEYCLOAK_START_HINT).toContain('npm run keycloak:dev:detach')
  })

  describe('callback capture', () => {
    it('keeps the first snapshot when capture runs twice', async () => {
      const { oauth } = await load()
      setUrl('/?code=first&state=s1')
      oauth.captureOAuthCallbackFromUrl()
      setUrl('/?code=second&state=s2')
      oauth.captureOAuthCallbackFromUrl()

      vi.mocked(fetch).mockResolvedValue(jsonResponse({ access_token: 'tok' }))
      pending('s1', 'v', 'http://localhost:5001/dashboard')
      await oauth.completeOAuthCallbackFromUrl()

      const body = String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)
      expect(body).toContain('code=first')
    })

    it('does not snapshot a url without code or error', async () => {
      const { oauth } = await load()
      setUrl('/?state=only')
      oauth.captureOAuthCallbackFromUrl()
      setUrl('/?code=later')
      expect(oauth.hasOAuthCallbackInUrl()).toBe(true)
    })

    it('reads the live url when nothing was captured', async () => {
      const { oauth } = await load()
      setUrl('/?error=access_denied')
      expect(oauth.hasOAuthCallbackInUrl()).toBe(true)
    })

    it('stores an error callback without a code', async () => {
      const { oauth } = await load()
      setUrl('/?error=access_denied&error_description=Not%20allowed')
      oauth.captureOAuthCallbackFromUrl()
      setUrl('/')
      await expect(oauth.completeOAuthCallbackFromUrl()).rejects.toThrow('Not allowed')
    })

    it('stores a code callback without an error', async () => {
      const { oauth } = await load()
      setUrl('/?code=only-code&state=state-1')
      oauth.captureOAuthCallbackFromUrl()
      setUrl('/')
      pending('state-1', 'verifier', 'http://localhost:5001/dashboard')
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ access_token: 'tok' }))
      await expect(oauth.completeOAuthCallbackFromUrl()).resolves.toMatchObject({
        accessToken: 'tok',
      })
    })
  })

  describe('authorize url', () => {
    it('refuses to start when Keycloak is not configured', async () => {
      stubKeycloakEnv({
        VITE_KEYCLOAK_URL: ' ',
        VITE_KEYCLOAK_REALM: ' ',
        VITE_KEYCLOAK_CLIENT_ID: ' ',
      })
      const { oauth } = await loadAuthModules()
      await expect(oauth.buildKeycloakAuthorizeUrl('ada@bcbp.com')).rejects.toThrow(
        /not configured/,
      )
    })

    it.each(['', '   '])('requires a work email (%j)', async (email) => {
      const { oauth } = await load()
      await expect(oauth.buildKeycloakAuthorizeUrl(email)).rejects.toThrow(
        'Enter your work email to continue.',
      )
    })

    it('requires a secure context for the S256 challenge', async () => {
      const { oauth } = await load()
      const cryptoWithSubtle = globalThis.crypto
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: { ...cryptoWithSubtle, subtle: undefined, getRandomValues: cryptoWithSubtle.getRandomValues.bind(cryptoWithSubtle), randomUUID: cryptoWithSubtle.randomUUID.bind(cryptoWithSubtle) },
      })
      await expect(oauth.buildKeycloakAuthorizeUrl('ada@bcbp.com')).rejects.toThrow(
        /Secure context required/,
      )
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: cryptoWithSubtle })
    })

    it('builds a PKCE authorize url and remembers the verifier', async () => {
      stubKeycloakEnv({ VITE_KEYCLOAK_REDIRECT_URI: 'http://localhost:5001/custom' })
      const { oauth } = await loadAuthModules()
      vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')

      const url = await oauth.buildKeycloakAuthorizeUrl('  ada@bcbp.com  ')
      const parsed = new URL(url)

      expect(parsed.origin + parsed.pathname).toBe(
        'http://localhost:8080/realms/bcbp/protocol/openid-connect/auth',
      )
      expect(parsed.searchParams.get('login_hint')).toBe('ada@bcbp.com')
      expect(parsed.searchParams.get('code_challenge_method')).toBe('S256')
      expect(parsed.searchParams.get('code_challenge')).toBeTruthy()
      expect(parsed.searchParams.get('redirect_uri')).toBe('http://localhost:5001/custom')
      expect(parsed.searchParams.get('state')).toBe('00000000-0000-4000-8000-000000000001')
      expect(sessionStorage.getItem(VERIFIER_KEY)).toBeTruthy()
      expect(sessionStorage.getItem(REDIRECT_KEY)).toBe('http://localhost:5001/custom')
      expect(sessionStorage.getItem(EXCHANGED_KEY)).toBeNull()
    })

    it('still starts sign-in when localStorage rejects the pending record', async () => {
      const { oauth } = await load()
      const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('quota')
      })

      try {
        const url = await oauth.buildKeycloakAuthorizeUrl('ada@bcbp.com')
        const state = new URL(url).searchParams.get('state')
        expect(sessionStorage.getItem(`app1.oauth.pending.${state}`)).toBeTruthy()
        expect(localStorage.getItem(`app1.oauth.pending.${state}`)).toBeNull()
      } finally {
        spy.mockRestore()
      }
    })

    it('strips a trailing slash and encodes the realm', async () => {
      stubKeycloakEnv({
        VITE_KEYCLOAK_URL: 'http://localhost:8080/',
        VITE_KEYCLOAK_REALM: 'a b',
      })
      const { oauth } = await loadAuthModules()
      const url = await oauth.buildKeycloakAuthorizeUrl('ada@bcbp.com')
      expect(url.startsWith('http://localhost:8080/realms/a%20b/protocol/openid-connect/auth?')).toBe(
        true,
      )
    })

    it('replaces the current page with the authorize url', async () => {
      const { oauth } = await load()
      await oauth.redirectToKeycloakAuthorize('ada@bcbp.com')
      expect(window.location.replace).toHaveBeenCalledWith(
        expect.stringContaining('login_hint=ada%40bcbp.com'),
      )
    })
  })

  describe('reachability', () => {
    it('is unreachable when Keycloak is not configured', async () => {
      stubKeycloakEnv({ VITE_KEYCLOAK_URL: ' ' })
      const { oauth } = await loadAuthModules()
      await expect(oauth.isKeycloakServerReachable()).resolves.toBe(false)
      expect(fetch).not.toHaveBeenCalled()
    })

    it('tries the dev proxy, then localhost, then 127.0.0.1', async () => {
      const { oauth } = await load()
      const urls: string[] = []
      vi.mocked(fetch).mockImplementation(async (input) => {
        const url = String(input)
        urls.push(url)
        if (url.includes('127.0.0.1')) {
          return jsonResponse({}, 200)
        }
        if (url.includes('__kc')) {
          throw new Error('proxy down')
        }
        return jsonResponse({}, 503)
      })

      await expect(oauth.isKeycloakServerReachable()).resolves.toBe(true)
      expect(urls[0]).toContain('/__kc/realms/bcbp/.well-known/openid-configuration')
      expect(urls[1]).toContain('http://localhost:8080/realms/bcbp/.well-known/openid-configuration')
      expect(urls[2]).toContain('http://127.0.0.1:8080/realms/bcbp/.well-known/openid-configuration')
    })

    it('skips the same-origin dev proxy when DEV is off', async () => {
      vi.stubEnv('DEV', false)
      stubKeycloakEnv({ VITE_KEYCLOAK_URL: 'https://idp.example.com' })
      const { oauth } = await loadAuthModules()
      const urls: string[] = []
      vi.mocked(fetch).mockImplementation(async (input) => {
        urls.push(String(input))
        return jsonResponse({}, 200)
      })

      await expect(oauth.isKeycloakServerReachable()).resolves.toBe(true)
      expect(urls).toEqual([
        'https://idp.example.com/realms/bcbp/.well-known/openid-configuration',
      ])
    })

    it('does not rewrite a non-local Keycloak host', async () => {
      stubKeycloakEnv({ VITE_KEYCLOAK_URL: 'https://idp.example.com' })
      const { oauth } = await loadAuthModules()
      const urls: string[] = []
      vi.mocked(fetch).mockImplementation(async (input) => {
        urls.push(String(input))
        return jsonResponse({}, 404)
      })

      await expect(oauth.isKeycloakServerReachable()).resolves.toBe(false)
      expect(urls.some((url) => url.includes('127.0.0.1'))).toBe(false)
      expect(urls.some((url) => url.includes('https://idp.example.com/realms/bcbp/'))).toBe(true)
    })

    it('returns false when every candidate fails', async () => {
      const { oauth } = await load()
      vi.mocked(fetch).mockRejectedValue(new Error('offline'))
      await expect(oauth.isKeycloakServerReachable()).resolves.toBe(false)
    })
  })

  describe('url cleanup and session', () => {
    it('leaves a url without oauth params unchanged', async () => {
      const { oauth } = await load()
      setUrl('/dashboard')
      oauth.stripOAuthParamsFromUrl()
      expect(window.location.pathname).toBe('/dashboard')
    })

    it('falls back to / when the page path is empty', async () => {
      const { oauth } = await load()
      setUrl('/dashboard?code=abc')
      vi.spyOn(window.location, 'pathname', 'get').mockReturnValue('')
      const replaceState = vi.spyOn(window.history, 'replaceState')

      oauth.stripOAuthParamsFromUrl()

      expect(replaceState).toHaveBeenCalledWith({}, document.title, '/')
    })

    it('removes code, state, and error from the url', async () => {
      const { oauth } = await load()
      setUrl('/dashboard?code=abc&state=s&error=access_denied')
      oauth.stripOAuthParamsFromUrl()
      expect(window.location.search).toBe('')
      expect(window.location.pathname).toBe('/dashboard')
    })

    it('round-trips a session and ignores corrupt storage', async () => {
      const { oauth } = await load()
      expect(oauth.getOAuthSession()).toBeNull()

      sessionStorage.setItem(SESSION_KEY, '{')
      expect(oauth.getOAuthSession()).toBeNull()

      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: 'tok', email: 'a@b.co' }))
      expect(oauth.getOAuthSession()).toEqual({ accessToken: 'tok', email: 'a@b.co' })

      sessionStorage.setItem(VERIFIER_KEY, 'v')
      oauth.clearOAuthSession()
      expect(oauth.getOAuthSession()).toBeNull()
      expect(sessionStorage.getItem(VERIFIER_KEY)).toBeNull()
    })
  })

  describe('token exchange', () => {
    function armCallback() {
      setUrl('/?code=abc&state=state-1')
    }

    it('rejects an identity-provider error using its description', async () => {
      const { oauth } = await load()
      setUrl('/?error=access_denied&error_description=Not%20allowed')
      oauth.captureOAuthCallbackFromUrl()
      await expect(oauth.completeOAuthCallbackFromUrl()).rejects.toThrow('Not allowed')
    })

    it('falls back to the error code when no description is present', async () => {
      const { oauth } = await load()
      setUrl('/?error=access_denied')
      await expect(oauth.completeOAuthCallbackFromUrl()).rejects.toThrow('access_denied')
    })

    it('returns the current session when the url has no code', async () => {
      const { oauth } = await load()
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: 'kept' }))
      await expect(oauth.completeOAuthCallbackFromUrl()).resolves.toMatchObject({
        accessToken: 'kept',
      })
    })

    it('returns null when Keycloak is not configured', async () => {
      stubKeycloakEnv({ VITE_KEYCLOAK_URL: ' ' })
      const { oauth } = await loadAuthModules()
      setUrl('/?code=abc&state=state-1')
      await expect(oauth.completeOAuthCallbackFromUrl()).resolves.toBeNull()
    })

    it('does not exchange a code that was already used', async () => {
      const { oauth } = await load()
      sessionStorage.setItem(EXCHANGED_KEY, 'abc')
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: 'kept' }))
      armCallback()
      await expect(oauth.completeOAuthCallbackFromUrl()).resolves.toMatchObject({
        accessToken: 'kept',
      })
      expect(fetch).not.toHaveBeenCalled()
    })

    it('returns null for a reused code whose session was cleared', async () => {
      const { oauth } = await load()
      sessionStorage.setItem(EXCHANGED_KEY, 'abc')
      armCallback()
      await expect(oauth.completeOAuthCallbackFromUrl()).resolves.toBeNull()
    })

    it('rejects a callback that is missing state', async () => {
      const { oauth } = await load()
      setUrl('/?code=abc')
      const pendingExchange = oauth.completeOAuthCallbackFromUrl()
      expect(oauth.isOAuthCallbackInProgress()).toBe(true)
      await expect(pendingExchange).rejects.toThrow('Missing OAuth state')
      expect(oauth.isOAuthCallbackInProgress()).toBe(false)
    })

    it('rejects a state mismatch when no pending record exists', async () => {
      const { oauth } = await load()
      armCallback()
      sessionStorage.setItem(STATE_KEY, 'other-state')
      await expect(oauth.completeOAuthCallbackFromUrl()).rejects.toThrow('Sign-in state mismatch')
    })

    it('rejects a callback that has no PKCE verifier', async () => {
      const { oauth } = await load()
      armCallback()
      sessionStorage.setItem(STATE_KEY, 'state-1')
      await expect(oauth.completeOAuthCallbackFromUrl()).rejects.toThrow('Missing PKCE verifier')
    })

    it('uses the session verifier and the current url when the pending record is gone', async () => {
      const { oauth } = await load()
      setUrl('/callback?code=abc&state=state-1')
      sessionStorage.setItem(STATE_KEY, 'state-1')
      sessionStorage.setItem(VERIFIER_KEY, 'from-session')
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ access_token: 'tok' }))

      await oauth.completeOAuthCallbackFromUrl()
      const body = String(vi.mocked(fetch).mock.calls.at(-1)?.[1]?.body)
      expect(body).toContain('code_verifier=from-session')
      expect(body).toContain(`redirect_uri=${encodeURIComponent(`${window.location.origin}/callback`)}`)
    })

    it('prefers the pending record over a stale session verifier', async () => {
      const { oauth } = await load()
      armCallback()
      pending('state-1', 'from-pending', 'http://localhost:5001/dashboard')
      sessionStorage.setItem(VERIFIER_KEY, 'from-session')
      sessionStorage.setItem(STATE_KEY, 'different')
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ access_token: 'tok' }))

      await oauth.completeOAuthCallbackFromUrl()
      const body = String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)
      expect(body).toContain('code_verifier=from-pending')
      expect(body).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A5001%2Fdashboard')
    })

    it('recovers a pending record from localStorage', async () => {
      const { oauth } = await load()
      armCallback()
      sessionStorage.setItem(PENDING, '{')
      localStorage.setItem(
        PENDING,
        JSON.stringify({ verifier: 'from-local', redirectUri: 'http://localhost:5001/dashboard' }),
      )
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ access_token: 'tok' }))

      await oauth.completeOAuthCallbackFromUrl()
      const body = String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)
      expect(body).toContain('code_verifier=from-local')
    })

    it('skips a pending record that does not contain a verifier', async () => {
      const { oauth } = await load()
      armCallback()
      sessionStorage.setItem(PENDING, JSON.stringify({ redirectUri: 'http://localhost:5001/dashboard' }))
      localStorage.setItem(PENDING, JSON.stringify({ verifier: '', redirectUri: 'http://localhost:5001/dashboard' }))
      sessionStorage.setItem(STATE_KEY, 'state-1')
      sessionStorage.setItem(VERIFIER_KEY, 'fallback')
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ access_token: 'tok' }))

      await oauth.completeOAuthCallbackFromUrl()
      const body = String(vi.mocked(fetch).mock.calls[0]?.[1]?.body)
      expect(body).toContain('code_verifier=fallback')
    })

    it('shares one in-flight exchange across overlapping callbacks', async () => {
      const { oauth } = await load()
      armCallback()
      pending('state-1', 'verifier', 'http://localhost:5001/dashboard')
      let release: (response: Response) => void = () => {}
      vi.mocked(fetch).mockImplementation(
        () =>
          new Promise((resolve) => {
            release = resolve
          }),
      )

      const first = oauth.completeOAuthCallbackFromUrl()
      const second = oauth.completeOAuthCallbackFromUrl()
      expect(oauth.isOAuthCallbackInProgress()).toBe(true)
      release(jsonResponse({ access_token: 'shared' }))
      await expect(Promise.all([first, second])).resolves.toEqual([
        expect.objectContaining({ accessToken: 'shared' }),
        expect.objectContaining({ accessToken: 'shared' }),
      ])
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(oauth.isOAuthCallbackInProgress()).toBe(false)
    })

    it('explains when every token endpoint is unreachable', async () => {
      const { oauth } = await load()
      armCallback()
      pending('state-1', 'verifier', 'http://localhost:5001/dashboard')
      vi.mocked(fetch).mockRejectedValue(new Error('offline'))
      await expect(oauth.completeOAuthCallbackFromUrl()).rejects.toThrow(/Cannot reach Keycloak/)
    })

    it('uses the next token endpoint when the first one throws', async () => {
      const { oauth } = await load()
      armCallback()
      pending('state-1', 'verifier', 'http://localhost:5001/dashboard')
      vi.mocked(fetch).mockImplementation(async (input) => {
        if (String(input).includes('__kc')) {
          throw new Error('proxy down')
        }
        return jsonResponse({ access_token: 'from-direct' })
      })

      await expect(oauth.completeOAuthCallbackFromUrl()).resolves.toMatchObject({
        accessToken: 'from-direct',
      })
    })

    it.each([
      ['{"error_description":"bad client"}', 'bad client'],
      ['{"error":"invalid_client"}', 'invalid_client'],
      ['{}', '{}'],
      ['not-json', 'not-json'],
      ['   ', 'Unknown error'],
    ])('surfaces token error body %j', async (body, expected) => {
      const { oauth } = await load()
      armCallback()
      pending('state-1', 'verifier', 'http://localhost:5001/dashboard')
      vi.mocked(fetch).mockResolvedValue(new Response(body, { status: 400 }))
      await expect(oauth.completeOAuthCallbackFromUrl()).rejects.toThrow(expected)
      expect(sessionStorage.getItem(PENDING)).toBeTruthy()
    })

    it('explains a redirect uri mismatch', async () => {
      const { oauth } = await load()
      armCallback()
      pending('state-1', 'verifier', 'http://localhost:5001/dashboard')
      vi.mocked(fetch).mockResolvedValue(
        new Response('{"error_description":"redirect_uri mismatch"}', { status: 400 }),
      )
      await expect(oauth.completeOAuthCallbackFromUrl()).rejects.toThrow(/redirect URI mismatch/)
    })

    it('explains an invalid redirect recorded as invalid_redirect_uri', async () => {
      const { oauth } = await load()
      armCallback()
      pending('state-1', 'verifier', 'http://localhost:5001/dashboard')
      vi.mocked(fetch).mockResolvedValue(new Response('invalid_redirect_uri', { status: 400 }))
      await expect(oauth.completeOAuthCallbackFromUrl()).rejects.toThrow(/redirect URI mismatch/)
    })

    it.each(['invalid_grant', 'Code not valid'])(
      'explains an expired authorization code (%s)',
      async (message) => {
        const { oauth } = await load()
        armCallback()
        pending('state-1', 'verifier', 'http://localhost:5001/dashboard')
        vi.mocked(fetch).mockResolvedValue(
          new Response(JSON.stringify({ error_description: message }), { status: 400 }),
        )
        await expect(oauth.completeOAuthCallbackFromUrl()).rejects.toThrow(/already used/)
      },
    )

    it('stores email and username from the id token and clears the pending record', async () => {
      const { oauth } = await load()
      setUrl('/login?code=abc&state=state-1')
      pending('state-1', 'verifier', 'http://localhost:5001/dashboard')
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({
          access_token: 'access',
          refresh_token: 'refresh',
          id_token: idToken({ email: 'ada@bcbp.com', preferred_username: 'ada' }),
        }),
      )

      await expect(oauth.completeOAuthCallbackFromUrl()).resolves.toMatchObject({
        accessToken: 'access',
        refreshToken: 'refresh',
        email: 'ada@bcbp.com',
        username: 'ada',
      })
      expect(sessionStorage.getItem(PENDING)).toBeNull()
      expect(localStorage.getItem(PENDING)).toBeNull()
      expect(sessionStorage.getItem(EXCHANGED_KEY)).toBe('abc')
      expect(sessionStorage.getItem(VERIFIER_KEY)).toBeNull()
      expect(window.location.pathname).toBe('/dashboard')
    })

    it('keeps /dashboard when the callback already landed there', async () => {
      const { oauth } = await load()
      setUrl('/dashboard?code=abc&state=state-1')
      pending('state-1', 'verifier', 'http://localhost:5001/dashboard')
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ access_token: 'access' }))

      const session = await oauth.completeOAuthCallbackFromUrl()
      expect(session).toMatchObject({ accessToken: 'access', email: undefined, username: undefined })
      expect(window.location.pathname).toBe('/dashboard')
    })

    it('ignores an id token that cannot be decoded', async () => {
      const { oauth } = await load()
      armCallback()
      pending('state-1', 'verifier', 'http://localhost:5001/dashboard')
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ access_token: 'access', id_token: 'not-a-jwt' }),
      )
      await expect(oauth.completeOAuthCallbackFromUrl()).resolves.toMatchObject({
        accessToken: 'access',
        email: undefined,
      })
    })

    it('ignores an id token payload that is not JSON', async () => {
      const { oauth } = await load()
      armCallback()
      pending('state-1', 'verifier', 'http://localhost:5001/dashboard')
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse({ access_token: 'access', id_token: `hdr.${btoa('hello')}.sig` }),
      )
      await expect(oauth.completeOAuthCallbackFromUrl()).resolves.toMatchObject({
        accessToken: 'access',
        username: undefined,
      })
    })

    it('rejects a token response that is not JSON', async () => {
      const { oauth } = await load()
      armCallback()
      pending('state-1', 'verifier', 'http://localhost:5001/dashboard')
      vi.mocked(fetch).mockResolvedValue(new Response('ok-but-not-json', { status: 200 }))
      await expect(oauth.completeOAuthCallbackFromUrl()).rejects.toThrow()
    })

    it('returns the stored session when the same code is presented again', async () => {
      const { oauth } = await load()
      armCallback()
      pending('state-1', 'verifier', 'http://localhost:5001/dashboard')
      vi.mocked(fetch).mockResolvedValue(jsonResponse({ access_token: 'access' }))
      const first = await oauth.completeOAuthCallbackFromUrl()

      setUrl('/?code=abc&state=state-1')
      oauth.captureOAuthCallbackFromUrl()
      vi.mocked(fetch).mockClear()
      await expect(oauth.completeOAuthCallbackFromUrl()).resolves.toEqual(first)
      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('logout', () => {
    it('returns to the redirect uri when Keycloak is not configured', async () => {
      stubKeycloakEnv({ VITE_KEYCLOAK_URL: ' ' })
      const { oauth } = await loadAuthModules()
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken: 'tok' }))
      oauth.logoutOAuthSession()
      expect(oauth.getOAuthSession()).toBeNull()
      expect(window.location.assign).toHaveBeenCalledWith(`${window.location.origin}/dashboard`)
    })

    it('sends the browser to the Keycloak end-session endpoint', async () => {
      const { oauth } = await load()
      oauth.logoutOAuthSession()
      const target = vi.mocked(window.location.assign).mock.calls[0]?.[0] as string
      const url = new URL(target)
      expect(url.pathname).toBe('/realms/bcbp/protocol/openid-connect/logout')
      expect(url.searchParams.get('client_id')).toBe('web-shell')
      expect(url.searchParams.get('post_logout_redirect_uri')).toBe(`${window.location.origin}/`)
    })
  })
})
