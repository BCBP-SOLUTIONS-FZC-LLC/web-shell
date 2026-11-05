# web-shell — Low-Level Design

## Tender Management SaaS Platform — Browser Shell

| | |
|---|---|
| **Repository** | `github.com/BCBP-SOLUTIONS-FZC-LLC/web-shell` (private) |
| **Artifact** | Static bundle served by nginx (`ghcr.io/bcbp-solutions-fzc-llc/web-shell`), never installed as a package (`web-shell`, `"private": true`; `version` = the latest tag) |
| **Platform SDK** | `@bcbp-solutions-fzc-llc/frontend-sdk`, `webpack-preset`, `eslint-plugin` `1.0.0-alpha.5`, pinned exactly, all three on one version |
| **Status** | Released: **`v0.2.0`** (remote `dashboard`, pairs with mfe-dashboard `v0.3.0`) is current and `latest`; **`v0.1.0`** (remote `app2`, pairs with mfe-dashboard `v0.2.0`) is kept as its rollback. Both were published by `release.yml` (signed, SBOM, SLSA provenance, tags added after signing). Not deployed yet ([CHANGELOG.md](../../CHANGELOG.md)). Pairs: web-shell `0.2.0` + mfe-dashboard `0.3.0`; `0.1.0` + `0.2.0`. Hosting until CloudFront (next month): [hosting-without-cloudfront.md](../hosting-without-cloudfront.md). Open: §15 |
| **Owners** | `@BCBP-SOLUTIONS-FZC-LLC/web-shell` (CODEOWNERS) |

### Revision history

| Date | Change |
|---|---|
| 2026-11-05 | Observability standard: inventory (`docs/observability.md`), `metrics-check` in CI |
| 2026-11-05 | Released `v0.1.0` and `v0.2.0`; status and open items updated |
| 2026-11-05 | Remote renamed `app2` → `dashboard` (breaking; pairs with mfe-dashboard `v0.3.0`) |
| 2026-11-05 | SDK `1.0.0-alpha.5` (optional `auth.signInUrl` for standalone remotes; host-page docs). Checked against mfe-dashboard `v0.1.1` (alpha.4) |
| 2026-11-05 | Docs aligned with `main` after #25–#27: status, layout, hosting until CloudFront, release workflow, compatibility, open items |
| 2026-11-05 | Release workflow fixed before its first run (#27): provenance via `imagetools`, release notes, `BUILD_VERSION` without `v`, source maps artifact |
| 2026-11-05 | Hosting until CloudFront (#26): ingress routing, mounted CSP and HSTS |
| 2026-11-05 | Release checks: dashboard contract test against a real mfe-dashboard build, optional mounted CSP in nginx, start-up failure runbook |
| 2026-11-05 | Launch hardening: background P-35 retry with a live provider, i18n `detect`, SDK navigator, start-up failure report, real-browser suite, bundle budget, hashed images, `LoginPage1` removed, package renamed `web-shell` |
| 2026-11-05 | SDK `1.0.0-alpha.4`: container global `__platform_mfe_app2`, global sign-out as a form POST (CSP `form-action` needs the IdP), `no-raw-storage` exemption for remember-email |
| 2026-11-04 | Launch decisions: self-hosted fonts, Forgot password → Keycloak reset, links shown only with official URLs, essential-only consent for v1, update banner |
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

The shell implements only what the SDK leaves to a shell: the screens, the two IAM ports, the role map, and the routes (consent is the SDK's essential-only default in v1). PKCE, tokens, refresh, idle timeout, cross-tab sign-out, workspace caching, the `/t/<slug>/` URL, telemetry, remote loading, chunk integrity and the shared map are the SDK's and the preset's. A change to any of those is made in `platform-reactcommon`.

Audit (2026-11-05) of `src/`, the tests and the CI scripts against platform-reactcommon. Nothing re-implements a published SDK, preset or lint-plugin behaviour. What the shell takes from platform-reactcommon's **unpublished** parts:

| In this repository | Taken from platform-reactcommon | Why it is here | To remove the copy |
|---|---|---|---|
| `platform/iam.ts`, `permissions.ts`, `SessionScreens.tsx`, `screen.tsx` | `examples/shell/src/*` (pattern) | The ports and screens every shell must own (design doc §C1); adapted (§2.3) | Not a copy to remove |
| `platform/sessionContext.ts` (`isTransient`, `retrySessionContext`, `createStore`), `platform/ShellRoot.tsx` | `examples/shell/src/session-context.ts`, `ShellRoot.tsx`, nearly verbatim; `isTransient` is now the SDK ApiClient's rule (429, 502–504, online network error, timeout), and background attempts send one request each (`loadSessionContextOnce`, `retry: false`) | The SDK exports no session-context retry and no `PlatformProvider` that reads a live context | SDK export requested (`platform-reactcommon-shell-helpers-export.md`) |
| `platform/passwordReset.ts` (`/realms/<realm>/login-actions/reset-credentials`) | The SDK's realm URL scheme (internal to `/auth`) | The SDK exports no realm-URL or password-reset builder | Same request |
| `nginx/security.d/csp.conf.example` (read by `test/browser/server.ts`) | `examples/cloudfront/csp.mjs` `buildCsp` | The CSP builder is not in any package; one copy here, enforced in three engines by the browser suite | Same request (publish `buildCsp`) |
| `test/fixtures/keycloak.ts`, `network.ts` | `test/fixtures/` (pattern) | The SDK's `/testing` `mockApi` answers only `api.baseUrl` routes; the e2e suite also needs `/config`, `/remotes` and `/otel` | Not a copy to remove |
| `.github/scripts/metrics-check.mjs` | — | Uses the SDK's own `getServiceMeter` / `getDomainMeter` as the verdict; restates no rule | — |

Removed as duplicates of the SDK (2026-11-05): `platform/consent.ts` (the runtime's default `ESSENTIAL_ONLY_CONSENT`), a second retry layer around the ApiClient's own GET retry, the restated `tenant-` default in `iam.ts`, and hand-built problem responses in the tests and dev server (now the SDK's `/testing` `mockProblem`).

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
| Login layouts, email form, remember-email, help and legal links (`links.ts`, `PageLinks.tsx`) | `src/pages/*` |
| Password reset hand-off to Keycloak | `src/platform/passwordReset.ts` |
| Update and missing-permissions notices | `src/App.tsx` (`useAppUpdate`, `useSessionContext`) |
| Consent (v1: essential only) | The SDK's default consent provider; the shell sets none |
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
| Dashboard screens, user management | `mfe-dashboard` (remote `dashboard`) |
| Each environment's `/config/runtime.json`, `/remotes/manifest.json`, CSP and security headers | Deploy pipeline, CloudFront |
| Cluster rollout | Operators. A tag publishes an image; nothing deploys it |

### 2.3 Differences from the SDK's reference shell

| Reference shell (`examples/shell`) | This shell | Why |
|---|---|---|
| Slug-or-email identifier form | Email-only form on the login page (`LoginPage`) | Product layout; the email doubles as `login_hint` |
| Example role map | `IAM_ROLES` closed set with §10.4 grants (§4.3) | IAM's roles |
| No remember-email | `bcbp.rememberEmail`, `bcbp.loginEmail` in `localStorage` | Needed before a workspace exists, when the SDK's `storage()` ignores writes |
| Webpack | Rsbuild 2 with `pluginPlatform({ role: 'shell' })` | Same Module Federation v1 protocol; remotes built with any of the three load |

---

## 3. Architecture and module layout

```
src/
  index.ts                  async boundary → bootstrap(); showUnavailable on a throw
  bootstrap.tsx             the only module that wires platform/ and renders #app
  App.tsx                   BrowserRouter (basename /t/<slug>), /dashboard/* → RemoteBoundary dashboard ./App
  platform/
    iam.ts                  toWorkspace, toSessionContext, workspaceResolver, sessionContextSource
    permissions.ts          IAM_ROLES, permissions (role → action:resource)
    SessionScreens.tsx      askForWorkspace and the dialogs
    sessionContext.ts       P-35 retry (isTransient, retrySessionContext) and the store the provider reads
    ShellRoot.tsx           PlatformProvider with the live context and locale
    navigator.ts            shellNavigator: the router as the SDK's navigate() target
    screen.tsx              #shell-screen host (fixed overlay outside #app)
  pages/                    LoginPage, useEmailSignIn, rememberEmail, links, PageLinks
  components/BrandLogo.tsx
  assets/images/            carousel photos and the logo, bundled into /assets/ with a hash
  theme/, index.css         Tailwind 4 and daisyUI theme
  globals.d.ts              __ENVIRONMENT__, __BUILD_VERSION__
config/                     dev only: runtime.local.json, remotes.local.json, dev-platform.mjs
public/                     config/runtime.json (prod defaults), remotes/manifest.json ({}), favicons
nginx/default.conf          the image's server
test/                       unit, integration, e2e, fixtures, smoke, browser (§12)
```

### 3.1 Dependency rules

| Module | May import |
|---|---|
| `platform/iam.ts`, `permissions.ts` | SDK subpaths only |
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
| Remote | `dashboard`, module `./App`, default export a component |
| Container global | `window.__platform_mfe_dashboard` (preset `containerName`, SDK alpha.4); a remote built with an older preset defines `dashboard` and fails as `incompatible` |
| Props | None |
| Entry | `/remotes/manifest.json` `{ "dashboard": { entry, version, ownerDomain, integrity? } }`; `integrity` required outside `local`, `dev`, `test` |
| Build | `@bcbp-solutions-fzc-llc/webpack-preset` remote (`pluginPlatform({ role: 'remote', name: 'dashboard', exposes: { './App': … } })` or the webpack/Rspack equivalents), SDK `import: false` |
| Route template | `/t/:slug/dashboard` (`useRouteTemplate` in `App.tsx`) |

---

## 5. Initialisation order

`src/index.ts` does `import('./bootstrap').then(m => m.bootstrap())` (the Module Federation async boundary) and catches into `showUnavailable`, which replaces `#app` with "The app is unavailable right now. Please try again later."

| # | Call | Notes |
|---|---|---|
| 1 | `installTrustedTypesPolicy()` | No-op without Trusted Types |
| 2 | `initializeCore({ serviceName: 'web-shell', domain: 'portal', environment: __ENVIRONMENT__, buildVersion: __BUILD_VERSION__ })` | Registry-validated identity |
| 3 | `loadRuntimeConfig()` → `setRuntimeConfig(cfg)` | Strict schema. Any throw from here on is fatal (§7): after `initializeCore` it is first logged as `error 'the app could not start'` (to `telemetry.otlpBaseUrl` once the config is read, else the default `/otel`) |
| 4 | (consent) | The SDK's default: essential only (v1). A consent manager would call `setConsentProvider` here |
| 5 | `initializeTracing`, `initializeLogging`, `initializeMetrics` (`cfg.telemetry`), `installGlobalErrorHandlers()`, `startWebVitals()` | |
| 6 | `setFlagProvider(runtimeConfigFlagProvider())` | Platform flags only, until P-35 |
| 7 | `idp = createOidcProvider(cfg.auth, workspaceResolver)`, `setTokenSource(initializeAuth(idp))`, `session = await idp.init()` | May redirect once with `prompt=none` and never settle |
| 8 | Anonymous → §6.1 and return | The app is not rendered |
| 9 | `isWrongWorkspace(session.workspace, session.user)` → `showWrongWorkspace(idp)` and return | Not cached, never rendered |
| 10 | `idp.subscribe(...)` | §6.4, §6.5 |
| 11 | `setAuthorizer(roleMapAuthorizer(permissions))`; `sessionContextSource.load()` into a store | Failure → `warn 'session context unavailable'`, context `undefined`. A sign-out from here on stops the boot (checked after every await) |
| 12 | `setAuthzSubject(context && { roles, tenantId })` | |
| 13 | With a context: `setFlagProvider(sessionContextFlagProvider(context))`, `rememberWorkspace({ ...session.workspace, slug: context.slug })` | Moves the URL under `/t/<slug>/` |
| 14 | `initializeI18n({ defaultLocale, supported, detect: () => context.locale })` | The user's IAM locale first, then the browser's languages |
| 15 | `loadManifest()` | Failure → `error 'manifest load failed'`; the app still renders |
| 16 | `startVersionPolling()` | `/version.json` every `appUpdate.pollIntervalMs` |
| 17 | `hideScreen()`, `createRoot(#app).render(<StrictMode><ShellRoot context={store} shell={…}><App basename? onRouter/></ShellRoot></StrictMode>)` | `basename = workspacePathPrefix + slugFromPath(...)` when the URL has a slug. `onRouter` → `registerNavigator(shellNavigator(navigate, basename))` |
| 18 | Without a context, and only when the first failure was transient (a network failure while online, a timeout, 429, 502, 503 or 504 (the SDK ApiClient's own rule); `isTransient`): `retrySessionContext` (1 s, 2 s, 4 s) over `loadSessionContextOnce` (`retry: false`: one request per attempt, the SDK's retries already ran on the first load) → `store.set`, step 12–13 again. A final answer (401, 403, 404) is not asked again | Stopped by a sign-out. The provider re-renders with the context; no reload. When `rememberWorkspace` moved the URL under `/t/<slug>/`, `App` is rendered again keyed by the new basename (and the navigator with it) |

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

### 6.1a Forgot password

"Forgot your password?" needs the typed email (an empty field shows "Enter your work email first…"). PUB-1 resolves it (failures show `WORKSPACE_NOT_FOUND`), then `location.assign(passwordResetUrl(workspace))`: `{auth.idpOrigin}/realms/{realm}/login-actions/reset-credentials?client_id={auth.clientId}`. Keycloak e-mails the reset link; the realm must have `resetPasswordAllowed`. No sign-in is started.

### 6.2 Callback

Keycloak redirects to `{origin}{auth.redirectPath}` (`/auth/callback`). The SDK checks `iss` and `state`, exchanges the code with the PKCE verifier, keeps the tokens in memory, and moves the URL back to the page the user opened. The bootstrap continues at step 9.

### 6.3 Silent restore

A reload or a new tab: `idp.init()` may redirect once with `prompt=none`. A live SSO session returns authenticated; otherwise `login-required` with the workspace (§6.1, case 1).

### 6.4 Expiry during use

`expired` → `showSessionEnded(s, …)` over the running app, text by cause (`serverEnded`: the workspace may have moved to its own plan; `idle`; other). "Sign in" calls `signInAgain({ idp, state, resolver, cfg, ask })`, which re-resolves the workspace when the server ended the session and reuses the cache otherwise; `ask` is the email screen.

### 6.5 Sign-out

Here (a remote's `useSignOut()`) or in another tab (`BroadcastChannel('platform-auth')`): `anonymous`/`signed-out` → the app root is unmounted (so the previous user's data is not left under the dialog), then `showSignedOut(() => idp.login({ workspace }))`. A global sign-out POSTs a hidden form to the realm's end-session endpoint (`id_token_hint`, `client_id`, `post_logout_redirect_uri`; the ID token stays out of URLs and history), which returns to `/`. The CSP `form-action` must allow the IdP origin, or the browser blocks the POST and the SSO session stays alive; that load shows the signed-out dialog (§6.1). The SDK clears per-workspace storage.

### 6.6 Workspace switch

`switchWorkspace(identifier)` from the shell value: PUB-1; not found → `showWorkspaceNotFound()`; else `idp.switchWorkspace(w)`.

### 6.6a New version

`startVersionPolling()` (§5 step 16) polls `/version.json`. When `useAppUpdate().available` turns true, `App` shows "A new version is available." with Reload (`role="status"`, top of the page). The reload is never forced.

### 6.7 Dashboard load

`/dashboard/*` → `useRouteTemplate('/t/:slug/dashboard')`, `<RemoteBoundary remote="dashboard" module="./App" fallback="Loading dashboard…">`. The SDK's `loadRemote`: kill switch (`remotes.killSwitch`, flag `remote.dashboard.disabled`), entry origin (page or `remotes.allowedOrigins`), classic `<script>` with `integrity`, timeout `remotes.loadTimeoutMs`, `retries`, container from `window.__platform_mfe_dashboard`, share-scope init. Any failure stays inside the boundary ("Something went wrong." / "Try again"); "Try again" asks the container again without a reload.

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
| `/healthz` | liveness only | Constant `ok`; does not check Keycloak, IAM or `dashboard` |

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
| CSP | Bundle is `script-src 'self'` and Trusted Types safe; fonts and styles are same-origin (`font-src 'self'`, `style-src 'self'`); headers come from CloudFront; without CloudFront, from a mounted `/etc/nginx/security.d/csp.conf` | Preset output, `inlineScripts: false`, self-hosted fonts; smoke `live` mode checks headers; the smoke job checks the image sends none by default and the mounted file adds it |
| Sign-out POST | CSP `form-action 'self' <idpOrigin>`: the SDK's global sign-out is a form POST to Keycloak | CloudFront; smoke `live` mode checks `form-action` contains the runtime config's `auth.idpOrigin` |
| Outbound links | Help and legal links open in a new tab with `rel="noopener noreferrer"`; unset links are not rendered | `PageLinks.tsx` |
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
| `@bcbp-solutions-fzc-llc/frontend-sdk:storage:<namespace>:<appId>:<key>` | `localStorage` | Remotes through `storage(appId)`; cleared on sign-out. Values under the pre-alpha.4 keys are not read |
| `bcbp.rememberEmail`, `bcbp.loginEmail` | `localStorage` | `pages/rememberEmail.ts`, only when "Remember Email" is checked; every access in `try`. The one file exempt from `no-raw-storage` (`eslint.config.js`) |

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

This is the platform's SPA rule (`platform-reactcommon` `examples/cloudfront/spa-rewrite.js`): only extension-less paths are app routes. nginx sets no CSP or HSTS: CloudFront does, and a second CSP here would be enforced alongside it. `include /etc/nginx/security.d/*.conf` (empty in the image) is for an environment without CloudFront, which mounts `nginx/security.d/csp.conf.example` and `hsts.conf.example` there: every environment until CloudFront is available (next month; [hosting-without-cloudfront.md](../hosting-without-cloudfront.md)).

### 10.2 Image

Builder `node:26-bookworm@sha256:…`: `npm ci` with the `npm_token` secret, `npm run build`, delete `*.map`. Runtime `nginxinc/nginx-unprivileged:1.31-alpine@sha256:…`, `apk upgrade`, `dist/` as uid 101. Ships `public/config/runtime.json` and `{}` as the manifest; an environment serves its own over those paths (CloudFront or a mount). Until CloudFront is available, environments follow [hosting-without-cloudfront.md](../hosting-without-cloudfront.md): path routing at the ingress, and the CSP and HSTS mounted under `/etc/nginx/security.d/`.

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

Identity: `service.name` `web-shell`, domain `portal`, environment `__ENVIRONMENT__`, version `__BUILD_VERSION__`. Telemetry goes to same-origin `/otel` and is consent-gated. v1 grants `essential` only (decision: no analytics consent manager), so only `error` and essential `warn` logs leave the page.

| Event | Level | When |
|---|---|---|
| `session context unavailable` | `warn` | P-35 failed (§5 step 11), and each failed retry (`attempt`) |
| `the app could not start` | `error` | Start-up threw after `initializeCore` (§5 step 3). Alert and diagnosis: [runbook](../runbook-startup-failure.md) |
| `manifest load failed` | `error` | `loadManifest` rejected (§5 step 15) |
| `the app could not start` | `console.error` only | Fatal start-up error (telemetry may not exist yet) |

Everything else (API spans, remote load logs and metrics, web vitals, global errors) is emitted by the SDK. Metrics follow the Enterprise Platform Observability Standard ([observability.md](../observability.md)): the shell creates none of its own today; the SDK injects `domain` `portal`, `service` `web-shell` and `environment`; Tier 1 `platform_web_*` is SDK-bound and pending ratification; a shell metric would be Tier 3 `portal_web_shell_*`, checked in CI by `metrics-check`. Route grouping: `useRouteTemplate('/t/:slug/dashboard')`.

---

## 12. Testing

Vitest 5, happy-dom at `http://localhost:5001/`, Testing Library. `vitest.config.ts` defines the two build constants and **inlines the SDK** (`server.deps.inline`) so `vi.resetModules()` gives each simulated page load a fresh SDK. `test/setup.ts` stubs `fetch` and `location.assign/replace` for DOM tests and skips its DOM setup in `@vitest-environment node` files. Coverage of `src/**/*.{ts,tsx}` is gated at 95% on all four metrics (`.github/scripts/coverage-gate.mjs`); today it is 100%.

| Layer | Path | Real SDK | What it locks |
|---|---|---|---|
| Unit | `test/unit/` | partly (`createTestPlatform`, `mockApi`, `roleMapAuthorizer`) | PUB-1/P-35 mappings against the SDK's contract cases, the entry point, remember-email, the role map, the screen host, `BrandLogo`, the login variant, the dev middleware (node env, real HTTP) |
| Integration | `test/integration/` | no (`vi.mock` recording fakes) | The bootstrap's exact order and every branch, login layouts and carousel (only current and next photo fetched), session screens (alerts, dialog focus), `App` routes and the missing-context notice, axe-core over every shell screen (`accessibility.test.tsx`, colour contrast excluded) |
| End to end | `test/e2e/shell.test.tsx` | yes | Email → PUB-1 → PKCE → callback → `dashboard` under `/t/acme/dashboard`; tokens never stored; deep link; role map reaching the remote; deny-all; failing remote and Try again; global sign-out (form POST to Keycloak) with no silent sign-in after; device clock; unknown email |
| Smoke | `test/smoke/deployment.test.ts` | yes (config and manifest validation) | Against `SMOKE_BASE_URL`: the SPA rule, Cache-Control, entry integrity, no maps, 404s, `/healthz`; `image` mode adds nginx's baseline headers, gzip, no version, dotfile 404s; `live` mode adds CloudFront's CSP (including `form-action` allowing the IdP), HSTS and nosniff |

E2E seams (`test/fixtures/`): `FakeKeycloak` (authorize via `approve()`, token endpoint with PKCE check and refresh rotation), `FakeNetwork` (route table on the page origin; `/otel` → 204), `FakeBroadcastChannel`. Only the remote's entry `<script>` is stubbed: it defines `window.__platform_mfe_dashboard` exposing a dashboard built on SDK hooks. A page load clears `globalThis[Symbol.for('@bcbp-solutions-fzc-llc/frontend-sdk')]`, resets modules, and imports the bootstrap again; storage is kept.

| Browser | `test/browser/shell.spec.ts` (Playwright) | the production build | Chromium, Firefox, WebKit over HTTPS with the production CSP and Trusted Types (`server.ts`), a fake Keycloak on a second origin, a remote stub on the shared SDK: fonts and hashed images with no third-party request, PKCE sign-in and the remote with integrity, `navigate()` without a reload, the sign-out form POST under `form-action`, the start-up failure at `/otel`, axe colour contrast (the logotype is exempt, WCAG 1.4.3). Any CSP report fails the test |
| Dashboard contract | `test/browser/dashboard.spec.ts` (`REMOTE_DIST`) | the production build | A real mfe-dashboard build served as `dashboard` with its own `remote-manifest-entry.json` integrity: it loads with its CSS and no CSP violation, every image it shows loads, the role map reaches it, its `NavLink` stays in the page, its Logout POSTs to Keycloak through the shell. A wrong integrity fails it |

---

## 13. CI/CD

| Workflow | Gate |
|---|---|
| `ci.yml` → `validate-test.yml` | `npm ci`, `npm run test:coverage`, coverage gate 95%, `npm run build`, `npm run budget` (entry 12 KB, JS+CSS 300 KB, largest 85 KB gzip; images 2.7 MB) |
| `ci.yml` → `validate-quality.yml` | ESLint `--max-warnings 0`, `npm run typecheck`, workflow hygiene, LF, digest pins, `.dockerignore`, `npm audit --omit=dev --audit-level=high` |
| `ci.yml` `build-image` | Hadolint, Buildx cache build `web-shell-ci-test` |
| `ci.yml` `trivy` | Unfixed CRITICAL/HIGH/UNKNOWN fail; SBOM artifact |
| `ci.yml` `smoke` | `smoke-tests.sh`: ≤ 200 MB, startup gate, then `npm run test-smoke` (`SMOKE_MODE=image`) against the container |
| `ci.yml` `dashboard-contract` | Builds mfe-dashboard (`vars.DASHBOARD_REF`, default `main`), then `REMOTE_DIST=… npm run test-contract`. Informational: does not gate `push` |
| `ci.yml` `browser` | Playwright browsers, `npm run build`, `npm run test-browser` (Chromium, Firefox, WebKit). Gates `push` |
| `ci.yml` `push` | `main`/`master`: GHCR branch and `sha-<short>` tags, Cosign keyless sign |
| `changelog-check.yml` | `CHANGELOG.md` required when `src/`, `package*.json`, `Dockerfile`, `nginx/`, `rsbuild.config.ts`, `config/**`, `public/config/**` or `index.html` change |
| `release.yml` | `vX.Y.Z[-*]`: re-validate, changelog section, dist tarball (`BUILD_VERSION` without the `v`), source maps as a workflow artifact, image pushed by digest, scan, SBOM, SLSA (BuildKit attestation via `imagetools`), Cosign, then the semver tags and `latest` on the signed digest (`tag-signed-image.sh`), GitHub Release |

Every `npm ci` reads `@bcbp-solutions-fzc-llc/*` from GitHub Packages with `GITHUB_TOKEN` (`packages: read`); each package grants this repository read under "Manage Actions access".

---

## 14. Compatibility

| Peer | Rule |
|---|---|
| SDK | Pinned exactly; the shell shares it as `1.0.0-alpha.5` under the preset's range `^1.0.0-0`. It loads remotes built on alpha.4 (`^1.0.0-alpha.4`) and alpha.5 |
| Remotes | A remote built with the preset requires `^<its SDK version>`: it must not be newer than the shell's. **Upgrade the shell first**, then remotes. A release that changes the shell–remote contract is the exception (alpha.4 changed the container global): the shell and every remote deploy together. `npm run test-contract` checks a pairing |
| React | Strict singleton `^19.0.0` from the preset; the shell ships 19.3 |
| `mfe-dashboard` (remote `dashboard`) | Rsbuild remote with `pluginPlatform({ role: 'remote', name: 'dashboard' })`, async-only chunk splitting, reads the user and sign-out through SDK hooks, takes no props. alpha.4 from its `main` and tag `v0.1.0` on. Contract suite (`dashboard.spec.ts`) on 2026-11-05 against `main` `e1b04c3` and branch `0be083c` (v0.1.1 prep): 9/9 in three engines (loads with its CSS and integrity, role map reaches it, `NavLink` without a reload, Logout through the shell's form POST). Its `v0.1.0` tag has no published release (its provenance step failed); `v0.1.1` is pending. An alpha.3 build does not load in this shell |
| Keycloak | Each workspace realm registers `{origin}/auth/callback` and the origin as post-logout redirect for the client |

Details: [VERSIONING.md](../../VERSIONING.md).

---

## 15. Open items

| # | Item | Owner |
|---|---|---|
| 1 | Official Privacy, Terms, Trust & Security and Help URLs: set them in `src/pages/links.ts` (hidden until then; none exists on bcbpsolutions.com) | product / legal |
| 3 | Consent is essential only in v1 (decision; the SDK's default). A consent manager would be installed with `setConsentProvider` in the bootstrap | product |
| 5 | Deploy in pairs: web-shell `0.2.0` + mfe-dashboard `0.3.0` (manifest key `dashboard`, `/remotes/dashboard/0.3.0/`), or `0.1.0` + `0.2.0` (`app2`). After a pair is deployed, environments may set `auth.signInUrl` (older SDKs refuse the key), then `SMOKE_MODE=live` | operators |
| 6 | PUB-1 and P-35 must exist behind `/api` in every environment; they are stubbed only in dev | IAM |
| 7 | No cluster deploy; each environment serves its own runtime config and manifest (with the remote's integrity) and registers its redirect URIs in each realm | operators |
| 8 | Tender permissions in the role map are provisional | Tender Service |
| 9 | No CloudFront until next month: environments route `/api`, `/otel`, `/csp-report`, `/remotes/dashboard/` at the ingress and mount the CSP (IdP in `form-action`) and HSTS ([hosting-without-cloudfront.md](../hosting-without-cloudfront.md)); remove the mounts when CloudFront arrives | operators |
| 10 | Keycloak realms need SMTP and "Forgot password" enabled for the reset flow (§6.1a); unconfirmed | Keycloak ops |
| 11 | The `WebShellStartupFailures` alert ([runbook](../runbook-startup-failure.md)) is an example; it must be deployed to the Loki ruler | operators |
