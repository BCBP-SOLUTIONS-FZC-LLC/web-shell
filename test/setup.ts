import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, vi } from 'vitest'

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: webcrypto,
})

beforeEach(() => {
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
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
