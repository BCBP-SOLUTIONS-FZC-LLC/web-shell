// Types for metrics-check.mjs, so its tests typecheck.
export interface Registry {
  constLabels: string[]
  prohibitedLabels: string[]
  prohibitedLabelSuffixes: string[]
  exemptPrefixes: string[]
  legacyNames: string[]
  metrics: { name: string; tier: string; type: string; domain?: string; labels: string[] }[]
}
export interface FoundMetric { tier: 'domain' | 'service'; type: 'counter' | 'histogram'; name: string; labels: string[]; line: number }
export function servicePrefix(domain: string, service: string): string
export function findMetrics(source: string): { metrics: FoundMetric[]; problems: { line: number; message: string }[] }
export function checkMetric(metric: Omit<FoundMetric, 'line'>, o: { registry: Registry; domain: string; service: string }): string[]
export function inventoryNames(markdown: string): Set<string>
export function identityOf(bootstrapSource: string): { domain: string; service: string }
export function check(o: { files: { path: string; source: string }[]; registry: Registry; identity: { domain: string; service: string }; inventory: Set<string> }): string[]
