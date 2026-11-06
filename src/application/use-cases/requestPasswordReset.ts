// Use case: send the user to their workspace's password reset. The realm decides where the reset
// happens, so the email is resolved first. The reset URL and the navigation are injected
// (infrastructure), so this stays free of browser APIs.
import type { Workspace } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import type { ResolveWorkspace } from './resolveWorkspace'

export type RequestPasswordReset = (email: string) => Promise<void>

export function requestPasswordResetUseCase(deps: {
  resolveWorkspace: ResolveWorkspace
  resetUrl: (workspace: Workspace) => string
  open: (url: string) => void
}): RequestPasswordReset {
  return async (email) => deps.open(deps.resetUrl(await deps.resolveWorkspace(email)))
}
