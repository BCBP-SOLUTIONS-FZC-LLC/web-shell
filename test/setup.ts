import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, vi } from 'vitest'

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: webcrypto,
})

// A file under `@vitest-environment node` (test/unit/dev-platform.test.ts) has no DOM and uses the
// real fetch against a local server.
const dom = typeof window !== 'undefined'

beforeEach(async () => {
  if (!dom) return
  // The shell's catalogue, as the bootstrap loads it before the first screen: components rendered on
  // their own show their English text, not keys.
  const { registerShellMessages } = await import('../src/infrastructure/i18n/shellMessages')
  await registerShellMessages('en')
  sessionStorage.clear()
  localStorage.clear()
  // A returning visitor by default: the first-visit welcome intro is seen, so the sign-in form shows.
  // The welcome-intro tests (unit, integration, bootstrap, e2e) remove it.
  localStorage.setItem('bcbp.welcomeSeen', '1')
  window.history.replaceState({}, '', '/')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status: 200 })),
  )
  vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  vi.spyOn(window.location, 'replace').mockImplementation(() => {})
})

afterEach(() => {
  if (dom) cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
