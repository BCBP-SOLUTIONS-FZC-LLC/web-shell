import {
  completeOAuthCallbackFromUrl,
  getOAuthSession,
  hasOAuthCallbackInUrl,
  logoutOAuthSession,
  redirectToKeycloakAuthorize,
} from './oauth-pkce'

export {
  getOAuthSession,
  hasOAuthCallbackInUrl,
  isOAuthCallbackInProgress,
  stripOAuthParamsFromUrl,
} from './oauth-pkce'

export async function initKeycloak(): Promise<boolean> {
  const existing = getOAuthSession()
  if (existing?.accessToken) {
    return true
  }

  if (!hasOAuthCallbackInUrl()) {
    return false
  }

  const session = await completeOAuthCallbackFromUrl()
  return Boolean(session?.accessToken)
}

export async function redirectToKeycloakLogin(email: string): Promise<void> {
  await redirectToKeycloakAuthorize(email)
}

export function getKeycloak(): null {
  return null
}

export function keycloakLogout(): void {
  logoutOAuthSession()
}

export function getRememberedEmail(): string {
  if (localStorage.getItem('bcbp.rememberEmail') !== 'true') {
    return ''
  }
  return localStorage.getItem('bcbp.loginEmail') ?? ''
}

export function persistRememberEmail(email: string, remember: boolean): void {
  if (remember) {
    localStorage.setItem('bcbp.rememberEmail', 'true')
    localStorage.setItem('bcbp.loginEmail', email.trim())
    return
  }
  localStorage.removeItem('bcbp.rememberEmail')
  localStorage.removeItem('bcbp.loginEmail')
}

export function getAuthenticatedUserLabel(): string {
  const session = getOAuthSession()
  return session?.email ?? session?.username ?? 'User'
}
