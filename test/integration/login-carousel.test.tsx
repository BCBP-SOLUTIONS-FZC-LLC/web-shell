import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '../../src/pages/LoginPage'

describe('login hero carousel', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('advances on a timer and follows the slide controls', async () => {
    vi.useFakeTimers()
    render(<LoginPage />)

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
})