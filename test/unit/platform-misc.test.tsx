import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRememberedEmail, persistRememberEmail } from '../../src/pages/rememberEmail'
import { cmp } from '../../src/platform/consent'
import { permissions } from '../../src/platform/permissions'
import { hideScreen, resetScreen, showScreen } from '../../src/platform/screen'

describe('rememberEmail', () => {
  it('round-trips and clears', () => {
    expect(getRememberedEmail()).toBe('')
    persistRememberEmail(' ada@bcbp.com ', true)
    expect(getRememberedEmail()).toBe('ada@bcbp.com')
    persistRememberEmail('ada@bcbp.com', false)
    expect(getRememberedEmail()).toBe('')
  })

  it('returns an empty email when the flag is set without one', () => {
    localStorage.setItem('bcbp.rememberEmail', 'true')
    expect(getRememberedEmail()).toBe('')
  })

  it('survives blocked storage', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked })
    expect(getRememberedEmail()).toBe('')
    expect(() => persistRememberEmail('a@b.c', true)).not.toThrow()
  })
})

describe('consent stand-in', () => {
  it('grants essential only until accepted, and notifies subscribers', () => {
    expect(cmp.has('essential')).toBe(true)
    expect(cmp.has('telemetry')).toBe(false)
    const listener = vi.fn()
    const unsubscribe = cmp.subscribe(listener)
    cmp.accept(['telemetry'])
    expect(cmp.has('telemetry')).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    cmp.accept(['analytics'])
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('permissions', () => {
  it('gives tenant admins every permission members have', () => {
    for (const p of permissions.member!) expect(permissions.tenant_admin).toContain(p)
  })
})

describe('screen host', () => {
  afterEach(() => act(() => resetScreen()))

  it('shows, hides and reuses one full-screen host', () => {
    act(() => showScreen(<p>first</p>))
    const host = document.getElementById('shell-screen')!
    expect(host).toHaveClass('fixed', 'inset-0')
    expect(host.hidden).toBe(false)
    expect(screen.getByText('first')).toBeInTheDocument()

    act(() => hideScreen())
    expect(host.hidden).toBe(true)
    expect(screen.queryByText('first')).not.toBeInTheDocument()

    act(() => showScreen(<p>second</p>))
    expect(document.querySelectorAll('#shell-screen')).toHaveLength(1)
    expect(host.hidden).toBe(false)
  })

  it('tolerates hide and reset before anything was shown', () => {
    expect(() => {
      hideScreen()
      resetScreen()
    }).not.toThrow()
  })
})
