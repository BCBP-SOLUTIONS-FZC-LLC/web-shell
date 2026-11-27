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

/** Users: two people. */
export const UsersIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7" />
  </Icon>
)

/** Departments: a building. */
export const DepartmentsIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <path d="M4 20V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15M14 9h5a1 1 0 0 1 1 1v10M3 20h18M8 8h2M8 12h2M8 16h2M17 13h0M17 17h0" />
  </Icon>
)

/** Group mappings: two nodes joined. */
export const GroupMappingsIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
  </Icon>
)

/** Settings: sliders. */
export const SettingsIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6" />
  </Icon>
)

/** Audit log: a clipboard with lines. */
export const AuditIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <path d="M9 4h6v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1zM9 5H7a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M9 12h6M9 16h6" />
  </Icon>
)

/** A sub-menu that opens downwards. */
export const ChevronDownIcon = (p: IconProps) => (
  <Icon className={p.className}>
    <path d="M6 9l6 6 6-6" />
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

