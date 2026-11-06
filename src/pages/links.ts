// The login page's help and legal links, in one place. A link without an `href` is not rendered, so
// the page never shows a dead link. Set each to the official URL once it is published (none exists on
// bcbpsolutions.com yet; checked 2026-11-04). Labels are keys of the shell's catalogue.
import type { ShellKey } from '../shared/i18n'

export interface PageLink {
  readonly label: ShellKey
  readonly href?: string
}

/** "Trouble logging in?" */
export const HELP_LINK: PageLink = { label: 'links.help' }

/** The footer, in this order. */
export const LEGAL_LINKS: readonly PageLink[] = [
  { label: 'links.privacy' },
  { label: 'links.terms' },
  { label: 'links.trust' },
]

/** Only the links that have a URL. */
export function published(links: readonly PageLink[]): (PageLink & { href: string })[] {
  return links.filter((l): l is PageLink & { href: string } => typeof l.href === 'string' && l.href !== '')
}
