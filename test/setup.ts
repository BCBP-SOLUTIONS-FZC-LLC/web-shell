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

beforeEach(() => {
  if (!dom) return
  sessionStorage.clear()
  localStorage.clear()
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
