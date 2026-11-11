// The reduced-motion preference, followed live: turning it on while a page shows stops its motion.
import { useSyncExternalStore } from 'react'

const REDUCE = '(prefers-reduced-motion: reduce)'
const hasMatchMedia = () => typeof window.matchMedia === 'function'

function subscribe(changed: () => void): () => void {
  const query = hasMatchMedia() ? window.matchMedia(REDUCE) : undefined
  query?.addEventListener?.('change', changed)
  return () => query?.removeEventListener?.('change', changed)
}

const reducedNow = () => hasMatchMedia() && window.matchMedia(REDUCE).matches

/** True while the user asks for reduced motion (false where matchMedia is missing). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, reducedNow)
}
