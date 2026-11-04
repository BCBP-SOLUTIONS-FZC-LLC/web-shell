import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '../../src/pages/LoginPage'

describe('login hero carousel', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('advances on a timer and follows the slide controls', async () => {
    vi.useFakeTimers()
    render(<LoginPage onContinue={async () => {}} />)

    expect(screen.getByRole('heading', { name: /Next-Gen System/ })).toBeInTheDocument()
    expect(screen.getByText(/Access your unified workspace/)).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(screen.getByRole('heading', { name: /Airside programs/ })).toBeInTheDocument()
    expect(screen.getByText(/apron stays in motion/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }))
    expect(screen.getByRole('heading', { name: /Port calls/ })).toBeInTheDocument()
    expect(screen.getByText(/quay stays on schedule/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }))
    expect(screen.getByRole('heading', { name: /Road corridors/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous slide' }))
    expect(screen.getByRole('heading', { name: /Port calls/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show slide 9' }))
    expect(screen.getByRole('heading', { name: /Village programs/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }))
    expect(screen.getByRole('heading', { name: /Next-Gen System/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show slide 3' }))
    expect(screen.getByRole('heading', { name: /Port calls/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show slide 2' }))
    expect(screen.getByRole('heading', { name: /Airside programs/ })).toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByRole('region', { name: 'Product highlights' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(screen.getByRole('heading', { name: /Airside programs/ })).toBeInTheDocument()

    fireEvent.mouseLeave(screen.getByRole('region', { name: 'Product highlights' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(screen.getByRole('heading', { name: /Port calls/ })).toBeInTheDocument()
  })

  it('cross-fades to a slide once its image has loaded, and ignores a click on the current slide', async () => {
    vi.useFakeTimers()
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1200)
    const { container } = render(<LoginPage onContinue={async () => {}} />)
    const images = () => [...container.querySelectorAll('section img')]

    fireEvent.click(screen.getByRole('button', { name: 'Show slide 1' }))
    expect(screen.getByRole('heading', { name: /Next-Gen System/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show slide 2' }))
    fireEvent.load(images()[1]!)
    fireEvent.load(images()[1]!)
    expect(images()[1]).toHaveClass('hero-image-in')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(900)
    })
    expect(images()[1]).toHaveClass('opacity-100')
    expect(images()[0]).toHaveClass('opacity-0')
  })

  it('fetches only the current and the next slide, then each slide as it comes up', () => {
    const { container } = render(<LoginPage onContinue={async () => {}} />)
    const sources = () =>
      [...container.querySelectorAll('section img.object-cover')].map((i) => i.getAttribute('src'))
    expect(sources().filter(Boolean)).toEqual(['/image/image1.jpg', '/image/image2.jpg'])
    fireEvent.click(screen.getByRole('button', { name: 'Show slide 5' }))
    expect(sources().filter(Boolean)).toEqual(['/image/image1.jpg', '/image/image5.jpg', '/image/image6.jpg'])
  })

  it('does not mark an image that failed to decode as loaded', () => {
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0)
    const { container } = render(<LoginPage onContinue={async () => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show slide 2' }))
    const img = container.querySelectorAll('section img')[1]!
    fireEvent.load(img)
    expect(img).not.toHaveClass('hero-image-in')
  })
})
