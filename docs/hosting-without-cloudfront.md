# Hosting without CloudFront (interim)

CloudFront is not available yet (expected next month). Until then the image serves the shell directly behind a load balancer or ingress, which must do the two CloudFront jobs the image does not: **one origin for every path** and **the security headers**. Everything here is undone when CloudFront arrives ([below](#when-cloudfront-arrives)).

## What replaces CloudFront

| CloudFront job (platform design §C3) | Until then |
|---|---|
| TLS | The load balancer or ingress terminates TLS |
| One origin: `/` the shell, `/remotes/dashboard/<version>/` the dashboard's files, `/api/*` the gateway, `/otel/*` the collector, `/csp-report` the collector | The ingress routes the same path prefixes to those services; everything else goes to this image. nginx answers 404 for `/api`, `/otel`, `/csp-report` and missing `/remotes` files, so a routing mistake shows as a 404, never as `index.html` |
| CSP and `Reporting-Endpoints` | Mount [`nginx/security.d/csp.conf.example`](../nginx/security.d/csp.conf.example) as `/etc/nginx/security.d/csp.conf`, with this environment's Keycloak origin in `connect-src` **and `form-action`** (the global sign-out POSTs a form to it) |
| HSTS | Mount [`nginx/security.d/hsts.conf.example`](../nginx/security.d/hsts.conf.example) as `/etc/nginx/security.d/hsts.conf` (HTTPS-only hosts) |
| SPA rewrite, `nosniff`, `Referrer-Policy`, `X-Frame-Options`, COOP, `Permissions-Policy`, Cache-Control, gzip | Already in the image (`nginx/default.conf`) |
| Edge cache | None: nginx serves every request. `/assets/` is `immutable`, so browsers still cache it |

Each environment also mounts its own `/config/runtime.json` and `/remotes/manifest.json` over the image's defaults (README § Production image).

## The dashboard: same origin (recommended) or its own

**Same origin.** The ingress routes `/remotes/dashboard/` to the dashboard's files. The manifest entry is `/remotes/dashboard/<version>/remoteEntry.js` with the integrity from the dashboard's `remote-manifest-entry.json`. The CSP example works unchanged. This is the layout CloudFront will have, so nothing changes for the dashboard later.

**Its own origin** (say `https://dashboard.<domain>`), only if path routing is impossible. All of these, or the dashboard does not load:

| Where | Change |
|---|---|
| `csp.conf` | Add the dashboard origin to `script-src`, `style-src`, `img-src`, `font-src` and `connect-src` |
| `runtime.json` | `remotes.allowedOrigins: ["https://dashboard.<domain>"]` |
| Manifest | An absolute `entry` on that origin |
| Dashboard responses | `Access-Control-Allow-Origin: <shell origin>` and `Cross-Origin-Resource-Policy: cross-origin` on every file (scripts, styles, fonts, images) |

## Mounts

```bash
docker run -d -p 8080:8080 \
  -v "$PWD/runtime.json:/usr/share/nginx/html/config/runtime.json:ro" \
  -v "$PWD/manifest.json:/usr/share/nginx/html/remotes/manifest.json:ro" \
  -v "$PWD/csp.conf:/etc/nginx/security.d/csp.conf:ro" \
  -v "$PWD/hsts.conf:/etc/nginx/security.d/hsts.conf:ro" \
  ghcr.io/bcbp-solutions-fzc-llc/web-shell:<tag>
```

In Kubernetes, the same four files as ConfigMap volumes at those paths (`readOnlyRootFilesystem: true` works: nothing is written at start).

## Check it

```bash
SMOKE_BASE_URL=https://<host> SMOKE_MODE=live npm run test-smoke
```

`live` mode fails without the CSP (including the IdP in `form-action`), HSTS of at least a year, or `nosniff`, and checks the SPA rule, caching, integrity and the runtime files. Then sign in, open the dashboard, and sign out: the sign-out must reach Keycloak (the next sign-in asks for the password).

## When CloudFront arrives

1. Configure CloudFront's behaviours for the same paths and its response-headers policy (`platform-reactcommon` `examples/cloudfront`), with the IdP in `form-action`.
2. **Remove the `security.d` mounts.** CloudFront's CSP and this one would both be enforced, and a page must satisfy both.
3. Re-run `SMOKE_MODE=live` against the CloudFront host.
