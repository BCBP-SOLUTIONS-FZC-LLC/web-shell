// @vitest-environment node
// The Frontend Architecture Constitution's dependency rules, as eslint.config.js enforces them
// (docs/architecture/constitution-assessment.md §5). Each case lints a snippet as if it lived in a
// layer, so the rules are proven to fire, not only declared; the real files pass `npm run lint`.
import { join } from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..', '..')
const eslint = new ESLint({ cwd: root })

/** The layer-rule messages ESLint reports for `code` placed at `file`. */
async function violations(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(root, file) })
  return result!.messages
    .filter((m) => ['@typescript-eslint/no-restricted-imports', 'no-restricted-globals', 'no-restricted-properties'].includes(m.ruleId ?? ''))
    .map((m) => m.message)
}

describe('domain (src/domain/): framework-free and browser-free', () => {
  it('refuses React, the SDK runtime, other layers and the browser', async () => {
    const found = await violations(
      'src/domain/probe.ts',
      `import { useState } from 'react'
       import { createApiClient } from '@bcbp-solutions-fzc-llc/frontend-sdk/http'
       import { workspaceResolver } from '../platform/iam'
       export const x = [useState, createApiClient, workspaceResolver, localStorage.getItem('k'), window.location.href]`,
    )
    expect(found).toEqual([
      expect.stringContaining('no React'),
      expect.stringContaining('SDK types (ports) only'),
      expect.stringContaining('depends on nothing in the shell'),
      expect.stringContaining('browser-free'),
      expect.stringContaining('browser-free'),
    ])
  })

  it('applies to .tsx files too', async () => {
    expect(await violations('src/domain/probe.tsx', `import { useState } from 'react'\nexport const s = [useState, globalThis.fetch]`)).toEqual([
      expect.stringContaining('no React'),
      expect.stringContaining('browser-free'),
    ])
  })

  it('allows SDK types', async () => {
    expect(await violations('src/domain/probe.ts', `import type { Workspace } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'\nexport type W = Workspace`)).toEqual([])
  })
})

describe('application (src/application/): no React, no browser, infrastructure injected', () => {
  it('refuses React, presentation, infrastructure, the SDK runtime and the browser', async () => {
    const found = await violations(
      'src/application/use-cases/probe.ts',
      `import { useEffect } from 'react'
       import LoginPage from '../../pages/LoginPage'
       import { passwordResetUrl } from '../../platform/passwordReset'
       import { getConfig } from '@bcbp-solutions-fzc-llc/frontend-sdk/config'
       export const x = [useEffect, LoginPage, passwordResetUrl, getConfig, fetch('/api')]`,
    )
    expect(found).toEqual([
      expect.stringContaining('no React'),
      expect.stringContaining('never presentation'),
      expect.stringContaining('never presentation'),
      expect.stringContaining('runtime is injected'),
      expect.stringContaining('inject the port'),
    ])
  })

  it('allows domain imports and SDK types', async () => {
    expect(
      await violations(
        'src/application/use-cases/probe.ts',
        `import type { WorkspaceResolver } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'\nimport { WorkspaceNotFoundError } from '../../domain/errors'\nexport const f = (r: WorkspaceResolver) => [r, WorkspaceNotFoundError]`,
      ),
    ).toEqual([])
  })
})

describe('pages and components: never platform/ or the SDK; no network, storage or navigation', () => {
  it('refuses infrastructure, the SDK (even /react), the network, storage and navigation', async () => {
    const found = await violations(
      'src/pages/Probe.tsx',
      `import { localStorageRememberedEmail } from '../platform/rememberedEmail'
       import { can } from '../platform/permissions'
       import { useSignOut } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
       import { signInAgain } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
       export const x = [localStorageRememberedEmail, can, useSignOut, signInAgain, fetch('/api'), sessionStorage,
         window.location.assign('/'), window.XMLHttpRequest, globalThis.fetch, self.localStorage, history.pushState, document.location, navigator.sendBeacon]`,
    )
    expect(found).toEqual([
      expect.stringContaining('never import platform/'),
      expect.stringContaining('never import platform/'),
      expect.stringContaining('never import the SDK'),
      expect.stringContaining('never import the SDK'),
      ...Array(9).fill(expect.stringContaining('call a use case')),
    ])
  })

  it('allows domain and application types, and other pages', async () => {
    expect(
      await violations(
        'src/components/Probe.tsx',
        `import type { RememberedEmailRepository } from '../domain/repositories/rememberedEmail'\nimport type { SignInUseCases } from '../application/signIn'\nimport { published } from '../pages/links'\nexport type T = [RememberedEmailRepository, SignInUseCases, typeof published]`,
      ),
    ).toEqual([])
  })
})

describe('the session screens (platform/SessionScreens.tsx): presentation next to infrastructure', () => {
  it('refuses the infrastructure beside them, /auth values and other SDK subpaths', async () => {
    const found = await violations(
      'src/platform/SessionScreens.tsx',
      `import { workspaceResolver } from './iam'
       import { can } from './permissions'
       import { signInAgain } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
       import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
       export const r = [workspaceResolver, can, signInAgain, useT, window.location]`,
    )
    expect(found).toEqual([
      expect.stringContaining('not infrastructure'),
      expect.stringContaining('not infrastructure'),
      expect.stringContaining('no login without a click'),
      expect.stringContaining('/auth types only'),
      expect.stringContaining('call a use case'),
    ])
  })

  it('allows /auth types, the screen host, the pages and the use cases', async () => {
    expect(
      await violations(
        'src/platform/SessionScreens.tsx',
        `import type { SessionState } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'\nimport { showScreen } from './screen'\nimport LoginPage from '../pages/LoginPage'\nimport type { SignInUseCases } from '../application/signIn'\nexport type T = [SessionState, typeof showScreen, typeof LoginPage, SignInUseCases]`,
      ),
    ).toEqual([])
  })
})

describe('infrastructure and the composition root are not restricted by these rules', () => {
  it('platform/ may use storage and the SDK runtime; bootstrap.tsx wires everything', async () => {
    expect(await violations('src/platform/probe.ts', `import { createApiClient } from '@bcbp-solutions-fzc-llc/frontend-sdk/http'\nexport const c = createApiClient`)).toEqual([])
    expect(await violations('src/bootstrap.tsx', `import { workspaceResolver } from './platform/iam'\nexport const r = workspaceResolver`)).toEqual([])
  })
})
