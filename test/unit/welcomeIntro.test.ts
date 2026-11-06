import { afterEach, describe, expect, it, vi } from 'vitest'
import { localStorageWelcomeIntro as intro } from '../../src/infrastructure/storage/welcomeIntro'

describe('localStorageWelcomeIntro', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is unseen on a first visit and seen once marked, under bcbp.welcomeSeen only', () => {
    localStorage.clear()
    expect(intro.seen()).toBe(false)
    intro.markSeen()
    expect(intro.seen()).toBe(true)
    expect({ ...localStorage }).toEqual({ 'bcbp.welcomeSeen': '1' })
  })

  it('counts as unseen, and never throws, when storage is blocked', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked })
    expect(intro.seen()).toBe(false)
    expect(() => intro.markSeen()).not.toThrow()
  })
})
