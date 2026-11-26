// Line icons for the shell's sidebar, drawn inline (no icon font, no third-party origin; CSP-safe: SVG
// attributes, no style). Decorative: each is hidden from assistive technology, so the text beside it names
// the control.
import type { ReactNode } from 'react'

function Icon({ children, className = 'size-5' }: { children: ReactNode; className?: string | undefined }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  )
}

type IconProps = { className?: string | undefined }

/** Dashboard: bars. */
export const DashboardIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Icon>
)

/** Tenders: a document. */
export const TendersIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </Icon>
)

/** Drafting: a pen. */
export const DraftingIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
  </Icon>
)

/** Workflows: connected steps. */
export const WorkflowsIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
    <path d="M6.5 10v4a3 3 0 0 0 3 3H14" />
  </Icon>
)

/** Admin: a gear. */
export const AdminIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
)

/** My account: a person. */
export const AccountIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
)

/** Sign out: an arrow leaving a door. */
export const SignOutIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </Icon>
)

/** The workspace switcher's up-and-down chevrons. */
export const ChevronsIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
  </Icon>
)

/** Open the menu (narrow screens). */
export const MenuIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Icon>
)

/** Close the menu. */
export const CloseIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
)

/** Collapse the sidebar to its icon rail: a panel closing to the left. */
export const CollapseIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16M16 10l-2 2 2 2" />
  </Icon>
)

/** Expand the sidebar from its icon rail: a panel opening to the right. */
export const ExpandIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16M14 10l2 2-2 2" />
  </Icon>
)
