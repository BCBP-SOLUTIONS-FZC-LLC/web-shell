// @vitest-environment node
// The architecture lint (.dependency-cruiser.cjs, `npm run arch-lint`): each rule is proven to fire on
// a copy of src/ with probe files added, so the component map is enforced, not only declared.
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..', '..')
const SDK = '@bcbp-solutions-fzc-llc/frontend-sdk'

interface Violation {
  from: string
  to: string
  rule: { name: string }
}

/** Runs the real config over `dir` and returns its violations. */
function archLint(dir: string): Violation[] {
  let out: string
  try {
    out = execFileSync(process.execPath, [join(root, 'node_modules/dependency-cruiser/bin/dependency-cruiser.mjs'), 'src', '--config', join(dir, 'arch-lint.cjs'), '--output-type', 'json'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    out = (error as { stdout: string }).stdout // violations exit non-zero; the report is still on stdout
  }
  return (JSON.parse(out) as { summary: { violations: Violation[] } }).summary.violations
}

let project: string
const write = (path: string, code: string) => {
  mkdirSync(dirname(join(project, path)), { recursive: true })
  writeFileSync(join(project, path), code)
}

describe('arch-lint', () => {
  beforeAll(() => {
    project = mkdtempSync(join(tmpdir(), 'web-shell-arch-lint-'))
    cpSync(join(root, 'src'), join(project, 'src'), { recursive: true })
    cpSync(join(root, 'tsconfig.json'), join(project, 'tsconfig.json'))
    symlinkSync(join(root, 'node_modules'), join(project, 'node_modules'), 'dir')
    // The real config; node_modules is a symlink here, so keep resolved paths under the project.
    writeFileSync(
      join(project, 'arch-lint.cjs'),
      `const real = require(${JSON.stringify(join(root, '.dependency-cruiser.cjs'))})\nmodule.exports = { ...real, options: { ...real.options, preserveSymlinks: true } }\n`,
    )
  })
  afterAll(() => rmSync(project, { recursive: true, force: true }))

  it('passes the real src/', () => {
    expect(archLint(project)).toEqual([])
  })

  describe('with probes', () => {
    let found: string[]
    beforeAll(() => {
      write('src/domain/probe.ts', `import { useState } from 'react'\nimport { workspaceResolver } from '../platform/iam'\nimport { createApiClient } from '${SDK}/http'\nexport const p = [useState, workspaceResolver, createApiClient]\n`)
      write('src/application/probe.ts', `import LoginPage from '../pages/LoginPage'\nexport const p = LoginPage\n`)
      write('src/pages/Probe.tsx', `import { localStorageRememberedEmail } from '../platform/rememberedEmail'\nimport { useSignOut } from '${SDK}/react'\nexport const p = [localStorageRememberedEmail, useSignOut]\n`)
      write('src/shared/i18n/probe.ts', `import { workspaceResolver } from '../../platform/iam'\nexport const p = workspaceResolver\n`)
      write('src/session/probe.ts', `import { WorkspaceNotFoundError } from '../domain/errors'\nexport const p = WorkspaceNotFoundError\n`)
      write('src/domain/cycleA.ts', `import { b } from './cycleB'\nexport const a = () => b\n`)
      write('src/domain/cycleB.ts', `import { a } from './cycleA'\nexport const b = () => a\n`)
      write('src/domain/missing.ts', `import { x } from './nowhere'\nexport const m = x\n`)
      // The session screens taking a sign-in function, not only /auth types (no login without a click)
      write('src/platform/SessionScreens.tsx', `${readFileSync(join(root, 'src/platform/SessionScreens.tsx'), 'utf8')}\nimport { signInAgain } from '${SDK}/auth'\nexport const probe = signInAgain\n`)
      // allowed: a use case with a domain import and an SDK port type
      write('src/application/use-cases/ok.ts', `import type { WorkspaceResolver } from '${SDK}/auth'\nimport { WorkspaceNotFoundError } from '../../domain/errors'\nexport const ok = (r: WorkspaceResolver) => [r, WorkspaceNotFoundError]\n`)
      found = archLint(project).map((v) => `${v.rule.name}: ${v.from} → ${v.to.replace(/^node_modules\/(@bcbp-solutions-fzc-llc\/frontend-sdk\/dist\/[^/]+|[^/]+).*/, '$1')}`)
    })

    it('domain: no React, no other component, no SDK runtime (types only)', () => {
      expect(found).toEqual(expect.arrayContaining([
        'not-in-allowed: src/domain/probe.ts → react',
        'not-in-allowed: src/domain/probe.ts → src/platform/iam.ts',
        `not-in-allowed: src/domain/probe.ts → @bcbp-solutions-fzc-llc/frontend-sdk/dist/http`,
      ]))
    })

    it('application: never presentation', () => {
      expect(found).toContain('not-in-allowed: src/application/probe.ts → src/pages/LoginPage.tsx')
    })

    it('pages: never infrastructure or the SDK', () => {
      expect(found).toEqual(expect.arrayContaining([
        'not-in-allowed: src/pages/Probe.tsx → src/platform/rememberedEmail.ts',
        'not-in-allowed: src/pages/Probe.tsx → @bcbp-solutions-fzc-llc/frontend-sdk/dist/react',
      ]))
    })

    it('session screens: /auth types only, never its functions', () => {
      expect(found).toContain('not-in-allowed: src/platform/SessionScreens.tsx → @bcbp-solutions-fzc-llc/frontend-sdk/dist/auth')
    })

    it('shared: no shell layer', () => {
      expect(found).toContain('not-in-allowed: src/shared/i18n/probe.ts → src/platform/iam.ts')
    })

    it('a file in no component fails', () => {
      expect(found).toContain('not-in-allowed: src/session/probe.ts → src/domain/errors.ts')
    })

    it('cycles and unresolvable imports fail', () => {
      expect(found).toEqual(expect.arrayContaining([
        'no-circular: src/domain/cycleA.ts → src/domain/cycleB.ts',
        'not-to-unresolvable: src/domain/missing.ts → ./nowhere',
      ]))
    })

    it('allows a use case with domain imports and SDK port types', () => {
      expect(found.filter((v) => v.includes('src/application/use-cases/ok.ts'))).toEqual([])
    })
  })
})
