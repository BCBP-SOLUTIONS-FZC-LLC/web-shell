// @vitest-environment node
// .github/scripts/metrics-check.mjs: the observability standard (docs/observability.md) checked at
// build time, against the SDK's own registry, mirroring the SDK's getDomainMeter / getServiceMeter.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  check,
  checkMetric,
  findMetrics,
  identityOf,
  inventoryNames,
  servicePrefix,
  type Registry,
} from '../../.github/scripts/metrics-check.mjs'

const root = join(import.meta.dirname, '..', '..')
const registry = JSON.parse(
  readFileSync(join(root, 'node_modules/@bcbp-solutions-fzc-llc/frontend-sdk/contracts/metric-registry.json'), 'utf8'),
) as Registry
const id = { registry, domain: 'portal', service: 'web-shell' }
const svc = (name: string, type: 'counter' | 'histogram' = 'counter', labels: string[] = []) =>
  checkMetric({ tier: 'service', type, name, labels }, id)

describe('servicePrefix (the SDK and gincommon ServicePrefix)', () => {
  it('normalises the service to snake_case and drops a repeated domain', () => {
    expect(servicePrefix('portal', 'web-shell')).toBe('portal_web_shell_')
    expect(servicePrefix('iam', 'iam-event-consumer')).toBe('iam_event_consumer_')
  })
})

describe('Tier 3 (getServiceMeter)', () => {
  it('accepts a prefixed counter and histogram with bounded labels', () => {
    expect(svc('portal_web_shell_session_fallback_total', 'counter', ['outcome', 'reason'])).toEqual([])
    expect(svc('portal_web_shell_boot_seconds', 'histogram')).toEqual([])
  })

  it('refuses a missing prefix and the wrong suffixes', () => {
    expect(svc('web_shell_x_total')).toEqual([expect.stringContaining('portal_web_shell_<metric>')])
    expect(svc('portal_web_shell_x')).toEqual([expect.stringContaining('counters must end in _total')])
    expect(svc('portal_web_shell_x_ms', 'histogram')).toEqual([expect.stringContaining('histograms must end in _seconds')])
  })

  it('refuses platform_*, registry, legacy and runtime-reserved names', () => {
    expect(svc('platform_custom_total')[0]).toMatch(/platform_\* \(Tier 1\)/)
    expect(svc(registry.metrics.find((m) => m.tier === 'platform' && !m.name.startsWith('platform_'))?.name ?? 'iam_auth_events_total')[0]).toMatch(/registry metric/)
    expect(svc('http_requests_total')[0]).toMatch(/legacy name/)
    expect(svc('process_cpu_seconds_total')[0]).toMatch(/reserved for runtime collectors/)
  })

  it('refuses prohibited, injected, non-snake_case, duplicate and too many labels', () => {
    expect(svc('portal_web_shell_x_total', 'counter', ['tenant_id'])).toEqual([expect.stringContaining('prohibited')])
    expect(svc('portal_web_shell_x_total', 'counter', ['customer_email'])).toEqual([expect.stringContaining('prohibited')])
    expect(svc('portal_web_shell_x_total', 'counter', ['environment'])).toEqual([expect.stringContaining('injected centrally')])
    expect(svc('portal_web_shell_x_total', 'counter', ['Outcome'])).toEqual([expect.stringContaining('snake_case')])
    expect(svc('portal_web_shell_x_total', 'counter', ['a', 'a'])).toEqual([expect.stringContaining('duplicate')])
    expect(svc('portal_web_shell_x_total', 'counter', 'abcdefghi'.split(''))).toEqual([expect.stringContaining('at most 8')])
  })
})

describe('Tier 2 (getDomainMeter)', () => {
  const dom = (name: string, type: 'counter' | 'histogram' = 'counter') => checkMetric({ tier: 'domain', type, name, labels: [] }, id)
  it("allows only the registry's Tier 2 metrics of the shell's domain, as their type", () => {
    expect(dom('portal_unknown_total')[0]).toMatch(/not in the Platform Observability Registry/)
    expect(dom('iam_auth_events_total')).toEqual([expect.stringContaining('this shell\'s domain is portal')])
    expect(dom('iam_auth_events_total', 'histogram')).toContainEqual(expect.stringContaining('defines a counter'))
    const platform = registry.metrics.find((m) => m.tier === 'platform')!
    expect(dom(platform.name)[0]).toMatch(/platform_\* \(Tier 1\)|not a domain one/)
  })
})

describe('findMetrics', () => {
  it('reads meters held in a variable and inline, with their labels', () => {
    const { metrics, problems } = findMetrics(`
      const meter = getServiceMeter()
      const a = meter.counter('portal_web_shell_a_total', 'A.', ['outcome'])
      getServiceMeter().histogram("portal_web_shell_b_seconds", "B.", [])
      const d = getDomainMeter()
      d.counter('portal_shared_total')
    `)
    expect(problems).toEqual([])
    expect(metrics.map(({ tier, type, name, labels }) => ({ tier, type, name, labels }))).toEqual([
      { tier: 'service', type: 'counter', name: 'portal_web_shell_a_total', labels: ['outcome'] },
      { tier: 'service', type: 'histogram', name: 'portal_web_shell_b_seconds', labels: [] },
      { tier: 'domain', type: 'counter', name: 'portal_shared_total', labels: [] },
    ])
  })

  it('reports metrics created outside the SDK, and names or labels that are not literals', () => {
    const { problems } = findMetrics(`
      import client from 'prom-client'
      const m = metrics.getMeter('x'); m.createCounter('y')
      const s = getServiceMeter(); s.counter(NAME, 'h', [])
      s.counter('portal_web_shell_z_total', 'h', LABELS)
    `)
    expect(problems.map((p) => p.message)).toEqual([
      expect.stringContaining('prom-client'),
      expect.stringContaining('OpenTelemetry metrics API'),
      expect.stringContaining('OpenTelemetry metrics API'),
      expect.stringContaining('string literal'),
      expect.stringContaining('array literal'),
    ])
  })

  it('ignores counter()/histogram() on anything that is not an SDK meter', () => {
    expect(findMetrics(`const x = other(); x.counter('whatever')`).metrics).toEqual([])
  })
})

describe('inventory and identity', () => {
  it('lists the backticked names of the Inventory table only', () => {
    const md = '## Inventory\n\n| Metric | Tier |\n|---|---|\n| `portal_web_shell_a_total` | 3 |\n\n## Other\n\n| `not_this` | x |\n'
    expect([...inventoryNames(md)]).toEqual(['portal_web_shell_a_total'])
  })

  it('reads the identity from initializeCore', () => {
    expect(identityOf("initializeCore({ serviceName: 'web-shell', domain: 'portal' })")).toEqual({ service: 'web-shell', domain: 'portal' })
    expect(() => identityOf('nothing here')).toThrow(/not found/)
  })

  it('fails a compliant metric that the inventory does not list', () => {
    const files = [{ path: 'src/x.ts', source: "getServiceMeter().counter('portal_web_shell_a_total', 'A.', [])" }]
    expect(check({ files, registry, identity: id, inventory: new Set() })).toEqual([expect.stringContaining('not in docs/observability.md')])
    expect(check({ files, registry, identity: id, inventory: new Set(['portal_web_shell_a_total']) })).toEqual([])
  })
})

describe('this repository', () => {
  it('passes: identity from src/bootstrap.tsx, every src/ metric compliant and listed', () => {
    expect(identityOf(readFileSync(join(root, 'src/bootstrap.tsx'), 'utf8'))).toEqual({ service: 'web-shell', domain: 'portal' })
    expect(inventoryNames(readFileSync(join(root, 'docs/observability.md'), 'utf8')).size).toBe(0)
  })
})
