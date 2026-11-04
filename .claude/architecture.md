# Architecture reference

Condensed from [ARCHITECTURE.md](../ARCHITECTURE.md) and the [LLD](../docs/lld/web-shell-lld.md) (§3, §10, §12). Those win on conflict.

## Repository layout

| Path | What it is |
|---|---|
| `src/index.ts` | `import('./bootstrap')` (Module Federation async boundary); `showUnavailable` replaces `#app` on a throw |
| `src/bootstrap.tsx` | SDK start-up order, session branches, `idp.subscribe`, render inside `PlatformProvider` |
| `src/App.tsx` | `BrowserRouter` (basename `/t/<slug>` when the URL has one); `/dashboard/*` → `RemoteBoundary remote="app2" module="./App"`; `*` → `/dashboard` |
| `src/platform/iam.ts` | `toWorkspace` (PUB-1), `toSessionContext` (P-35), `workspaceResolver`, `sessionContextSource` over a lazy `createApiClient()` |
| `src/platform/permissions.ts` | `IAM_ROLES`, `permissions` (role → `action:resource`) |
| `src/platform/consent.ts` | `cmp`: `essential` until `accept()` |
| `src/platform/SessionScreens.tsx` | `askForWorkspace`, `showSignedOut`, `showDeviceClock`, `showSessionEnded`, `showWrongWorkspace`, `showWorkspaceNotFound`, `WORKSPACE_NOT_FOUND` |
| `src/platform/screen.tsx` | `#shell-screen` fixed overlay host: `showScreen`, `hideScreen`, `resetScreen` |
| `src/pages/` | `LoginPage` (latest), `LoginPage1` (`?variant=login1`), `useEmailSignIn`, `rememberEmail`, `loginVariant` |
| `rsbuild.config.ts` | `pluginReact`, `pluginPlatform({ role: 'shell' })`, `pluginVersionJson`; output, CSS, dev server |
| `config/` | Dev only: `runtime.local.json`, `remotes.local.json`, `dev-platform.mjs` (+ `.d.mts`) |
| `public/` | `config/runtime.json` (prod defaults), `remotes/manifest.json` (`{}`), images, favicons |
| `nginx/default.conf`, `Dockerfile` | The image |
| `keycloak/`, `scripts/`, `docker-compose.keycloak.yml` | Local realm `tenant-bcbp`, theme, compose and seed helpers |
| `test/` | `unit/`, `integration/`, `e2e/`, `fixtures/`, `smoke/`, `setup.ts` |
| `docs/` | `lld/`, `architecture/mermaid/*.mmd`, `pipeline/`, runbooks |

## Module rules

| Module | May import |
|---|---|
| `platform/iam.ts`, `consent.ts`, `permissions.ts` | SDK subpaths only |
| `platform/screen.tsx` | `react-dom/client` |
| `platform/SessionScreens.tsx` | `pages/*`, `iam`, `screen`, SDK types |
| `pages/*`, `components/*` | Each other; never `platform/` or the SDK |
| `App.tsx` | `react-router-dom`, SDK `/react` |
| `bootstrap.tsx` | Everything; the only module that renders `#app` |

SDK subpaths in use: `/core /config /tracing /logging /metrics /flags /auth /http /authz /i18n /mfe /security /react`. Tests also use `/testing` and `contracts/*.json`.

## Build

The preset owns: container `shell`, `var` library, strict singletons (`react`, `react-dom`, `@opentelemetry/api`, every SDK subpath), JS output paths, chunk integrity (sha384, also on the `index.html` entry), `crossOriginLoading: 'anonymous'`, hidden source maps. The shell sets only: entry `index`, `source.define` (`__ENVIRONMENT__`, `__BUILD_VERSION__`), non-JS `distPath` → `assets`, `inlineScripts/inlineStyles: false`, `cssLoader.url: false`, dev port 5001 with `hmr: false`. Never set Rsbuild's own `moduleFederation` (the plugin refuses it).

## Hosting (nginx)

| Location | Cache | Missing |
|---|---|---|
| every response | gzip; `nosniff`, Referrer-Policy, `X-Frame-Options: DENY`, COOP, Permissions-Policy (`add_header_inherit merge`); `server_tokens off` | — |
| `/\.` (dotfiles) | — | 404 |
| `/healthz` | — | constant `ok` |
| `/config/runtime.json`, `/remotes/manifest.json`, `/version.json`, `/index.html` | `no-cache` | 404 |
| `/assets/` | `immutable`, 1 year | 404 |
| `/(api\|otel\|csp-report\|config\|remotes\|assets)/…` | — | 404 |
| any path with an extension | `no-cache` | 404 |
| `/` (extension-less) | `no-cache` | `index.html` |

No CSP or HSTS from nginx; CloudFront sends the platform's (a second CSP would be enforced alongside it).

## Tests

| Layer | Notes |
|---|---|
| `test/unit` | `iam.test.ts` uses `createTestPlatform` + `mockApi` and the SDK's `contracts/*-cases.json`; `dev-platform.test.ts` is `@vitest-environment node` with real HTTP |
| `test/integration` | `bootstrap.test.tsx` replaces every SDK subpath with recording fakes (`vi.mock`) and asserts the order |
| `test/e2e/shell.test.tsx` | Real bootstrap and SDK. `load(path)` = unmount roots, clear `globalThis[Symbol.for('@bcbp-solutions-fzc-llc/frontend-sdk')]`, `vi.resetModules()`, import the bootstrap again. Needs `server.deps.inline` for the SDK in `vitest.config.ts`. Stubs: the remote's entry `<script>` (defines `window.app2`), `location.assign/replace` (recorded), `createRoot` (tracked) |
| `test/fixtures` | `FakeKeycloak` (`approve()`, token endpoint, PKCE check, refresh rotation, `now` for clock skew), `FakeNetwork` (`on('GET /path', …)`, `sent(path)`), `FakeBroadcastChannel` |
| `test/smoke` | `vitest.smoke.config.ts`; `SMOKE_BASE_URL` required; `SMOKE_MODE` `image` (localhost default) or `live` |
