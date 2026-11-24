// The application layer's use cases, alone: plain functions over injected ports (no React, no
// browser), as the Frontend Architecture Constitution requires.
import { describe, expect, it, vi } from 'vitest'
import { slugFromPath, type Workspace } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
import { WorkspaceNotFoundError } from '../../src/domain/errors'
import { requestPasswordResetUseCase } from '../../src/application/use-cases/requestPasswordReset'
import { resolveWorkspaceUseCase } from '../../src/application/use-cases/resolveWorkspace'
import { MAX_IDENTIFIER_LENGTH, isEmailIdentifier, toIdentifier } from '../../src/domain/rules/identifier'

// The SDK's slugFromPath with the /t/ prefix, as the bootstrap injects it (it reads only workspacePathPrefix).
const slugOf = (p: string) => slugFromPath(p, { workspacePathPrefix: '/t/' } as Parameters<typeof slugFromPath>[1])

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

describe('toIdentifier (IAM spec §6 A2: email, workspace name or pasted URL)', () => {
  it.each([
    ['ada@acme.com', 'ada@acme.com'],
    ['  Ada@Acme.com ', 'Ada@Acme.com'], // an email is kept as typed, only trimmed
    ['Acme', 'acme'], // a workspace name is lower-cased
    ['https://app.example.com/t/acme/dashboard', 'acme'],
    ['HTTPS://APP.EXAMPLE.COM/T/ACME', 'acme'],
    ['app.example.com/t/acme', 'acme'],
    ['/t/acme/tenders/42', 'acme'],
    ['https://app.example.com/t/acme/members/ada@acme.com', 'acme'], // a URL with @ is still a URL
    ['https://ada@app.example.com/t/acme', 'acme'],
  ])('%j → %j', (typed, identifier) => {
    expect(toIdentifier(typed, slugOf)).toBe(identifier)
  })

  it.each([
    ['empty', '   '],
    ['over 254 characters', `${'a'.repeat(MAX_IDENTIFIER_LENGTH - 8)}@acme.com`],
    ['a URL without /t/<slug>', 'https://app.example.com/dashboard'],
    ['a URL that does not parse', 'http://[bad/t/acme'],
  ])('names no workspace when %s', (_, typed) => {
    expect(toIdentifier(typed, slugOf)).toBeUndefined()
  })

  it('accepts exactly 254 characters', () => {
    const longest = `${'a'.repeat(MAX_IDENTIFIER_LENGTH - 9)}@acme.com`
    expect(longest).toHaveLength(MAX_IDENTIFIER_LENGTH)
    expect(toIdentifier(longest, slugOf)).toBe(longest)
  })

  it('only an email is an email (and so a login_hint)', () => {
    expect(isEmailIdentifier('ada@acme.com')).toBe(true)
    for (const not of ['acme', 'https://app.example.com/t/acme/members/ada@acme.com', 'a@b@c', '@acme.com', 'ada@', 'ada @acme.com', 'ada@acme.com?x=1'])
      expect(isEmailIdentifier(not), not).toBe(false)
  })
})

describe('resolveWorkspaceUseCase with typed workspaces', () => {
  it('sends PUB-1 the slug of a pasted URL', async () => {
    const resolve = vi.fn(async () => acme)
    await resolveWorkspaceUseCase({ resolve }, { slugFromPath: slugOf })('https://app.example.com/t/acme/dashboard')
    expect(resolve).toHaveBeenCalledWith('acme')
  })

  it('asks PUB-1 nothing for an identifier that names no workspace, and answers not found', async () => {
    const resolve = vi.fn(async () => acme)
    await expect(resolveWorkspaceUseCase({ resolve })('https://app.example.com/t/acme')).rejects.toBeInstanceOf(WorkspaceNotFoundError)
    await expect(resolveWorkspaceUseCase({ resolve }, { slugFromPath: slugOf })('')).rejects.toBeInstanceOf(WorkspaceNotFoundError)
    expect(resolve).not.toHaveBeenCalled()
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
