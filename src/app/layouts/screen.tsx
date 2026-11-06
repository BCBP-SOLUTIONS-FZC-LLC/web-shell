// Mounts the shell's own screens (sign-in, signed out, session ended, wrong workspace) outside the
// app root, so a dialog can sit over a running app.
import type { ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

let root: Root | undefined
let host: HTMLElement | undefined

/** Shows `node` full-screen, above the app root (which may be empty or running). */
export function showScreen(node: ReactNode): void {
  if (!root || !host) {
    host = document.createElement('div')
    host.id = 'shell-screen'
    host.className = 'fixed inset-0 z-50 overflow-y-auto'
    document.body.appendChild(host)
    root = createRoot(host)
  }
  host.hidden = false
  root.render(node)
}

export function hideScreen(): void {
  root?.render(null)
  if (host) host.hidden = true
}

/** Test seam: unmounts the screen root so each test starts clean. */
export function resetScreen(): void {
  root?.unmount()
  root = undefined
  host?.remove()
  host = undefined
}
