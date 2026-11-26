import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { useShellText } from '../../shared/i18n'
import { BrandLogo } from '../components/BrandLogo'

/** One link in the header: `to` is the router path, `href` the same path with the router's basename. */
export interface FrameLink {
  id: string
  label: string
  to: string
  href: string
  current: boolean
}

export interface AppHeaderProps {
  /** The section links, in order (the remotes this environment serves). */
  links: readonly FrameLink[]
  /** The Admin entry point, when the user may administer the workspace and the remote is served. */
  admin?: FrameLink | undefined
  /** "My account" in the user menu, when the remote is served. */
  account?: FrameLink | undefined
  user?: { name?: string | undefined; email?: string | undefined } | undefined
  /** The workspace's name (IAM P-1), else its slug. */
  workspace?: string | undefined
  /** Follows a link inside the shell (no page load). */
  onNavigate(to: string): void
  /** Resolves and switches; rejects when the workspace service cannot answer. */
  onSwitchWorkspace(identifier: string): Promise<void>
  onSignOut(): void
}

/** A plain click: the shell follows it; a new-tab or download click is left to the browser. */
function plainClick(e: MouseEvent<HTMLAnchorElement>): boolean {
  return !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

const LINK = 'shrink-0 rounded px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white'
const LINK_CURRENT = 'bg-white/15 text-white'
const ITEM = 'block w-full rounded px-3 py-2 text-start text-sm text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-slate-800'

/**
 * The shell's frame around every remote: section links, the Admin entry point, and the user menu (My
 * account, Switch workspace, Sign out). Its state comes as props; the composition root wires the SDK.
 */
export function AppHeader({ links, admin, account, user, workspace, onNavigate, onSwitchWorkspace, onSignOut }: AppHeaderProps) {
  const text = useShellText()
  const menuId = useId()
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [identifier, setIdentifier] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')
  const menuRef = useRef<HTMLDivElement>(null)

  const close = () => {
    setOpen(false)
    setSwitching(false)
    setState('idle')
  }
  const follow = (e: MouseEvent<HTMLAnchorElement>, to: string) => {
    if (!plainClick(e)) return
    e.preventDefault()
    close()
    onNavigate(to)
  }
  const link = (l: FrameLink, className: string, current = LINK_CURRENT) => (
    <a
      key={l.id}
      href={l.href}
      onClick={(e) => follow(e, l.to)}
      aria-current={l.current ? 'page' : undefined}
      className={l.current ? `${className} ${current}` : className}
    >
      {l.label}
    </a>
  )
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
  // A press outside closes the menu. Not a blur with no new focus: WebKit does not focus a clicked button,
  // so a click on Continue or Sign out would close the menu before it landed.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) close()
  }
  const who = user?.name ?? user?.email

  return (
    <header className="bg-[#030d1b] font-sans text-white shadow">
      <div className="flex items-center gap-3 px-4 py-2">
        <BrandLogo size={28} />
        <nav aria-label={text('app.frame.nav')} className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {links.map((l) => link(l, LINK))}
          {admin ? link(admin, LINK) : null}
        </nav>
        <div
          ref={menuRef}
          className="relative"
          onKeyDown={onKeyDown}
          onBlur={(e) => {
            // Focus moved elsewhere by the keyboard (Tab); a blur with no new focus is left to pointerdown.
            if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) close()
          }}
        >
          <button
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => (open ? close() : setOpen(true))}
            className="flex max-w-[14rem] items-center gap-2 rounded px-3 py-1.5 text-sm text-slate-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            {who ? <span className="sr-only">{text('app.frame.userMenu')}: </span> : null}
            <span className="truncate">{who ?? text('app.frame.userMenu')}</span>
          </button>
          {open ? (
            <div id={menuId} className="absolute end-0 mt-1 w-72 rounded-md bg-white p-2 text-slate-800 shadow-lg">
              {who || workspace ? (
                <div className="border-b border-slate-200 px-3 pb-2 pt-1 text-sm">
                  {who ? <p className="truncate font-medium">{who}</p> : null}
                  {user?.name && user.email ? <p className="truncate text-slate-500">{user.email}</p> : null}
                  {workspace ? <p className="truncate text-slate-500">{text('app.frame.workspace', { name: workspace })}</p> : null}
                </div>
              ) : null}
              <ul className="pt-1">
                {account ? <li>{link(account, ITEM, 'font-medium')}</li> : null}
                <li>
                  {switching ? (
                    <form onSubmit={(e) => void submit(e)} className="space-y-2 px-3 py-2">
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
                        <button type="button" onClick={() => setSwitching(false)} className="rounded px-3 py-1 text-sm hover:bg-slate-100">
                          {text('app.frame.cancel')}
                        </button>
                        <button
                          type="submit"
                          disabled={state === 'busy'}
                          className="rounded bg-slate-800 px-3 py-1 text-sm text-white disabled:opacity-60"
                        >
                          {text('common.continue')}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button type="button" onClick={() => setSwitching(true)} className={ITEM}>
                      {text('app.frame.switchWorkspace')}
                    </button>
                  )}
                </li>
                <li>
                  <button type="button" onClick={onSignOut} className={ITEM}>
                    {text('common.signOut')}
                  </button>
                </li>
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
