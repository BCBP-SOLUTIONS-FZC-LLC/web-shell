import { beforeEach, describe, expect, it, vi } from 'vitest'

const render = vi.hoisted(() => vi.fn())
const createRoot = vi.hoisted(() => vi.fn(() => ({ render })))

vi.mock('react-dom/client', () => ({
  createRoot,
}))

describe('main', () => {
  beforeEach(() => {
    vi.resetModules()
    document.body.innerHTML = ''
    createRoot.mockClear()
    render.mockClear()
  })

  it('throws when the root element is missing', async () => {
    await expect(import('../../src/main')).rejects.toThrow('Root element #app not found')
    expect(createRoot).not.toHaveBeenCalled()
  })

  it('captures an oauth callback and renders the shell', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    window.history.replaceState({}, '', '/?code=from-main&state=s')

    await import('../../src/main')

    expect(createRoot).toHaveBeenCalledWith(document.getElementById('app'))
    expect(render).toHaveBeenCalledTimes(1)

    const oauth = await import('../../src/auth/oauth-pkce')
    oauth.captureOAuthCallbackFromUrl()
    expect(oauth.hasOAuthCallbackInUrl()).toBe(true)
  })

  it('ignores a startup url that is not an oauth callback', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    window.history.replaceState({}, '', '/dashboard')

    await import('../../src/main')

    const oauth = await import('../../src/auth/oauth-pkce')
    expect(oauth.hasOAuthCallbackInUrl()).toBe(false)
  })
})
