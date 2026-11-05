#!/usr/bin/env node
// The Enterprise Platform Observability Standard, checked at build time for the shell's own metrics
// (docs/observability.md). The SDK enforces the same rules when a metric is created
// (InvalidMetricError); this fails the PR first. Rules and registry are the SDK's: the registry is
// `@bcbp-solutions-fzc-llc/frontend-sdk/contracts/metric-registry.json` (synced from platform-gincommon
// obsregistry), the tier rules mirror its getDomainMeter / getServiceMeter checks.
//
//   node .github/scripts/metrics-check.mjs        (npm run metrics-check)
//
// Fails when src/:
// - creates metrics outside the SDK (OpenTelemetry metrics API, prom-client): the SDK injects
//   domain, service and environment centrally, so instrumentation cannot omit or misspell them;
// - names a platform_* metric (Tier 1 is bound by the SDK only, after registry ratification);
// - uses a domain meter name that is not a registry Tier 2 metric of the shell's domain;
// - uses a service meter name without the <domain>_<service>_ prefix, a counter not ending in
//   _total, a histogram not ending in _seconds, or a registry / legacy / runtime-reserved name;
// - declares a label that is not snake_case, is prohibited (unbounded), is injected centrally, is
//   duplicated, or more than 8 labels;
// - uses a metric that docs/observability.md does not list in its inventory.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const NAME_RE = /^[a-z][a-z0-9_]*$/
const MAX_SERVICE_LABELS = 8

/** The SDK's ServicePrefix (gincommon): `<domain>_<service>_`, service normalised to snake_case. */
export function servicePrefix(domain, service) {
  let s = service.toLowerCase().replace(/[^a-z0-9]/g, '_')
  s = s.replace(/^_+|_+$/g, '').replace(/_{2,}/g, '_')
  if (s.startsWith(`${domain}_`)) s = s.slice(domain.length + 1)
  return `${domain}_${s}_`
}

const stringsIn = (list) => [...list.matchAll(/['"`]([^'"`]*)['"`]/g)].map((m) => m[1])

/**
 * Every metric the source creates: `{ tier: 'domain' | 'service', type, name, labels, line }`, and
 * the problems with how it creates them (foreign APIs, names that are not literals).
 */
export function findMetrics(source) {
  const metrics = []
  const problems = []
  const lineOf = (i) => source.slice(0, i).split('\n').length
  if (/from\s+['"]prom-client['"]/.test(source)) problems.push({ line: lineOf(source.search(/prom-client/)), message: 'prom-client: create metrics with the SDK meters (/metrics)' })
  for (const m of source.matchAll(/\bmetrics\s*\.\s*getMeter\s*\(|\.\s*create(Counter|Histogram|UpDownCounter|Gauge|ObservableGauge|ObservableCounter)\s*\(/g)) {
    problems.push({ line: lineOf(m.index), message: 'OpenTelemetry metrics API: create metrics with the SDK meters (getDomainMeter / getServiceMeter), which inject domain, service and environment' })
  }
  // const x = getServiceMeter(...) / getDomainMeter(...), then x.counter(...); or inline calls.
  const meters = new Map()
  for (const m of source.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*get(Domain|Service)Meter\s*\(/g)) meters.set(m[1], m[2].toLowerCase())
  const calls = /(?:\b(\w+)|get(Domain|Service)Meter\s*\([^)]*\))\s*\.\s*(counter|histogram)\s*\(/g
  for (const m of source.matchAll(calls)) {
    const tier = m[2] ? m[2].toLowerCase() : meters.get(m[1])
    if (!tier) continue
    const args = source.slice(m.index + m[0].length)
    const name = /^\s*(['"`])([^'"`$]*)\1/.exec(args)
    if (!name) {
      problems.push({ line: lineOf(m.index), message: `${m[3]}(): the metric name must be a string literal, so it can be checked and listed` })
      continue
    }
    let labels = []
    if (tier === 'service') {
      const rest = args.slice(name[0].length)
      const list = /^\s*,\s*(['"`])(?:[^'"`\\]|\\.)*\1\s*,\s*\[([^\]]*)\]/.exec(rest)
      if (!list) {
        problems.push({ line: lineOf(m.index), message: `${name[2]}: the label list must be an array literal, so it can be checked` })
      } else labels = stringsIn(list[2])
    }
    metrics.push({ tier, type: m[3], name: name[2], labels, line: lineOf(m.index) })
  }
  return { metrics, problems }
}

/** Problems with one metric against the standard and the registry (as the SDK would throw them). */
export function checkMetric(metric, { registry, domain, service }) {
  const out = []
  const byName = new Map(registry.metrics.map((e) => [e.name, e]))
  const legacy = new Set(registry.legacyNames)
  const { name, type, tier, labels } = metric
  if (!NAME_RE.test(name)) return [`"${name}": name must be snake_case [a-z0-9_]`]
  if (name.startsWith('platform_')) return [`"${name}": platform_* (Tier 1) metrics are bound by the SDK after registry ratification; app code must not create them`]
  if (tier === 'domain') {
    const e = byName.get(name)
    if (!e) return [`"${name}": not in the Platform Observability Registry; a domain-shared metric needs governance approval first`]
    if (e.tier !== 'domain') return [`"${name}": a ${e.tier} registry metric, not a domain one`]
    if (e.domain !== domain) out.push(`"${name}": a ${e.domain} domain metric; this shell's domain is ${domain}`)
    if (e.type !== type) out.push(`"${name}": the registry defines a ${e.type}, not a ${type}`)
    return out
  }
  if (legacy.has(name)) return [`"${name}": a legacy name; emit its replacement`]
  const e = byName.get(name)
  if (e) return [`"${name}": a ${e.tier} registry metric; use getDomainMeter (domain) or let the SDK record it (platform)`]
  if (registry.exemptPrefixes.some((p) => name.startsWith(p))) return [`"${name}": prefix reserved for runtime collectors`]
  const prefix = servicePrefix(domain, service)
  if (!name.startsWith(prefix)) out.push(`"${name}": service-specific (Tier 3) metrics must be named ${prefix}<metric>`)
  if (type === 'counter' && !name.endsWith('_total')) out.push(`"${name}": counters must end in _total`)
  if (type === 'histogram' && !name.endsWith('_seconds')) out.push(`"${name}": histograms must end in _seconds`)
  for (const l of labels) {
    if (!NAME_RE.test(l)) out.push(`"${name}": label "${l}" must be snake_case`)
    else if (registry.prohibitedLabels.includes(l) || registry.prohibitedLabelSuffixes.some((s) => l.endsWith(s))) out.push(`"${name}": label "${l}" is prohibited (unbounded cardinality)`)
    else if (registry.constLabels.includes(l)) out.push(`"${name}": label "${l}" is injected centrally by the SDK; do not declare it`)
  }
  if (new Set(labels).size !== labels.length) out.push(`"${name}": duplicate label names`)
  if (labels.length > MAX_SERVICE_LABELS) out.push(`"${name}": ${labels.length} labels; at most ${MAX_SERVICE_LABELS} besides domain, service and environment`)
  return out
}

/** The metric names docs/observability.md lists in its inventory (first column, in backticks). */
export function inventoryNames(markdown) {
  const section = markdown.split(/^## /m).find((s) => s.startsWith('Inventory')) ?? ''
  return new Set([...section.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|/gm)].map((m) => m[1]))
}

/** The shell's identity, read from initializeCore in src/bootstrap.tsx (one source). */
export function identityOf(bootstrapSource) {
  const service = /serviceName:\s*['"]([^'"]+)['"]/.exec(bootstrapSource)?.[1]
  const domain = /domain:\s*['"]([^'"]+)['"]/.exec(bootstrapSource)?.[1]
  if (!service || !domain) throw new Error('metrics-check: initializeCore serviceName/domain not found in src/bootstrap.tsx')
  return { service, domain }
}

/** Runs every check over `files` ([{ path, source }]); returns the failure lines. */
export function check({ files, registry, identity, inventory }) {
  const failures = []
  for (const { path, source } of files) {
    const { metrics, problems } = findMetrics(source)
    for (const p of problems) failures.push(`${path}:${p.line}: ${p.message}`)
    for (const m of metrics) {
      for (const p of checkMetric(m, { registry, ...identity })) failures.push(`${path}:${m.line}: ${p}`)
      if (!inventory.has(m.name)) failures.push(`${path}:${m.line}: "${m.name}" is not in docs/observability.md § Inventory`)
    }
  }
  return failures
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.(ts|tsx|js|mjs)$/.test(e.name) ? [join(dir, e.name)] : [],
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd()
  const registry = JSON.parse(readFileSync(join(root, 'node_modules/@bcbp-solutions-fzc-llc/frontend-sdk/contracts/metric-registry.json'), 'utf8'))
  const identity = identityOf(readFileSync(join(root, 'src/bootstrap.tsx'), 'utf8'))
  const inventory = inventoryNames(readFileSync(join(root, 'docs/observability.md'), 'utf8'))
  const files = walk(join(root, 'src')).map((p) => ({ path: relative(root, p), source: readFileSync(p, 'utf8') }))
  const failures = check({ files, registry, identity, inventory })
  const created = files.flatMap((f) => findMetrics(f.source).metrics)
  for (const f of failures) console.log(`::error title=Observability standard::${f}`)
  console.log(
    `${failures.length ? '✗' : '✓'} metrics: ${created.length} created in src/ (${identity.domain}/${identity.service}, prefix ${servicePrefix(identity.domain, identity.service)}), ` +
      `registry ${registry.metrics.length} metrics, inventory ${inventory.size} listed`,
  )
  process.exit(failures.length ? 1 : 0)
}
