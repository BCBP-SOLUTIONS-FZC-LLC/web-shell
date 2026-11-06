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
       import { workspaceResolver } from '../infrastructure/api/iam'
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
       import LoginPage from '../../presentation/pages/login/LoginPage'
       import { passwordResetUrl } from '../../infrastructure/auth/passwordReset'
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

  it('allows domain imports, SDK types and the /problem error classes', async () => {
    expect(
      await violations(
        'src/application/use-cases/probe.ts',
        `import type { WorkspaceResolver } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'\nimport { NetworkError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'\nimport { WorkspaceNotFoundError } from '../../domain/errors'\nexport const f = (r: WorkspaceResolver) => [r, NetworkError, WorkspaceNotFoundError]`,
      ),
    ).toEqual([])
  })
})

describe('pages, components and widgets: never infrastructure, app/ or the SDK; no network, storage or navigation', () => {
  it('refuses infrastructure, the SDK (even /react), the network, storage and navigation', async () => {
    const found = await violations(
      'src/presentation/pages/login/Probe.tsx',
      `import { localStorageRememberedEmail } from '../../../infrastructure/storage/rememberedEmail'
       import { showScreen } from '../../../app/layouts/screen'
       import { useSignOut } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
       import { signInAgain } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
       export const x = [localStorageRememberedEmail, showScreen, useSignOut, signInAgain, fetch('/api'), sessionStorage,
         window.location.assign('/'), window.XMLHttpRequest, globalThis.fetch, self.localStorage, history.pushState, document.location, navigator.sendBeacon]`,
    )
    expect(found).toEqual([
      expect.stringContaining('never imports infrastructure or app/'),
      expect.stringContaining('never imports infrastructure or app/'),
      expect.stringContaining('never import the SDK'),
      expect.stringContaining('never import the SDK'),
      ...Array(9).fill(expect.stringContaining('call a use case')),
    ])
  })

  it('covers any presentation folder, and allows application/ types only', async () => {
    const found = await violations(
      'src/presentation/hooks/probe.ts',
      `import { resolveWorkspaceUseCase } from '../../application/use-cases/resolveWorkspace'
       export const x = [resolveWorkspaceUseCase, fetch('/api')]`,
    )
    expect(found).toEqual([expect.stringContaining('application/ types only'), expect.stringContaining('call a use case')])
  })

  it('allows domain and application types, shared/ and other presentation', async () => {
    expect(
      await violations(
        'src/presentation/widgets/Probe.tsx',
        `import type { RememberedEmailRepository } from '../../domain/repositories/rememberedEmail'\nimport type { SignInUseCases } from '../../application/signIn'\nimport { published } from '../../shared/constants/links'\nimport { BrandLogo } from '../components/BrandLogo'\nexport type T = [RememberedEmailRepository, SignInUseCases, typeof published, typeof BrandLogo]`,
      ),
    ).toEqual([])
  })
})

describe('features (the session screens): /auth types only, never infrastructure or app/', () => {
  it('refuses the infrastructure beside them, /auth values and other SDK subpaths', async () => {
    const found = await violations(
      'src/presentation/features/session-screens/SessionScreens.tsx',
      `import { workspaceResolver } from '../../../infrastructure/api/iam'
       import { showScreen } from '../../../app/layouts/screen'
       import { signInAgain } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'
       import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
       export const r = [workspaceResolver, showScreen, signInAgain, useT, window.location]`,
    )
    expect(found).toEqual([
      expect.stringContaining('not infrastructure'),
      expect.stringContaining('not infrastructure'),
      expect.stringContaining('no login without a click'),
      expect.stringContaining('/auth types only'),
      expect.stringContaining('call a use case'),
    ])
  })

  it('allows /auth types, the pages and the use cases', async () => {
    expect(
      await violations(
        'src/presentation/features/session-screens/SessionScreens.tsx',
        `import type { SessionState } from '@bcbp-solutions-fzc-llc/frontend-sdk/auth'\nimport LoginPage from '../../pages/login/LoginPage'\nimport type { SignInUseCases } from '../../../application/signIn'\nexport type T = [SessionState, typeof LoginPage, SignInUseCases]`,
      ),
    ).toEqual([])
  })
})

describe('shared (src/shared/): no shell layer; the SDK for text only', () => {
  it('refuses shell layers, other SDK subpaths and the browser', async () => {
    const found = await violations(
      'src/shared/i18n/probe.ts',
      `import { workspaceResolver } from '../../infrastructure/api/iam'
       import { createApiClient } from '@bcbp-solutions-fzc-llc/frontend-sdk/http'
       export const x = [workspaceResolver, createApiClient, localStorage]`,
    )
    expect(found).toEqual([
      expect.stringContaining('depends on no shell layer'),
      expect.stringContaining('only for text'),
      expect.stringContaining('does not reach'),
    ])
  })

  it('allows /i18n and /react', async () => {
    expect(await violations('src/shared/i18n/probe.ts', `import { t } from '@bcbp-solutions-fzc-llc/frontend-sdk/i18n'\nimport { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'\nexport const x = [t, useT]`)).toEqual([])
  })
})

describe('infrastructure (src/infrastructure/): implements domain contracts', () => {
  it('refuses presentation, application and app/', async () => {
    const found = await violations(
      'src/infrastructure/api/probe.ts',
      `import LoginPage from '../../presentation/pages/login/LoginPage'
       import { resolveWorkspaceUseCase } from '../../application/use-cases/resolveWorkspace'
       import { showScreen } from '../../app/layouts/screen'
       export const x = [LoginPage, resolveWorkspaceUseCase, showScreen]`,
    )
    expect(found).toEqual(Array(3).fill(expect.stringContaining('implements domain contracts')))
  })

  it('may use the SDK runtime and the domain', async () => {
    expect(await violations('src/infrastructure/api/probe.ts', `import { createApiClient } from '@bcbp-solutions-fzc-llc/frontend-sdk/http'\nimport type { RememberedEmailRepository } from '../../domain/repositories/rememberedEmail'\nexport const c: [typeof createApiClient, RememberedEmailRepository?] = [createApiClient]`)).toEqual([])
  })
})

describe('app/ (the composition root) is not restricted by these rules', () => {
  it('bootstrap.tsx wires everything', async () => {
    expect(await violations('src/app/bootstrap/bootstrap.tsx', `import { workspaceResolver } from '../../infrastructure/api/iam'\nimport LoginPage from '../../presentation/pages/login/LoginPage'\nexport const r = [workspaceResolver, LoginPage]`)).toEqual([])
  })
})
