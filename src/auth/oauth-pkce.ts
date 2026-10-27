import { getKeycloakRedirectUri, isKeycloakConfigured, keycloakConfig } from './keycloak.config'

const PKCE_VERIFIER_KEY = 'app1.oauth.pkce_verifier'
const OAUTH_STATE_KEY = 'app1.oauth.state'
const REDIRECT_URI_KEY = 'app1.oauth.redirect_uri'
const EXCHANGED_CODE_KEY = 'app1.oauth.exchanged_code'
const PENDING_OAUTH_PREFIX = 'app1.oauth.pending.'

type PendingOAuth = {
  verifier: string
  redirectUri: string
}

let tokenExchangeInFlight: Promise<OAuthSession | null> | null = null

type OAuthCallbackSnapshot = {
  code?: string
  state?: string
  error?: string
  errorDescription?: string
}

let oauthCallbackSnapshot: OAuthCallbackSnapshot | null = null

/** Call once at app startup so callback params survive URL cleanup during the same navigation. */
export function captureOAuthCallbackFromUrl(): void {
  if (oauthCallbackSnapshot) {
    return
  }
  const params = new URLSearchParams(window.location.search)
  if (!params.has('code') && !params.has('error')) {
    return
  }
  oauthCallbackSnapshot = {
    code: params.get('code') ?? undefined,
    state: params.get('state') ?? undefined,
    error: params.get('error') ?? undefined,
    errorDescription: params.get('error_description') ?? undefined,
  }
}

function oauthCallbackParams(): URLSearchParams {
  if (oauthCallbackSnapshot) {
    const params = new URLSearchParams()
    if (oauthCallbackSnapshot.code) {
      params.set('code', oauthCallbackSnapshot.code)
    }
    if (oauthCallbackSnapshot.state) {
      params.set('state', oauthCallbackSnapshot.state)
    }
    if (oauthCallbackSnapshot.error) {
      params.set('error', oauthCallbackSnapshot.error)
    }
    if (oauthCallbackSnapshot.errorDescription) {
      params.set('error_description', oauthCallbackSnapshot.errorDescription)
    }
    return params
  }
  return new URLSearchParams(window.location.search)
}

function clearOAuthCallbackSnapshot(): void {
  oauthCallbackSnapshot = null
}

function pendingOAuthKey(state: string): string {
  return `${PENDING_OAUTH_PREFIX}${state}`
}

function savePendingOAuth(state: string, pending: PendingOAuth): void {
  const payload = JSON.stringify(pending)
  sessionStorage.setItem(pendingOAuthKey(state), payload)
  try {
    localStorage.setItem(pendingOAuthKey(state), payload)
  } catch {
    /* quota / private mode */
  }
}

function loadPendingOAuth(state: string): PendingOAuth | null {
  for (const storage of [sessionStorage, localStorage] as const) {
    const raw = storage.getItem(pendingOAuthKey(state))
    if (!raw) {
      continue
    }
    try {
      const parsed = JSON.parse(raw) as PendingOAuth
      if (parsed.verifier && parsed.redirectUri) {
        return parsed
      }
    } catch {
      /* ignore */
    }
  }
  return null
}

function clearPendingOAuth(state: string): void {
  sessionStorage.removeItem(pendingOAuthKey(state))
  localStorage.removeItem(pendingOAuthKey(state))
}

/** Remove authorization callback query params so refresh/back does not reuse a stale code/state. */
export function stripOAuthParamsFromUrl(): void {
  const params = new URLSearchParams(window.location.search)
  if (!params.has('code') && !params.has('error') && !params.has('state')) {
    return
  }
  const path = window.location.pathname || '/'
  window.history.replaceState({}, document.title, path)
}

export function isOAuthCallbackInProgress(): boolean {
  return tokenExchangeInFlight !== null
}

function baseUrl(): string {
  return keycloakConfig.url.replace(/\/$/, '')
}

function openIdWellKnownPath(): string {
  return `/realms/${encodeURIComponent(keycloakConfig.realm)}/.well-known/openid-configuration`
}

/** Dev: same-origin proxy first (avoids CORS). Then direct Keycloak / 127.0.0.1. */
function keycloakRealmPath(suffix: string): string {
  return `/realms/${encodeURIComponent(keycloakConfig.realm)}${suffix}`
}

function keycloakUrlCandidates(path: string): string[] {
  const base = baseUrl()
  const urls: string[] = []

  if (import.meta.env.DEV) {
    urls.push(`/__kc${path}`)
  }

  urls.push(`${base}${path}`)

  if (/localhost/i.test(base)) {
    urls.push(`${base.replace(/localhost/i, '127.0.0.1')}${path}`)
  }

  return [...new Set(urls)]
}

function openIdWellKnownCandidates(): string[] {
  return keycloakUrlCandidates(openIdWellKnownPath())
}

function tokenEndpointCandidates(): string[] {
  return keycloakUrlCandidates(keycloakRealmPath('/protocol/openid-connect/token'))
}

async function postTokenRequest(body: URLSearchParams): Promise<Response> {
  let lastNetworkError: unknown
  for (const url of tokenEndpointCandidates()) {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    } catch (error) {
      lastNetworkError = error
    }
  }
  throw lastNetworkError
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generateVerifier(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

async function challengeFromVerifier(verifier: string): Promise<string> {
  if (!crypto.subtle) {
    throw new Error('Secure context required for sign-in (use http://localhost:5001).')
  }
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

export async function buildKeycloakAuthorizeUrl(loginHint: string): Promise<string> {
  if (!isKeycloakConfigured()) {
    throw new Error(
      'Keycloak is not configured. Set VITE_KEYCLOAK_URL, VITE_KEYCLOAK_REALM, and VITE_KEYCLOAK_CLIENT_ID in .env.',
    )
  }

  const email = loginHint.trim()
  if (!email) {
    throw new Error('Enter your work email to continue.')
  }

  const verifier = generateVerifier()
  const challenge = await challengeFromVerifier(verifier)
  const state = crypto.randomUUID()

  const redirectUri = getKeycloakRedirectUri()

  savePendingOAuth(state, { verifier, redirectUri })
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier)
  sessionStorage.setItem(OAUTH_STATE_KEY, state)
  sessionStorage.setItem(REDIRECT_URI_KEY, redirectUri)
  sessionStorage.removeItem(EXCHANGED_CODE_KEY)
  stripOAuthParamsFromUrl()

  const params = new URLSearchParams({
    client_id: keycloakConfig.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    login_hint: email,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })

  return `${baseUrl()}/realms/${encodeURIComponent(keycloakConfig.realm)}/protocol/openid-connect/auth?${params.toString()}`
}

export async function isKeycloakServerReachable(): Promise<boolean> {
  if (!isKeycloakConfigured()) {
    return false
  }

  for (const url of openIdWellKnownCandidates()) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      })
      if (response.ok) {
        return true
      }
    } catch {
      // try next candidate
    }
  }

  return false
}

export const KEYCLOAK_START_HINT =
  'Start Keycloak: open Docker Desktop (wait until the engine is running), then in the app1 folder run "npm run keycloak:dev:detach". After http://localhost:8080 loads (first start may take 1–2 minutes), refresh this page and retry.'

/** Redirect browser to Keycloak login (same tab). */
export async function redirectToKeycloakAuthorize(loginHint: string): Promise<void> {
  const authorizeUrl = await buildKeycloakAuthorizeUrl(loginHint)
  window.location.replace(authorizeUrl)
}

export function hasOAuthCallbackInUrl(): boolean {
  const params = oauthCallbackParams()
  return params.has('code') || params.has('error')
}

export type OAuthSession = {
  accessToken: string
  refreshToken?: string
  idToken?: string
  email?: string
  username?: string
}

const SESSION_KEY = 'app1.oauth.session'

export function getOAuthSession(): OAuthSession | null {
  const raw = sessionStorage.getItem(SESSION_KEY)
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw) as OAuthSession
  } catch {
    return null
  }
}

export function clearOAuthSession(): void {
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(PKCE_VERIFIER_KEY)
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(REDIRECT_URI_KEY)
  sessionStorage.removeItem(EXCHANGED_CODE_KEY)
}

function resolveRedirectUriForTokenExchange(): string {
  return (
    sessionStorage.getItem(REDIRECT_URI_KEY) ??
    `${window.location.origin}${window.location.pathname}`
  )
}

function parseKeycloakErrorBody(detail: string): string {
  try {
    const json = JSON.parse(detail) as { error?: string; error_description?: string }
    if (json.error_description) {
      return json.error_description
    }
    if (json.error) {
      return json.error
    }
  } catch {
    /* plain text */
  }
  return detail.trim() || 'Unknown error'
}

async function exchangeAuthorizationCode(code: string): Promise<OAuthSession | null> {
  if (sessionStorage.getItem(EXCHANGED_CODE_KEY) === code) {
    return getOAuthSession()
  }

  const returnedState = oauthCallbackParams().get('state')
  if (!returnedState) {
    throw new Error('Missing OAuth state. Start sign-in again from the login page.')
  }

  const pending = loadPendingOAuth(returnedState)
  let verifier: string | null = pending?.verifier ?? null
  let redirectUri: string | null = pending?.redirectUri ?? null

  if (!verifier || !redirectUri) {
    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY)
    if (expectedState && returnedState !== expectedState) {
      throw new Error('Sign-in state mismatch. Try again.')
    }
    verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY)
    redirectUri = resolveRedirectUriForTokenExchange()
  }

  if (!verifier) {
    throw new Error('Missing PKCE verifier. Start sign-in again from the login page.')
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: keycloakConfig.clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  })

  let response: Response
  try {
    response = await postTokenRequest(body)
  } catch {
    throw new Error(
      `Cannot reach Keycloak at ${baseUrl()}. Install Docker Desktop, run "npm run keycloak:dev", then retry.`,
    )
  }

  if (!response.ok) {
    const detail = await response.text()
    const message = parseKeycloakErrorBody(detail)
    if (detail.includes('invalid_redirect_uri') || message.includes('redirect_uri')) {
      throw new Error(
        `Keycloak redirect URI mismatch (used "${redirectUri}"). Add http://localhost:5001/dashboard and http://localhost:5001/* to client "${keycloakConfig.clientId}".`,
      )
    }
    if (message.includes('invalid_grant') || message.includes('Code not valid')) {
      throw new Error(
        'Sign-in code expired or already used. Clear site data for localhost:5001 and sign in again.',
      )
    }
    throw new Error(`Keycloak token exchange failed (${response.status}): ${message}`)
  }

  const tokens = (await response.json()) as {
    access_token: string
    refresh_token?: string
    id_token?: string
  }

  let email: string | undefined
  let username: string | undefined
  if (tokens.id_token) {
    try {
      const payload = JSON.parse(atob(tokens.id_token.split('.')[1] ?? '')) as {
        email?: string
        preferred_username?: string
      }
      email = payload.email
      username = payload.preferred_username
    } catch {
      /* ignore decode errors */
    }
  }

  const session: OAuthSession = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    email,
    username,
  }

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  sessionStorage.setItem(EXCHANGED_CODE_KEY, code)
  clearPendingOAuth(returnedState)
  sessionStorage.removeItem(PKCE_VERIFIER_KEY)
  sessionStorage.removeItem(OAUTH_STATE_KEY)
  sessionStorage.removeItem(REDIRECT_URI_KEY)
  stripOAuthParamsFromUrl()
  clearOAuthCallbackSnapshot()
  if (window.location.pathname !== '/dashboard') {
    window.history.replaceState({}, document.title, '/dashboard')
  }

  return session
}

export async function completeOAuthCallbackFromUrl(): Promise<OAuthSession | null> {
  if (!isKeycloakConfigured()) {
    return null
  }

  const params = oauthCallbackParams()
  const error = params.get('error')
  if (error) {
    clearOAuthCallbackSnapshot()
    throw new Error(params.get('error_description') ?? error)
  }

  const code = params.get('code')
  if (!code) {
    return getOAuthSession()
  }

  if (!tokenExchangeInFlight) {
    tokenExchangeInFlight = exchangeAuthorizationCode(code).finally(() => {
      tokenExchangeInFlight = null
    })
  }

  return tokenExchangeInFlight
}

export function logoutOAuthSession(): void {
  clearOAuthSession()
  if (!isKeycloakConfigured()) {
    window.location.assign(getKeycloakRedirectUri())
    return
  }

  const params = new URLSearchParams({
    client_id: keycloakConfig.clientId,
    post_logout_redirect_uri: `${window.location.origin}/`,
  })
  window.location.assign(
    `${baseUrl()}/realms/${encodeURIComponent(keycloakConfig.realm)}/protocol/openid-connect/logout?${params.toString()}`,
  )
}
