// The first-visit welcome intro: shown by the sign-in screen until it is completed or skipped once,
// counting its facts up, pausing its motion on request, and leaving no loop or listener behind.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SignInUseCases } from '../../src/application/signIn'
import { SignInScreen } from '../../src/presentation/features/session-screens/SessionScreens'
import WelcomeSplash from '../../src/presentation/features/welcome/WelcomeSplash'
import { localStorageRememberedEmail } from '../../src/infrastructure/storage/rememberedEmail'
import { localStorageWelcomeIntro } from '../../src/infrastructure/storage/welcomeIntro'

const useCases: SignInUseCases = {
  resolveWorkspace: async () => ({ realm: 'tenant-acme', trial: false, slug: 'acme' }),
  requestPasswordReset: async () => {},
  rememberedEmail: localStorageRememberedEmail,
  welcomeIntro: localStorageWelcomeIntro,
}

/** A matchMedia whose reduced-motion answer can change, telling its 'change' listeners. */
function reducedMotion(reduce: boolean) {
  const listeners = new Set<() => void>()
  const state = { reduce }
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: state.reduce && query.includes('reduce'),
    media: query,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }))
  return {
    set(next: boolean) {
      state.reduce = next
      listeners.forEach((l) => l())
    },
    listeners,
  }
}

/** A recording 2D context: the dust draws into it. */
function fakeCanvas() {
  const ctx = { setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), fillStyle: '' }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
  return ctx
}

beforeEach(() => {
  localStorage.removeItem('bcbp.welcomeSeen')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the sign-in screen on a first visit', () => {
  it.each([
    ['Continue to sign in', (s: typeof screen) => fireEvent.click(s.getByRole('button', { name: 'Continue to sign in' }))],
    ['Skip intro', (s: typeof screen) => fireEvent.click(s.getByRole('button', { name: 'Skip intro' }))],
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
  ])('shows the welcome first; %s marks it seen and shows the form', (_name, finish) => {
    reducedMotion(true)
    render(<SignInScreen useCases={useCases} welcome onChosen={() => {}} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Construction tenders, from first bid to handover.' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /work email address/i })).toBeNull()

    act(() => finish(screen))
    // Focus moves to the email field: the intro's button that had it is gone.
    expect(screen.getByRole('textbox', { name: /work email address/i })).toHaveFocus()
    expect(localStorage.getItem('bcbp.welcomeSeen')).toBe('1')
  })

  it('goes straight to the form once the intro was seen, with a notice, or when not offered (session flows)', () => {
    localStorage.setItem('bcbp.welcomeSeen', '1')
    const seen = render(<SignInScreen useCases={useCases} welcome onChosen={() => {}} />)
    expect(screen.getByRole('textbox', { name: /work email address/i })).not.toHaveFocus()
    seen.unmount()

    localStorage.removeItem('bcbp.welcomeSeen')
    const notice = render(<SignInScreen useCases={useCases} welcome notice="session.ended.default" onChosen={() => {}} />)
    expect(screen.getByRole('textbox', { name: /work email address/i })).toBeInTheDocument()
    notice.unmount()

    render(<SignInScreen useCases={useCases} onChosen={() => {}} />)
    expect(screen.getByRole('textbox', { name: /work email address/i })).toBeInTheDocument()
    expect(localStorage.getItem('bcbp.welcomeSeen')).toBeNull()
  })
})

describe('WelcomeSplash', () => {
  it('under reduced motion shows the final facts at once, with no canvas and no pause control', () => {
    reducedMotion(true)
    const { container } = render(<WelcomeSplash onComplete={() => {}} />)
    const shown = (label: string) => screen.getByText(label).parentElement!.querySelector('dd')!
    expect(screen.getByRole('region', { name: 'What the platform covers' })).toBeInTheDocument()
    expect(shown('Forecasting accuracy').querySelector('[aria-hidden]')).toHaveTextContent('95%')
    expect(shown('Programme sectors').querySelector('[aria-hidden]')).toHaveTextContent('8')
    expect(shown('Site monitoring')).toHaveTextContent('Live')
    expect(container.querySelector('canvas')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pause animation' })).toBeNull()
  })

  it('counts the facts up after the card lands, for screen readers only once', async () => {
    reducedMotion(false)
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    render(<WelcomeSplash onComplete={() => {}} />)
    const forecasting = screen.getByText('Forecasting accuracy').parentElement!
    expect(forecasting.querySelector('[aria-hidden]')).toHaveTextContent('0%')
    expect(forecasting.querySelector('.sr-only')).toHaveTextContent('95%')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000 + 1200 + 50)
    })
    expect(forecasting.querySelector('[aria-hidden]')).toHaveTextContent('95%')
    expect(screen.getByText('Programme sectors').parentElement!.querySelector('[aria-hidden]')).toHaveTextContent('8')
  })

  it('draws site dust each frame, stops it on pause and while hidden, and leaves nothing behind on unmount', async () => {
    reducedMotion(false)
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    const ctx = fakeCanvas()
    const removeWindow = vi.spyOn(window, 'removeEventListener')
    const removeDocument = vi.spyOn(document, 'removeEventListener')
    const { container, unmount } = render(<WelcomeSplash onComplete={() => {}} />)

    // Long enough for every mote to rise past the top and re-enter at the bottom.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(ctx.arc).toHaveBeenCalled()

    // Hidden tab: no frames; visible again: frames resume.
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    ctx.arc.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(ctx.arc).not.toHaveBeenCalled()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    act(() => void window.dispatchEvent(new Event('resize')))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(ctx.arc).toHaveBeenCalled()

    // Pause: the dust stops and the glow is held (the entrance still finishes); Play resumes.
    fireEvent.click(screen.getByRole('button', { name: 'Pause animation' }))
    expect(container.firstElementChild).toHaveClass('splash-paused')
    expect(screen.getByRole('button', { name: 'Play animation' })).toHaveAttribute('aria-pressed', 'true')
    ctx.arc.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(ctx.arc).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Play animation' }))
    expect(container.firstElementChild).not.toHaveClass('splash-paused')

    unmount()
    ctx.arc.mockClear()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(ctx.arc).not.toHaveBeenCalled()
    expect(removeWindow).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeWindow).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })

  it('follows the reduced-motion preference live: turning it on removes the canvas and the pause control', () => {
    const media = reducedMotion(false)
    fakeCanvas()
    const { container, unmount } = render(<WelcomeSplash onComplete={() => {}} />)
    expect(container.querySelector('canvas')).not.toBeNull()
    act(() => media.set(true))
    expect(container.querySelector('canvas')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pause animation' })).toBeNull()
    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('runs without a 2D context or matchMedia (an older engine): the rest of the intro still works', () => {
    vi.stubGlobal('matchMedia', undefined)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const done = vi.fn()
    render(<WelcomeSplash onComplete={done} />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip intro' }))
    expect(done).toHaveBeenCalledOnce()
  })
})
