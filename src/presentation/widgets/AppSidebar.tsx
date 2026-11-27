import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { useShellText } from '../../shared/i18n'
import { BrandLogo } from '../components/BrandLogo'
import {
  AdminIcon,
  AuditIcon,
  ChevronDownIcon,
  CloseIcon,
  DashboardIcon,
  DepartmentsIcon,
  DraftingIcon,
  GroupMappingsIcon,
  MenuIcon,
  SettingsIcon,
  TendersIcon,
  UsersIcon,
  WorkflowsIcon,
} from '../components/Icons'

/** One link in the sidebar: `to` is the router path, `href` the same path with the router's basename. */
export interface FrameLink {
  /** The remote's name (`dashboard`, `tenders`, …): it picks the icon. */
  id: string
  label: string
  to: string
  href: string
  current: boolean
  /** Sub-menu items, drawn as a tree under the link while its section is the current one. */
  children?: readonly FrameLink[] | undefined
}

export interface AppSidebarProps {
  /** The section links, in order (the remotes this environment serves). */
  links: readonly FrameLink[]
  /** The Admin entry point, when the user may administer the workspace and the remote is served. */
  admin?: FrameLink | undefined
  /** The workspace's name (IAM P-1), else its slug. */
  workspace?: string | undefined
  /** Follows a link inside the shell (no page load). */
  onNavigate(to: string): void
  /** The narrow-screen bar and the sidebar, measured by the caller (`--shell-header-height`, `--shell-sidebar-width`). */
  topBarRef?: RefObject<HTMLDivElement | null> | undefined
  sidebarRef?: RefObject<HTMLElement | null> | undefined
  /** Hides the sidebar on a wide screen (the top bar's menu button; the caller keeps and saves the choice). */
  collapsed?: boolean | undefined
  /** Called when the narrow-screen drawer opens or closes: the caller makes the page behind it inert. */
  onDrawerChange?: ((open: boolean) => void) | undefined
}

/** A plain click: the shell follows it; a new-tab or download click is left to the browser. */
function plainClick(e: MouseEvent<HTMLAnchorElement>): boolean {
  return !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

const ICONS: Record<string, (p: { className?: string }) => ReactNode> = {
  dashboard: DashboardIcon,
  tenders: TendersIcon,
  drafting: DraftingIcon,
  workflows: WorkflowsIcon,
  admin: AdminIcon,
  'admin.users': UsersIcon,
  'admin.departments': DepartmentsIcon,
  'admin.groupMappings': GroupMappingsIcon,
  'admin.settings': SettingsIcon,
  'admin.audit': AuditIcon,
}

// The sidebar's colours, light (the product design): a white panel, the current item pink (#be185d on #fce7f3,
// 5.3:1), text #18181b (17:1 on white) and secondary #52525b (7.7:1): WCAG AA everywhere (measured in
// test/browser/shell.spec.ts).
const PANEL = 'bg-white text-[#18181b] border-e border-[#e4e4e7]'
const RAIL = 'bg-white'
const CURRENT = 'bg-[#fce7f3] text-[#be185d]'
const IDLE_PILL = 'text-[#3f3f46] hover:bg-[#f4f4f5] hover:text-[#18181b]'
const MUTED = 'text-[#52525b]'
/** A menu item: one pill holding the icon and the label . */
const PILL =
  'group mx-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.95rem] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#be185d]'


/**
 * The shell's frame around every remote, as a sidebar: an icon rail beside a panel with the labels. Top: the
 * workspace (with Switch workspace); then the section links, and Admin apart from them; bottom: the control that collapses the panel to the rail (wide screens; the caller saves the choice). On a narrow
 * screen it is a drawer, always expanded, opened from a bar at the top. Its state comes as props; the
 * composition root wires the SDK.
 */
export function AppSidebar({
  links,
  admin,
  workspace,
  onNavigate,
  topBarRef,
  sidebarRef,
  collapsed = false,
  onDrawerChange = () => {},
}: AppSidebarProps) {
  const text = useShellText()
  const sidebarId = useId()
  const [drawer, setDrawer] = useState(false)
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const toggleRef = useRef<HTMLButtonElement>(null)
  const asideRef = useRef<HTMLElement | null>(null)

  // The drawer (narrow screens) is modal: focus moves into it when it opens and back to the menu button when it
  // closes (it would be lost on the now hidden drawer), the caller makes the page inert meanwhile, and Escape
  // closes it from anywhere. A wide screen has no drawer: crossing the breakpoint closes it.
  const openDrawer = () => {
    setDrawer(true)
    onDrawerChange(true)
  }
  const closeDrawer = () => {
    if (!drawer) return
    setDrawer(false)
    onDrawerChange(false)
    if (asideRef.current!.contains(document.activeElement)) toggleRef.current!.focus()
  }
  useEffect(() => {
    if (!drawer) return
    asideRef.current!.querySelector<HTMLElement>('a, button')?.focus()
    const close = () => {
      setDrawer(false)
      onDrawerChange(false)
      // The drawer and the menu button are mounted while the drawer is open.
      if (asideRef.current!.contains(document.activeElement)) toggleRef.current!.focus()
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    // Every engine the shell supports has matchMedia.
    const wide = window.matchMedia('(min-width: 1024px)')
    const onWide = () => {
      if (wide.matches) close()
    }
    document.addEventListener('keydown', onKey)
    wide.addEventListener('change', onWide)
    return () => {
      document.removeEventListener('keydown', onKey)
      wide.removeEventListener('change', onWide)
    }
  }, [drawer, onDrawerChange])

  const follow = (e: MouseEvent<HTMLAnchorElement>, to: string) => {
    if (!plainClick(e)) return
    e.preventDefault()
    closeDrawer()
    onNavigate(to)
  }
  const item = (l: FrameLink) => {
    const Icon = ICONS[l.id] ?? DashboardIcon
    const subs = l.children ?? []
    const parent = subs.length > 0
    // A link with a sub-menu only opens and closes it (the page opens from a sub-menu item); it starts open
    // while the user is in that section.
    const open = parent && (opened[l.id] ?? l.current)
    const pill = `${PILL} ${l.current ? CURRENT : IDLE_PILL}`
    const content = (
      <>
        <Icon />
        <span data-label className="truncate">
          {l.label}
        </span>
        {parent ? <ChevronDownIcon className={`ms-auto size-4 transition-transform ${open ? 'rotate-180' : ''}`} /> : null}
      </>
    )
    return (
      <li key={l.id}>
        {parent ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpened({ ...opened, [l.id]: !open })}
            className={`${pill} w-[calc(100%-1.5rem)] text-start`}
          >
            {content}
          </button>
        ) : (
          <a
            href={l.href}
            onClick={(e) => follow(e, l.to)}
            aria-current={l.current ? 'page' : undefined}
            className={pill}
          >
            {content}
          </a>
        )}
        {/* The section's sub-menu, under the parent: a pill with an icon for each item, indented from the parent's. */}
        {open ? (
          <ul className="mb-1 ms-6 me-3 space-y-0.5">
            {subs.map((sub) => {
              const SubIcon = ICONS[sub.id] ?? DashboardIcon
              return (
                <li key={sub.id}>
                  <a
                    href={sub.href}
                    onClick={(e) => follow(e, sub.to)}
                    aria-current={sub.current ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#be185d] ${
                      sub.current ? CURRENT : `${MUTED} hover:bg-[#f4f4f5] hover:text-[#18181b]`
                    }`}
                  >
                    <SubIcon className="size-4" />
                    <span className="truncate">{sub.label}</span>
                  </a>
                </li>
              )
            })}
          </ul>
        ) : null}
      </li>
    )
  }
  return (
    <>
      {/* Narrow screens: a bar at the top opens the sidebar as a drawer below it, so its Close menu stays in view. */}
      <div ref={topBarRef} className={`sticky top-0 z-[60] flex items-center gap-3 px-4 py-2 font-sans shadow lg:hidden! ${RAIL} text-[#18181b]`}>
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={drawer}
          aria-controls={sidebarId}
          onClick={() => (drawer ? closeDrawer() : openDrawer())}
          className="rounded-lg p-2 hover:bg-[#f4f4f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#be185d]"
        >
          {drawer ? <CloseIcon /> : <MenuIcon />}
          <span className="sr-only">{drawer ? text('app.frame.closeMenu') : text('app.frame.openMenu')}</span>
        </button>
        <span className="truncate font-semibold">{workspace}</span>
      </div>
      {drawer ? <div aria-hidden="true" className="fixed inset-x-0 bottom-0 top-[var(--shell-header-height,0px)] z-40 bg-black/60 lg:hidden!" onClick={closeDrawer} /> : null}

      <aside
        id={sidebarId}
        ref={(el) => {
          asideRef.current = el
          if (sidebarRef) sidebarRef.current = el
        }}
        aria-label={text('app.frame.sidebar')}
        className={`fixed bottom-0 start-0 top-[var(--shell-header-height,0px)] z-50 flex w-72 flex-col font-sans transition-[transform,width] lg:sticky! lg:top-0! lg:h-dvh! lg:z-30! lg:translate-x-0! lg:visible! rtl:lg:translate-x-0! lg:w-72! ${PANEL} ${
          collapsed ? 'lg:hidden!' : ''
        } ${drawer ? 'translate-x-0 shadow-2xl' : 'invisible -translate-x-full rtl:translate-x-full'}`}
      >
        {/* The brand mark, as on the login page. */}
        <div className="relative flex items-center justify-center gap-2 px-4 pb-1 pt-5">
          <BrandLogo size={40} blend={false} />
          <span className="leading-none">
            <span className="block text-2xl font-extrabold tracking-wide">{text('app.frame.brand')}</span>
            <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.35em] text-[#be185d]">{text('app.frame.brandSub')}</span>
          </span>
        </div>

        {/* The sections, with Admin in the same list. */}
        <nav aria-label={text('app.frame.nav')} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-2">
          <p className={`px-5 pb-2 text-xs font-semibold uppercase tracking-wider ${MUTED}`}>{text('app.frame.menu')}</p>
          <ul className="space-y-1">{(admin ? [...links, admin] : links).map(item)}</ul>
        </nav>

      </aside>
    </>
  )
}
