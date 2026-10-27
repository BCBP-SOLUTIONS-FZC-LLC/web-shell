import { vi } from 'vitest'

export function stubKeycloakEnv(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    VITE_KEYCLOAK_URL: 'http://localhost:8080',
    VITE_KEYCLOAK_REALM: 'bcbp',
    VITE_KEYCLOAK_CLIENT_ID: 'web-shell',
    VITE_KEYCLOAK_REDIRECT_URI: '',
    ...overrides,
  }
  for (const [key, value] of Object.entries(values)) {
    vi.stubEnv(key, value)
  }
}

export async function loadAuthModules() {
  vi.resetModules()
  const config = await import('../../src/auth/keycloak.config')
  const oauth = await import('../../src/auth/oauth-pkce')
  const keycloak = await import('../../src/auth/keycloak')
  return { config, oauth, keycloak }
}

export function setUrl(path: string) {
  window.history.replaceState({}, '', path)
}

export function idToken(payload: Record<string, string>): string {
  return `hdr.${btoa(JSON.stringify(payload))}.sig`
}

export function jsonResponse(body: unknown, status = 200): Response {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(payload, {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
