import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRememberedEmail, persistRememberEmail } from '../../src/pages/rememberEmail'
import { cmp } from '../../src/platform/consent'
import { hasPermission, roleMapAuthorizer, setAuthorizer, setAuthzSubject } from '@bcbp-solutions-fzc-llc/frontend-sdk/authz'
import { createTestPlatform } from '@bcbp-solutions-fzc-llc/frontend-sdk/testing'
import { IAM_ROLES, permissions } from '../../src/platform/permissions'
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

describe('permissions (IAM P-35 roles, §10.4 grants)', () => {
  afterEach(() => platform?.reset())
  let platform: ReturnType<typeof createTestPlatform> | undefined

  const can = (roles: string[], action: string, resource: string) => {
    platform?.reset()
    platform = createTestPlatform()
    setAuthorizer(roleMapAuthorizer(permissions))
    setAuthzSubject({ roles, tenantId: 't-1' })
    return hasPermission(action, resource)
  }

  it("keys only on IAM's closed role set, so no key is dead", () => {
    expect(Object.keys(permissions).sort()).toEqual([...IAM_ROLES].sort())
  })

  it('lets every active member view members and tenders', () => {
    for (const role of IAM_ROLES) {
      expect(permissions[role]).toContain('read:members')
      expect(permissions[role]).toContain('read:tender')
    }
  })

  it('lets only tenant owners and tenant admins manage members', () => {
    expect(can(['member', 'tenant_owner'], 'manage', 'members')).toBe(true)
    expect(can(['member', 'tenant_admin'], 'manage', 'members')).toBe(true)
    expect(can(['member', 'tender_admin'], 'manage', 'members')).toBe(false)
    expect(can(['member'], 'manage', 'members')).toBe(false)
    expect(can(['member'], 'read', 'members')).toBe(true)
  })

  it('gives tenant owners exactly what tenant admins get', () => {
    expect(permissions.tenant_owner).toEqual(permissions.tenant_admin)
  })

  it('grants nothing for a department level, which is never a role', () => {
    expect(can(['preparator'], 'update', 'tender')).toBe(false)
    expect(can(['preparator'], 'read', 'tender')).toBe(false)
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
