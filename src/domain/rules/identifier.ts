// What the sign-in box accepts (IAM spec §6 A2): a work email, a workspace name (the slug), or a
// pasted workspace URL (…/t/<slug>/…). PUB-1 takes an email or a slug, so a URL is reduced to its slug.

/** The longest identifier sent to PUB-1: the longest valid email address (RFC 5321 path limit). */
export const MAX_IDENTIFIER_LENGTH = 254

/**
 * One `@` with something on each side and no whitespace. Never `:` (a scheme or a port: not in an address),
 * and nothing URL-like after the `@`. Before it, `/` is allowed (RFC 5322 permits it); `?` and `#` are not,
 * although RFC 5322 permits them too, because they start a pasted link's query or fragment, which can carry a
 * token, and such a value is remembered and sent as login_hint. No real work address uses them.
 */
const EMAIL = /^[^\s@:?#]+@[^\s@/?#:]+$/

/** True for an email. Only an email may become Keycloak's login_hint. */
export function isEmailIdentifier(identifier: string): boolean {
  if (!EMAIL.test(identifier) || identifier.startsWith('/')) return false
  // A `/` after a host name (`app.example.com/t/acme/…@…`) is a link pasted without its scheme, not an address
  // like `ops/billing@acme.com`: a host has a dot before its first `/`.
  const slash = identifier.indexOf('/')
  return slash === -1 || !identifier.slice(0, slash).includes('.')
}

/**
 * True for a value the sign-in box may remember: an email or a bare workspace name, at most 254
 * characters. Never a URL: a pasted link can carry a token or code in its query or fragment.
 */
export function isRememberableIdentifier(value: string): boolean {
  return value !== '' && value.length <= MAX_IDENTIFIER_LENGTH && (isEmailIdentifier(value) || !/[\s/?#:@]/.test(value))
}

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * The identifier PUB-1 gets for what the user typed, or undefined when it cannot name a workspace
 * (empty, an email or name over 254 characters, or a URL with no workspace in its path). An email is kept as typed (trimmed); a
 * workspace name is lower-cased (slugs are lower-case); a URL, with or without its scheme, gives the
 * slug `slugFromPath` reads from its path.
 */
export function toIdentifier(input: string, slugFromPath: (pathname: string) => string | undefined): string | undefined {
  const typed = input.trim()
  if (typed === '') return undefined
  // An email or a name goes to PUB-1 as it is, so it is held to PUB-1's limit. A URL is read for its slug
  // only, whatever its length (a remote's deep link with a long query, say).
  const email = isEmailIdentifier(typed)
  if (email || !typed.includes('/')) {
    if (typed.length > MAX_IDENTIFIER_LENGTH) return undefined
    return email ? typed : typed.toLowerCase()
  }
  let pathname: string
  try {
    pathname = new URL(SCHEME.test(typed) || typed.startsWith('/') ? typed : `https://${typed}`, 'https://workspace.invalid').pathname
  } catch {
    return undefined
  }
  return slugFromPath(pathname.toLowerCase())
}
