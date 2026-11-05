# Runbook: the shell does not start

**Alert:** `WebShellStartupFailures` (proposed; ops deploys it). In the style of `platform-reactcommon` [`docs/observability/runbooks.md`](https://github.com/BCBP-SOLUTIONS-FZC-LLC/platform-reactcommon/blob/main/docs/observability/runbooks.md).

## Signal

When `bootstrap()` throws after `initializeCore`, the shell logs one **essential error** before it shows "The app is unavailable right now." (`src/bootstrap.tsx`, LLD §5 step 3, §11):

| Field | Value |
|---|---|
| Body | `the app could not start` |
| Severity | `ERROR` (essential: sent without consent) |
| Resource | `service.name=web-shell`, `service.namespace=portal`, `service.version=<BUILD_VERSION>`, `deployment.environment.name=<env>` |
| Attributes | `error` (serialised by the SDK: type, message, stack, with URL queries and tokens removed) |
| Sent to | `telemetry.otlpBaseUrl` from `/config/runtime.json`; the default `/otel` when that file never arrived |

The collector gateway forwards logs to Loki over OTLP (`examples/collector/gateway.yaml`, `LOGS_OTLP_ENDPOINT`). Loki indexes `service.name` as the label `service_name`.

Nothing is reported when `initializeCore` itself throws (no identity to report under) or when the browser cannot reach `/otel` at all (offline, or the collector is down). The user's console still has the error.

## Alert (example)

A Loki ruler rule. Adjust the environment label to the one your Loki maps from `deployment.environment.name`:

```yaml
groups:
  - name: web-shell
    rules:
      - alert: WebShellStartupFailures
        # More than 5 failed starts in 10 minutes: a broken deploy or environment, not one user's network.
        expr: sum by (service_version) (count_over_time({service_name="web-shell"} |= "the app could not start" [10m])) > 5
        for: 5m
        labels:
          severity: critical
          team: frontend
        annotations:
          summary: "web-shell {{ $labels.service_version }} fails to start"
          runbook_url: https://github.com/BCBP-SOLUTIONS-FZC-LLC/web-shell/blob/main/docs/runbook-startup-failure.md
```

Grouping by version separates "this release is broken" from "this environment is broken". If `service_version` is not an index label in your Loki, group by it in the query instead (`| json` or structured metadata) or drop the `by`.

## Diagnosis

Read the `error` attribute of a few records. Then:

| `error.type` / message | Cause | Action |
|---|---|---|
| `RuntimeConfigError` | `/config/runtime.json` missing (404), not JSON, failing the SDK's schema, or slower than 10 s | `curl -i https://<host>/config/runtime.json`; validate it with `SMOKE_BASE_URL=https://<host> SMOKE_MODE=live npm run test-smoke`. Check the deploy wrote this environment's file, not the image's default |
| Errors naming `createOidcProvider` / `auth` config | `auth.idpOrigin`, `clientId` or realm settings in `runtime.json` invalid for this environment | Fix the environment's `runtime.json`; compare with `public/config/runtime.json` |
| Errors from `idp.init` (token or network) | Keycloak unreachable or the redirect URI not registered for this origin | Check `https://<idp>/realms/<realm>/.well-known/openid-configuration`; check the client's redirect and post-logout URIs include `<origin>/auth/callback` and `<origin>/` |
| A `TypeError` naming `TrustedScriptURL` or `TrustedHTML` | The CSP in front of the shell lists other Trusted Types policies than the platform's (`platform-sdk platform-webpack dompurify 'allow-duplicates'`) | Compare the response's `Content-Security-Policy` with `platform-reactcommon` `examples/cloudfront/csp.mjs` (or `nginx/security.d/csp.conf.example`); `SMOKE_MODE=live` checks the main directives |
| Anything else | A bug in this release | Find the release in `service_version`; reproduce with `npm run build && npm run test-browser`, which runs the build under the production CSP |

If the records stop at one `service_version`, roll back to the previous image tag and keep the failing one for investigation.

## Related

- The dashboard failing inside a running shell is **not** this alert: it is the SDK's `remote failed to load` (`PlatformWebRemoteLoadErrorBudgetBurn` in the platform runbooks). An alpha.3 dashboard behind an alpha.4 shell shows there as `incompatible`.
- `session context unavailable` warnings mean IAM P-35 failed. The shell still runs deny-all and retries; it is not a start-up failure.
