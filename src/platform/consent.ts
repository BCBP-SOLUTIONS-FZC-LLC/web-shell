// Stand-in for the consent management platform (CMP): essential telemetry always; telemetry and
// analytics only after the user accepts. Wire the real CMP's API here when there is one.
import type { ConsentCategory, ConsentProvider } from '@bcbp-solutions-fzc-llc/frontend-sdk/core'

const granted = new Set<ConsentCategory>(['essential'])
const listeners = new Set<() => void>()

export const cmp: ConsentProvider & { accept(categories: readonly ConsentCategory[]): void } = {
  has: (c) => granted.has(c),
  subscribe(l) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
  accept(categories) {
    for (const c of categories) granted.add(c)
    for (const l of [...listeners]) l()
  },
}
