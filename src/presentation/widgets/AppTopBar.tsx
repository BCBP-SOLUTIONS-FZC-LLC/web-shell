import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { useShellText } from '../../shared/i18n'
import { AccountIcon, ChevronsIcon, SignOutIcon } from '../components/Icons'
import type { FrameLink } from './AppSidebar'

export interface AppTopBarProps {
  user?: { name?: string | undefined; email?: string | undefined } | undefined
  /** "My account", when the remote is served. */
  account?: FrameLink | undefined
  onNavigate(to: string): void
  onSignOut(): void
}

/** The page's theme, as every remote reads it: `html[data-theme]`, `light` unless set otherwise. */
const currentTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

const ITEM =
  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm text-[#18181b] hover:bg-[#f4f4f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#be185d]'

/**
 * The bar across the top of the page on a wide screen: the signed-in user's menu (My account, Theme mode, Sign
 * out). The theme is the page's `data-theme`, which the shell already keeps for every remote.
 */
export function AppTopBar({ user, account, onNavigate, onSignOut }: AppTopBarProps) {
  const text = useShellText()
  const menuId = useId()
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState(currentTheme)
  const rootRef = useRef<HTMLDivElement>(null)
  const who = user?.name ?? user?.email

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    setTheme(next)
  }
  const openAccount = (e: MouseEvent<HTMLAnchorElement>, to: string) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    setOpen(false)
    onNavigate(to)
  }
  if (!who) return null

  return (
    <header className="sticky top-0 z-20 hidden h-14 items-center justify-end border-b border-[#e4e4e7] bg-white px-6 font-sans lg:flex!">
      <div ref={rootRef} className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen(!open)}
          className="flex items-center gap-3 rounded-full py-1 pe-3 ps-1 text-sm font-medium text-[#18181b] hover:bg-[#f4f4f5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#be185d]"
        >
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-[#be185d] text-xs font-bold text-white">
            {(who.trim()[0] ?? '?').toUpperCase()}
          </span>
          <span className="max-w-48 truncate">{who}</span>
          <ChevronsIcon className="size-4 text-[#52525b]" />
        </button>
        {open ? (
          <div id={menuId} className="absolute end-0 top-full mt-2 w-64 rounded-xl border border-[#e4e4e7] bg-white p-2 shadow-xl">
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
