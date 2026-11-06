// @vitest-environment node
// .github/scripts/metrics-check.mjs: the observability standard (docs/observability.md) at build
// time. The rules are the SDK's: each metric is created with its getServiceMeter / getDomainMeter and
// the SDK's InvalidMetricError is the verdict. These tests check that the script finds the metrics,
// passes the SDK's verdict through, and adds what the SDK cannot see (foreign APIs, the inventory).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { check, findMetrics, identityOf, inventoryNames, sdkVerdict, useIdentity } from '../../.github/scripts/metrics-check.mjs'

const root = join(import.meta.dirname, '..', '..')
const svc = (name: string, type: 'counter' | 'histogram' = 'counter', labels: string[] = []) =>
  sdkVerdict({ tier: 'service', type, name, labels })

beforeAll(() => useIdentity(identityOf(readFileSync(join(root, 'src/app/bootstrap/bootstrap.tsx'), 'utf8'))))

describe("the SDK's verdict, passed through", () => {
  it('accepts what the SDK accepts', () => {
    expect(svc('portal_web_shell_session_fallback_total', 'counter', ['outcome'])).toEqual([])
    expect(svc('portal_web_shell_boot_seconds', 'histogram')).toEqual([])
  })

  it('reports each rule the SDK enforces, with its rule name', () => {
    expect(svc('web_shell_x_total')).toEqual([expect.stringMatching(/^namespace: .*portal_web_shell_<metric>/)])
    expect(svc('portal_web_shell_x_ms', 'histogram')).toEqual([expect.stringMatching(/^suffix: /)])
    expect(svc('portal_web_shell_y_total', 'counter', ['tenant_id'])).toEqual([expect.stringMatching(/^prohibited_label: /)])
    expect(svc('portal_web_shell_z_total', 'counter', ['environment'])).toEqual([expect.stringMatching(/^required_labels: /)])
    expect(svc('platform_custom_total')).toEqual([expect.stringMatching(/^namespace: .*platform_\*/)])
    expect(sdkVerdict({ tier: 'domain', type: 'counter', name: 'portal_unknown_total', labels: [] })).toEqual([expect.stringMatching(/^registry: /)])
    expect(sdkVerdict({ tier: 'domain', type: 'counter', name: 'iam_auth_events_total', labels: [] })).toEqual([expect.stringContaining('domain "portal"')])
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

  it('fails a compliant metric that the inventory does not list, and a broken one twice', () => {
    const files = [{ path: 'src/x.ts', source: "getServiceMeter().counter('portal_web_shell_c_total', 'C.', [])\ngetServiceMeter().counter('bad', 'B.', [])" }]
    expect(check({ files, inventory: new Set(['portal_web_shell_c_total']) })).toEqual([
      expect.stringMatching(/^src\/x\.ts:2: [a-z_]+: metric "bad"/), // the SDK reports the first rule a metric breaks
      'src/x.ts:2: "bad" is not in docs/observability.md § Inventory',
    ])
  })
})

describe('this repository', () => {
  it('passes: identity from src/app/bootstrap/bootstrap.tsx, and the inventory lists no metric yet', () => {
    expect(identityOf(readFileSync(join(root, 'src/app/bootstrap/bootstrap.tsx'), 'utf8'))).toEqual({ service: 'web-shell', domain: 'portal' })
    expect(inventoryNames(readFileSync(join(root, 'docs/observability.md'), 'utf8')).size).toBe(0)
  })
})
