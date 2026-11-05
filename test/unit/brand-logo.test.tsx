import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandLogo } from '../../src/components/BrandLogo'

describe('BrandLogo', () => {
  it('renders the cube mark at the default size', () => {
    render(<BrandLogo />)
    const img = screen.getByRole('img', { name: 'Beyond Code' })
    expect(img.getAttribute('src')).toMatch(/logo/)
    expect(img).toHaveAttribute('width', '52')
    expect(img).toHaveAttribute('height', '52')
  })

  it('accepts a custom size and class name', () => {
    render(<BrandLogo className="block" size={128} />)
    const img = screen.getByRole('img', { name: 'Beyond Code' })
    expect(img).toHaveAttribute('width', '128')
    expect(img).toHaveClass('block')
  })
})
