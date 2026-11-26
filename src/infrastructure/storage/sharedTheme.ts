// Infrastructure: one theme for the whole page. Every remote draws with `html[data-theme]`, but only the
// dashboard sets it (from its own storage), so another remote opened next, or on a reload, showed the
// default. The shell keeps the value instead: it puts the saved theme on the page before a remote mounts
// and saves whatever theme a remote sets afterwards, in the SDK's storage() for the shell (scoped to the
// signed-in workspace, cleared on sign-out). Remotes keep setting `data-theme` as they do today.
import { storage } from '@bcbp-solutions-fzc-llc/frontend-sdk/storage'

const THEME_KEY = 'theme'

/**
 * Applies the saved theme, then saves every change to `data-theme` until the returned function runs.
 * Call it once the user is signed in (storage is empty before that).
 */
export function keepSharedTheme(root: HTMLElement = document.documentElement): () => void {
  const saved = storage('shell').get<string>(THEME_KEY)
  if (saved && root.dataset.theme !== saved) root.dataset.theme = saved
  const observer = new MutationObserver(() => {
    const current = root.dataset.theme
    if (current && current !== storage('shell').get<string>(THEME_KEY)) storage('shell').set(THEME_KEY, current)
  })
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}
