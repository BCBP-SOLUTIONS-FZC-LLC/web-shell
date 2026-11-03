/** Which signed-out screen `/` and `/dashboard` render. */
export type LoginVariant = 'login1' | 'latest'

/**
 * `latest` is the split-screen login. `login1` is the previous layout, unchanged.
 * A visit with `?variant=login1` or `?variant=latest` overrides this for that page load.
 */
export const ACTIVE_LOGIN: LoginVariant = 'latest'

export function resolveLoginVariant(search = ''): LoginVariant {
  const requested = new URLSearchParams(search).get('variant')
  if (requested === 'login1' || requested === 'latest') {
    return requested
  }
  return ACTIVE_LOGIN
}
