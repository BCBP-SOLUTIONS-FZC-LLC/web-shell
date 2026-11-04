// Consent for v1: essential telemetry only (errors and essential warnings), by decision: there is no
// analytics consent manager in v1, so traces, metrics and info logs are not exported. `accept()` is
// where a future consent manager would grant more; nothing in the shell calls it.
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
