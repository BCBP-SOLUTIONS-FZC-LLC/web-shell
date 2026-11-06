// The application layer's use cases, alone: plain functions over injected ports (no React, no
// browser), as the Frontend Architecture Constitution requires.
import { describe, expect, it, vi } from 'vitest'
import type { Workspace } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import { WorkspaceNotFoundError } from '../../src/domain/errors'
import { requestPasswordResetUseCase } from '../../src/application/use-cases/requestPasswordReset'
import { resolveWorkspaceUseCase } from '../../src/application/use-cases/resolveWorkspace'

const acme: Workspace = { realm: 'tenant-acme', trial: false, slug: 'acme' }

describe('resolveWorkspaceUseCase (PUB-1 through the SDK port)', () => {
  it('returns the workspace the resolver finds', async () => {
    const resolve = vi.fn(async () => acme)
    await expect(resolveWorkspaceUseCase({ resolve })('ada@acme.com')).resolves.toBe(acme)
    expect(resolve).toHaveBeenCalledWith('ada@acme.com')
  })

  it('answers not found, rate-limited and unreachable alike: WorkspaceNotFoundError, no text', async () => {
    const notFound = resolveWorkspaceUseCase({ resolve: async () => undefined })
    const failing = resolveWorkspaceUseCase({
      resolve: async () => {
        throw new Error('429 or network')
      },
    })
    for (const run of [notFound('nobody@else.com'), failing('ada@acme.com')]) {
      const error = await run.catch((e: unknown) => e)
      expect(error).toBeInstanceOf(WorkspaceNotFoundError)
      expect((error as Error).message).toBe('workspace not found') // presentation chooses the words
    }
  })
})

describe('requestPasswordResetUseCase', () => {
  it('resolves the email, then opens that realm reset URL', async () => {
    const open = vi.fn()
    const reset = requestPasswordResetUseCase({
      resolveWorkspace: async () => acme,
      resetUrl: (w) => `https://idp.test/realms/${w.realm}/reset`,
      open,
    })
    await reset('ada@acme.com')
    expect(open).toHaveBeenCalledWith('https://idp.test/realms/tenant-acme/reset')
  })

  it('opens nothing when no workspace matches', async () => {
    const open = vi.fn()
    const reset = requestPasswordResetUseCase({
      resolveWorkspace: resolveWorkspaceUseCase({ resolve: async () => undefined }),
      resetUrl: () => 'never',
      open,
    })
    await expect(reset('nobody@else.com')).rejects.toBeInstanceOf(WorkspaceNotFoundError)
    expect(open).not.toHaveBeenCalled()
  })
})
