// Types for metrics-check.mjs, so its tests typecheck.
export interface FoundMetric { tier: 'domain' | 'service'; type: 'counter' | 'histogram'; name: string; labels: string[]; line: number }
export function findMetrics(source: string): { metrics: FoundMetric[]; problems: { line: number; message: string }[] }
export function sdkVerdict(metric: Omit<FoundMetric, 'line'>): string[]
export function useIdentity(identity: { domain: string; service: string }): void
export function inventoryNames(markdown: string): Set<string>
export function identityOf(bootstrapSource: string): { domain: string; service: string }
export function check(o: { files: { path: string; source: string }[]; inventory: Set<string> }): string[]
