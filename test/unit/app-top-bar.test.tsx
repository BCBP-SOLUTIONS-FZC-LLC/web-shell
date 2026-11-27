import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppTopBar } from '../../src/presentation/widgets/AppTopBar'

const account = { id: 'me', to: '/me', href: '/t/acme/me', label: 'My account', current: false }
const props = () => ({ onToggleSidebar: vi.fn(), user: { name: 'Ada Lovelace', email: 'ada@acme.com' }, account, onNavigate: vi.fn(), onSignOut: vi.fn() })

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('AppTopBar', () => {
  it('shows nothing before the user is known', () => {
    const { container } = render(<AppTopBar {...props()} user={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens the user menu, follows My account inside the shell, and signs out', () => {
    const p = props()
    render(<AppTopBar {...p} />)
    const button = screen.getByRole('button', { name: /Ada L\./ })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('link', { name: 'My account' }))
    expect(p.onNavigate).toHaveBeenCalledWith('/me')
    expect(screen.queryByRole('link', { name: 'My account' })).toBeNull()
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(p.onSignOut).toHaveBeenCalledOnce()
  })

  it('leaves a new-tab click to the browser', () => {
    const p = props()
    render(<AppTopBar {...p} />)
    fireEvent.click(screen.getByRole('button', { name: /Ada L\./ }))
    fireEvent.click(screen.getByRole('link', { name: 'My account' }), { ctrlKey: true })
    expect(p.onNavigate).not.toHaveBeenCalled()
  })

  it('has no My account without mfe-me, and uses the email when the user has no name', () => {
    render(<AppTopBar {...props()} account={undefined} user={{ email: 'ada@acme.com' }} />)
    fireEvent.click(screen.getByRole('button', { name: /ada@acme.com/ }))
    expect(screen.queryByRole('link', { name: 'My account' })).toBeNull()
  })

  it('switches the page theme, which every remote reads from html[data-theme]', () => {
    render(<AppTopBar {...props()} />)
    fireEvent.click(screen.getByRole('button', { name: /Ada L\./ }))
    const mode = screen.getByRole('switch', { name: /Theme mode/ })
    expect(mode).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(mode)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(mode).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(mode)
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('closes on Escape and on a press outside', () => {
    render(<AppTopBar {...props()} />)
    const button = screen.getByRole('button', { name: /Ada L\./ })
    fireEvent.click(button)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    fireEvent.keyDown(document, { key: 'a' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerDown(document.body)
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('shortens a name to first name and last initial, and shows the language', () => {
    render(<AppTopBar {...props()} user={{ name: 'Balaji Selvarangam' }} />)
    const button = screen.getByRole('button', { name: /Balaji S\./ })
    expect(button).toHaveTextContent('BS')
    fireEvent.click(button)
    expect(screen.getByText('English')).toBeInTheDocument()
  })

  it('keeps a one-word name as it is, and a menu button toggles the sidebar', () => {
    const p = props()
    render(<AppTopBar {...p} user={{ name: 'Ada' }} />)
    expect(screen.getByRole('button', { name: /Ada/ })).toHaveTextContent('A')
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }))
    expect(p.onToggleSidebar).toHaveBeenCalledOnce()
  })
})
