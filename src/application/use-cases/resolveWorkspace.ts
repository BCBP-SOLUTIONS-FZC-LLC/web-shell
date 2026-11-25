// Use case: resolve what the user typed (an email, a workspace name or a pasted workspace URL) to a
// workspace, through the SDK's WorkspaceResolver port (IAM PUB-1). No React, no browser APIs: the
// resolver and the path rule are injected.
import type { Workspace, WorkspaceResolver } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import { WorkspaceNotFoundError } from '../../domain/errors'
import { toIdentifier } from '../../domain/rules/identifier'

export type ResolveWorkspace = (identifier: string) => Promise<Workspace>

export interface ResolveWorkspaceOptions {
  /** The slug in a workspace URL's path (the SDK's slugFromPath with the runtime config). Without it, no URL resolves. */
  slugFromPath?: (pathname: string) => string | undefined
}

/**
 * "Not found", rate-limited, unreachable and an identifier that names no workspace (empty, an email or name over 254
 * characters, a URL without /t/<slug>) all end as WorkspaceNotFoundError (never says which).
 */
export function resolveWorkspaceUseCase(resolver: WorkspaceResolver, o: ResolveWorkspaceOptions = {}): ResolveWorkspace {
  const slugFromPath = o.slugFromPath ?? (() => undefined)
  return async (input) => {
    const identifier = toIdentifier(input, slugFromPath)
    let workspace: Workspace | undefined
    if (identifier !== undefined) {
      try {
        workspace = await resolver.resolve(identifier)
      } catch {
        // Rate-limited or unreachable: the same answer as not found.
      }
    }
    if (!workspace) throw new WorkspaceNotFoundError()
    return workspace
  }
}
