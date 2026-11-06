# Architecture reference

Condensed from [ARCHITECTURE.md](../ARCHITECTURE.md) and the [LLD](../docs/lld/web-shell-lld.md) (§3, §10, §12). Those win on conflict.

## Repository layout

| Path | What it is |
|---|---|
| `src/index.ts` | `import('./bootstrap')` (Module Federation async boundary); `showUnavailable` replaces `#app` on a throw |
| `src/bootstrap.tsx` | SDK start-up order, session branches, `idp.subscribe`, render inside `ShellRoot`, P-35 background retry, start-up failure report (`the app could not start`), `registerNavigator` |
| `src/App.tsx` | `BrowserRouter` (basename `/t/<slug>` when the URL has one, keyed by it); `/dashboard/*` → `RemoteBoundary remote="dashboard" module="./App"`; `*` → `/dashboard`; `onRouter` hands `navigate` to the bootstrap; update banner and missing-context notice |
| `src/platform/iam.ts` | `toWorkspace` (PUB-1), `toSessionContext` (P-35), `workspaceResolver`, `sessionContextSource` over a lazy `createApiClient()` |
| `src/platform/permissions.ts` | `IAM_ROLES`, `permissions` (role → `action:resource`) |
| `src/platform/SessionScreens.tsx` | `askForWorkspace`, `showSignedOut`, `showDeviceClock`, `showSessionEnded`, `showWrongWorkspace`, `showWorkspaceNotFound`, `WORKSPACE_NOT_FOUND` |
| `src/application/` | `signIn.ts` (`SignInUseCases`), `use-cases/resolveWorkspace.ts`, `use-cases/requestPasswordReset.ts` (ports injected) |
| `src/domain/` | `repositories/rememberedEmail.ts` (contract), `errors.ts` (`WorkspaceNotFoundError`) |
| `src/shared/i18n/` | `en.json` (every user-facing word, keyed), `catalogues.ts` (catalogue by tag → language → English), `index.ts`: `useShellText` (React), `shellText`, `ShellKey` |
| `src/platform/shellMessages.ts` | `registerShellMessages`: registers the `shell` namespace and loads it before any screen (bootstrap only) |
| `src/platform/rememberedEmail.ts` | `localStorageRememberedEmail` (the one raw-storage file) |
| `src/platform/screen.tsx` | `#shell-screen` fixed overlay host: `showScreen`, `hideScreen`, `resetScreen` |
| `src/platform/sessionContext.ts` | `isTransient`, `retrySessionContext` (1 s, 2 s, 4 s; abortable), `createStore` |
| `src/platform/ShellRoot.tsx` | `PlatformProvider` with the live context (store) and locale (`useLocale`) |
| `src/platform/navigator.ts` | `shellNavigator(navigate, basename)`: under the basename → router, else a full load |
| `src/pages/` | `LoginPage`, `useEmailSignIn` (submit, forgot password; the remembered-email repository is a prop), `links` + `PageLinks` (help/legal, shown only with a URL) |
| `src/assets/images/` | Carousel photos and the logo, imported so they ship content-hashed under `/assets/` |
| `src/platform/passwordReset.ts` | `passwordResetUrl(workspace)`: Keycloak `login-actions/reset-credentials` from `getConfig().auth` |
| `rsbuild.config.ts` | `pluginReact`, `pluginPlatform({ role: 'shell' })`, `pluginVersionJson`; output, CSS, dev server |
| `config/` | Dev only: `runtime.local.json`, `remotes.local.json`, `dev-platform.mjs` (+ `.d.mts`) |
| `public/` | `config/runtime.json` (prod defaults), `remotes/manifest.json` (`{}`), favicons |
| `nginx/default.conf`, `Dockerfile` | The image |
| `nginx/security.d/*.conf.example` | CSP and HSTS to mount at `/etc/nginx/security.d/` where no CloudFront fronts the image (until next month: every environment) |
| `keycloak/`, `scripts/`, `docker-compose.keycloak.yml` | Local realm `tenant-bcbp`, theme, compose and seed helpers |
| `test/` | `unit/`, `integration/`, `e2e/`, `fixtures/`, `smoke/`, `browser/` (Playwright: `shell.spec.ts`, `dashboard.spec.ts`, `server.ts`), `setup.ts` |
| `playwright.config.ts` | The browser suite: three engines, one worker, HTTPS servers from `test/browser/global-setup.ts` |
| `docs/` | `lld/`, `architecture/mermaid/*.mmd`, `pipeline/`, runbooks (coverage gate, image scan, release, start-up failure), `hosting-without-cloudfront.md` |
| `.github/scripts/` | CI and release scripts: coverage gate, bundle budget, smoke, release asset (source maps → artifact), release notes, provenance (`imagetools`) |

## Module rules

| Module | May import |
|---|---|
| `platform/iam.ts`, `permissions.ts`, `passwordReset.ts`, `sessionContext.ts`, `navigator.ts` | SDK subpaths only (`navigator.ts` none) |
| `platform/ShellRoot.tsx` | React, SDK `/react` and `/auth` types |
| `platform/screen.tsx` | `react-dom/client` |
| `platform/SessionScreens.tsx` | `pages/*`, `screen`, `application/signIn` (injected use cases), `domain/errors`, `shared/i18n`, SDK `/auth` types; no other `platform/` module, no other SDK runtime |
| `application/` | `domain/`, SDK types; no React, no browser APIs |
| `domain/` | SDK types only |
| `pages/*`, `components/*` | Each other, `domain/` and `application/` types, `shared/i18n`; never `platform/`, the SDK, storage, the network or navigation |
| `shared/i18n` | SDK `/i18n`, `/react`; no shell layer (lint) |
| `platform/shellMessages.ts` | `shared/i18n`, SDK `/i18n` |
| `App.tsx` | `react-router-dom`, SDK `/react`, `shared/i18n` |
| `bootstrap.tsx` | Everything; the only module that renders `#app` |

Layer rows (`domain/`, `application/`, presentation incl. `SessionScreens.tsx`) are ESLint rules in `eslint.config.js`; `test/unit/layer-rules.test.ts` proves each fires. Fix a violation by injecting a port from the bootstrap, never by widening the rule.

SDK subpaths in use: `/core /config /tracing /logging /metrics /flags /auth /http /authz /i18n /mfe /nav /problem /security /react`. Tests also use `/testing` and `contracts/*.json`.

## Build

The preset owns: container `shell`, `var` library, strict singletons (`react`, `react-dom`, `@opentelemetry/api`, every SDK subpath), JS output paths, chunk integrity (sha384, also on the `index.html` entry), `crossOriginLoading: 'anonymous'`, hidden source maps. The shell sets only: entry `index`, `source.define` (`__ENVIRONMENT__`, `__BUILD_VERSION__`), non-JS `distPath` → `assets`, `inlineScripts/inlineStyles: false`, `cssLoader.url.filter` (root-relative `url()`s left as written, relative ones bundled), dev port 5001 with `hmr: false`. The preset's `SdkVersionPlugin` fails a build whose installed SDK is not the preset's version. Never set Rsbuild's own `moduleFederation` (the plugin refuses it).

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

No CSP or HSTS in the image. CloudFront sends the platform's; until it exists (next month), each environment mounts `nginx/security.d/csp.conf` and `hsts.conf` (`include /etc/nginx/security.d/*.conf`). Never both: two CSPs are both enforced. See `docs/hosting-without-cloudfront.md`.

## Tests

| Layer | Notes |
|---|---|
| `test/unit` | `iam.test.ts` uses `createTestPlatform` + `mockApi` and the SDK's `contracts/*-cases.json`; `dev-platform.test.ts` is `@vitest-environment node` with real HTTP |
| `test/integration` | `bootstrap.test.tsx` replaces every SDK subpath with recording fakes (`vi.mock`) and asserts the order |
| `test/e2e/shell.test.tsx` | Real bootstrap and SDK. `load(path)` = unmount roots, clear `globalThis[Symbol.for('@bcbp-solutions-fzc-llc/frontend-sdk')]`, `vi.resetModules()`, import the bootstrap again. Needs `server.deps.inline` for the SDK in `vitest.config.ts`. Stubs: the remote's entry `<script>` (defines `window.__platform_mfe_dashboard`), `location.assign/replace` (recorded), `HTMLFormElement#submit` (the sign-out POST, recorded), `createRoot` (tracked) |
| `test/fixtures` | `FakeKeycloak` (`approve()`, token endpoint, PKCE check, refresh rotation, `now` for clock skew), `FakeNetwork` (`on('GET /path', …)`, `sent(path)`), `FakeBroadcastChannel` |
| `test/smoke` | `vitest.smoke.config.ts`; `SMOKE_BASE_URL` required; `SMOKE_MODE` `image` (localhost default) or `live` (CSP incl. `form-action`, HSTS, nosniff) |
| `test/browser/shell.spec.ts` | Production build in Chromium, Firefox, WebKit over HTTPS with the production CSP; fake Keycloak on a second origin; a stub remote on the shared SDK. 6 cases × 3 engines. Not in `npm test` |
| `test/browser/dashboard.spec.ts` | Same, with a real mfe-dashboard build (`REMOTE_DIST`). 3 cases × 3 engines; CI `Dashboard contract` (informational) |
