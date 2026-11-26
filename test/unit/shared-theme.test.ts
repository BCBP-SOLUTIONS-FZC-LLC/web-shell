import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { keepSharedTheme } from '../../src/infrastructure/storage/sharedTheme'

const store = new Map<string, unknown>()
vi.mock('@bcbp-solutions-fzc-llc/frontend-sdk/storage', () => ({
  storage: () => ({ get: (k: string) => store.get(k), set: (k: string, v: unknown) => void store.set(k, v) }),
}))

describe('keepSharedTheme', () => {
  let stop: () => void = () => {}
  beforeEach(() => {
    store.clear()
    delete document.documentElement.dataset.theme
  })
  afterEach(() => stop())

  it('puts the saved theme on the page before a remote mounts', () => {
    store.set('theme', 'dark')
    stop = keepSharedTheme()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('saves a theme a remote sets, and keeps it for the next remote', async () => {
    stop = keepSharedTheme()
    document.documentElement.dataset.theme = 'dark'
    await vi.waitFor(() => expect(store.get('theme')).toBe('dark'))
    delete document.documentElement.dataset.theme // a reload, or another remote's page
    stop()
    stop = keepSharedTheme()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('stops saving once stopped', async () => {
    stop = keepSharedTheme()
    stop()
    document.documentElement.dataset.theme = 'light'
    await new Promise((r) => setTimeout(r, 20))
    expect(store.has('theme')).toBe(false)
  })
})
