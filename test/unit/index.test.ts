import { beforeEach, describe, expect, it, vi } from 'vitest'

const bootstrap = vi.fn<() => Promise<void>>()
vi.mock('../../src/app/bootstrap/bootstrap', () => ({ bootstrap: () => bootstrap() }))

beforeEach(() => {
  vi.resetModules()
  document.body.innerHTML = '<div id="app"></div>'
})

describe('entry point', () => {
  it('runs the bootstrap behind the async boundary', async () => {
    bootstrap.mockResolvedValue()
    const { started } = await import('../../src/app/bootstrap/index')
    await started
    expect(bootstrap).toHaveBeenCalledOnce()
    expect(document.querySelector('[role=alert]')).toBeNull()
  })

  it('shows a static message when start-up fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    bootstrap.mockRejectedValue(new Error('runtime.json invalid'))
    const { started } = await import('../../src/app/bootstrap/index')
    await started
    expect(document.querySelector('[role=alert]')).toHaveTextContent('The app is unavailable right now.')
    expect(error).toHaveBeenCalledWith('the app could not start', expect.any(Error))
  })

  it('offers Try again, which reloads the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
    const { showUnavailable } = await import('../../src/app/bootstrap/index')
    showUnavailable(new Error('x'))
    const retry = document.querySelector<HTMLButtonElement>('[role=alert] button')!
    expect(retry).toHaveTextContent('Try again')
    retry.click()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('tolerates a missing root element', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    document.body.innerHTML = ''
    const { showUnavailable } = await import('../../src/app/bootstrap/index')
    expect(() => showUnavailable(new Error('x'))).not.toThrow()
  })
})
