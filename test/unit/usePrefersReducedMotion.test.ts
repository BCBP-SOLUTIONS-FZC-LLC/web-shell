import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePrefersReducedMotion } from '../../src/presentation/components/usePrefersReducedMotion'

describe('usePrefersReducedMotion', () => {
  it('reads the media query and works where change listeners or matchMedia are missing', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(true)
    vi.stubGlobal('matchMedia', undefined)
    const { result, unmount } = renderHook(() => usePrefersReducedMotion())
    expect(result.current).toBe(false)
    unmount()
  })
})
