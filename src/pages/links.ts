// The login page's help and legal links, in one place. A link without an `href` is not rendered, so
// the page never shows a dead link. Set each to the official URL once it is published (none exists on
// bcbpsolutions.com yet; checked 2026-11-04).

export interface PageLink {
  readonly label: string
  readonly href?: string
}

/** "Trouble logging in?" */
export const HELP_LINK: PageLink = { label: 'Trouble logging in?' }

/** The footer, in this order. */
export const LEGAL_LINKS: readonly PageLink[] = [
  { label: 'Privacy Policy' },
  { label: 'Terms of Service' },
  { label: 'Trust & Security' },
]

/** Only the links that have a URL. */
export function published(links: readonly PageLink[]): (PageLink & { href: string })[] {
  return links.filter((l): l is PageLink & { href: string } => typeof l.href === 'string' && l.href !== '')
}
