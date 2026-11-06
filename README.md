# web-shell

The browser shell for the BCBP micro-frontend platform. It runs the platform SDK's start-up sequence once for the whole page: identity, runtime config, telemetry, the Keycloak session, the workspace, permissions and flags. Then it renders the dashboard as a Module Federation remote (`dashboard`) inside this origin. The sign-in page and the session screens (signed out, session ended and so on) belong to the shell. Remotes initialise nothing; they read the shell's state through the SDK's hooks.

**Repository:** `github.com/BCBP-SOLUTIONS-FZC-LLC/web-shell`
**Runtime:** Node.js 26 · Rsbuild 2 (Rspack) · React 19.3 · `@bcbp-solutions-fzc-llc/frontend-sdk` `1.0.0-alpha.6` · private npm package `web-shell` (`"private": true`) · production image is nginx on port **8080**
**Contract:** Module Federation host `shell`, built with `@bcbp-solutions-fzc-llc/webpack-preset`. It provides React, React DOM, the OTel API and every SDK subpath to remotes, and exposes nothing. Versioning of the image and that contract is in [VERSIONING.md](./VERSIONING.md).
**Design:** [docs/lld/web-shell-lld.md](./docs/lld/web-shell-lld.md) is the contract (where it and the code disagree, fix one in the same PR). The platform SDK's design doc (`platform-reactcommon` `docs/design/frontend-sdk-design.md`, §C1 ports, §C2 shell bootstrap) defines what a shell must own. The structure follows the Frontend Architecture Constitution ([assessment](./docs/architecture/constitution-assessment.md), [ADRs](./docs/adr/README.md)).
**Status:** Released: **`v0.3.0`** (2026-11-06; remote `dashboard`, SDK `1.0.0-alpha.6`, pairs with mfe-dashboard `v0.3.0`) is current and `latest`; **`v0.2.0`** (remote `dashboard`, SDK alpha.5) is its rollback; **`v0.1.0`** (remote `app2`) is superseded. All were published by `release.yml` (signed, SBOM, SLSA provenance, tags added after signing). Not deployed yet. Deploy web-shell `0.3.0` with mfe-dashboard `0.3.0` (rollback: web-shell `0.2.0`, same dashboard). mfe-dashboard `0.4.0` (alpha.6) needs web-shell `0.3.0` or later. Until CloudFront exists (next month) environments follow [docs/hosting-without-cloudfront.md](./docs/hosting-without-cloudfront.md). What is still open: [LLD §15](./docs/lld/web-shell-lld.md#15-open-items).

---

## Mental model

| This shell owns | Lives elsewhere |
|---|---|
| The SDK bootstrap (`src/app/bootstrap/bootstrap.tsx`) and the routes of the signed-in app: `/t/<slug>/dashboard/*` renders the dashboard remote | Dashboard pages, navigation inside the dashboard and dashboard data (`mfe-dashboard`, loaded as `dashboard`) |
| The email sign-in page and the session screens. The SDK does Authorization Code + PKCE against the workspace's Keycloak realm and keeps tokens in memory | Credentials, password policy, MFA and token issuance (Keycloak). This repo ships a local realm and theme for development |
| The IAM ports: PUB-1 (email or slug → realm) and P-35 (session context), over the SDK's `ApiClient` | The IAM APIs themselves, tenant membership, roles and audit |
| The shell value remotes read through SDK hooks: the user, workspace, session context and sign-out (`PlatformProvider`) | Any other remote. Only `dashboard` is in the local manifest |
| Static hosting of `index.html`, hashed `/assets/`, `/config/runtime.json`, `/remotes/manifest.json`, `/version.json` and `GET /healthz` | Cluster deploy and each environment's runtime config and remote manifest. Publishing a tag pushes an image; it does not roll a cluster |

Everything environment-specific is read at run time from `/config/runtime.json`. Only the identity environment and build version are compiled into the bundle.

---

## Why this shell exists

The dashboard is a separate build. The browser still needs one origin that can:

- Sign the user in to the right workspace once, and give every remote the same session, token source, consent state and telemetry.
- Load each remote's `remoteEntry.js` from the remote manifest, and keep a single copy of React, the OTel API and the SDK.
- Keep serving the document when a remote is down. A failed remote stays inside its `RemoteBoundary` ("Something went wrong. / Try again") instead of blanking the page.

This is enforced structurally, not by convention:

- **Layers.** `src/` follows the constitution's folders: presentation → application → domain, with infrastructure implementing domain contracts and `app/` as the composition root. `eslint.config.js` and `npm run arch-lint` (`.dependency-cruiser.cjs`) fail any import across a layer the rules do not allow, in CI.
- **No copies of the SDK.** `test/unit/no-sdk-duplicates.test.ts` fails when a module-level name in `src/`, `config/` or `test/browser/server.ts` is an SDK export, so token handling, retries, remote loading and telemetry stay in the SDK.
- **No login without a click.** The e2e suite proves it after a sign-out and a device-clock refusal, and the bootstrap integration test after an expiry; the e2e suite also proves the app is unmounted before "You are signed out".

Local development runs the shell at `http://localhost:5001`.

---

## What the browser sees

There is no backend in this repository. The production process is nginx serving the Rsbuild `dist/` tree.

### Routes

Only an authenticated session renders the app. Before that, the bootstrap mounts the sign-in or session screens over the empty root.

| Path | Signed in |
|---|---|
| `/t/<slug>/dashboard/*` | `dashboard` `./App` inside `RemoteBoundary` |
| anything else under `/t/<slug>/` | Redirect to `/t/<slug>/dashboard` |
| `/auth/callback` | Handled by the SDK, then moved to the page the user opened |

After sign-in the SDK moves the URL under `/t/<slug>/` (`rememberWorkspace`), and the router uses that prefix as its basename. Without a session context there is no slug, and the routes start at the site root.

### Sign-in sequence

1. `src/app/bootstrap/index.ts` imports `src/app/bootstrap/bootstrap.tsx` behind the async boundary Module Federation needs.
2. The bootstrap loads `/config/runtime.json` and calls the SDK's `idp.init()`. A reload with a live Keycloak session is restored silently (`prompt=none`).
3. Signed out with a known workspace (the `/t/<slug>` in the URL, or the SDK's workspace cache): straight to that realm's authorize endpoint, with the remembered email as `login_hint`.
4. Otherwise the login page asks for the work email. `GET /api/v1/public/tenants/resolve?identifier=<email>` (PUB-1) returns the realm. "Not found" and "unreachable" show the same generic message.
5. Keycloak redirects to `{origin}/auth/callback`. The SDK checks `state`, exchanges the code with the PKCE verifier, and keeps the tokens in memory.
6. The bootstrap loads the session context (`GET /api/v1/me/session-context`, P-35), sets permissions and flags, caches the workspace, loads `/remotes/manifest.json`, and renders.

**Forgot your password?** resolves the typed email the same way and opens Keycloak's reset page for that realm (`/realms/{realm}/login-actions/reset-credentials`). Help and legal links appear only once their official URLs are set in `src/shared/constants/links.ts`. When a new deployment is live, "A new version is available." offers a reload.

Sign-out is global by default: the Keycloak session ends, every tab drops its tokens, the app unmounts, and "You are signed out" waits for a click. A session that expires during use shows "Session ended". The shell never redirects on its own.

### Federation contract

| Item | Value |
|---|---|
| Host | `shell` (`rsbuild.config.ts`, `pluginPlatform({ role: 'shell' })`) |
| Remote entries | `/remotes/manifest.json`: `{ "<name>": { "entry", "version", "ownerDomain", "integrity" } }`. `integrity` is required outside `local`, `dev` and `test` |
| Remote the shell renders | `dashboard`, module `./App` |
| Props this shell passes to `dashboard` `./App` | None. The remote uses `useCurrentUser()` and `useSignOut()` |
| Shared | `react`, `react-dom` (and their JSX and client entries), `@opentelemetry/api`, every SDK subpath. Strict singletons; a remote takes the SDK from the shell (`import: false`) |

A remote must be built with `@bcbp-solutions-fzc-llc/webpack-preset` (`role: 'remote'`); a Vite ES-module remote does not load through the SDK's `loadRemote`. `mfe-dashboard` is built that way (Rsbuild, `pluginPlatform({ role: 'remote', name: 'dashboard' })`), and it must not be built against a newer SDK than this shell's: upgrade the shell first.

### nginx paths

| Path | Behavior |
|---|---|
| `GET /healthz` | `200` and the text `ok`. No access log |
| `GET /` | Shell document. `index.html` is `Cache-Control: no-cache`. Only extension-less paths fall through to `index.html` (the platform's rule, `platform-reactcommon` `examples/cloudfront/spa-rewrite.js`); a missing file under `/api/`, `/otel/`, `/csp-report/`, `/config/`, `/remotes/`, `/assets/`, or any missing file with an extension, is 404 |
| `GET /config/runtime.json`, `/remotes/manifest.json`, `/version.json` | `no-cache`, `404` when the file is absent |
| `GET /assets/*` | Hashed files, `Cache-Control: public, max-age=31536000, immutable` |
| Dotfile paths (`/.git/…`, `/.env`) | `404` |
| Every response | gzip for text, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy`; no nginx version. CSP and HSTS come from CloudFront |

The container listens on **8080** as uid **101**.

---

## Input validation and error handling

The shell has one form (the work email) and reads three files it does not own (`/config/runtime.json`, `/remotes/manifest.json`, `/version.json`). Everything it shows the user comes from its own catalogue (`src/shared/i18n/en.json`), never from a server's message.

Errors from the platform's APIs are RFC 9457 problem responses. The SDK's `ApiClient` turns one into a `ProblemError` (`status`, `typeId`, `errorCode`, `requestId`). For example, a rate-limited PUB-1 call answers with the platform's type `platform/rate-limit-exceeded` (the SDK's `contracts/problem-types.json`):

```json
{
  "type": "https://errors.company.com/platform/rate-limit-exceeded",
  "title": "Too Many Requests",
  "status": 429,
  "errorCode": "RATE_LIMIT_EXCEEDED",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "timestamp": "2026-11-06T10:45:22Z"
}
```

The shell never shows `title` or `detail`: the sign-in screen maps every failure to a catalogue key.

### Notable validation rules

| Rule | Enforcement |
|---|---|
| The email is required and must look like an email | `<input type="email" required>`; the value is trimmed before PUB-1 |
| PUB-1 never reveals whether an email or a workspace exists | Not found, 429, unreachable and a malformed answer all become `WorkspaceNotFoundError` → "We could not find a workspace for that email." (`resolveWorkspaceUseCase`) |
| No error message from a server is shown | The session screens map every failure to `login.workspaceNotFound`, `login.error.signIn` or `login.error.passwordReset`; the error page (`AppError`) shows only a reference id |
| `/config/runtime.json` is validated strictly | The SDK refuses an unknown key, an invalid value, or an `environment` outside the platform's vocabulary: the page shows "The app is unavailable right now." and logs `the app could not start`. Smoke `live` fails a file that names another environment than the deployment's |
| Remote entries are trusted only when pinned | `/remotes/manifest.json` entries load only from the page's origin or `remotes.allowedOrigins`, with `integrity` required outside `local`, `dev`, `test`; a mismatch fails as a chunk-load error inside the remote's boundary |
| Identity headers are never sent | The `ApiClient` refuses `x-user-id`, `x-tenant-id`, `x-tenant-roles` and the rest: the gateway sets them from the verified token |
| Redirects after sign-in stay on this origin | The SDK checks return URLs with `isSafeRedirect`; the redirect URI is `{origin}{auth.redirectPath}` |
| Text is never rendered as HTML | React text only; `test/unit/shell-text.test.ts` fails a hard-coded literal, and the ESLint plugin forbids unsafe HTML |

---

## Architecture

```
web-shell/
├── src/
│   ├── app/                     # Composition root
│   │   ├── bootstrap/           # index.ts (async boundary, "unavailable" message), bootstrap.tsx (SDK start-up, session handling, wiring, render)
│   │   ├── providers/           # ShellRoot: PlatformProvider with the live session context
│   │   ├── routes/              # App.tsx: signed-in routes, dashboard RemoteBoundary
│   │   └── layouts/             # Full-screen host and the session-screen mounting
│   ├── presentation/            # pages/login, features/session-screens, components, widgets
│   ├── application/             # Use cases: resolve workspace, password reset, session context retry
│   ├── domain/                  # Contracts, errors, the role map
│   ├── infrastructure/          # api (PUB-1, P-35), auth (password reset), storage (remember email), federation (navigator), i18n
│   └── shared/                  # i18n (the shell's text), constants (links), ui (images, theme, CSS), types
├── .dependency-cruiser.cjs      # Architecture lint: components and their allowed dependencies
├── rsbuild.config.ts           # Platform plugin, React, Tailwind, dev server
├── config/                      # Dev only: runtime.local.json, remotes.local.json, dev-platform.mjs
├── public/                      # Static files; config/runtime.json and remotes/manifest.json defaults
├── eslint.config.js             # TypeScript, React hooks, platform rules
├── nginx/default.conf           # Runtime server for dist/
├── Dockerfile                   # Node 26 builder, nginx-unprivileged runtime
├── keycloak/                    # Local realm import (tenant-bcbp) and bcbp login theme
├── scripts/                     # Local Keycloak compose, health check, user seed
├── test/
│   ├── unit/                    # IAM mappings, entry point, small helpers, dev middleware
│   ├── integration/             # The login page, session screens, App, bootstrap (SDK faked)
│   ├── e2e/                     # The real shell and SDK, end to end
│   ├── fixtures/                # FakeKeycloak, FakeNetwork, FakeBroadcastChannel
│   ├── smoke/                   # GET-only checks against the served image or a deployment
│   └── browser/                 # Playwright: the build in three engines under the production CSP; the dashboard contract
├── vitest.config.ts             # happy-dom, build constants, SDK inlined; excludes test/smoke
├── vitest.smoke.config.ts       # test/smoke only, node environment
├── docs/                        # LLD, architecture diagrams, pipeline, runbooks
├── .claude/                     # Claude Code guidance, settings (hooks), hook scripts, reviewer agents, skills
├── .mcp.json                    # Claude Code MCP servers (context7, pinned)
├── .github/workflows/           # ci, test, quality, changelog, release
└── VERSIONING.md                # Image tags and how to cut a release
```

`src/` imports the SDK through public subpaths only (`@bcbp-solutions-fzc-llc/frontend-sdk/auth`, …); the ESLint plugin fails a root or deep import. `src/` never imports the dashboard's source.

### Dependency rules (enforced by ESLint and `npm run arch-lint` in CI)

| Layer | May import | Never |
|---|---|---|
| `domain/` | SDK types | React, the browser, any other layer |
| `application/` | `domain/`; SDK types and the `/problem` error classes | React, the browser, `infrastructure/`, `presentation/`, `app/` (ports are injected) |
| `infrastructure/` | `domain/`, `shared/i18n`, the SDK | `presentation/`, `application/`, `app/` |
| `presentation/` | `pages/`: `components/`, `domain/`, `application/` types, `shared/i18n`, `shared/constants`, `shared/ui`; `features/`: `pages/`, `components/`, `domain/`, `application/` types, `shared/i18n`, SDK `/auth` types; `components/`: `shared/i18n`, `shared/constants`, `shared/ui`; `widgets/`: `shared/i18n` | `infrastructure/`, `app/`, the SDK (features: `/auth` types only), `application/` values, `fetch`, storage, `location`, `history`, `navigator`, `open` |
| `shared/` | SDK `/i18n` and `/react` (`shared/i18n`); `shared/constants` → `shared/i18n` | Any shell layer |
| `app/` | `bootstrap.tsx` wires every layer except presentation and `shared/constants`; routes, providers and layouts only what they render or provide | — |

The full component map is in CONTRIBUTING (§ Architecture lint); `test/unit/layer-rules.test.ts` and `test/unit/arch-lint.test.ts` prove each rule fires.

### Storage and messaging

| Key or channel | Store | Purpose |
|---|---|---|
| `@bcbp-solutions-fzc-llc/frontend-sdk:*` | `localStorage` | SDK metadata: workspace cache (up to 20), session id, last activity, last user. No tokens |
| `bcbp.rememberEmail`, `bcbp.loginEmail` | `localStorage` | "Remember Email" on the login form only (`infrastructure/storage/rememberedEmail.ts`, the one raw-storage file) |
| `BroadcastChannel` `platform-auth` | Browser | SDK: sign-out and workspace switches reach every tab |
| Session context, tokens | Memory | Per page; tokens are never written to storage |

Remotes that need storage use `storage(appId)` from the SDK's `/storage`, namespaced per workspace. Details: ARCHITECTURE § Browser storage, § Cache strategy.

### Shared library dependencies

| Package | Version | What it provides |
|---|---|---|
| `@bcbp-solutions-fzc-llc/frontend-sdk` | `1.0.0-alpha.6` (exact) | Identity, runtime config, Keycloak sign-in (PKCE, tokens in memory), `ApiClient`, telemetry, authorization hints, flags, i18n, remote loading, navigation, Trusted Types, React hooks and `PlatformProvider`, test helpers |
| `@bcbp-solutions-fzc-llc/webpack-preset` | `1.0.0-alpha.6` (exact) | `pluginPlatform({ role: 'shell' })`: Module Federation host, the shared map, chunk integrity, `SdkVersionPlugin` |
| `@bcbp-solutions-fzc-llc/eslint-plugin` | `1.0.0-alpha.6` (exact) | Public-subpath imports, no identity headers, no raw storage, no unsafe HTML, API route templates |
| `react`, `react-dom` | 19.3 | Strict singletons shared with remotes |
| `react-router-dom` | 7 | The signed-in routes under `/t/<slug>/` |
| `@opentelemetry/api` | `1.10.0` (exact) | Strict singleton shared with remotes; the SDK's telemetry runs on it |
| Tailwind 4, daisyUI, `@fontsource-variable/*` | — | Shell-local UI and self-hosted fonts (ADR 0006) |
| `dependency-cruiser` | `18.7.0` (dev) | `npm run arch-lint` |

The three platform packages move together, shell before remotes (`/sdk-upgrade`, CONTRIBUTING).

---

## Integrating a remote with the shell

How a new micro-frontend joins the page. The checklist form, with the hosting side, is ARCHITECTURE § Host and remote checklist.

### 1. Prerequisites

Build the remote with `@bcbp-solutions-fzc-llc/webpack-preset` (`pluginPlatform({ role: 'remote', name: '<name>', exposes: { './App': … } })` in Rsbuild, or the preset's Rspack or webpack config), on an SDK version **no newer than the shell's** (`1.0.0-alpha.6` today). A Vite ES-module remote does not load through the SDK's `loadRemote`. The remote takes React and the SDK from the shell's share scope; it never bundles its own copy.

### 2. Register it in the manifest

Each environment's `/remotes/manifest.json` gets `{ "<name>": { "entry", "version", "ownerDomain", "integrity" } }`. `integrity` (sha384 of the entry) is required outside `local`, `dev` and `test`. An entry on another origin must be in `remotes.allowedOrigins` in `/config/runtime.json`.

### 3. Render it

A route in `src/app/routes/App.tsx` renders `<RemoteBoundary remote="<name>" module="./App" />` with **no props**, and calls `useRouteTemplate('/t/:slug/<path>')` so telemetry groups by route template. Data the remote needs goes into the `PlatformProvider` shell value; see CONTRIBUTING § Adding a remote or changing what the shell passes to one.

### 4. What the remote reads (SDK `/react` hooks)

| Need | Hook |
|---|---|
| The signed-in user, the workspace | `useCurrentUser()`, `useWorkspace()` |
| Roles, plan, flags, read-only (P-35) | `useSessionContext()`, `useHasPermission(action, resource)` or `<Can>`, `useFeatureFlag(key, fallback)`, `useReadOnly()` |
| Sign out, switch workspace, step-up MFA | `useSignOut()`, `useSwitchWorkspace()`, `useStepUp()` |
| Calls to `/api` | `useApi(fn, deps)` or `useApiClient()`: the shell's token source, the remote's `mfe` label on spans and metrics |
| Text and locale | `useT('<name>')` over its own namespace (`registerNamespace('<name>', loader)`), `useLocale()` |

The remote never runs its own Keycloak client, never reads tokens, and never imports the shell's source.

### 5. Navigation

`navigate()` from the SDK's `/nav` goes through the shell's router when the path is under the current `/t/<slug>` basename (no reload), and is a full load otherwise (`infrastructure/federation/navigator.ts`).

### 6. Errors

A render error inside the remote stays in its `RemoteBoundary` ("Try again"); the rest of the shell keeps running. A failed load (manifest, timeout, integrity) shows the same boundary. The remote may add its own `MFEErrorBoundary` around parts of itself.

### 7. Storage

`storage('<appId>')` from `/storage` is namespaced per workspace and refuses token-like keys. Raw `localStorage` is forbidden by the platform's ESLint plugin.

### 8. Telemetry

Nothing to set up: the shell starts tracing, logging, metrics and web vitals once, and the SDK tags the remote's spans, logs and API metrics with its `mfe`. v1 consent exports only errors and essential warnings.

### 9. Verify

For `dashboard`, run `REMOTE_DIST=../mfe-dashboard/dist npm run test-contract` (§ Testing the dashboard contract locally): integrity, the share scope, CSS, the role map reaching the remote, navigation and sign-out, in three engines under the production CSP. A new remote needs its own contract spec and a server entry in `test/browser/server.ts`: the current suite refuses a build not named `dashboard`.

---

## Local development

### Prerequisites

- Node.js 26 and npm
- A GitHub token with `read:packages`, SSO-authorised for the organisation, in `NODE_AUTH_TOKEN`. `.npmrc` sends the `@bcbp-solutions-fzc-llc` scope to GitHub Packages
- Docker, when you want the local Keycloak realm or the production image

### Setup

```bash
git clone https://github.com/BCBP-SOLUTIONS-FZC-LLC/web-shell
cd web-shell
gh auth refresh -s read:packages
export NODE_AUTH_TOKEN=$(gh auth token)
npm ci
npm run keycloak:setup
npm run dev
```

The shell is at **http://localhost:5001**. Keycloak admin is at **http://localhost:8080** (`admin` / `admin`). The first Keycloak start can take one to two minutes. `npm run keycloak:setup` copies `docker.local.env` when needed, starts the compose stack, waits until Keycloak is ready, and seeds the local user. The seed script prints that user's email. The password it sets is in `scripts/seed-keycloak-user.mjs`.

The dev server stands in for what CloudFront and the platform APIs provide (`config/dev-platform.mjs`):

| Path | Dev server answer |
|---|---|
| `/config/runtime.json` | `config/runtime.local.json` (Keycloak `http://localhost:8080`, client `app1`, environment `local`) |
| `/remotes/manifest.json` | `config/remotes.local.json` (`dashboard` at `http://localhost:5002/remoteEntry.js`) |
| `GET /api/v1/public/tenants/resolve` | Any identifier → realm `tenant-bcbp` |
| `GET /api/v1/me/session-context` | Slug `bcbp`, roles `member`, `tenant_owner` (the signup owner; `DEV_ROLES=member,tenant_admin` overrides), 401 without a bearer token |
| `POST /otel/*` | `204`, dropped |

Set `DEV_API_URL` to proxy `/api` to a real API instead of the stubs, or `DEV_REALM` to stub a different realm.

The dashboard is a second process. Start `mfe-dashboard` (`npm run dev` there) so it serves `remoteEntry.js` at `http://localhost:5002`. While it is not running, `/t/bcbp/dashboard` shows the remote boundary's error and the rest of the shell keeps working.

### Trying the flows locally

With Keycloak and the dev server running (`mfe-dashboard` too for the sign-out rows: the shell has no sign-out control of its own):

| Flow | How |
|---|---|
| Sign in | Open http://localhost:5001, enter the seeded user's email (the seed script prints it; its password is set in `scripts/seed-keycloak-user.mjs`), continue to Keycloak |
| Silent restore | Reload the page: the SDK restores the session from Keycloak's SSO cookie (`prompt=none`) without the email screen |
| Sign-out, no silent sign-in | Sign out from the dashboard: "You are signed out" waits; the next sign-in asks for credentials (`prompt=login`) |
| Cross-tab sign-out | Open two tabs, sign out in one: the other shows "You are signed out" |
| Session expiry | Set `auth.idleTimeoutMs` to `60000` (the SDK's minimum; lower values are refused) in `config/runtime.local.json` and leave the tab idle: "Session ended" appears over the app |
| Missing permissions | Sign in once without it (that caches the workspace), then restart with `DEV_API_URL=http://localhost:9 npm run dev` (nothing listens there) and reload: P-35 gets a 503 problem, the amber notice says some actions are hidden, and the background retry runs. PUB-1 is proxied too, so the email screen cannot resolve while it is set |
| A different role | `DEV_ROLES=member,tenant_admin npm run dev` |
| Remote down | Stop `mfe-dashboard`: `/t/bcbp/dashboard` shows the boundary's error, the shell keeps running |

### Developer tools

| Tool | What it does |
|---|---|
| `npm run hooks:install` | Pre-commit gate: staged env files, workflow hygiene, Dockerfile digest pin, `tsc --noEmit` |
| `npm run arch-lint` | Component boundaries (`.dependency-cruiser.cjs`) |
| Claude Code (`.claude/`) | `settings.json` hooks: `guard.sh` blocks edits to sibling repos, `node_modules/`, `dist/`, `coverage/`, and `.env` / `docker.local.env` (any depth), comparing canonical paths; `post-edit.sh` runs ESLint, arch-lint, the SDK pin check and the diagram check. Subagents `invariant-reviewer`, `doc-sync-reviewer`; skills `/sdk-upgrade`, `/stack-sync`; MCP `context7` (`.mcp.json`) |
| `node .claude/hooks/check-diagrams.mjs` | Every diagram in ARCHITECTURE.md equals its `.mmd` source |

### Common commands

| Command | Description |
|---|---|
| `npm run dev` | Rsbuild dev server on port 5001, with the dev stand-ins above |
| `npm run build` | `tsc` and the production bundle (`rsbuild build`) |
| `npm run preview` | Serve `dist/` on port 5001 |
| `npm run lint` | ESLint, including the `@bcbp-solutions-fzc-llc` platform rules |
| `npm run arch-lint` | Component boundaries: every dependency in `src/` declared in `.dependency-cruiser.cjs` (the counterpart of go-arch-lint; CI does) |
| `npm run typecheck` | `tsc` over `src/` and `test/` (`tsconfig.test.json`) |
| `npm test` | Vitest once (unit, integration, e2e) |
| `npm run test-unit` / `test-int` / `test-e2e` | One layer |
| `npm run budget` | Bundle size budget over `dist/` (run after `npm run build`; CI does) |
| `npm run metrics-check` | Every metric `src/` creates follows the Enterprise Platform Observability Standard and is listed in [docs/observability.md](./docs/observability.md) (CI does) |
| `npm run test-browser` | The real-browser suite (Playwright, Chromium, Firefox, WebKit) against `dist/` under the production CSP ([test/browser/README.md](./test/browser/README.md)) |
| `npm run test-contract` | The browser suite against a real mfe-dashboard build: `REMOTE_DIST=../mfe-dashboard/dist npm run test-contract` after building both ([test/browser/README.md](./test/browser/README.md)) |
| `npm run test-smoke` | The smoke suite against `SMOKE_BASE_URL` ([test/smoke/README.md](./test/smoke/README.md)) |
| `npm run test:coverage` | Same, with the v8 coverage report |
| `npm run test:ci` | Coverage plus the 95% gate (`.github/scripts/coverage-gate.mjs`) |
| `npm run hooks:install` | Copy `.githooks/pre-commit` into `.git/hooks` |
| `npm run keycloak:dev` | Keycloak in the foreground |
| `npm run keycloak:dev:detach` | Keycloak in the background |
| `npm run keycloak:logs` | Follow the Keycloak container log |
| `npm run keycloak:status` | Readiness check against `http://localhost:8080` |
| `npm run keycloak:setup` | Start Keycloak, wait, seed the local user |
| `npm run keycloak:seed-user` | Seed only, when Keycloak is already up |
| `npm run docker:dev` | Dev server inside a Node 26 container (Windows path mount). Passes `NODE_AUTH_TOKEN` through |
| `npm run docker:dev:mac` | Same mount syntax for macOS and Linux |

### Run one test file

```bash
npx vitest run test/integration/bootstrap.test.tsx
npx vitest run test/unit/iam.test.ts
```

### Local Keycloak

`docker-compose.keycloak.yml` runs `quay.io/keycloak/keycloak:26.8.1` with `start-dev --import-realm`. The imported realm is `tenant-bcbp`: the SDK requires a paid workspace's realm to be `tenant-<slug>`. The public client is `app1`, standard flow only, PKCE S256, redirect URIs `http://localhost:5001/*` and `http://127.0.0.1:5001/*`, post-logout redirect URIs `+` (same as the redirect URIs). The `bcbp` login theme is mounted from `keycloak/themes/bcbp`. A container created before the rename still has realm `bcbp`; recreate it (`docker compose -f docker-compose.keycloak.yml up -d --force-recreate`) to import `tenant-bcbp`.

Port **8080** is Keycloak in this compose file and also the port the shell image listens on. Map the shell image to another host port when both are running. See Docker below.

---

## Testing the dashboard contract locally

The contract suite (`test/browser/dashboard.spec.ts`) serves a **real** mfe-dashboard production build as `dashboard` inside this shell's production build, in Chromium, Firefox and WebKit under the production CSP. Run it before a release that changes the SDK, the remote contract or the shell value.

### Step 1 — Build the dashboard

```bash
cd ../mfe-dashboard
export NODE_AUTH_TOKEN=$(gh auth token)
npm ci && npm run build      # writes dist/ with remoteEntry.js and remote-manifest-entry.json
```

### Step 2 — Build the shell

```bash
cd ../web-shell
npm ci && npm run build
```

### Step 3 — Run the suite

```bash
REMOTE_DIST=../mfe-dashboard/dist npm run test-contract
```

12 cases (4 × 3 engines): the remote loads with its own integrity and CSS and no CSP violation, every image it shows loads, the role map reaches it, its `NavLink` stays in the page, and its Logout POSTs to Keycloak through the shell. A `remoteEntry.js` that does not match its manifest `integrity` is refused by the browser, so the first case fails.

### Troubleshooting

| Symptom | Cause |
|---|---|
| The remote does not load; a shared-scope error in the console | The dashboard was built on a newer SDK than the shell's. Upgrade the shell first (`/sdk-upgrade`) |
| Integrity failure | `remote-manifest-entry.json` does not match the built `remoteEntry.js`: rebuild the dashboard |
| A CSP report | The remote adds an inline script or style, or a third-party origin |
| `test/browser: REMOTE_DIST's build names its remote …` when the suite starts | The remote is not named `dashboard` (container `__platform_mfe_dashboard`) |
| Browsers not installed | `npx playwright install chromium firefox webkit` once (test/browser/README.md; CI uses the Playwright container) |

---

## Testing

| Layer | Path | What it exercises |
|---|---|---|
| Unit | `test/unit/` | PUB-1 and P-35 mappings and ports, the entry point, remember-email, the screen host, `BrandLogo`, the session-context retry (and its agreement with the SDK ApiClient), the navigator adapter, the dev server's platform middleware, the layer rules and arch-lint firing, the text catalogue and the hard-coded-text guard, the no-SDK-duplicates guard, metrics-check, the use cases, the links, the password reset URL |
| Integration | `test/integration/` | The login page and the carousel, the session screens, `App` routes, and the bootstrap's order and branches; axe-core over every shell screen (`accessibility.test.tsx`) |
| End to end | `test/e2e/` | The real bootstrap, screens, `App` and SDK against a fake Keycloak (PKCE) and network: email → PUB-1 → sign-in → the `dashboard` remote under `/t/<slug>/`, deep links, role-map permissions in the remote, deny-all, a failing remote, global sign-out, the device clock |
| Smoke | `test/smoke/` | `npm run test-smoke` against the served image (CI) or a deployment: the SPA rule, Cache-Control, script integrity, 404s, and the runtime files validated by the SDK. See [test/smoke/README.md](./test/smoke/README.md) |
| Browser | `test/browser/` | `npm run test-browser` after a build: the production bundle in Chromium, Firefox and WebKit under the production CSP and Trusted Types, with a fake Keycloak on a second origin: fonts, PKCE sign-in, the remote with integrity, `navigate()`, the sign-out form POST, the start-up failure report, colour contrast |
| Dashboard contract | `test/browser/dashboard.spec.ts`, CI `dashboard-contract` | The real mfe-dashboard build (`REMOTE_DIST`) in this shell, three engines, production CSP: integrity, share scope and CSS, the role map reaching it, its navigation, its Logout through the shell's form POST. Informational in CI |

Vitest uses happy-dom and Testing Library. `vitest.config.ts` defines `__ENVIRONMENT__` and `__BUILD_VERSION__` as `test`. The bootstrap test replaces every SDK subpath with a recording fake. The e2e suite runs the real SDK (Vitest inlines it, so each simulated page load gets a fresh one) against `test/fixtures/` fakes, modelled on platform-reactcommon's. No suite calls Keycloak, the IAM APIs or port 5002.

### Canonical tests (do not break)

- **`test/e2e/shell.test.tsx`** — the real shell and SDK: sign-out unmounts the app, nothing signs in without a click (`prompt=login` next), tokens never reach storage, the device-clock refusal.
- **`test/unit/no-sdk-duplicates.test.ts`** — no module-level name in `src/`, `config/` or `test/browser/server.ts` is an SDK export; no test hand-builds a problem body.
- **`test/unit/layer-rules.test.ts`, `test/unit/arch-lint.test.ts`** — every layer rule fires on a probe.
- **`test/unit/shell-text.test.ts`** — no hard-coded user-facing text in presentation; the catalogue's fallback.
- **`test/unit/session-context.test.ts`** — `isTransient` agrees with the SDK `ApiClient`'s real retries (12 statuses).
- **`test/integration/bootstrap.test.tsx`** — the exact start-up order, every branch, the catalogue loaded before the IdP.
- **`test/browser/shell.spec.ts`** — the production build under the production CSP and Trusted Types; any CSP report fails.

### Coverage

`npm run test:ci` fails when statements, branches, functions, or lines fall below **95%**. The gate reads `coverage/coverage-summary.json`. Coverage includes `src/**/*.{ts,tsx}` and excludes declaration files and CSS. The threshold is the same one `validate-test.yml` enforces. It is not lowered for this repo.

---

## Configuration

### Runtime (`/config/runtime.json`)

The SDK reads no environment variables in the browser. It loads `/config/runtime.json` at start-up and validates it strictly: an unknown key or an invalid value stops the app with "The app is unavailable right now." Change it per environment without rebuilding.

| Key | Image default (`public/config/runtime.json`) | Local (`config/runtime.local.json`) |
|---|---|---|
| `environment` | none: each deployment writes its own (`dev`, `test`, `staging`, `prod`); smoke `live` checks it | `local` |
| `api.baseUrl` | `/api` | `/api` |
| `auth.idpOrigin` | `https://auth.bcbpsolutions.com` | `http://localhost:8080` |
| `auth.clientId` | `tender-web` | `app1` |
| `auth.redirectPath` | `/auth/callback` | `/auth/callback` |
| `auth.trialRealm` · `paidRealmPrefix` · `workspacePathPrefix` | `trial` · `tenant-` · `/t/` | same |
| `auth.idleTimeoutMs` | `1800000` | `1800000` |
| `telemetry` | `/otel`, sample `0.1`, `info` | `/otel`, sample `1`, `debug` |
| `remotes.allowedOrigins` | `[]` | `["http://localhost:5002"]` |
| `i18n` | `en` | `en` |
| `flags` | `{}` (platform flags; tenant flags come from P-35) | `{}` |

The full schema is in the SDK's README (Runtime configuration) and the SDK LLD §12.1.

### Build time

| Variable | Default | Purpose |
|---|---|---|
| `PLATFORM_ENVIRONMENT` | `prod` for a production build, `local` for `npm run dev` | `__ENVIRONMENT__`: only the fallback now. The identity environment comes from `runtime.json` `environment` when the deployed file names it (SDK alpha.6), which every environment's should; then this goes away (`local`, `dev`, `test`, `staging`, `prod`) |
| `BUILD_VERSION` | `package.json` `version` | `__BUILD_VERSION__`, and the content of `/version.json` |
| `NODE_AUTH_TOKEN` | — | `npm ci` only: reads `@bcbp-solutions-fzc-llc/*` from GitHub Packages |

The image takes `PLATFORM_ENVIRONMENT`, `BUILD_VERSION` and `SOURCE_DATE_EPOCH` as build args, and the registry token as the BuildKit secret `npm_token`.

`docker.local.env` is for the Keycloak helper scripts (`DOCKER_CLI` on Windows). The shell does not read it.

### Development and tooling variables

| Variable | Read by | Purpose |
|---|---|---|
| `DEV_API_URL` | `config/dev-platform.mjs` | Proxy `/api` to a real API instead of the stubs (unreachable → 503 problem) |
| `DEV_REALM` | `config/dev-platform.mjs` | The realm the PUB-1 stub returns (default `tenant-bcbp`) |
| `DEV_ROLES` | `config/dev-platform.mjs` | The roles the P-35 stub returns (default `member,tenant_owner`) |
| `SMOKE_BASE_URL` | `test/smoke` | The image or deployment the smoke suite checks (required) |
| `SMOKE_MODE` | `test/smoke` | `image` (adds nginx's headers) or `live` (adds the CSP, HSTS and the `environment` check) |
| `ENVIRONMENT` | `test/smoke` | The page environment the runtime config is validated with (default `prod` for `image`, `dev` for `live`); in `live` also the environment the deployed `runtime.json` must name |
| `REMOTE_DIST` | `test/browser/server.ts` (and the specs' skips) | A built mfe-dashboard `dist/` for `npm run test-contract` |
| `COVERAGE_THRESHOLD` | `.github/scripts/coverage-gate.mjs` | Overrides the 95% gate locally; CI never sets it |

---

## Security

| Topic | Guidance |
|---|---|
| **Public client** | No client secret. The possession proof is the PKCE verifier |
| **Token storage** | Tokens live in memory only, never in storage. "Remember Email" stores the email only |
| **Redirect** | The SDK checks `state` before the code is exchanged. The redirect URI is `{origin}{auth.redirectPath}` |
| **API calls** | The SDK's `ApiClient` sends the token to the page's own origin only and never sends identity headers. The ESLint plugin enforces subpath imports, no identity headers, no raw `window.*Storage`, no unsafe HTML |
| **Remote code** | Remotes execute in this origin. Entries load only from the page's origin or `remotes.allowedOrigins`, pinned by `integrity` outside local, dev and test |
| **CSP** | The bundle is Trusted-Types and `script-src 'self'` safe (preset output, `installTrustedTypesPolicy`). nginx sends no CSP by default; the platform's CloudFront distribution does. An environment served without CloudFront mounts `nginx/security.d/csp.conf.example` (with its IdP origin) as `/etc/nginx/security.d/csp.conf`; one behind CloudFront mounts nothing, since two CSPs are both enforced. Fonts (Geist, Inter) are self-hosted under `/assets/`, so `font-src 'self'` and `style-src 'self'` hold |
| **Image** | nginx runs as uid 101. `.env` is not copied into the build context. The registry token is a BuildKit secret and never lands in a layer. Source maps are deleted from the image |
| **Reporting** | [SECURITY.md](./.github/SECURITY.md). Email vijay@bcbpsolutions.com with subject `[web-shell]` |

---

## Observability

The shell starts the SDK's telemetry once for the whole page; the remote's telemetry flows through the same pipeline under its own `mfe` label. The standard, the tiers and the inventory are in [docs/observability.md](./docs/observability.md).

**Identity.** `service` `web-shell`, `domain` `portal`, `environment` from `runtime.json` (else the build-time fallback), `buildVersion`. The SDK injects them into every span, log and metric; code never sets them.

### Metrics

Per the Enterprise Platform Observability Standard's three tiers:

- **Tier 1 — `platform_web_*`** (web vitals, remote loads, API client, errors): bound by the SDK, recording once governance ratifies them.
- **Tier 2 — `portal_*`**: none in the registry yet.
- **Tier 3 — `portal_web_shell_*`**: the shell creates **none** today. `npm run metrics-check` (CI) refuses a metric that breaks the standard or is missing from the inventory.

### Alerts and dashboards

One alert is defined here: `WebShellStartupFailures` (Loki, on `the app could not start`), with its [runbook](./docs/runbook-startup-failure.md); it must be deployed to the Loki ruler (LLD §15). The platform's browser dashboards and SLOs for `platform_web_*` live in `platform-reactcommon`.

### Tracing and logs

OTLP/HTTP to the same-origin `telemetry.otlpBaseUrl` (`/otel`), sampled by `telemetry.sampleRatio`. API calls carry `x-request-id`, `traceparent` and `x-session-id`. v1 consent is essential only, so error logs and essential warnings leave the page and the rest stays in it. The shell's own events: `the app could not start` (error), `manifest load failed` (error), `session context unavailable` (warning, kept in the page under v1 consent). Error boundaries (`RemoteBoundary`, `MFEErrorBoundary` `web-shell`) log render errors with their `mfe`.

---

## Deployment

A tag publishes a signed image; nothing in this repository deploys it.

| Concern | Where |
|---|---|
| Image | `ghcr.io/bcbp-solutions-fzc-llc/web-shell`, nginx on 8080 as uid 101 (§ Docker); tags, Cosign verification and how to cut a release in [VERSIONING.md](./VERSIONING.md) |
| Per environment | `/config/runtime.json` (with its `environment`), `/remotes/manifest.json`, the redirect URIs in each realm, and the CSP (§ Docker, Minimum per-environment configuration) |
| Until CloudFront | The ingress routes `/api`, `/otel`, `/csp-report`, `/remotes/dashboard/` and the image gets the CSP and HSTS as mounted files: [docs/hosting-without-cloudfront.md](./docs/hosting-without-cloudfront.md) |
| Pairs | web-shell `0.3.0` + mfe-dashboard `0.3.0` (remote `dashboard`); rollback web-shell `0.2.0` with the same dashboard. mfe-dashboard `0.4.0` (alpha.6) needs web-shell `0.3.0` or later: with it, rolling the shell back to `0.2.0` also rolls the dashboard back to `0.3.0`. On an SDK upgrade the shell deploys first |
| Deploy check | `SMOKE_BASE_URL=https://<host> SMOKE_MODE=live ENVIRONMENT=<target> npm run test-smoke` |
| Rollback | Redeploy the previous image; `index.html` and the config are `no-cache`, so it takes effect on the next load (ARCHITECTURE § Release and rollback safety) |

---

## CI

Five workflow files, nine `ci.yml` jobs. Markdown-only pushes do not run `ci.yml`. Job order and the failure runbooks are in [docs/pipeline](./docs/pipeline/README.md).

Every `npm ci` reads `@bcbp-solutions-fzc-llc/*` from GitHub Packages with `GITHUB_TOKEN` (`packages: read`). This repository needs read access on each package's page: Package settings → Manage Actions access → Add repository.

- **`ci.yml`** — orchestrator. `validate-test.yml` and `validate-quality.yml` run in parallel with `build-image` (Hadolint, then a Buildx cache build). Trivy and the smoke job follow the image build; the smoke job sets up Node, runs `npm ci`, then `smoke-tests.sh` (size, startup gate, the smoke suite, and the mounted CSP and HSTS). `browser` runs the real-browser suite (Chromium, Firefox, WebKit) and gates the image push. `dashboard-contract` builds mfe-dashboard (`vars.DASHBOARD_REF`, default `main`) and runs this shell with it; it reports but does not gate. Pull requests get a status comment, failures included. A push to `main` or `master` also pushes `ghcr.io/bcbp-solutions-fzc-llc/web-shell`, tagged with the branch name and `sha-<short>`, and Cosign-signs that digest.
- **`validate-test.yml`** — `npm ci`, `npm run test:coverage`, the 95% coverage gate, `npm run build`, then the bundle budget (`npm run budget`).
- **`validate-quality.yml`** — ESLint (`--max-warnings 0`), `npm run arch-lint`, `npm run metrics-check` and `npm run typecheck`. Workflow files must use literal operators and LF line endings, `Dockerfile` `FROM` lines must be digest-pinned, `.dockerignore` must exist, and `npm audit --omit=dev --audit-level=high` must pass.
- **`changelog-check.yml`** — a pull request that touches `src/`, `package.json`, `package-lock.json`, `Dockerfile`, `nginx/`, `rsbuild.config.ts`, `config/**`, `public/config/**`, or `index.html` must also update `CHANGELOG.md`.
- **`release.yml`** — tag `vX.Y.Z` or `vX.Y.Z-*`, or a manual run with a tag input. Re-validates, requires a matching changelog section, packs `web-shell_<tag>_dist.tar.gz` (source maps removed; kept as the workflow artifact `sourcemaps-<tag>`), pushes the image by digest only, scans it, attaches the SBOM and SLSA provenance, signs with Cosign, and only then adds the semver tags and `latest` (`tag-signed-image.sh`), so a failed step leaves an untagged digest and moves no tag; then it opens the GitHub Release. Tagging does not deploy a cluster.

Image tag rules, the Cosign identity, and the maintainer steps are in [VERSIONING.md](./VERSIONING.md).

Dependabot is enabled for npm, Docker, and GitHub Actions. Its npm job reads GitHub Packages through the Dependabot secret `PACKAGES_READ_TOKEN` (`read:packages`) and leaves the three `@bcbp-solutions-fzc-llc/*` packages alone: they move by hand, together.

---

## Docker

### Production image

```bash
export NODE_AUTH_TOKEN=$(gh auth token)
docker build --secret id=npm_token,env=NODE_AUTH_TOKEN -t web-shell:local .
docker run --rm -p 8080:8080 web-shell:local
curl -s http://localhost:8080/healthz
```

When local Keycloak already owns host port 8080:

```bash
docker run --rm -p 18080:8080 web-shell:local
curl -s http://localhost:18080/healthz
```

To point the image at another environment, mount that environment's files over the defaults:

```bash
docker run --rm -p 18080:8080 \
  -v "$PWD/runtime.json:/usr/share/nginx/html/config/runtime.json:ro" \
  -v "$PWD/manifest.json:/usr/share/nginx/html/remotes/manifest.json:ro" \
  web-shell:local
```

**Without CloudFront** (until it is available): the load balancer or ingress routes `/api`, `/otel`, `/csp-report` and `/remotes/dashboard/` on the same origin, and the image gets the CSP and HSTS as mounted files. See [docs/hosting-without-cloudfront.md](./docs/hosting-without-cloudfront.md); remove those mounts when CloudFront arrives.

Two stages, both digest-pinned: `node:26-bookworm` runs `npm ci` and `npm run build`, then deletes the source maps; `nginxinc/nginx-unprivileged:1.31-alpine` serves `/usr/share/nginx/html` as uid 101. The CI smoke job fails the image above 200 MB, requires `/healthz`, `/` (a document that contains `id="app"`), `/config/runtime.json` and `/version.json` to return 200, fails when the image contains a `.map` file, and then runs the smoke suite against the container (`npm run test-smoke`, [test/smoke/README.md](./test/smoke/README.md)). To run it locally: `docker run -d --rm -p 127.0.0.1:18080:8080 web-shell:local`, then `SMOKE_BASE_URL=http://127.0.0.1:18080 npm run test-smoke`.

### Minimum per-environment configuration

The image ships `public/config/runtime.json` with production defaults and no `environment`. A mounted file replaces it whole and the SDK validates it strictly, so start from the image's file and change at least these keys:

```jsonc
// /config/runtime.json (mounted, or written by the deploy pipeline)
{
  "environment": "staging",                       // must match the deployment; checked by smoke live
  "auth": {
    "idpOrigin": "https://auth.<env>.example",     // that environment's Keycloak
    "clientId": "tender-web"
    // keep the other auth keys from the image's file
  },
  "remotes": { "killSwitch": [], "loadTimeoutMs": 10000, "retries": 2, "allowedOrigins": [] }  // add the remotes' origin if not same-origin
  // …every other key as in the image's file
}
```

`/remotes/manifest.json` (`ownerDomain` must be a registry domain, or the SDK drops the entry; `integrity` comes from the dashboard's `remote-manifest-entry.json`):

```json
{ "dashboard": { "entry": "/remotes/dashboard/0.3.0/remoteEntry.js", "version": "0.3.0", "ownerDomain": "portal", "integrity": "sha384-…" } }
```

Plus, until CloudFront: `nginx/security.d/csp.conf.example` (with that environment's Keycloak origin in `connect-src` and `form-action`) and `hsts.conf.example`, mounted at `/etc/nginx/security.d/`. Each realm registers `{origin}/auth/callback` as a redirect URI.

### Local Keycloak compose

| Container | Image | Host port | Purpose |
|---|---|---|---|
| `keycloak` | `quay.io/keycloak/keycloak:26.8.1` | `8080` | Realm `tenant-bcbp`, client `app1`, theme `bcbp` |

`npm run keycloak:dev` starts that one service. It does not start the shell. Use `npm run dev` for the shell.

### Health

| Endpoint | Returns | Meaning |
|---|---|---|
| `GET /healthz` | `200` and `ok` | nginx is serving. It does not check Keycloak, the IAM APIs or `dashboard` |

---

## Cross-service dependencies

### 1. Synchronous outbound calls (the browser → other services)

#### Keycloak (through the SDK)

| Call | When |
|---|---|
| `GET /realms/{realm}/protocol/openid-connect/auth` | Browser redirect to sign in, or a silent `prompt=none` restore |
| `POST /realms/{realm}/protocol/openid-connect/token` | Code exchange and refresh |
| `POST /realms/{realm}/protocol/openid-connect/logout` (a hidden form: `id_token_hint`, `client_id`, `post_logout_redirect_uri`) | Sign out, globally (the CSP's `form-action` must allow the IdP origin) |
| `GET /realms/{realm}/login-actions/reset-credentials?client_id=` | "Forgot your password?" (browser navigation, built by the shell) |

`{realm}` is the workspace's realm (`trial`, or `tenant-<slug>`). The SDK builds these URLs from `{auth.idpOrigin}/realms/{realm}`; it does not fetch discovery. The shell does not call the Keycloak Admin API. `scripts/seed-keycloak-user.mjs` uses `kcadm` inside the dev container only.

#### IAM HTTP APIs (same origin, `/api`)

| Call | When |
|---|---|
| `GET /api/v1/public/tenants/resolve?identifier=` (PUB-1) | The email sign-in screen, and workspace switching. No token |
| `GET /api/v1/me/session-context` (P-35) | Once after sign-in (with the SDK's own retries); after a network failure while online, a timeout, 429, 502, 503 or 504 (the SDK ApiClient's own rule), again after 1 s, 2 s, 4 s, one request each. Until it answers the app renders with deny-all permissions |

#### Dashboard remote (`dashboard`)

The shell loads `dashboard`'s entry from `/remotes/manifest.json` in the browser and renders its `./App` with no props; the remote reads the user and sign-out from the SDK. A missing or failing remote stays inside its boundary; the shell keeps running.

### 2. Inbound callers (what depends on the shell)

| Caller | Contract |
|---|---|
| Browsers | The document, `/config/runtime.json`, `/remotes/manifest.json`, `/version.json`, `/assets/*`, `GET /healthz` (§ nginx paths) |
| The `dashboard` remote, and any future remote | The share scope (React, React DOM, the OTel API, every SDK subpath at the shell's version), the `PlatformProvider` shell value through SDK hooks, the router through `navigate()` |

### 3. Async dependencies

| Mechanism | Between | What flows |
|---|---|---|
| `BroadcastChannel` `platform-auth` | Tabs of this origin (SDK) | Sign-out and workspace switches |
| `/version.json` polling | The shell and its own deployment | A new shell build (every `appUpdate.pollIntervalMs`, 300 s in the image's config) |
| OTLP export | The browser → `/otel` | Under v1 consent, error logs and essential warnings only (below) |

#### Telemetry

Traces, logs and metrics are exported over OTLP/HTTP to `telemetry.otlpBaseUrl` (`/otel`), gated by consent. v1 grants `essential` only (a decision: no analytics consent manager), so errors and essential warnings are exported and traces, metrics and info logs are not.

### 4. Infrastructure dependencies

| System | Role |
|---|---|
| CloudFront (or, until next month, the ingress) | Routes `/api`, `/otel`, `/csp-report`, `/remotes/dashboard/`; sends the CSP and HSTS |
| An OTLP collector behind `/otel`, Loki | Telemetry intake; the `WebShellStartupFailures` alert |
| GitHub Packages | `@bcbp-solutions-fzc-llc/*` at build time (`NODE_AUTH_TOKEN`; the Dependabot secret `PACKAGES_READ_TOKEN`) |
| GHCR | The signed image |

---

## Out of scope

| Concern | Where it lives |
|---|---|
| Passwords, MFA, user registration, token issuance | Keycloak |
| Dashboard layout, tickets, user management screens | `mfe-dashboard` (remote `dashboard`) |
| Tenant resolution, session context, authorization decisions | IAM services and the gateway. UI permissions here are hints |
| Each environment's runtime config, remote manifest and CSP headers | The deploy pipeline and CloudFront |
| Notifications and live updates | Not implemented in this repository |

---

## Contributing

Setup, how to extend the shell, the test gate, and the pull request checklist are in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Related documents

| Document | Description |
|---|---|
| [docs/lld/web-shell-lld.md](./docs/lld/web-shell-lld.md) | Low-level design: responsibilities, contracts, start-up order, flows, hosting, tests, open items |
| [docs/README.md](./docs/README.md) | LLD, pipeline map, architecture diagrams, and runbooks |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Layers and module graph; bootstrap, sign-in, API, PUB-1, session and dashboard flows; data model, caching, observability, CSP, concurrency, deployment, contracts and the threat model |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Local setup, extension rules, tests, and the pull request checklist |
| [docs/observability.md](./docs/observability.md) | Observability standard: identity, tiers, inventory, how to add a metric |
| [docs/hosting-without-cloudfront.md](./docs/hosting-without-cloudfront.md) | Ingress routing and the mounted CSP and HSTS until CloudFront |
| [docs/runbook-startup-failure.md](./docs/runbook-startup-failure.md), [runbook-release.md](./docs/runbook-release.md), [runbook-image-scan.md](./docs/runbook-image-scan.md), [runbook-coverage-gate.md](./docs/runbook-coverage-gate.md) | Runbooks |
| [docs/architecture/constitution-assessment.md](./docs/architecture/constitution-assessment.md), [docs/adr/](./docs/adr/README.md) | Constitution compliance, the roadmap and the decisions |
| [test/browser/README.md](./test/browser/README.md), [test/smoke/README.md](./test/smoke/README.md) | The browser and contract suites; the smoke suite and its modes |
| [.claude/architecture.md](./.claude/architecture.md), [request-flows.md](./.claude/request-flows.md), [operations.md](./.claude/operations.md) | Condensed reference for Claude Code: layout and rules, flows, commands and CI |
| [VERSIONING.md](./VERSIONING.md) | SemVer rules, image tags, Cosign verify, how to cut a release |
| [CHANGELOG.md](./CHANGELOG.md) | User-facing history: released `0.1.0`, `0.2.0` and `0.3.0`; `[Unreleased]` for `main` |
| [SECURITY.md](./.github/SECURITY.md) | How to report a vulnerability |
| [.github/pull_request_template.md](./.github/pull_request_template.md) | What a pull request needs, including `npm run test:ci` |
| [.claude/CLAUDE.md](./.claude/CLAUDE.md) | Guidance for Claude Code: critical rules, commands, reference files |
| `platform-reactcommon` README and LLD | The SDK: API overview, integration guide, runtime config reference |

---

## License / ownership

BCBP Solutions FZC LLC — internal platform shell. Not for external distribution.
