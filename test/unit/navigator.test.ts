// The SDK navigator: paths under the router's basename stay in the app; others are full loads.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shellNavigator } from '../../src/platform/navigator'

let assigned: string[]
beforeEach(() => {
  assigned = []
  vi.spyOn(window.location, 'assign').mockImplementation((u) => void assigned.push(`assign ${String(u)}`))
  vi.spyOn(window.location, 'replace').mockImplementation((u) => void assigned.push(`replace ${String(u)}`))
})

describe('shellNavigator', () => {
  it('routes a path under the basename through the router, keeping query and hash', () => {
    const router = vi.fn()
    const nav = shellNavigator(router, '/t/acme')
    nav('dashboard', '/t/acme/dashboard/members?tab=2#top')
    nav('dashboard', '/t/acme', { replace: true })
    expect(router.mock.calls).toEqual([
      ['/dashboard/members?tab=2#top', {}],
      ['/', { replace: true }],
    ])
    expect(assigned).toEqual([])
  })

  it('loads any other path in full: another workspace, or a prefix look-alike', () => {
    const router = vi.fn()
    const nav = shellNavigator(router, '/t/acme')
    nav('dashboard', '/t/other/dashboard')
    nav('dashboard', '/t/acme-two/dashboard', { replace: true })
    expect(router).not.toHaveBeenCalled()
    const origin = window.location.origin
    expect(assigned).toEqual([`assign ${origin}/t/other/dashboard`, `replace ${origin}/t/acme-two/dashboard`])
  })

  it('without a basename routes every path', () => {
    const router = vi.fn()
    shellNavigator(router, undefined)('shell', '/dashboard')
    expect(router).toHaveBeenCalledWith('/dashboard', {})
  })
})
