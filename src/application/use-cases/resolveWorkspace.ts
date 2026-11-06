// Use case: resolve what the user typed (an email or a company slug) to a workspace, through the
// SDK's WorkspaceResolver port (IAM PUB-1). No React, no browser APIs: the resolver is injected.
import type { Workspace, WorkspaceResolver } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import { WorkspaceNotFoundError } from '../../domain/errors'

export type ResolveWorkspace = (identifier: string) => Promise<Workspace>

/** "Not found", rate-limited and unreachable all end as WorkspaceNotFoundError (never says which). */
export function resolveWorkspaceUseCase(resolver: WorkspaceResolver): ResolveWorkspace {
  return async (identifier) => {
    let workspace: Workspace | undefined
    try {
      workspace = await resolver.resolve(identifier)
    } catch {
      // Rate-limited or unreachable: the same answer as not found.
    }
    if (!workspace) throw new WorkspaceNotFoundError()
    return workspace
  }
}
