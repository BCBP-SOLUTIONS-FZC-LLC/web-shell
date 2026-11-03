import type { IncomingMessage, ServerResponse } from 'node:http'

/** Connect-style middleware for Rsbuild's dev server: runtime config, remote manifest, IAM stubs. */
export function devPlatformMiddleware(
  root: string,
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void
