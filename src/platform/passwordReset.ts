// "Forgot your password?": Keycloak's own reset page for the workspace's realm. The SDK has no reset
// helper (its /auth covers sign-in and sign-out), so the shell builds the URL from the same runtime
// config the SDK signs in with. Keycloak e-mails the reset link; the realm must allow resets
// (`resetPasswordAllowed`).
import { getConfig } from '@bcbp-solutions-fzc-llc/frontend-sdk/config'
import type { Workspace } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'

export function passwordResetUrl(workspace: Workspace): string {
  const { idpOrigin, clientId } = getConfig().auth
  const url = new URL(`/realms/${encodeURIComponent(workspace.realm)}/login-actions/reset-credentials`, idpOrigin)
  url.searchParams.set('client_id', clientId)
  return url.href
}
