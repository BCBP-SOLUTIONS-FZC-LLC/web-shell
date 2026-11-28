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
    const button = screen.getByRole('button', { name: 'Ada Lovelace' })
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
    fireEvent.click(screen.getByRole('button', { name: 'Ada Lovelace' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Ada Lovelace' }))
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
    const button = screen.getByRole('button', { name: 'Ada Lovelace' })
    fireEvent.click(button)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    fireEvent.keyDown(document, { key: 'a' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerDown(document.body)
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it("shows only the avatar in the bar, and the user's name and email, with Settings, in its menu", () => {
    const settings = { id: 'admin.settings', to: '/admin/settings', href: '/t/acme/admin/settings', label: 'Settings', current: false }
    const p = props()
    render(<AppTopBar {...p} settings={settings} user={{ name: 'Balaji Selvarangam', email: 'balaji@acme.com' }} />)
    const button = screen.getByRole('button', { name: 'Balaji Selvarangam' })
    expect(button).toHaveTextContent('BS')
    expect(screen.queryByText('Balaji Selvarangam')).toBeNull() // no name beside the avatar
    fireEvent.click(button)
    expect(screen.getByText('Balaji Selvarangam')).toBeInTheDocument()
    expect(screen.getByText('balaji@acme.com')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }))
    expect(p.onNavigate).toHaveBeenCalledWith('/admin/settings')
  })

  it('has no Settings link without one, and no email line for a user known only by email', () => {
    render(<AppTopBar {...props()} user={{ email: 'ada@acme.com' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'ada@acme.com' }))
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
    expect(screen.getAllByText('ada@acme.com')).toHaveLength(1)
  })

  it('opens the notifications bell with its empty state, one popover at a time', () => {
    render(<AppTopBar {...props()} />)
    const bell = screen.getByRole('button', { name: 'Notifications' })
    fireEvent.click(bell)
    expect(screen.getByText('You are all caught up.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ada Lovelace' }))
    expect(screen.queryByText('You are all caught up.')).toBeNull()
    expect(bell).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(bell)
    fireEvent.click(bell)
    expect(bell).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps a one-word name as it is, and a menu button toggles the sidebar', () => {
    const p = props()
    render(<AppTopBar {...p} user={{ name: 'Ada' }} />)
    expect(screen.getByRole('button', { name: 'Ada' })).toHaveTextContent('A')
    fireEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }))
    expect(p.onToggleSidebar).toHaveBeenCalledOnce()
  })
})
