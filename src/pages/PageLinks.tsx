import { HELP_LINK, LEGAL_LINKS, published } from './links'

/** "Trouble logging in?", when its URL is set. */
export function HelpLink({ className }: { className: string }) {
  const [help] = published([HELP_LINK])
  if (!help) return null
  return (
    <a href={help.href} className={className} target="_blank" rel="noopener noreferrer">
      {help.label}
    </a>
  )
}

/** The legal footer: only links that have a URL; nothing at all when none has. */
export function LegalFooter({
  className,
  linkClassName,
  separator,
}: {
  className: string
  linkClassName: string
  separator?: string
}) {
  const links = published(LEGAL_LINKS)
  if (links.length === 0) return null
  return (
    <footer className={className}>
      {links.map((l, i) => (
        <span key={l.label} className="contents">
          {separator && i > 0 ? (
            <span className={separator} aria-hidden>
              |
            </span>
          ) : null}
          <a href={l.href} className={linkClassName} target="_blank" rel="noopener noreferrer">
            {l.label}
          </a>
        </span>
      ))}
    </footer>
  )
}

/** "Forgot your password?" as a button: it needs the typed email to find the workspace's realm. */
export function ForgotPasswordButton({
  onClick,
  disabled,
  className,
}: {
  onClick?: (() => void) | undefined
  disabled: boolean
  className: string
}) {
  if (!onClick) return null
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`cursor-pointer border-0 bg-transparent p-0 disabled:cursor-not-allowed disabled:opacity-70 ${className}`}
    >
      Forgot your password?
    </button>
  )
}
