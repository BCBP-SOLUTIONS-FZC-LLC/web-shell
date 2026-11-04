# web-shell — Low-Level Design

## Tender Management SaaS Platform — Browser Shell

| | |
|---|---|
| **Repository** | `github.com/BCBP-SOLUTIONS-FZC-LLC/web-shell` (private) |
| **Artifact** | Static bundle served by nginx (`ghcr.io/bcbp-solutions-fzc-llc/web-shell`), never installed as a package (`app1`, `"private": true`, `0.0.0`) |
| **Platform SDK** | `@bcbp-solutions-fzc-llc/frontend-sdk`, `webpack-preset`, `eslint-plugin` `1.0.0-alpha.3`, pinned exactly, all three on one version |
| **Status** | Not tagged or deployed. Everything is `[Unreleased]` in [CHANGELOG.md](../../CHANGELOG.md) |
| **Owners** | `@BCBP-SOLUTIONS-FZC-LLC/web-shell` (CODEOWNERS) |

### Revision history

| Date | Change |
|---|---|
| 2026-11-04 | Production-readiness fixes: login photo weight, nginx gzip and baseline headers, dotfile 404s, accessibility, missing-context notice, Try again |
| 2026-11-04 | First LLD. Describes `main` after the move to the SDK on Rsbuild (#16), app2 on SDK hooks (#17), the IAM role map (#18), the audit follow-ups (#19), SDK `1.0.0-alpha.3` (#20) and the e2e and smoke suites (#21) |

### Table of Contents

1. [Document overview](#1-document-overview)
2. [Responsibilities and boundaries](#2-responsibilities-and-boundaries)
3. [Architecture and module layout](#3-architecture-and-module-layout)
4. [Domain model and contracts](#4-domain-model-and-contracts)
5. [Initialisation order](#5-initialisation-order)
6. [Key flows](#6-key-flows)
7. [Failure handling](#7-failure-handling)
8. [Security](#8-security)
9. [Configuration and storage](#9-configuration-and-storage)
10. [Hosting](#10-hosting)
11. [Observability](#11-observability)
12. [Testing](#12-testing)
13. [CI/CD](#13-cicd)
14. [Compatibility](#14-compatibility)
15. [Open items](#15-open-items)

---

## 1. Document overview

This LLD is the contract for the shell: what it owns, what the SDK owns for it, the order it starts the page in, the files it serves, and how each is tested. [ARCHITECTURE.md](../../ARCHITECTURE.md) is the narrative with diagrams; [README.md](../../README.md) is how to run it; [VERSIONING.md](../../VERSIONING.md) is the release contract.

### 1.1 Relationship to other documents

| Document | What this LLD takes from it |
|---|---|
| `platform-reactcommon` `docs/design/frontend-sdk-design.md` | §C1 (the ports a shell implements: `/auth` `WorkspaceResolver`, `SessionContextSource`), §C2 (shell bootstrap order), §C3 (web distribution: SPA rule, cache, CSP) |
| `platform-reactcommon` `docs/lld/platform-reactcommon-lld.md` | §5.4 behaviour of `ApiClient`, `IdentityProvider`, `loadRemote`, boundaries; §6.2 initialisation order; §12.1 `runtime.json` schema; §12.3 reserved storage keys |
| `platform-reactcommon` `examples/shell` | The reference shell. `src/platform/iam.ts` and the bootstrap follow it; differences are listed in §2.3 |
| `iam-org-membership` LLD rev 2.47 | PUB-1 `GET /api/v1/public/tenants/resolve`, P-35 `GET /api/v1/me/session-context`, the closed role set (§5.4) and member-management grants (§10.4) |

### 1.2 Rule: no copies of SDK behaviour

The shell implements only what the SDK leaves to a shell: the screens, the two IAM ports, consent, the role map, and the routes. PKCE, tokens, refresh, idle timeout, cross-tab sign-out, workspace caching, the `/t/<slug>/` URL, telemetry, remote loading, chunk integrity and the shared map are the SDK's and the preset's. A change to any of those is made in `platform-reactcommon`.

---

## 2. Responsibilities and boundaries

### 2.1 In scope

| Area | Module |
|---|---|
| Async boundary and the fatal "unavailable" message | `src/index.ts` |
| The SDK start-up sequence and session handling | `src/bootstrap.tsx` |
| Signed-in routes and the dashboard `RemoteBoundary` | `src/App.tsx` |
| IAM ports: PUB-1 → `Workspace`, P-35 → `SessionContext` | `src/platform/iam.ts` |
| Session screens: email sign-in, signed out, session ended, device clock, wrong workspace, workspace not found | `src/platform/SessionScreens.tsx`, `src/platform/screen.tsx` |
| Login layouts, email form, remember-email | `src/pages/*` |
| Consent stand-in | `src/platform/consent.ts` |
| Role → UI permission map | `src/platform/permissions.ts` |
| Build (`shell` host), `/version.json` | `rsbuild.config.ts` |
| Dev-only platform stand-ins | `config/dev-platform.mjs` |
| Static hosting | `nginx/default.conf`, `Dockerfile` |

### 2.2 Out of scope (owned elsewhere)

| Concern | Owner |
|---|---|
| Credentials, MFA, token issuance, realms | Keycloak |
| PKCE, token handling, refresh, idle timeout, cross-tab sign-out, workspace cache | SDK `/auth` |
| Tenant resolution, session context, roles, authorization decisions | IAM services, the gateway (AuthZ Enrichment) |
| Dashboard screens, user management | `mfe-dashboard` (remote `app2`) |
| Each environment's `/config/runtime.json`, `/remotes/manifest.json`, CSP and security headers | Deploy pipeline, CloudFront |
| Cluster rollout | Operators. A tag publishes an image; nothing deploys it |

### 2.3 Differences from the SDK's reference shell

| Reference shell (`examples/shell`) | This shell | Why |
|---|---|---|
| Slug-or-email identifier form | Email-only form on the existing login layouts (`LoginPage`, `LoginPage1` for `?variant=login1`) | Product layout; the email doubles as `login_hint` |
| Example role map | `IAM_ROLES` closed set with §10.4 grants (§4.3) | IAM's roles |
| No remember-email | `bcbp.rememberEmail`, `bcbp.loginEmail` in `localStorage` | Needed before a workspace exists, when the SDK's `storage()` ignores writes |
| Webpack | Rsbuild 2 with `pluginPlatform({ role: 'shell' })` | Same Module Federation v1 protocol; remotes built with any of the three load |

---

## 3. Architecture and module layout

```
src/
  index.ts                  async boundary → bootstrap(); showUnavailable on a throw
  bootstrap.tsx             the only module that wires platform/ and renders #app
  App.tsx                   BrowserRouter (basename /t/<slug>), /dashboard/* → RemoteBoundary app2 ./App
  platform/
    iam.ts                  toWorkspace, toSessionContext, workspaceResolver, sessionContextSource
    permissions.ts          IAM_ROLES, permissions (role → action:resource)
    consent.ts              cmp: essential only until accept()
    SessionScreens.tsx      askForWorkspace and the dialogs
    screen.tsx              #shell-screen host (fixed overlay outside #app)
  pages/                    LoginPage, LoginPage1, useEmailSignIn, rememberEmail, loginVariant
  components/BrandLogo.tsx
  theme/, index.css         Tailwind 4 and daisyUI theme
  globals.d.ts              __ENVIRONMENT__, __BUILD_VERSION__
config/                     dev only: runtime.local.json, remotes.local.json, dev-platform.mjs
public/                     config/runtime.json (prod defaults), remotes/manifest.json ({}), images, favicons
nginx/default.conf          the image's server
test/                       unit, integration, e2e, fixtures, smoke (§12)
```

### 3.1 Dependency rules

| Module | May import |
|---|---|
| `platform/iam.ts`, `consent.ts`, `permissions.ts` | SDK subpaths only |
| `platform/screen.tsx` | `react-dom/client` |
| `platform/SessionScreens.tsx` | `pages/*`, `iam`, `screen`, SDK types |
| `pages/*`, `components/*` | Each other. Never `platform/` or the SDK |
| `App.tsx` | `react-router-dom`, SDK `/react` |
| `bootstrap.tsx` | Everything above; every SDK subpath it initialises |
| `index.ts` | `bootstrap.tsx`, dynamically |

The SDK is imported through public subpaths only. `@bcbp-solutions-fzc-llc/eslint-plugin` `configs.recommended` on `src/` fails a root or deep import, identity headers, raw `window.*Storage`, unsafe HTML and non-template API paths; `npm run lint` runs with `--max-warnings 0` in `validate-quality`.

SDK subpaths `src/` uses: `/core`, `/config`, `/tracing`, `/logging`, `/metrics`, `/flags`, `/auth`, `/http`, `/authz`, `/i18n`, `/mfe`, `/security`, `/react`.

### 3.2 Build

`rsbuild.config.ts`: `pluginReact()`, `pluginPlatform({ role: 'shell' })`, and `pluginVersionJson` (emits `/version.json` = `{ "version": BUILD_VERSION }`).

| Setting | Value | Reason |
|---|---|---|
| Entry | `index: ./src/index.ts` | Emits `index.html` |
| `source.define` | `__ENVIRONMENT__` (`PLATFORM_ENVIRONMENT`, default `prod` / `local` in dev), `__BUILD_VERSION__` | The only compiled-in values |
| `output.distPath` | css, font, image, svg, media, wasm, assets → `assets` | Every hashed file under `/assets/` (immutable). JS paths are the preset's |
| `inlineScripts`, `inlineStyles` | `false` | CSP `script-src 'self'`, `style-src 'self'` |
| `tools.cssLoader.url` | `false` | Root-relative `url()` points at `public/` |
| `dev` | `hmr: false`, `liveReload: true`, port 5001, `strictPort` | No HMR client in a federated page |

The preset provides: container `shell`, a `var` library, strict singletons for `react`, `react-dom` (and their JSX/client entries), `@opentelemetry/api` and every SDK subpath (`ProvideSdkRspackPlugin`), `GlobalThisOnlyPlugin` (no `Function('return this')`), `ChunkIntegrityPlugin` (sha384 on the entry in `index.html` and every lazy chunk), `crossOriginLoading: 'anonymous'`, hidden source maps.

---

## 4. Domain model and contracts

### 4.1 PUB-1 → `Workspace` (`toWorkspace`)

`GET /api/v1/public/tenants/resolve?identifier=<email or slug>`, no token (`auth: false`), rate-limited per IP.

| PUB-1 response | `Workspace` |
|---|---|
| `found !== true`, or `realm` missing or empty | `undefined` (the screen shows the generic message) |
| `strategy: 'shared'` | `{ realm, trial: true, slug?: identifier (only when it was not an email), tenantIdHint?: tenant_id }` |
| otherwise | `{ realm, trial: false, slug?: realm minus auth.paidRealmPrefix (when it starts with it) }` |

`auth.paidRealmPrefix` defaults to `tenant-` (as in the SDK's example). A paid realm must be `tenant-<slug>`: the SDK refuses to cache a workspace whose slug and realm disagree. Tested against the SDK's `contracts/tenant-resolve-cases.json`.

### 4.2 P-35 → `SessionContext` (`toSessionContext`)

`GET /api/v1/me/session-context` with the bearer token.

| P-35 | `SessionContext` |
|---|---|
| `tenant_id`, `slug` | `tenantId`, `slug` |
| `roles`, `departments`, `feature_flags` (may be `null`) | `roles`, `departments`, `featureFlags` (never `null`, default `[]`) |
| `read_only` | `readOnly` (`true` only when `true`) |
| `plan`, `mfa_freshness_seconds`, `locale` | `plan`, `mfaFreshnessSeconds`, `locale` (only when present) |

Tested against `contracts/session-context-cases.json`.

### 4.3 Role map (`permissions.ts`)

Keys are IAM's closed role set: `member`, `tenant_owner`, `tenant_admin`, `tender_admin`. Department levels (`preparator`, `reviewer`, `approver`) are never roles.

| Role | Grants |
|---|---|
| `member` | `read:tender`, `read:members` |
| `tender_admin` | member + `update:tender`, `delete:tender` |
| `tenant_admin` | tender_admin + `manage:members` |
| `tenant_owner` | same as `tenant_admin` (the signup owner usually holds `tenant_owner` without `tenant_admin`) |

`setAuthorizer(roleMapAuthorizer(permissions))`; the subject is `{ roles, tenantId }` from P-35, or none (deny all). These are UI hints; the gateway and services authorise every request. Tender grants are provisional until Tender Service confirms them.

### 4.4 Shell value (`PlatformProvider shell`)

| Field | Source | Read by remotes through |
|---|---|---|
| `user` | `session.user` | `useCurrentUser()` |
| `workspace` | `session.workspace` | `useWorkspace()` |
| `context` | P-35, or `undefined` | `useSessionContext()`, `useHasPermission()`, `useFeatureFlag()` |
| `locale` | `document.documentElement.lang` (set by `initializeI18n`) | `useLocale()` |
| `switchWorkspace(identifier)` | PUB-1, then `idp.switchWorkspace`; not found → "Workspace not found" | `useSwitchWorkspace()` |
| `signOut(o)` | `idp.logout(o)`; global unless `{ global: false }` | `useSignOut()` |

### 4.5 Remote contract

| Item | Value |
|---|---|
| Remote | `app2`, module `./App`, default export a component |
| Props | None |
| Entry | `/remotes/manifest.json` `{ "app2": { entry, version, ownerDomain, integrity? } }`; `integrity` required outside `local`, `dev`, `test` |
| Build | `@bcbp-solutions-fzc-llc/webpack-preset` remote (`pluginPlatform({ role: 'remote', name: 'app2', exposes: { './App': … } })` or the webpack/Rspack equivalents), SDK `import: false` |
| Route template | `/t/:slug/dashboard` (`useRouteTemplate` in `App.tsx`) |

---

## 5. Initialisation order

`src/index.ts` does `import('./bootstrap').then(m => m.bootstrap())` (the Module Federation async boundary) and catches into `showUnavailable`, which replaces `#app` with "The app is unavailable right now. Please try again later."

| # | Call | Notes |
|---|---|---|
| 1 | `installTrustedTypesPolicy()` | No-op without Trusted Types |
| 2 | `initializeCore({ serviceName: 'web-shell', domain: 'portal', environment: __ENVIRONMENT__, buildVersion: __BUILD_VERSION__ })` | Registry-validated identity |
| 3 | `loadRuntimeConfig()` → `setRuntimeConfig(cfg)` | Strict schema. Any throw up to here is fatal (§7) |
| 4 | `setConsentProvider(cmp)` | |
| 5 | `initializeTracing`, `initializeLogging`, `initializeMetrics` (`cfg.telemetry`), `installGlobalErrorHandlers()`, `startWebVitals()` | |
| 6 | `setFlagProvider(runtimeConfigFlagProvider())` | Platform flags only, until P-35 |
| 7 | `idp = createOidcProvider(cfg.auth, workspaceResolver)`, `setTokenSource(initializeAuth(idp))`, `session = await idp.init()` | May redirect once with `prompt=none` and never settle |
| 8 | Anonymous → §6.1 and return | The app is not rendered |
| 9 | `isWrongWorkspace(session.workspace, session.user)` → `showWrongWorkspace(idp)` and return | Not cached, never rendered |
| 10 | `idp.subscribe(...)` | §6.4, §6.5 |
| 11 | `sessionContextSource.load()` | Failure → `warn 'session context unavailable'`, context `undefined` |
| 12 | `setAuthorizer(roleMapAuthorizer(permissions))`, `setAuthzSubject(context && { roles, tenantId })` | |
| 13 | With a context: `setFlagProvider(sessionContextFlagProvider(context))`, `rememberWorkspace({ ...session.workspace, slug: context.slug })` | Moves the URL under `/t/<slug>/` |
| 14 | `initializeI18n({ defaultLocale, supported })` | |
| 15 | `loadManifest()` | Failure → `error 'manifest load failed'`; the app still renders |
| 16 | `startVersionPolling()` | `/version.json` every `appUpdate.pollIntervalMs` |
| 17 | `hideScreen()`, `createRoot(#app).render(<StrictMode><PlatformProvider shell={…}><App basename?/></PlatformProvider></StrictMode>)` | `basename = workspacePathPrefix + slugFromPath(...)` when the URL has a slug |

`test/integration/bootstrap.test.tsx` asserts this order with every SDK subpath replaced by a recording fake.

---

## 6. Key flows

### 6.1 Signed-out page load

| `session.reason` | Action |
|---|---|
| `signed-out` | `showSignedOut(signIn)`: waits for a click. An automatic login would ride the live SSO session and undo the logout |
| `device-clock` | `showDeviceClock(signIn)`: waits for a click |
| `none`, `login-required` | `signIn()` now |

`signIn()` picks the workspace in this order:

1. The workspace a failed silent attempt named (`reason: 'login-required'`).
2. `chooseWorkspace({ pathname, resolver, cfg })`: the `/t/<slug>` in the URL (cached or resolved through PUB-1), else the most recently cached workspace.
3. `askForWorkspace()`: the email screen. PUB-1 resolves the email; "not found", 429 and unreachable all show "We could not find a workspace for that email."

Then `idp.login({ workspace, loginHint? })`. The hint is the typed email, or the remembered email for a known workspace. `returnUrl` defaults to the current page in the SDK, and after a sign-out the SDK adds `prompt=login` itself; the shell passes neither.

### 6.2 Callback

Keycloak redirects to `{origin}{auth.redirectPath}` (`/auth/callback`). The SDK checks `iss` and `state`, exchanges the code with the PKCE verifier, keeps the tokens in memory, and moves the URL back to the page the user opened. The bootstrap continues at step 9.

### 6.3 Silent restore

A reload or a new tab: `idp.init()` may redirect once with `prompt=none`. A live SSO session returns authenticated; otherwise `login-required` with the workspace (§6.1, case 1).

### 6.4 Expiry during use

`expired` → `showSessionEnded(s, …)` over the running app, text by cause (`serverEnded`: the workspace may have moved to its own plan; `idle`; other). "Sign in" calls `signInAgain({ idp, state, resolver, cfg, ask })`, which re-resolves the workspace when the server ended the session and reuses the cache otherwise; `ask` is the email screen.

### 6.5 Sign-out

Here (a remote's `useSignOut()`) or in another tab (`BroadcastChannel('platform-auth')`): `anonymous`/`signed-out` → the app root is unmounted (so the previous user's data is not left under the dialog), then `showSignedOut(() => idp.login({ workspace }))`. A global sign-out navigates to the realm's end-session endpoint, which returns to `/`; that load shows the signed-out dialog (§6.1). The SDK clears per-workspace storage.

### 6.6 Workspace switch

`switchWorkspace(identifier)` from the shell value: PUB-1; not found → `showWorkspaceNotFound()`; else `idp.switchWorkspace(w)`.

### 6.7 Dashboard load

`/dashboard/*` → `useRouteTemplate('/t/:slug/dashboard')`, `<RemoteBoundary remote="app2" module="./App" fallback="Loading dashboard…">`. The SDK's `loadRemote`: kill switch (`remotes.killSwitch`, flag `remote.app2.disabled`), entry origin (page or `remotes.allowedOrigins`), classic `<script>` with `integrity`, timeout `remotes.loadTimeoutMs`, `retries`, container from `window.app2`, share-scope init. Any failure stays inside the boundary ("Something went wrong." / "Try again"); "Try again" asks the container again without a reload.

---

## 7. Failure handling

| Step | Posture | Result |
|---|---|---|
| Identity, `/config/runtime.json` | fatal | "The app is unavailable right now." with Try again (reload) + `console.error` |
| Silent restore | degrade | Signed-out flow |
| PUB-1 | stop on the screen | One generic message; retry |
| P-35 | degrade | Deny-all, platform flags, no `/t/<slug>/` move, `warn` log; `App` shows "We couldn't load your permissions…" with Reload (`role="status"`) |
| Manifest | degrade | `error` log; the boundary shows its error |
| Remote load or render | degrade | Boundary message, "Try again" |
| Telemetry export | ignore | SDK queues; nothing beyond `essential` without consent |
| `/healthz` | liveness only | Constant `ok`; does not check Keycloak, IAM or `app2` |

---

## 8. Security

| Topic | Rule | Where it holds |
|---|---|---|
| Client | Public OAuth client, PKCE S256, no secret | Runtime config has `clientId` only |
| Tokens | Memory only; never storage, `BroadcastChannel`, logs | SDK `/auth`; e2e asserts storage holds none |
| Identity headers | Never sent from the browser | SDK `/http`; `no-identity-headers` lint rule |
| API origin | Token to the page origin only, route templates | SDK `ApiClient`; `iam.ts` uses `/v1/...` templates |
| Login without a click | Never after logout, device-clock refusal or expiry | `showSignedOut`, `showDeviceClock`, `showSessionEnded`; bootstrap and e2e tests |
| Wrong workspace | App never rendered, workspace not cached | `isWrongWorkspace` before render |
| Shared device | App unmounted before "You are signed out" | `idp.subscribe` handler; e2e |
| Remote code | Runs in this origin; manifest-only entries, allowed origins, integrity outside local/dev/test | SDK `/mfe` |
| Script integrity | sha384 on the entry and every lazy chunk | Preset `ChunkIntegrityPlugin`; smoke checks the entry |
| CSP | Bundle is `script-src 'self'` and Trusted Types safe; headers come from CloudFront | Preset output, `inlineScripts: false`; smoke `live` mode checks headers |
| Generic errors | The email screen never says which input failed | `WORKSPACE_NOT_FOUND` |
| Image | uid 101, digest-pinned bases, registry token as BuildKit secret, no source maps | `Dockerfile`; smoke checks `.map` |

The full STRIDE table is in [ARCHITECTURE.md § Threat model](../../ARCHITECTURE.md#threat-model).

---

## 9. Configuration and storage

### 9.1 `/config/runtime.json`

Validated strictly by the SDK (unknown keys rejected). Schema: SDK LLD §12.1.

| Key | Image default (`public/config/runtime.json`) | Local (`config/runtime.local.json`) |
|---|---|---|
| `api` | `/api`, `timeoutMs` 35000, `propagationAllowlist` `[]` | same |
| `telemetry` | `/otel`, `sampleRatio` 0.1, `info`, `sendSessionHeader` | `/otel`, 1, `debug` |
| `auth.idpOrigin` · `clientId` | `https://auth.bcbpsolutions.com` · `tender-web` | `http://localhost:8080` · `app1` |
| `auth.trialRealm` · `paidRealmPrefix` · `workspacePathPrefix` | `trial` · `tenant-` · `/t/` | same |
| `auth.scopes` · `idleTimeoutMs` · `redirectPath` | `["openid"]` · 1800000 · `/auth/callback` | same |
| `remotes` | `killSwitch` `[]`, 10000 ms, `retries` 2, `allowedOrigins` `[]` | `retries` 1, `allowedOrigins` `["http://localhost:5002"]` |
| `i18n` · `appUpdate` | `en` · 300000 ms | same |

### 9.2 Build-time constants

`PLATFORM_ENVIRONMENT` → `__ENVIRONMENT__` (`local`, `dev`, `test`, `staging`, `prod`); `BUILD_VERSION` → `__BUILD_VERSION__` and `/version.json`; `SOURCE_DATE_EPOCH`. `NODE_AUTH_TOKEN` is install-time only (BuildKit secret `npm_token` in the image).

### 9.3 Browser storage

| Key | Store | Written by |
|---|---|---|
| `@bcbp-solutions-fzc-llc/frontend-sdk:*` (workspace cache, session id, last activity, last user, signed-out mark) | `localStorage` | SDK. No tokens |
| `<namespace>:<appId>:<key>` | `localStorage` | Remotes through `storage(appId)`; cleared on sign-out |
| `bcbp.rememberEmail`, `bcbp.loginEmail` | `localStorage` | `pages/rememberEmail.ts`, only when "Remember Email" is checked; every access in `try` |

---

## 10. Hosting

### 10.1 nginx (`nginx/default.conf`, port 8080, uid 101)

| Location | Behaviour |
|---|---|
| server | `server_tokens off`; gzip (css, js, json, svg, text, html) with `Vary`; on every response (`add_header_inherit merge`): `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy` |
| `= /healthz` | `200 ok`, no access log |
| `= /config/runtime.json`, `= /remotes/manifest.json`, `= /version.json` | `no-cache`, 404 when absent |
| `= /index.html` | `no-cache` |
| `^~ /assets/` | `public, max-age=31536000, immutable`; 404 when absent |
| `~ /\.` (dotfiles) | 404 |
| `~ ^/(api\|otel\|csp-report\|config\|remotes\|assets)(/\|$)` | 404 when absent; never `index.html` |
| `~ \.[^/]*$` (any path with an extension) | `no-cache`; 404 when absent |
| `/` | `no-cache`; `try_files $uri /index.html` |

This is the platform's SPA rule (`platform-reactcommon` `examples/cloudfront/spa-rewrite.js`): only extension-less paths are app routes. nginx sets no CSP or HSTS: CloudFront does, and a second CSP here would be enforced alongside it.

### 10.2 Image

Builder `node:26-bookworm@sha256:…`: `npm ci` with the `npm_token` secret, `npm run build`, delete `*.map`. Runtime `nginxinc/nginx-unprivileged:1.31-alpine@sha256:…`, `apk upgrade`, `dist/` as uid 101. Ships `public/config/runtime.json` and `{}` as the manifest; an environment serves its own over those paths (CloudFront or a mount).

### 10.3 Dev server (`config/dev-platform.mjs`)

| Path | Answer |
|---|---|
| `GET /config/runtime.json`, `/remotes/manifest.json` | `config/*.local.json`, `no-cache` |
| `POST /otel/*` | `204` |
| `GET /api/v1/public/tenants/resolve` | Any non-empty identifier → `DEV_REALM` (default `tenant-bcbp`), `dedicated` |
| `GET /api/v1/me/session-context` | 401 without a bearer; else slug from the realm, roles `DEV_ROLES` (default `member,tenant_owner`) |
| other `/api/*` | 404 problem, or proxied to `DEV_API_URL` (502 problem when unreachable) |

None of it reaches the bundle or the image.

---

## 11. Observability

Identity: `service.name` `web-shell`, domain `portal`, environment `__ENVIRONMENT__`, version `__BUILD_VERSION__`. Telemetry goes to same-origin `/otel` and is consent-gated; the stand-in CMP grants `essential` only, so only `error` and essential `warn` logs leave the page today.

| Event | Level | When |
|---|---|---|
| `session context unavailable` | `warn` | P-35 failed (§5 step 11) |
| `manifest load failed` | `error` | `loadManifest` rejected (§5 step 15) |
| `the app could not start` | `console.error` only | Fatal start-up error (telemetry may not exist yet) |

Everything else (API spans, remote load logs and metrics, web vitals, global errors) is emitted by the SDK. Route grouping: `useRouteTemplate('/t/:slug/dashboard')`.

---

## 12. Testing

Vitest 5, happy-dom at `http://localhost:5001/`, Testing Library. `vitest.config.ts` defines the two build constants and **inlines the SDK** (`server.deps.inline`) so `vi.resetModules()` gives each simulated page load a fresh SDK. `test/setup.ts` stubs `fetch` and `location.assign/replace` for DOM tests and skips its DOM setup in `@vitest-environment node` files. Coverage of `src/**/*.{ts,tsx}` is gated at 95% on all four metrics (`.github/scripts/coverage-gate.mjs`); today it is 100%.

| Layer | Path | Real SDK | What it locks |
|---|---|---|---|
| Unit | `test/unit/` | partly (`createTestPlatform`, `mockApi`, `roleMapAuthorizer`) | PUB-1/P-35 mappings against the SDK's contract cases, the entry point, remember-email, consent, the role map, the screen host, `BrandLogo`, the login variant, the dev middleware (node env, real HTTP) |
| Integration | `test/integration/` | no (`vi.mock` recording fakes) | The bootstrap's exact order and every branch, login layouts and carousel (only current and next photo fetched), session screens (alerts, dialog focus), `App` routes and the missing-context notice, axe-core over every shell screen (`accessibility.test.tsx`, colour contrast excluded) |
| End to end | `test/e2e/shell.test.tsx` | yes | Email → PUB-1 → PKCE → callback → `app2` under `/t/acme/dashboard`; tokens never stored; deep link; role map reaching the remote; deny-all; failing remote and Try again; global sign-out with no silent sign-in after; device clock; unknown email |
| Smoke | `test/smoke/deployment.test.ts` | yes (config and manifest validation) | Against `SMOKE_BASE_URL`: the SPA rule, Cache-Control, entry integrity, no maps, 404s, `/healthz`; `image` mode adds nginx's baseline headers, gzip, no version, dotfile 404s; `live` mode adds CloudFront's CSP, HSTS and nosniff |

E2E seams (`test/fixtures/`): `FakeKeycloak` (authorize via `approve()`, token endpoint with PKCE check and refresh rotation), `FakeNetwork` (route table on the page origin; `/otel` → 204), `FakeBroadcastChannel`. Only the remote's entry `<script>` is stubbed: it defines `window.app2` exposing a dashboard built on SDK hooks. A page load clears `globalThis[Symbol.for('@bcbp-solutions-fzc-llc/frontend-sdk')]`, resets modules, and imports the bootstrap again; storage is kept.

Not covered here: real browser engines under the production CSP (the SDK's `test/browser` suite does that for the SDK; §15).

---

## 13. CI/CD

| Workflow | Gate |
|---|---|
| `ci.yml` → `validate-test.yml` | `npm ci`, `npm run test:coverage`, coverage gate 95%, `npm run build` |
| `ci.yml` → `validate-quality.yml` | ESLint `--max-warnings 0`, `npm run typecheck`, workflow hygiene, LF, digest pins, `.dockerignore`, `npm audit --omit=dev --audit-level=high` |
| `ci.yml` `build-image` | Hadolint, Buildx cache build `web-shell-ci-test` |
| `ci.yml` `trivy` | Unfixed CRITICAL/HIGH/UNKNOWN fail; SBOM artifact |
| `ci.yml` `smoke` | `smoke-tests.sh`: ≤ 200 MB, startup gate, then `npm run test-smoke` (`SMOKE_MODE=image`) against the container |
| `ci.yml` `push` | `main`/`master`: GHCR branch and `sha-<short>` tags, Cosign keyless sign |
| `changelog-check.yml` | `CHANGELOG.md` required when `src/`, `package*.json`, `Dockerfile`, `nginx/`, `rsbuild.config.ts`, `config/**`, `public/config/**` or `index.html` change |
| `release.yml` | `vX.Y.Z[-*]`: re-validate, changelog section, dist tarball, semver image tags, scan, SBOM, SLSA, Cosign, GitHub Release |

Every `npm ci` reads `@bcbp-solutions-fzc-llc/*` from GitHub Packages with `GITHUB_TOKEN` (`packages: read`); each package grants this repository read under "Manage Actions access".

---

## 14. Compatibility

| Peer | Rule |
|---|---|
| SDK | Pinned exactly; the shell shares it as `1.0.0-alpha.3` under the preset's range `^1.0.0-0` |
| Remotes | A remote built with the preset requires `^<its SDK version>`: it must not be newer than the shell's. **Upgrade the shell first**, then remotes |
| React | Strict singleton `^19.0.0` from the preset; the shell ships 19.3 |
| `mfe-dashboard` (`app2`) | Rsbuild remote with `pluginPlatform({ role: 'remote', name: 'app2' })`, async-only chunk splitting, reads the user and sign-out through SDK hooks, takes no props. Verified end to end on 2026-11-04 (owner sees Invite; member does not; logout asks for the password again) |
| Keycloak | Each workspace realm registers `{origin}/auth/callback` and the origin as post-logout redirect for the client |

Details: [VERSIONING.md](../../VERSIONING.md).

---

## 15. Open items

| # | Item | Owner |
|---|---|---|
| 1 | `index.html` loads Geist and Inter from Google Fonts; the platform CSP (`style-src 'self'; font-src 'self'`) blocks them. Self-host under `/assets/` | this repo |
| 2 | No real-browser suite under the production CSP (the SDK's `test/browser` pattern). Blocked on item 1 | this repo |
| 3 | Consent is a stand-in (`essential` only). Wire the real CMP | this repo + CMP |
| 4 | SDK features not used yet: `useAppUpdate` / `subscribeAppUpdate` (polling runs, but the user is never told), `registerNavigator` (a remote's `navigate()` does a full load), i18n `detect` from P-35 `locale` | this repo |
| 5 | `no-raw-storage` catches `window.localStorage` but not bare `localStorage` | `platform-reactcommon` |
| 6 | PUB-1 and P-35 must exist behind `/api` in every environment; they are stubbed only in dev | IAM |
| 7 | No cluster deploy; each environment serves its own runtime config and manifest | operators |
| 8 | Tender permissions in the role map are provisional | Tender Service |
