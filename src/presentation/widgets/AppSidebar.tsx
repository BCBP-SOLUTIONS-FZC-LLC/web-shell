import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { useShellText } from '../../shared/i18n'
import {
  AccountIcon,
  AdminIcon,
  ChevronsIcon,
  CloseIcon,
  CollapseIcon,
  DashboardIcon,
  DraftingIcon,
  ExpandIcon,
  MenuIcon,
  SignOutIcon,
  TendersIcon,
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
}

export interface AppSidebarProps {
  /** The section links, in order (the remotes this environment serves). */
  links: readonly FrameLink[]
  /** The Admin entry point, when the user may administer the workspace and the remote is served. */
  admin?: FrameLink | undefined
  /** "My account", when the remote is served. */
  account?: FrameLink | undefined
  user?: { name?: string | undefined; email?: string | undefined } | undefined
  /** The workspace's name (IAM P-1), else its slug. */
  workspace?: string | undefined
  /** The workspace's slug, shown under its name when the two differ. */
  workspaceSlug?: string | undefined
  /** Follows a link inside the shell (no page load). */
  onNavigate(to: string): void
  /** Resolves and switches; rejects when the workspace service cannot answer. */
  onSwitchWorkspace(identifier: string): Promise<void>
  onSignOut(): void
  /** The narrow-screen bar and the sidebar, measured by the caller (`--shell-header-height`, `--shell-sidebar-width`). */
  topBarRef?: RefObject<HTMLDivElement | null> | undefined
  sidebarRef?: RefObject<HTMLElement | null> | undefined
  /** Whether the sidebar starts collapsed to its icon rail (the user's saved choice). */
  initiallyCollapsed?: boolean | undefined
  /** Called with the new state when the user collapses or expands it, to save the choice. */
  onCollapsedChange?: ((collapsed: boolean) => void) | undefined
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
  me: AccountIcon,
}

// The sidebar's colours, dark: an icon rail (#0c0c0e) beside a panel (#161618) with the labels; the current
// item #27272a. Text #fafafa (14.3:1 on the current item), secondary #d4d4d8 (10:1) and #a1a1aa (5.8:1): WCAG
// AA everywhere (measured in test/browser/shell.spec.ts).
const PANEL = 'bg-[#161618] text-[#fafafa]'
const RAIL = 'bg-[#0c0c0e]'
const CURRENT = 'bg-[#27272a] text-[#fafafa]'
const IDLE = 'text-[#d4d4d8] group-hover:bg-[#1f1f23] group-hover:text-[#fafafa]'
const MUTED = 'text-[#a1a1aa]'
/** A row: the icon centred in the rail's column, the label in the panel's. */
const ROW =
  'group grid w-full grid-cols-[4rem_minmax(0,1fr)] items-center py-0.5 text-start rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#fafafa]'
const CELL = 'mx-auto flex size-10 items-center justify-center rounded-lg'
const FOCUS_DARK = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800'

/** The first letter of a name, for the workspace mark and the user's avatar. */
const initial = (s: string | undefined) => (s?.trim()[0] ?? '?').toUpperCase()

/**
 * The shell's frame around every remote, as a sidebar: an icon rail beside a panel with the labels. Top: the
 * workspace (with Switch workspace); then the section links, and Admin apart from them; bottom: My account, the
 * signed-in user, Sign out, and the control that collapses the panel to the rail (wide screens; the caller saves the choice). On a narrow
 * screen it is a drawer, always expanded, opened from a bar at the top. Its state comes as props; the
 * composition root wires the SDK.
 */
export function AppSidebar({
  links,
  admin,
  account,
  user,
  workspace,
  workspaceSlug,
  onNavigate,
  onSwitchWorkspace,
  onSignOut,
  topBarRef,
  sidebarRef,
  initiallyCollapsed = false,
  onCollapsedChange,
  onDrawerChange = () => {},
}: AppSidebarProps) {
  const text = useShellText()
  const sidebarId = useId()
  const switchId = useId()
  const inputId = useId()
  const [drawer, setDrawer] = useState(false)
  const [collapsed, setCollapsed] = useState(initiallyCollapsed)
  const [switching, setSwitching] = useState(false)
  const [identifier, setIdentifier] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')
  const switchRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const workspaceRef = useRef<HTMLButtonElement>(null)
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
    workspaceRef.current!.focus()
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

  // The panel's labels: hidden on a wide screen while collapsed (kept for assistive technology, and as the
  // rail icon's tooltip); the drawer of a narrow screen always shows them, so it shows no tooltips either.
  const label = collapsed ? 'lg:sr-only!' : ''
  const railOnly = collapsed && !drawer
  const tip = (t: string | undefined) => (railOnly ? t : undefined)
  const closeSwitch = () => {
    setSwitching(false)
    setState('idle')
  }
  const follow = (e: MouseEvent<HTMLAnchorElement>, to: string) => {
    if (!plainClick(e)) return
    e.preventDefault()
    closeSwitch()
    closeDrawer()
    onNavigate(to)
  }
  const item = (l: FrameLink) => {
    const Icon = ICONS[l.id] ?? DashboardIcon
    return (
      <li key={l.id}>
        <a
          href={l.href}
          onClick={(e) => follow(e, l.to)}
          aria-current={l.current ? 'page' : undefined}
          title={tip(l.label)}
          className={ROW}
        >
          <span className={`${CELL} ${l.current ? CURRENT : IDLE}`}>
            <Icon />
          </span>
          <span data-label className={`me-3 truncate rounded-lg px-3 py-2 text-[0.95rem] font-medium ${l.current ? CURRENT : IDLE} ${label}`}>
            {l.label}
          </span>
        </a>
      </li>
    )
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const value = identifier.trim()
    if (!value || state === 'busy') return
    setState('busy')
    try {
      // On success the browser leaves for the other workspace's sign-in, or "Workspace not found" shows.
      await onSwitchWorkspace(value)
      setState('idle')
    } catch {
      setState('failed')
    }
  }
  // A press outside closes Switch workspace. Not a blur with no new focus: WebKit does not focus a clicked
  // button, so a click on Continue would close it before it landed.
  useEffect(() => {
    if (!switching) return
    const onPointerDown = (e: PointerEvent) => {
      if (!switchRef.current?.contains(e.target as Node)) closeSwitch()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [switching])
  // Escape closes Switch workspace first; only then (a document listener above) the drawer.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !switching) return
    e.stopPropagation()
    closeSwitch()
  }
  const who = user?.name ?? user?.email
  const showSlug = workspaceSlug !== undefined && workspaceSlug !== workspace

  return (
    <>
      {/* Narrow screens: a bar at the top opens the sidebar as a drawer below it, so its Close menu stays in view. */}
      <div ref={topBarRef} className={`sticky top-0 z-[60] flex items-center gap-3 px-4 py-2 font-sans shadow lg:hidden! ${RAIL} text-[#fafafa]`}>
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={drawer}
          aria-controls={sidebarId}
          onClick={() => (drawer ? closeDrawer() : openDrawer())}
          className="rounded-lg p-2 hover:bg-[#1f1f23] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#fafafa]"
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
        onKeyDown={onKeyDown}
        className={`fixed bottom-0 start-0 top-[var(--shell-header-height,0px)] z-50 flex w-80 flex-col font-sans transition-[transform,width] lg:sticky! lg:top-0! lg:h-dvh! ${switching ? 'lg:z-50!' : 'lg:z-30!'} lg:translate-x-0! lg:visible! rtl:lg:translate-x-0! ${PANEL} ${
          collapsed ? 'lg:w-16!' : 'lg:w-80!'
        } ${drawer ? 'translate-x-0 shadow-2xl' : 'invisible -translate-x-full rtl:translate-x-full'}`}
      >
        {/* The rail: a darker column under the icons. */}
        <div aria-hidden="true" className={`absolute inset-y-0 start-0 w-16 border-e border-[#27272a] ${RAIL}`} />

        {/* The workspace, and Switch workspace. */}
        <div
          ref={switchRef}
          className="relative pb-3 pt-4"
          onBlur={(e) => {
            // Focus moved elsewhere by the keyboard (Tab); a blur with no new focus is left to pointerdown.
            if (switching && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) closeSwitch()
          }}
        >
          <button
            ref={workspaceRef}
            type="button"
            aria-expanded={switching}
            aria-controls={switchId}
            title={tip(workspace)}
            onClick={() => (switching ? closeSwitch() : setSwitching(true))}
            className={`${ROW} grid-cols-[4rem_minmax(0,1fr)_auto] text-[#fafafa]`}
          >
            <span aria-hidden="true" className="mx-auto flex size-10 items-center justify-center rounded-full bg-[#fafafa] text-lg font-bold text-[#0c0c0e]">
              {initial(workspace)}
            </span>
            <span className={`min-w-0 ps-3 ${label}`}>
              <span className="sr-only">{text('app.frame.switchWorkspace')}: </span>
              <span className="block truncate text-lg font-semibold">{workspace ?? text('app.frame.switchWorkspace')}</span>
              {showSlug ? <span className={`block truncate text-sm ${MUTED}`}>{workspaceSlug}</span> : null}
            </span>
            <ChevronsIcon className={`me-4 size-4 ${MUTED} ${collapsed ? 'lg:hidden!' : ''}`} />
          </button>
          {switching ? (
            <form
              id={switchId}
              onSubmit={(e) => void submit(e)}
              className="absolute start-3 top-full z-20 w-72 space-y-2 rounded-xl bg-white p-3 text-slate-800 shadow-xl"
            >
              <label htmlFor={inputId} className="block text-sm font-medium">
                {text('login.identifier')}
              </label>
              <input
                id={inputId}
                autoFocus
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="off"
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
              />
              {state === 'failed' ? (
                <p role="alert" className="text-sm text-red-700">
                  {text('app.frame.switchFailed')}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={closeSwitch} className={`rounded px-3 py-1 text-sm hover:bg-slate-100 ${FOCUS_DARK}`}>
                  {text('app.frame.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={state === 'busy'}
                  className={`rounded bg-[#18181b] px-3 py-1 text-sm text-white disabled:opacity-60 ${FOCUS_DARK}`}
                >
                  {text('common.continue')}
                </button>
              </div>
            </form>
          ) : null}
        </div>

        {/* The sections, then Admin apart from them. */}
        <nav aria-label={text('app.frame.nav')} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-2">
          <ul className="space-y-1">{links.map(item)}</ul>
          {admin ? (
            <>
              <hr className="mx-4 my-3 w-8 border-[#27272a]" />
              <ul className="space-y-1">{item(admin)}</ul>
            </>
          ) : null}
        </nav>

        {/* My account, the user, Sign out, and collapsing the panel. */}
        <div className="relative space-y-1 pb-4 pt-2">
          {account ? <ul>{item(account)}</ul> : null}
          <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-center py-1">
            <span aria-hidden="true" className="mx-auto flex size-9 items-center justify-center rounded-full bg-[#27272a] text-sm font-semibold text-[#fafafa]">
              {initial(who)}
            </span>
            <span className={`min-w-0 pe-3 ps-3 text-sm ${label}`}>
              {who ? <span className="block truncate font-semibold text-[#fafafa]">{who}</span> : null}
              {user?.name && user.email ? <span className={`block truncate ${MUTED}`}>{user.email}</span> : null}
            </span>
          </div>
          <button type="button" onClick={onSignOut} title={tip(text('common.signOut'))} className={ROW}>
            <span className={`${CELL} ${IDLE}`}>
              <SignOutIcon />
            </span>
            <span className={`me-3 rounded-lg px-3 py-2 text-[0.95rem] font-medium ${IDLE} ${label}`}>{text('common.signOut')}</span>
          </button>
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={sidebarId}
            onClick={() => {
              closeSwitch()
              setCollapsed(!collapsed)
              onCollapsedChange?.(!collapsed)
            }}
            className={`${ROW} hidden lg:grid!`}
          >
            <span className={`${CELL} ${IDLE}`}>{collapsed ? <ExpandIcon /> : <CollapseIcon />}</span>
            <span className={`me-3 rounded-lg px-3 py-2 text-sm ${MUTED} ${label}`}>
              {collapsed ? text('app.frame.expand') : text('app.frame.collapse')}
            </span>
          </button>
        </div>
      </aside>
    </>
  )
}
