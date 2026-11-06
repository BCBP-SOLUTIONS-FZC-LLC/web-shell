#!/usr/bin/env node
// The Enterprise Platform Observability Standard, checked at build time for the shell's own metrics
// (docs/observability.md). The rules are not restated here: each metric src/ creates is created
// once more with the SDK's own meters (getServiceMeter / getDomainMeter, under the shell's identity
// from src/app/bootstrap/bootstrap.tsx), and whatever InvalidMetricError the SDK throws (namespace, suffix,
// registry, prohibited_label, required_labels, label_vocabulary) fails the build. The registry is the
// SDK's (platform-gincommon obsregistry). This script only adds what the SDK cannot see:
//
// - metrics created outside the SDK (OpenTelemetry metrics API, prom-client), which would bypass
//   both the rules and the centrally injected domain / service / environment labels;
// - metric names and label lists that are not literals (they could not be checked);
// - metrics missing from docs/observability.md § Inventory.
//
//   node .github/scripts/metrics-check.mjs        (npm run metrics-check)
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { initializeCore } from '@bcbp-solutions-fzc-llc/frontend-sdk/core'
import { getDomainMeter, getServiceMeter, InvalidMetricError } from '@bcbp-solutions-fzc-llc/frontend-sdk/metrics'

const stringsIn = (list) => [...list.matchAll(/['"`]([^'"`]*)['"`]/g)].map((m) => m[1])

/**
 * Every metric the source creates through the SDK meters, `{ tier: 'domain' | 'service', type,
 * name, labels, line }`, and the problems with how it creates them.
 */
export function findMetrics(source) {
  const metrics = []
  const problems = []
  const lineOf = (i) => source.slice(0, i).split('\n').length
  if (/from\s+['"]prom-client['"]/.test(source)) problems.push({ line: lineOf(source.search(/prom-client/)), message: 'prom-client: create metrics with the SDK meters (/metrics)' })
  for (const m of source.matchAll(/\bmetrics\s*\.\s*getMeter\s*\(|\.\s*create(Counter|Histogram|UpDownCounter|Gauge|ObservableGauge|ObservableCounter)\s*\(/g)) {
    problems.push({ line: lineOf(m.index), message: 'OpenTelemetry metrics API: create metrics with the SDK meters (getDomainMeter / getServiceMeter), which apply the standard and inject domain, service and environment' })
  }
  // const x = getServiceMeter(...) / getDomainMeter(...), then x.counter(...); or inline calls.
  const meters = new Map()
  for (const m of source.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*get(Domain|Service)Meter\s*\(/g)) meters.set(m[1], m[2].toLowerCase())
  for (const m of source.matchAll(/(?:\b(\w+)|get(Domain|Service)Meter\s*\([^)]*\))\s*\.\s*(counter|histogram)\s*\(/g)) {
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
      const list = /^\s*,\s*(['"`])(?:[^'"`\\]|\\.)*\1\s*,\s*\[([^\]]*)\]/.exec(args.slice(name[0].length))
      if (!list) problems.push({ line: lineOf(m.index), message: `${name[2]}: the label list must be an array literal, so it can be checked` })
      else labels = stringsIn(list[2])
    }
    metrics.push({ tier, type: m[3], name: name[2], labels, line: lineOf(m.index) })
  }
  return { metrics, problems }
}

/**
 * Creates `metric` with the SDK's meter for its tier; returns the SDK's verdict (empty when the SDK
 * accepts it). The identity must already be set with `useIdentity`.
 */
export function sdkVerdict(metric) {
  try {
    if (metric.tier === 'domain') getDomainMeter()[metric.type](metric.name)
    else getServiceMeter()[metric.type](metric.name, `checked by metrics-check: ${metric.name}`, metric.labels)
    return []
  } catch (e) {
    if (e instanceof InvalidMetricError) return [`${e.rule}: ${e.message}`]
    throw e
  }
}

/** Sets the page identity the SDK checks Tier 2 domains and Tier 3 prefixes against. */
export function useIdentity({ domain, service }) {
  initializeCore({ serviceName: service, domain, environment: 'test' })
}

/** The metric names docs/observability.md lists in its inventory (first column, in backticks). */
export function inventoryNames(markdown) {
  const section = markdown.split(/^## /m).find((s) => s.startsWith('Inventory')) ?? ''
  return new Set([...section.matchAll(/^\|\s*`([a-z0-9_]+)`\s*\|/gm)].map((m) => m[1]))
}

/** The shell's identity, read from initializeCore in src/app/bootstrap/bootstrap.tsx (one source). */
export function identityOf(bootstrapSource) {
  const service = /serviceName:\s*['"]([^'"]+)['"]/.exec(bootstrapSource)?.[1]
  const domain = /domain:\s*['"]([^'"]+)['"]/.exec(bootstrapSource)?.[1]
  if (!service || !domain) throw new Error('metrics-check: initializeCore serviceName/domain not found in src/app/bootstrap/bootstrap.tsx')
  return { service, domain }
}

/** Runs every check over `files` ([{ path, source }]); returns the failure lines. */
export function check({ files, inventory }) {
  const failures = []
  for (const { path, source } of files) {
    const { metrics, problems } = findMetrics(source)
    for (const p of problems) failures.push(`${path}:${p.line}: ${p.message}`)
    for (const m of metrics) {
      for (const p of sdkVerdict(m)) failures.push(`${path}:${m.line}: ${p}`)
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
  const identity = identityOf(readFileSync(join(root, 'src/app/bootstrap/bootstrap.tsx'), 'utf8'))
  useIdentity(identity)
  const inventory = inventoryNames(readFileSync(join(root, 'docs/observability.md'), 'utf8'))
  const files = walk(join(root, 'src')).map((p) => ({ path: relative(root, p), source: readFileSync(p, 'utf8') }))
  const failures = check({ files, inventory })
  const created = files.flatMap((f) => findMetrics(f.source).metrics)
  for (const f of failures) console.log(`::error title=Observability standard::${f}`)
  console.log(
    `${failures.length ? '✗' : '✓'} metrics: ${created.length} created in src/ (${identity.domain}/${identity.service}), checked with the SDK's meters; inventory ${inventory.size} listed`,
  )
  process.exit(failures.length ? 1 : 0)
}
