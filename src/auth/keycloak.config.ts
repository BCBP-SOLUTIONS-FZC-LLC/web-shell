function env(name: keyof ImportMetaEnv): string {
  return (import.meta.env[name] ?? '').trim()
}

export const keycloakConfig = {
  url: env('VITE_KEYCLOAK_URL'),
  realm: env('VITE_KEYCLOAK_REALM'),
  clientId: env('VITE_KEYCLOAK_CLIENT_ID'),
} as const

export function isKeycloakConfigured(): boolean {
  return Boolean(keycloakConfig.url && keycloakConfig.realm && keycloakConfig.clientId)
}

export function getKeycloakRedirectUri(): string {
  const configured = env('VITE_KEYCLOAK_REDIRECT_URI')
  if (configured) {
    return configured
  }
  return `${window.location.origin}/dashboard`
}
