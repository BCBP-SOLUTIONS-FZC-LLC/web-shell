// The sign-in hero's slideshow: it opens once, then moves on its own every 7 s with a crossfade and
// a slow zoom, waits for a photograph that is not ready, holds on Pause, a mouse or keyboard focus
// (keeping the time left), never moves under reduced motion, and fetches only the photographs it
// is about to show. Photographs count as decoded unless a test says otherwise.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '../../src/presentation/pages/login/LoginPage'
import { localStorageRememberedEmail as remembered } from '../../src/infrastructure/storage/rememberedEmail'

const page = () => render(<LoginPage rememberedEmail={remembered} onContinue={async () => {}} />)
/** As a browser would: every photograph with a src has loaded (decoded or not, per naturalWidth). */
const loadAll = () => document.querySelectorAll('section img.object-cover[src]').forEach((img) => fireEvent.load(img))
const next = async (ms = 7000) => {
  loadAll()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function reducedMotion(reduce: boolean) {
  const listeners = new Set<() => void>()
  const state = { reduce }
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: state.reduce && query.includes('reduce'),
    media: query,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }))
  return { set: (v: boolean) => ((state.reduce = v), listeners.forEach((l) => l())) }
}

const decoded = (width: number) => vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(width)
const hero = () => screen.getByRole('region', { name: 'Product highlights' })

describe('login hero slideshow', () => {
  beforeEach(() => {
    decoded(1200)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('moves to the next slide every 7 s, around all nine, with no slide controls', async () => {
    vi.useFakeTimers()
    page()
    expect(screen.getByRole('heading', { name: /Next-Gen System/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /slide \d|Next slide|Previous slide/ })).toBeNull()

    await next(6999)
    expect(screen.getByRole('heading', { name: /Next-Gen System/ })).toBeInTheDocument()
    await next(1)
    expect(screen.getByRole('heading', { name: /Airside programs/ })).toBeInTheDocument()
    expect(screen.getByText(/apron stays in motion/)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '2 of 9' })).toBeInTheDocument()
    // The new slide gets its full 7 s (a regression once ran the slides with 0 ms timers).
    await next(6999)
    expect(screen.getByRole('group', { name: '2 of 9' })).toBeInTheDocument()
    await next(1)
    expect(screen.getByRole('group', { name: '3 of 9' })).toBeInTheDocument()

    for (let i = 0; i < 6; i++) await next()
    expect(screen.getByRole('heading', { name: /Village programs/ })).toBeInTheDocument()
    await next()
    expect(screen.getByRole('heading', { name: /Next-Gen System/ })).toBeInTheDocument()
  })

  it('holds on Pause; the button names what a press does; the slideshow is not a live region', async () => {
    vi.useFakeTimers()
    const { container } = page()
    expect(container.querySelector('[aria-live]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Pause slideshow' }))
    expect(screen.getByRole('button', { name: 'Play slideshow' })).not.toHaveAttribute('aria-pressed')
    expect(container.querySelector('section')).toHaveClass('hero-held')
    await next(21_000)
    expect(screen.getByRole('heading', { name: /Next-Gen System/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Play slideshow' }))
    await next()
    expect(screen.getByRole('heading', { name: /Airside programs/ })).toBeInTheDocument()
  })

  it('a mouse over the hero holds it and keeps the time left; a touch does not hold it', async () => {
    vi.useFakeTimers()
    page()
    await next(5000)
    fireEvent.pointerEnter(hero(), { pointerType: 'mouse' })
    await next(21_000)
    expect(screen.getByRole('heading', { name: /Next-Gen System/ })).toBeInTheDocument()
    fireEvent.pointerLeave(hero(), { pointerType: 'mouse' })
    // 2 s were left on the first slide, not a fresh 7 s.
    await next(2000)
    expect(screen.getByRole('heading', { name: /Airside programs/ })).toBeInTheDocument()

    fireEvent.pointerEnter(hero(), { pointerType: 'touch' })
    await next()
    expect(screen.getByRole('heading', { name: /Port calls/ })).toBeInTheDocument()
  })

  it('keyboard focus inside the hero holds it until focus leaves', async () => {
    vi.useFakeTimers()
    page()
    const pause = screen.getByRole('button', { name: 'Pause slideshow' })
    act(() => pause.focus())
    expect(hero()).toHaveClass('hero-held')
    await next(21_000)
    expect(screen.getByRole('heading', { name: /Next-Gen System/ })).toBeInTheDocument()
    act(() => screen.getByRole('textbox', { name: /work email address/i }).focus())
    expect(hero()).not.toHaveClass('hero-held')
    await next()
    expect(screen.getByRole('heading', { name: /Airside programs/ })).toBeInTheDocument()
  })

  it('waits for the next photograph: the words never move ahead of their picture', async () => {
    vi.useFakeTimers()
    decoded(0)
    const { container } = page()
    await next(21_000)
    expect(screen.getByRole('heading', { name: /Next-Gen System/ })).toBeInTheDocument()
    // Held when it arrives: it waits for the hold to end.
    fireEvent.pointerEnter(hero(), { pointerType: 'mouse' })
    decoded(1200)
    fireEvent.load(container.querySelectorAll('section img.object-cover')[1]!)
    expect(screen.getByRole('heading', { name: /Next-Gen System/ })).toBeInTheDocument()
    // The third photograph will be late too.
    decoded(0)
    fireEvent.pointerLeave(hero(), { pointerType: 'mouse' })
    await next(1)
    expect(screen.getByRole('heading', { name: /Airside programs/ })).toBeInTheDocument()

    // Not held: the change happens as the late photograph arrives.
    await next()
    expect(screen.getByRole('heading', { name: /Airside programs/ })).toBeInTheDocument()
    decoded(1200)
    fireEvent.load(container.querySelectorAll('section img.object-cover')[2]!)
    expect(screen.getByRole('heading', { name: /Port calls/ })).toBeInTheDocument()
  })

  it('never moves or opens under reduced motion; turned on live it stops on the slide showing; turned off it never replays the opening', async () => {
    vi.useFakeTimers()
    const media = reducedMotion(true)
    const { container } = page()
    expect(screen.queryByRole('button', { name: 'Pause slideshow' })).toBeNull()
    expect(container.querySelectorAll('.cine-bar')).toHaveLength(0)
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveClass('cine-d1')
    await next(21_000)
    expect(screen.getByRole('heading', { name: /Next-Gen System/ })).toBeInTheDocument()

    act(() => media.set(false))
    expect(container.querySelectorAll('.cine-bar')).toHaveLength(0)
    await next()
    expect(screen.getByRole('heading', { name: /Airside programs/ })).toBeInTheDocument()
    act(() => media.set(true))
    await next(21_000)
    expect(screen.getByRole('heading', { name: /Airside programs/ })).toBeInTheDocument()
  })

  it('plays the cinematic opening once; from the first change every slide rises in instead', async () => {
    vi.useFakeTimers()
    const { container } = page()
    expect(screen.getByRole('heading', { name: /Next-Gen System/ })).toHaveClass('cine-rise', 'cine-d1')
    expect(screen.getByText(/Access your unified workspace/)).toHaveClass('cine-rise', 'cine-d2')
    expect(container.querySelectorAll('.cine-bar')).toHaveLength(2)
    expect(container.querySelector('.cine-settle')).not.toBeNull()
    // The form beside it never animates: it takes input from the first frame.
    const form = container.querySelector('form')!
    expect(form.closest('[class*="cine-"]')).toBeNull()
    expect(form.querySelector('[class*="cine-"]')).toBeNull()
    // The pause control is never part of the rise, so it is never invisible.
    expect(screen.getByRole('button', { name: 'Pause slideshow' }).closest('[class*="cine-"]')).toBeNull()

    await next()
    const heading = screen.getByRole('heading', { name: /Airside programs/ })
    expect(heading).toHaveClass('cine-rise')
    expect(heading).not.toHaveClass('cine-d1')
    expect(screen.getByText(/apron stays in motion/)).toHaveClass('cine-rise', 'hero-copy-late')
    expect(container.querySelectorAll('.cine-bar')).toHaveLength(0)
    expect(container.querySelector('.cine-settle')).toBeNull()
  })

  it('cross-fades to a slide once its photograph has loaded; the one on screen zooms', async () => {
    vi.useFakeTimers()
    const { container } = page()
    const frames = () => [...container.querySelectorAll('section > div[aria-hidden]:has(img)')]
    const images = () => [...container.querySelectorAll('section img.object-cover')]
    expect(frames()[0]).toHaveClass('opacity-100')
    expect(images()[0]).toHaveClass('hero-kb', 'hero-kb-late')

    await next()
    // The first photograph keeps its zoom's delay while it is still on screen: no jump.
    expect(images()[0]).toHaveClass('hero-kb', 'hero-kb-late')
    fireEvent.load(images()[1]!)
    fireEvent.load(images()[1]!)
    // The incoming frame fades in on top while the last one stays under it.
    expect(frames()[1]).toHaveClass('opacity-100', 'z-[1]')
    expect(frames()[0]).toHaveClass('opacity-100', 'z-0')
    expect(images()[1]).toHaveClass('hero-kb')
    expect(images()[1]).not.toHaveClass('hero-kb-late')

    await next(1400)
    expect(frames()[0]).toHaveClass('opacity-0')
    expect(images()[0]).not.toHaveClass('hero-kb')
  })

  it('fetches only the current and the next slide, then each slide as it comes up', async () => {
    vi.useFakeTimers()
    const { container } = page()
    const sources = () => [...container.querySelectorAll('section img.object-cover')].map((i) => i.getAttribute('src'))
    expect(sources().filter(Boolean)).toEqual([expect.stringContaining('image1'), expect.stringContaining('image2')])
    await next()
    expect(sources().filter(Boolean)).toEqual([
      expect.stringContaining('image1'),
      expect.stringContaining('image2'),
      expect.stringContaining('image3'),
    ])
  })

  it('does not fade in a photograph that failed to decode', async () => {
    vi.useFakeTimers()
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0)
    const { container } = page()
    await next()
    fireEvent.load(container.querySelectorAll('section img.object-cover')[1]!)
    expect(container.querySelectorAll('section > div[aria-hidden]:has(img)')[1]).toHaveClass('opacity-0')
  })
})
