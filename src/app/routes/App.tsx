// The signed-in shell. The bootstrap renders this only with an authenticated session, so there is
// no signed-out route here: sign-in screens are mounted by the bootstrap outside this tree.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  MFEErrorBoundary,
  RemoteBoundary,
  useAppUpdate,
  useCurrentUser,
  useFeatureFlag,
  useHasPermission,
  useReadOnly,
  useRouteTemplate,
  useSessionContext,
  useSignOut,
  useSwitchWorkspace,
  useWorkspace,
} from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { ADMIN_ENTRY } from '../../domain/rules/permissions'
import type { SidebarPreferenceRepository } from '../../domain/repositories/sidebarPreference'
import { useShellText, type ShellKey } from '../../shared/i18n'
import { AppSidebar, type FrameLink } from '../../presentation/widgets/AppSidebar'
import { AppError } from '../../presentation/widgets/AppError'
import { ContextUnavailable } from '../../presentation/widgets/ContextUnavailable'
import { ReadOnlyNotice } from '../../presentation/widgets/ReadOnlyNotice'
import { UpdateAvailable } from '../../presentation/widgets/UpdateAvailable'
import { WorkspaceBanners, type BannerProps } from '../../presentation/widgets/WorkspaceBanners'

/** The remote that renders the dashboard, as named in /remotes/manifest.json. */
export const DASHBOARD_REMOTE = 'dashboard'

/** The remote that renders the tender workspace (mfe-tender), as named in /remotes/manifest.json. */
export const TENDERS_REMOTE = 'tenders'

/** The remote that renders tender drafting (mfe-drafting), as named in /remotes/manifest.json. */
export const DRAFTING_REMOTE = 'drafting'

/** The remote that renders the workflow designer (mfe-workflow-designer), as named in /remotes/manifest.json. */
export const WORKFLOWS_REMOTE = 'workflows'

/** The remote that renders workspace administration (mfe-admin), as named in /remotes/manifest.json. */
export const ADMIN_REMOTE = 'admin'

/** The remote that renders the user's own account (mfe-me), as named in /remotes/manifest.json. */
export const ACCOUNT_REMOTE = 'me'

/**
 * The runtime-config flag that turns the shell's sidebar off in an environment (`"flags": { "shell.frame": false }`),
 * e.g. while a remote that still draws its own frame is the only one served. On when absent.
 */
export const FRAME_FLAG = 'shell.frame'

/** The shell's own name in error logs and web-error metrics (the dashboard reports as `dashboard`). */
export const SHELL_MFE = 'web-shell'

function Loading({ children }: { children: string }) {
  return (
    <div className="flex h-full min-h-[60dvh] items-center justify-center bg-[#030d1b] font-sans text-white/80">
      {children}
    </div>
  )
}

/**
 * The dashboard remote reads the signed-in user and sign-out itself (useCurrentUser, useSignOut)
 * from the SDK this shell provides, so it gets no props.
 */
function Dashboard() {
  useRouteTemplate('/t/:slug/dashboard')
  const text = useShellText()
  return <RemoteBoundary remote={DASHBOARD_REMOTE} module="./App" fallback={<Loading>{text('app.loadingDashboard')}</Loading>} />
}

/**
 * The tenders remote (mfe-tender), under /t/<slug>/tenders/*. react-router-dom is not shared, so it
 * runs its own router under the same basename; it reads the user and sign-out from the SDK (its
 * props are optional), so it gets no props either.
 */
function Tenders() {
  useRouteTemplate('/t/:slug/tenders')
  const text = useShellText()
  return <RemoteBoundary remote={TENDERS_REMOTE} module="./App" fallback={<Loading>{text('app.loadingTenders')}</Loading>} />
}

/**
 * The drafting remote (mfe-drafting), under /t/<slug>/drafting/*, and the workflow designer
 * (mfe-workflow-designer), under /t/<slug>/workflows/*. Each runs its own router under the same basename
 * (react-router-dom is not shared) and reads the user and sign-out from the SDK, so neither gets props.
 */
function Drafting() {
  useRouteTemplate('/t/:slug/drafting')
  const text = useShellText()
  return <RemoteBoundary remote={DRAFTING_REMOTE} module="./App" fallback={<Loading>{text('app.loadingDrafting')}</Loading>} />
}

function Workflows() {
  useRouteTemplate('/t/:slug/workflows')
  const text = useShellText()
  return <RemoteBoundary remote={WORKFLOWS_REMOTE} module="./App" fallback={<Loading>{text('app.loadingWorkflows')}</Loading>} />
}

/**
 * Workspace administration (mfe-admin), under /t/<slug>/admin/*, and the user's own account (mfe-me),
 * under /t/<slug>/me/*. Each runs its own router under the same basename and reads the user, the
 * workspace, sign-out and permissions from the SDK, so neither gets props.
 */
function Admin() {
  useRouteTemplate('/t/:slug/admin')
  const text = useShellText()
  return <RemoteBoundary remote={ADMIN_REMOTE} module="./App" fallback={<Loading>{text('app.loadingAdmin')}</Loading>} />
}

function Account() {
  useRouteTemplate('/t/:slug/me')
  const text = useShellText()
  return <RemoteBoundary remote={ACCOUNT_REMOTE} module="./App" fallback={<Loading>{text('app.loadingAccount')}</Loading>} />
}

/** The sidebar's section links: the remote, its route and its label. Shown only when the remote is served. */
const SECTIONS: readonly { remote: string; to: string; label: ShellKey }[] = [
  { remote: DASHBOARD_REMOTE, to: '/dashboard', label: 'app.frame.dashboard' },
  { remote: TENDERS_REMOTE, to: '/tenders', label: 'app.frame.tenders' },
  { remote: DRAFTING_REMOTE, to: '/drafting', label: 'app.frame.drafting' },
  { remote: WORKFLOWS_REMOTE, to: '/workflows', label: 'app.frame.workflows' },
]

/** The update notice, with the SDK's update state (presentation takes it as props). */
function Update() {
  const update = useAppUpdate()
  return <UpdateAvailable available={update.available} onReload={() => update.reload()} />
}

/** What the workspace banners show (IAM P-1 and P-27, loaded by the bootstrap after render). */
export interface AppNotices {
  banners: readonly BannerProps[]
  /** RFC 3339: a cancelled workspace's read-only grace end. */
  readOnlyUntil?: string
  /** The workspace's name (P-1), for the sidebar. */
  workspaceName?: string
}

/** A value that changes after render (the bootstrap's store), read with useSyncExternalStore. */
export interface Live<T> {
  get(): T
  subscribe(listener: () => void): () => void
}

const NO_NOTICES: AppNotices = { banners: [] }
const noNotices: Live<AppNotices> = { get: () => NO_NOTICES, subscribe: () => () => {} }

/** The read-only notice, while P-35 says so or the page has seen a DENY_TENANT_READ_ONLY answer. */
function ReadOnly({ until }: { until: string | undefined }) {
  return useReadOnly() ? <ReadOnlyNotice until={until} /> : null
}

/**
 * react-router's navigate as the SDK's navigator uses it: a path under the basename, push or replace. The
 * same shape as `RouterNavigate` in infrastructure/federation/navigator.ts (routes may not import
 * infrastructure); the bootstrap passes this one to `shellNavigator`, so the compiler checks they agree.
 */
export type RouterNavigate = (to: string, o?: { replace?: boolean }) => void

/** A router path's section, its first segment: '/tenders/T-1?x' → '/tenders'. */
export function sectionOf(path: string): string {
  return /^\/[^/?#]*/.exec(path)?.[0] ?? '/'
}

/** A section as the routes match it: decoded (`/%61dmin` is `/admin`) and without case. */
function matchedSection(path: string): string {
  const section = sectionOf(path)
  try {
    return decodeURIComponent(section).toLowerCase()
  } catch {
    return section.toLowerCase() // a malformed escape: compared as written
  }
}

/** Whether two router paths are in the same section, compared as the routes match them. */
export function sameSection(a: string, b: string): boolean {
  return matchedSection(a) === matchedSection(b)
}

/** The address bar's path and query: what a remote's own router shows. */
const addressBar = () => window.location.pathname + window.location.search

/**
 * Hands the router's navigate to the bootstrap, which registers it as the SDK's navigator. Each remote runs
 * its own router, which does not see this one's navigation: a navigate() that stays in the section the
 * shell's routes show (`navigate('admin', '/t/acme/admin/users')` while `/admin/settings` shows) would keep
 * the same route element mounted, change the URL and leave the page. So such a move, once it has changed
 * the address bar's path or query, remounts the routes (`onVisit`), and the remote's router starts at the new
 * URL. A move to another section mounts that remote anyway; a move that changes nothing (the same path and
 * query, or a hash) remounts nothing, so a remote's state is not lost and a remote that navigates to where it
 * is cannot loop. A query change remounts too: a remote keeps a filter or tab in the query with its own
 * router, never with navigate() (LLD §4.5).
 *
 * Once the router is gone (App unmounted: a sign-out, a refusal screen, "Session ended" over a refusal), a
 * late navigate() does nothing: the screen that replaced the app stays, and no page load can start a
 * sign-in without a click. The next App (a new basename) registers its own navigator.
 */
function RouterBridge({ onRouter, onVisit }: { onRouter: (navigate: RouterNavigate) => void; onVisit: () => void }) {
  const navigate = useNavigate()
  // The section the shell's routes show: a remount is needed only when that route element stays. The
  // navigator is registered again on each change (react-router's navigate changes with it anyway).
  const { pathname } = useLocation()
  // Set only on mount and unmount, never between two registrations, so a navigate() made while React swaps
  // one registration for the next still reaches the router.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    onRouter((to, o) => {
      if (!mounted.current) return
      const before = addressBar()
      void navigate(to, o)
      if (addressBar() !== before && sameSection(to, pathname)) onVisit()
    })
  }, [navigate, onRouter, onVisit, pathname])
  return null
}

/** The CSS custom property remotes read for the notice stack's height. */
export const NOTICES_HEIGHT_VAR = '--shell-notices-height'

/**
 * The CSS custom property remotes read for the height of the shell's bar at the top of the page: the bar that
 * opens the sidebar on a narrow screen, `0px` on a wide one (the sidebar is beside the page then). Absent
 * while the frame is off.
 */
export const HEADER_HEIGHT_VAR = '--shell-header-height'

/**
 * The CSS custom property remotes read for the width of the shell's sidebar beside the page: its width on a
 * wide screen, `0px` on a narrow one (a drawer over the page then). Absent while the frame is off.
 */
export const SIDEBAR_WIDTH_VAR = '--shell-sidebar-width'

/**
 * Publishes a size of an element as a custom property on <html>, kept current by a ResizeObserver and window
 * resizes, and removed on unmount. Set through the CSSOM, which the platform CSP allows (no inline style).
 */
function usePublishedSize(ref: RefObject<HTMLElement | null>, name: string, measure: (el: HTMLElement) => number) {
  useLayoutEffect(() => {
    const el = ref.current!
    const root = document.documentElement
    const publish = () => root.style.setProperty(name, `${measure(el)}px`)
    publish()
    // Every engine the shell supports has ResizeObserver (the browser suite runs all three). A breakpoint
    // can move an element in or out of the page's flow without resizing it: window resizes catch that.
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    window.addEventListener('resize', publish)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', publish)
      root.style.removeProperty(name)
    }
  }, [ref, name, measure])
}

const heightOf = (el: HTMLElement) => el.offsetHeight
/** The sidebar's width while it is beside the page; a drawer over it (fixed) takes no room. */
const widthBeside = (el: HTMLElement) => (getComputedStyle(el).position === 'fixed' ? 0 : el.offsetWidth)

/**
 * Publishes the bottom notice stack's height as `--shell-notices-height` on <html> (0px when empty), so a
 * remote's fixed elements can end above it (`bottom: var(--shell-notices-height, 0px)`) instead of
 * sitting under it.
 */
function NoticeStack({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  usePublishedSize(ref, NOTICES_HEIGHT_VAR, heightOf)
  return (
    <div ref={ref} className="sticky bottom-0 z-40 flex flex-col">
      {children}
    </div>
  )
}

/**
 * The shell's frame (option A of the app-chrome handoff), a sidebar: the workspace with Switch workspace,
 * links to the served remotes, the Admin entry point for those who may administer the workspace, My account
 * and Sign out. On a narrow screen it is a drawer under a bar at the top. Its width beside the page is
 * published as `--shell-sidebar-width` and the bar's height as `--shell-header-height`, so a remote's fixed
 * elements can start beside or below them.
 *
 * A link is followed by this router. Each remote runs its own router, which does not see this one's
 * navigation, so a link to the section the user is in remounts the routes (`onVisit`): it opens that
 * section's start page instead of changing only the URL (§6.6d; a remote's navigate(): §4.5).
 */
function Frame({
  basename,
  remotes,
  workspaceName,
  onVisit,
  preference,
  onDrawerChange,
}: {
  basename: string | undefined
  remotes: ReadonlySet<string>
  workspaceName: string | undefined
  onVisit: () => void
  preference: SidebarPreferenceRepository | undefined
  onDrawerChange: (open: boolean) => void
}) {
  const text = useShellText()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const user = useCurrentUser()
  const workspace = useWorkspace()
  const signOut = useSignOut()
  const switchWorkspace = useSwitchWorkspace()
  const mayAdminister = useHasPermission(ADMIN_ENTRY.action, ADMIN_ENTRY.resource)
  const topBar = useRef<HTMLDivElement>(null)
  const sidebar = useRef<HTMLElement>(null)
  usePublishedSize(topBar, HEADER_HEIGHT_VAR, heightOf)
  usePublishedSize(sidebar, SIDEBAR_WIDTH_VAR, widthBeside)
  const inSection = (to: string) => sameSection(to, pathname)
  const link = (id: string, to: string, label: ShellKey): FrameLink => ({
    id,
    to,
    href: `${basename ?? ''}${to}`,
    label: text(label),
    current: inSection(to),
  })
  return (
    <AppSidebar
      topBarRef={topBar}
      sidebarRef={sidebar}
      initiallyCollapsed={preference?.collapsed() ?? false}
      onCollapsedChange={(collapsed) => preference?.setCollapsed(collapsed)}
      onDrawerChange={onDrawerChange}
      links={SECTIONS.filter((s) => remotes.has(s.remote)).map((s) => link(s.remote, s.to, s.label))}
      admin={mayAdminister && remotes.has(ADMIN_REMOTE) ? link(ADMIN_REMOTE, '/admin', 'app.frame.admin') : undefined}
      account={remotes.has(ACCOUNT_REMOTE) ? link(ACCOUNT_REMOTE, '/me', 'app.frame.account') : undefined}
      user={user}
      workspace={workspaceName ?? workspace?.slug}
      workspaceSlug={workspace?.slug}
      onNavigate={(to) => {
        // Another section mounts its remote anyway; the same section's remote is mounted again.
        if (inSection(to)) onVisit()
        navigate(to)
      }}
      onSwitchWorkspace={switchWorkspace}
      onSignOut={() => void signOut()}
    />
  )
}

const NO_REMOTES: ReadonlySet<string> = new Set()

/**
 * Routes under /t/<slug>/ once the workspace has a slug (the SDK moves the URL there after
 * sign-in, from the session context); otherwise from the site root.
 */
export default function App({
  basename,
  onRouter,
  notices = noNotices,
  remotes = NO_REMOTES,
  sidebar,
}: {
  basename?: string
  onRouter?: (navigate: RouterNavigate) => void
  notices?: Live<AppNotices>
  /** The remotes this environment serves (the manifest's, less those switched off): the sidebar links to these. */
  remotes?: ReadonlySet<string>
  /** Where the sidebar's collapsed state is saved (the bootstrap's SDK storage); none keeps it for the page only. */
  sidebar?: SidebarPreferenceRepository
}) {
  const context = useSessionContext()
  const { banners, readOnlyUntil, workspaceName } = useSyncExternalStore(notices.subscribe, notices.get, notices.get)
  const frame = useFeatureFlag(FRAME_FLAG, true)
  // Bumped by a move into the section the user is in (a sidebar link, or a remote's navigate()): the routes are
  // keyed by it, so that remote mounts afresh at the new URL (Frame, RouterBridge).
  const [visit, setVisit] = useState(0)
  const remount = useCallback(() => setVisit((v) => v + 1), [])
  // While the narrow-screen drawer is open the page behind it is inert: Tab stays in the drawer.
  const [drawerOpen, setDrawerOpen] = useState(false)
  // The shell's own screens in an error boundary (the SDK's): a render error is logged and counted
  // under `web-shell` and replaced by AppError instead of a blank page. The remote has its own
  // (RemoteBoundary), so a remote's error never reaches this one.
  return (
    <MFEErrorBoundary mfe={SHELL_MFE} fallback={(e) => <AppError reference={e.traceId ?? e.requestId} onRetry={e.retry} />}>
      <BrowserRouter {...(basename ? { basename } : {})}>
        {onRouter ? <RouterBridge onRouter={onRouter} onVisit={remount} /> : null}
        {/* The sidebar beside the page on a wide screen (a bar and a drawer on a narrow one), then the page: the
            remote's routes and, under them, the notices. */}
        <div className="min-h-screen lg:flex!">
          {frame ? <Frame basename={basename} remotes={remotes} workspaceName={workspaceName} onVisit={remount} preference={sidebar} onDrawerChange={setDrawerOpen} /> : null}
          <div className="flex min-h-screen min-w-0 flex-1 flex-col" inert={drawerOpen}>
            {/* The update notice heads the page, beside the sidebar and under the narrow-screen bar. */}
            <Update />
            <div className="flex-1" key={visit}>
              <Routes>
                <Route path="/dashboard/*" element={<Dashboard />} />
                <Route path="/tenders/*" element={<Tenders />} />
                <Route path="/drafting/*" element={<Drafting />} />
                <Route path="/workflows/*" element={<Workflows />} />
                <Route path="/admin/*" element={<Admin />} />
                <Route path="/me/*" element={<Account />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </div>
            {/* The page's notices, stacked at the bottom so two never cover each other. Sticky, in the page's
                flow: they stay in view, and the page ends below them, so the remote's last controls scroll clear. */}
            <NoticeStack>
              <WorkspaceBanners banners={banners} />
              <ReadOnly until={readOnlyUntil} />
              {context ? null : <ContextUnavailable onReload={() => window.location.reload()} />}
            </NoticeStack>
          </div>
        </div>
      </BrowserRouter>
    </MFEErrorBoundary>
  )
}
