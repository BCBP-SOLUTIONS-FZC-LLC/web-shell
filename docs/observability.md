# Observability: web-shell under the Enterprise Platform Observability Standard

How the shell fits the platform's three metric tiers, what it emits, and how a metric is added. The standard's registry is platform-gincommon's `internal/obsregistry/registry.json`, synced into the SDK as `contracts/metric-registry.json` (58 metrics today: 50 Tier 1, 8 Tier 2; 6 approved, 52 proposed). The SDK enforces it whenever a metric is created; `npm run metrics-check` runs that same SDK check at build time over every metric `src/` creates, and adds the Inventory below.

## Identity and central labels

| | Value | Set by |
|---|---|---|
| `domain` | `portal` (registry vocabulary) | `initializeCore` in `src/app/bootstrap/bootstrap.tsx` |
| `service` | `web-shell` | same |
| `environment` | `local`, `dev`, `test`, `staging` or `prod` | the deployed `runtime.json` `environment` (SDK alpha.6), else build-time `PLATFORM_ENVIRONMENT` |
| Tier 3 prefix | `portal_web_shell_` | the SDK's `ServicePrefix` (`<domain>_<service>_`, snake_case) |

The SDK injects `domain`, `service` and `environment` into every data point (the standard's rule 8: instrumentation cannot omit or misspell them). Code never declares them as labels; `metrics-check` and the SDK both refuse it. Metrics export to the same-origin collector (`/otel/v1/metrics`, delta temporality, every 60 s); the platform's reference collector gateway also drops label keys outside the registry (platform-reactcommon `examples/collector`).

## Tiers for this shell

| Tier | Namespace | Who creates it here | How |
|---|---|---|---|
| 1 Platform shared | `platform_*` | **The SDK only.** The browser's Tier 1 metrics (`platform_web_*`: web vitals, remote loads, API client, errors) are proposed in platform-reactcommon (`docs/observability/tier1-ratification.md`) and record nothing until governance ratifies them and the SDK binds them | Nothing to do in this repo. App code never creates `platform_*` |
| 2 Domain shared | `portal_*` | Nothing yet: the registry has no `portal` domain metric | `getDomainMeter().counter('<registry name>')`, only after governance adds it to the registry |
| 3 Service specific | `portal_web_shell_*` | Nothing yet | `getServiceMeter().counter('portal_web_shell_<metric>_total', help, labels)` |

## Inventory

Metrics that web-shell's own code creates. `metrics-check` fails a metric in `src/` that this table does not list.

| Metric | Tier | Type | Labels | Meaning | Since |
|---|---|---|---|---|---|

None yet. The shell's signals today are SDK metrics (Tier 1, pending ratification) and logs:

| Signal | Kind | Where |
|---|---|---|
| `the app could not start` | essential error log | Alert `WebShellStartupFailures` (Loki, example rule): [runbook](runbook-startup-failure.md) |
| `session context unavailable` | warning log (each failed retry carries `attempt`) | LLD §11 |
| `manifest load failed` | error log | LLD §11 |
| Remote loads, API calls, web vitals, uncaught errors | SDK logs and spans today; SDK Tier 1 metrics once ratified | platform-reactcommon `docs/observability/runbooks.md` |

## Adding a metric

1. **Is the meaning shared across domains** (IAM, Workflow, Billing, …)? Then it is Tier 1: propose it to observability governance (platform-gincommon registry) and let the SDK bind it. Do not create it here.
2. **Shared by several `portal` services** with identical semantics? Tier 2: get it ratified into the registry first (name, labels, allowed values, aggregation), then `getDomainMeter().counter(name)` / `.histogram(name)`.
3. **Otherwise** Tier 3:
   ```ts
   import { getServiceMeter } from '@bcbp-solutions-fzc-llc/frontend-sdk/metrics'
   const meter = getServiceMeter()
   const fallbacks = meter.counter('portal_web_shell_example_total', 'What one increment means.', ['outcome'])
   ```
   - counters end in `_total`, histograms in `_seconds`;
   - labels: snake_case, at most 8, never `domain`/`service`/`environment` (injected), never unbounded values (`user_id`, `email`, `tenant_id`, `request_id`, `event_id`, `session_id`, `trace_id`, `url`, `path`, … and any `*_id`, `*_email`, `*_ip`, `*_uuid`, `*_token`);
   - name and labels as literals (the check reads them);
   - add a row to the Inventory above, and any dashboard, alert or SLO that uses it to this file.
4. `npm run metrics-check`, then the usual gates.

## Dashboards, alerts, recording rules, SLOs, HPA

None live in this repository: there is no Helm chart, Kubernetes manifest, dashboard or Prometheus rule file here. The platform's browser dashboards, alerts and SLOs for `platform_web_*` are proposed in platform-reactcommon (`monitoring/prometheus/platform-web.rules.yml`, `docs/observability/runbooks.md`). The one alert this repo defines is log-based (`WebShellStartupFailures`, [runbook](runbook-startup-failure.md)). A future shell metric's dashboards and rules are listed with it in the Inventory.

## Migration

No legacy or non-compliant metric: the shell has never created one, so there is nothing to emit in parallel or sunset. A rename of a metric listed above would follow the standard's compatibility period (old and new in parallel; dashboards, alerts, recording rules, SLOs, HPA moved; old one deprecated, then removed).
