import { describe, expect, it } from 'vitest'
import { resolveLoginVariant } from '../../src/pages/loginVariant'

describe('resolveLoginVariant', () => {
  it('uses the latest screen unless the query asks for login1', () => {
    expect(resolveLoginVariant('')).toBe('latest')
    expect(resolveLoginVariant('?code=abc')).toBe('latest')
    expect(resolveLoginVariant('?variant=latest')).toBe('latest')
    expect(resolveLoginVariant('?variant=login1')).toBe('login1')
  })
})