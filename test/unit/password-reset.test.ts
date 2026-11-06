// "Forgot your password?" goes to Keycloak's reset page for the workspace's realm, built from the
// runtime config the SDK signs in with.
import { afterEach, describe, expect, it } from 'vitest'
import { getConfig } from '@bcbp-solutions-fzc-llc/frontend-sdk/config'
import { createTestPlatform } from '@bcbp-solutions-fzc-llc/frontend-sdk/testing'
import { passwordResetUrl } from '../../src/infrastructure/auth/passwordReset'

let platform: ReturnType<typeof createTestPlatform> | undefined
afterEach(() => platform?.reset())

describe('passwordResetUrl', () => {
  it("is the realm's reset-credentials page on the IdP, for the shell's client", () => {
    platform = createTestPlatform()
    const { auth } = getConfig()
    const url = new URL(passwordResetUrl({ realm: 'tenant-acme', trial: false, slug: 'acme' }))
    expect(url.origin).toBe(new URL(auth.idpOrigin).origin)
    expect(url.pathname).toBe('/realms/tenant-acme/login-actions/reset-credentials')
    expect(url.searchParams.get('client_id')).toBe(auth.clientId)
  })

  it('encodes the realm', () => {
    platform = createTestPlatform()
    expect(passwordResetUrl({ realm: 'a/b', trial: true })).toContain('/realms/a%2Fb/login-actions/reset-credentials')
  })
})
