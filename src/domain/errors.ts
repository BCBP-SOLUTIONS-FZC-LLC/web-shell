// Domain errors: what went wrong, without user-facing text (presentation chooses the words).

/**
 * No workspace for an identifier. Deliberately the same for "not found", rate-limited and
 * unreachable, so nothing tells an outsider which emails or workspaces exist.
 */
export class WorkspaceNotFoundError extends Error {
  override readonly name = 'WorkspaceNotFoundError'
  constructor() {
    super('workspace not found')
  }
}
