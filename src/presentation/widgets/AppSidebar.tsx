import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { useShellText } from '../../shared/i18n'
import { BrandLogo } from '../components/BrandLogo'
import {
  AdminIcon,
  ChevronsIcon,
  CloseIcon,
  CollapseIcon,
  DashboardIcon,
  DraftingIcon,
  ExpandIcon,
  MenuIcon,
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
  /** The workspace's slug, shown under its name when the two differ. */
  workspaceSlug?: string | undefined
  /** Follows a link inside the shell (no page load). */
  onNavigate(to: string): void
  /** Resolves and switches; rejects when the workspace service cannot answer. */
  onSwitchWorkspace(identifier: string): Promise<void>
  /** The narrow-screen bar and the sidebar, measured by the caller (`--shell-header-height`, `--shell-sidebar-width`). */
  topBarRef?: RefObject<HTMLDivElement | null> | undefined
  sidebarRef?: RefObject<HTMLElement | null> | undefined
  /** Whether the sidebar starts collapsed to its icon rail (the user's saved choice). */
  initiallyCollapsed?: boolean | undefined
  /** Set by the caller (the top bar's menu button) to collapse or expand the panel; follows each change. */
  collapsed?: boolean | undefined
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
}

// The sidebar's colours, light (the product design): a white panel, the current item pink (#be185d on #fce7f3,
// 5.3:1), text #18181b (17:1 on white) and secondary #52525b (7.7:1): WCAG AA everywhere (measured in
// test/browser/shell.spec.ts).
const PANEL = 'bg-white text-[#18181b] border-e border-[#e4e4e7]'
const RAIL = 'bg-white'
const CURRENT = 'bg-[#fce7f3] text-[#be185d]'
const IDLE = 'text-[#3f3f46] group-hover:bg-[#f4f4f5] group-hover:text-[#18181b]'
const IDLE_PILL = 'text-[#3f3f46] hover:bg-[#f4f4f5] hover:text-[#18181b]'
const MUTED = 'text-[#52525b]'
/** A row: the icon centred in the rail's column, the label in the panel's. */
const ROW =
  'group grid w-full grid-cols-[4rem_minmax(0,1fr)] items-center py-0.5 text-start rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#be185d]'
const CELL = 'mx-auto flex size-10 items-center justify-center rounded-lg'
/** A menu item: one pill holding the icon and the label (the icon alone on the collapsed rail). */
const PILL =
  'group mx-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.95rem] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#be185d] lg:data-[rail=true]:justify-center lg:data-[rail=true]:px-0'
const FOCUS_DARK = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800'

/** The first letter of a name, for the workspace mark. */
const initial = (s: string | undefined) => (s?.trim()[0] ?? '?').toUpperCase()

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
  workspaceSlug,
  onNavigate,
  onSwitchWorkspace,
  topBarRef,
  sidebarRef,
  initiallyCollapsed = false,
  collapsed: collapsedProp,
  onCollapsedChange,
  onDrawerChange = () => {},
}: AppSidebarProps) {
  const text = useShellText()
  const sidebarId = useId()
  const switchId = useId()
  const inputId = useId()
  const [drawer, setDrawer] = useState(false)
  const [ownCollapsed, setCollapsed] = useState(initiallyCollapsed)
  // Controlled when the caller passes `collapsed`, else the sidebar keeps its own.
  const collapsed = collapsedProp ?? ownCollapsed
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
    const subs = l.children ?? []
    return (
      <li key={l.id}>
        <a
          href={l.href}
          onClick={(e) => follow(e, l.to)}
          aria-current={l.current ? 'page' : undefined}
          title={tip(l.label)}
          data-rail={collapsed}
          className={`${PILL} ${l.current ? CURRENT : IDLE_PILL}`}
        >
          <Icon />
          <span data-label className={`truncate ${label}`}>
            {l.label}
          </span>
        </a>
        {/* The section's sub-menu, a tree in the panel under the parent's label: one unbroken line down its left
            edge, with a short curved elbow into each row. The labels are indented from the parent's. */}
        {l.current && subs.length > 0 && !railOnly ? (
          <ul className="mb-1 ms-[2.5rem] me-3">
            {subs.map((sub, i) => (
              <li key={sub.id} className="relative ps-5">
                {i < subs.length - 1 ? <span aria-hidden="true" className="absolute inset-y-0 start-0 border-s border-[#d4d4d8]" /> : null}
                <span aria-hidden="true" className="absolute start-0 top-0 h-1/2 w-4 rounded-bl-xl border-b border-s border-[#d4d4d8]" />
                <a
                  href={sub.href}
                  onClick={(e) => follow(e, sub.to)}
                  aria-current={sub.current ? 'page' : undefined}
                  className={`my-0.5 block truncate rounded-lg px-2 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#be185d] ${
                    sub.current ? CURRENT : `${MUTED} hover:bg-[#f4f4f5] hover:text-[#18181b]`
                  }`}
                >
                  {sub.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
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
  const showSlug = workspaceSlug !== undefined && workspaceSlug !== workspace

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
        onKeyDown={onKeyDown}
        className={`fixed bottom-0 start-0 top-[var(--shell-header-height,0px)] z-50 flex w-72 flex-col font-sans transition-[transform,width] lg:sticky! lg:top-0! lg:h-dvh! ${switching ? 'lg:z-50!' : 'lg:z-30!'} lg:translate-x-0! lg:visible! rtl:lg:translate-x-0! ${PANEL} ${
          collapsed ? 'lg:w-[4.5rem]!' : 'lg:w-72!'
        } ${drawer ? 'translate-x-0 shadow-2xl' : 'invisible -translate-x-full rtl:translate-x-full'}`}
      >
        {/* The brand mark, as on the login page. */}
        <div className="relative flex items-center justify-center gap-2 px-4 pb-1 pt-5">
          <BrandLogo size={40} blend={false} />
          <span className={`leading-none ${label}`}>
            <span className="block text-2xl font-extrabold tracking-wide">{text('app.frame.brand')}</span>
            <span className="block text-[0.6rem] font-semibold uppercase tracking-[0.35em] text-[#be185d]">{text('app.frame.brandSub')}</span>
          </span>
        </div>

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
            className={`${ROW} grid-cols-[4rem_minmax(0,1fr)_auto] text-[#18181b]`}
          >
            <span aria-hidden="true" className="mx-auto flex size-10 items-center justify-center rounded-full bg-[#be185d] text-lg font-bold text-white">
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
          <p className={`px-5 pb-2 text-xs font-semibold uppercase tracking-wider ${MUTED} ${label}`}>{text('app.frame.menu')}</p>
          <ul className="space-y-1">{links.map(item)}</ul>
          {admin ? (
            <>
              <hr className="mx-4 my-3 w-8 border-[#e4e4e7]" />
              <ul className="space-y-1">{item(admin)}</ul>
            </>
          ) : null}
        </nav>

        {/* Collapsing the panel (My account and Sign out are in the top bar's user menu). */}
        <div className="relative space-y-1 pb-4 pt-2">
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
