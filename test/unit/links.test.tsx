// The login page's help and legal links (src/pages/links.ts): a link renders only with a URL, and
// opens in a new tab without giving the page a handle on the opener.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HELP_LINK, LEGAL_LINKS, published } from '../../src/pages/links'

describe('published', () => {
  it('keeps only links that have a URL', () => {
    expect(published([{ label: 'a' }, { label: 'b', href: '' }, { label: 'c', href: 'https://x.test/c' }])).toEqual([
      { label: 'c', href: 'https://x.test/c' },
    ])
  })

  it('has none published until the official URLs are set', () => {
    expect(published([HELP_LINK, ...LEGAL_LINKS])).toEqual([])
  })
})

describe('the link components, once URLs are set', () => {
  it('render the help link and the footer, with separators, in a new tab', async () => {
    vi.resetModules()
    vi.doMock('../../src/pages/links', async (orig) => ({
      ...(await orig<typeof import('../../src/pages/links')>()),
      HELP_LINK: { label: 'Trouble logging in?', href: 'https://help.test/' },
      LEGAL_LINKS: [
        { label: 'Privacy Policy', href: 'https://legal.test/privacy' },
        { label: 'Terms of Service', href: 'https://legal.test/terms' },
        { label: 'Trust & Security' },
      ],
    }))
    const { HelpLink, LegalFooter } = await import('../../src/pages/PageLinks')
    render(
      <>
        <HelpLink className="h" />
        <LegalFooter className="f" linkClassName="l" separator="s" />
      </>,
    )
    const help = screen.getByRole('link', { name: 'Trouble logging in?' })
    expect(help).toHaveAttribute('href', 'https://help.test/')
    expect(help).toHaveAttribute('rel', 'noopener noreferrer')
    expect(help).toHaveAttribute('target', '_blank')
    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual(['Trouble logging in?', 'Privacy Policy', 'Terms of Service'])
    expect(screen.getByRole('contentinfo').textContent).toBe('Privacy Policy|Terms of Service')
    vi.doUnmock('../../src/pages/links')
  })
})
