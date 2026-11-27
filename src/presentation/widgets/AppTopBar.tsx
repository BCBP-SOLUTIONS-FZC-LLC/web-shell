import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { useShellText } from '../../shared/i18n'
import { AccountIcon, BellIcon, MenuIcon, SettingsIcon, SignOutIcon } from '../components/Icons'
import type { FrameLink } from './AppSidebar'

export interface AppTopBarProps {
  user?: { name?: string | undefined; email?: string | undefined } | undefined
  /** "My account", when the remote is served. */
  account?: FrameLink | undefined
  /** "Settings" (the workspace's), when mfe-admin is served and the user may open it. */
  settings?: FrameLink | undefined
  onNavigate(to: string): void
  onSignOut(): void
  /** Collapses or expands the sidebar. */
  onToggleSidebar(): void
}

/** The page's theme, as every remote reads it: `html[data-theme]`, `light` unless set otherwise. */
const currentTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

/** The avatar's letters: "Ada Lovelace" is "AL"; one word, or an email, gives its first letter. */
function initialsOf(who: string): string {
  const [first = '?', ...rest] = who.trim().split(/\s+/)
  const last = rest.at(-1)
  return (last && !who.includes('@') ? `${first[0]!}${last[0]!}` : first[0]!).toUpperCase()
}

/** A popover card under the bar's right side: no border, a soft shadow. */
const POPOVER = 'absolute end-0 top-full mt-2 rounded-xl bg-white shadow-[0_6px_24px_rgba(15,23,42,0.12)]'

const ITEM =
  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm text-[#18181b] hover:bg-[#f4f4f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#be185d]'

/**
 * The bar across the top of the page on a wide screen: the sidebar's menu button, and on the right the
 * notifications bell and the user's avatar, which opens the user's details (name, email), My account, Theme mode,
 * Settings and Sign out. The theme is the page's `data-theme`, which the shell already keeps for every remote.
 */
export function AppTopBar({ user, account, settings, onNavigate, onSignOut, onToggleSidebar }: AppTopBarProps) {
  const text = useShellText()
  const menuId = useId()
  const bellId = useId()
  // Which popover is open: only one at a time.
  const [shown, setShown] = useState<'bell' | 'user' | undefined>(undefined)
  const [theme, setTheme] = useState(currentTheme)
  const rootRef = useRef<HTMLDivElement>(null)
  const who = user?.name ?? user?.email

  useEffect(() => {
    if (!shown) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setShown(undefined)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShown(undefined)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [shown])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    setTheme(next)
  }
  const openAccount = (e: MouseEvent<HTMLAnchorElement>, to: string) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    setShown(undefined)
    onNavigate(to)
  }
  if (!who) return null
  const initials = initialsOf(who)
  const open = shown === 'user'

  return (
    <header className="sticky top-0 z-20 hidden h-16 items-center justify-between bg-white px-6 font-sans shadow-[0_1px_6px_rgba(15,23,42,0.08)] lg:flex!">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="rounded-lg p-2 text-[#3f3f46] hover:bg-[#f4f4f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#be185d]"
      >
        <MenuIcon />
        <span className="sr-only">{text('app.frame.toggleSidebar')}</span>
      </button>
      <div ref={rootRef} className="relative flex items-center gap-2">
        <button
          type="button"
          aria-expanded={shown === 'bell'}
          aria-controls={bellId}
          onClick={() => setShown(shown === 'bell' ? undefined : 'bell')}
          className="rounded-full p-2 text-[#3f3f46] hover:bg-[#f4f4f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#be185d]"
        >
          <BellIcon />
          <span className="sr-only">{text('app.frame.notifications')}</span>
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={who}
          onClick={() => setShown(open ? undefined : 'user')}
          className="flex size-10 items-center justify-center rounded-full bg-[#be185d] text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#be185d]"
        >
          {initials}
        </button>
        {shown === 'bell' ? (
          <div id={bellId} className={`${POPOVER} w-72 p-4 text-sm`}>
            <p className="font-semibold text-[#18181b]">{text('app.frame.notifications')}</p>
            <p className="mt-1 text-[#52525b]">{text('app.frame.noNotifications')}</p>
          </div>
        ) : null}
        {open ? (
          <div id={menuId} className={`${POPOVER} w-72 p-2`}>
            <div className="px-3 pb-2 pt-1">
              <p className="truncate text-sm font-semibold text-[#18181b]">{who}</p>
              {user?.name && user.email ? <p className="truncate text-xs text-[#52525b]">{user.email}</p> : null}
            </div>
            <hr className="my-1 border-[#e4e4e7]" />
            {account ? (
              <a href={account.href} onClick={(e) => openAccount(e, account.to)} className={ITEM}>
                <AccountIcon className="size-4" />
                {account.label}
              </a>
            ) : null}
            <button type="button" role="switch" aria-checked={theme === 'dark'} onClick={toggleTheme} className={`${ITEM} justify-between`}>
              <span>{text('app.frame.themeMode')}</span>
              <span className="text-xs text-[#52525b]">{theme === 'dark' ? text('app.frame.themeDark') : text('app.frame.themeLight')}</span>
            </button>
            {settings ? (
              <a href={settings.href} onClick={(e) => openAccount(e, settings.to)} className={ITEM}>
                <SettingsIcon className="size-4" />
                {settings.label}
              </a>
            ) : null}
            <hr className="my-1 border-[#e4e4e7]" />
            <button type="button" onClick={onSignOut} className={ITEM}>
              <SignOutIcon className="size-4" />
              {text('common.signOut')}
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
