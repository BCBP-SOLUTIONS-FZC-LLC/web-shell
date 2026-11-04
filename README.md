# web-shell

The browser shell for the BCBP micro-frontend platform. It runs the platform SDK's start-up sequence once for the whole page: identity, runtime config, telemetry, the Keycloak session, the workspace, permissions and flags. Then it renders the dashboard as a Module Federation remote (`app2`) inside this origin. The sign-in page and the session screens (signed out, session ended and so on) belong to the shell. Remotes initialise nothing; they read the shell's state through the SDK's hooks.

**Repository:** `github.com/BCBP-SOLUTIONS-FZC-LLC/web-shell`
**Runtime:** Node.js 26 · Rsbuild 2 (Rspack) · React 19.3 · `@bcbp-solutions-fzc-llc/frontend-sdk` `1.0.0-alpha.3` · private npm package `app1` (`"private": true`) · production image is nginx on port **8080**
**Contract:** Module Federation host `shell`, built with `@bcbp-solutions-fzc-llc/webpack-preset`. It provides React, React DOM, the OTel API and every SDK subpath to remotes, and exposes nothing. Versioning of the image and that contract is in [VERSIONING.md](./VERSIONING.md).

---

## Mental model

| This shell owns | Lives elsewhere |
|---|---|
| The SDK bootstrap (`src/bootstrap.tsx`) and the routes of the signed-in app: `/t/<slug>/dashboard/*` renders the dashboard remote | Dashboard pages, navigation inside the dashboard and dashboard data (`mfe-dashboard`, loaded as `app2`) |
| The email sign-in page and the session screens. The SDK does Authorization Code + PKCE against the workspace's Keycloak realm and keeps tokens in memory | Credentials, password policy, MFA and token issuance (Keycloak). This repo ships a local realm and theme for development |
| The IAM ports: PUB-1 (email or slug → realm) and P-35 (session context), over the SDK's `ApiClient` | The IAM APIs themselves, tenant membership, roles and audit |
| The shell value remotes read through SDK hooks: the user, workspace, session context and sign-out (`PlatformProvider`) | Any other remote. Only `app2` is in the local manifest |
| Static hosting of `index.html`, hashed `/assets/`, `/config/runtime.json`, `/remotes/manifest.json`, `/version.json` and `GET /healthz` | Cluster deploy and each environment's runtime config and remote manifest. Publishing a tag pushes an image; it does not roll a cluster |

Everything environment-specific is read at run time from `/config/runtime.json`. Only the identity environment and build version are compiled into the bundle.

---

## Why this shell exists

The dashboard is a separate build. The browser still needs one origin that can:

- Sign the user in to the right workspace once, and give every remote the same session, token source, consent state and telemetry.
- Load each remote's `remoteEntry.js` from the remote manifest, and keep a single copy of React, the OTel API and the SDK.
- Keep serving the document when a remote is down. A failed remote stays inside its `RemoteBoundary` ("Something went wrong. / Try again") instead of blanking the page.

Local development runs the shell at `http://localhost:5001`.

---

## What the browser sees

There is no backend in this repository. The production process is nginx serving the Rsbuild `dist/` tree.

### Routes

Only an authenticated session renders the app. Before that, the bootstrap mounts the sign-in or session screens over the empty root.

| Path | Signed in |
|---|---|
| `/t/<slug>/dashboard/*` | `app2` `./App` inside `RemoteBoundary` |
| anything else under `/t/<slug>/` | Redirect to `/t/<slug>/dashboard` |
| `/auth/callback` | Handled by the SDK, then moved to the page the user opened |

After sign-in the SDK moves the URL under `/t/<slug>/` (`rememberWorkspace`), and the router uses that prefix as its basename. Without a session context there is no slug, and the routes start at the site root.

### Sign-in sequence

1. `src/index.ts` imports `src/bootstrap.tsx` behind the async boundary Module Federation needs.
2. The bootstrap loads `/config/runtime.json` and calls the SDK's `idp.init()`. A reload with a live Keycloak session is restored silently (`prompt=none`).
3. Signed out with a known workspace (the `/t/<slug>` in the URL, or the SDK's workspace cache): straight to that realm's authorize endpoint, with the remembered email as `login_hint`.
4. Otherwise the login page asks for the work email. `GET /api/v1/public/tenants/resolve?identifier=<email>` (PUB-1) returns the realm. "Not found" and "unreachable" show the same generic message.
5. Keycloak redirects to `{origin}/auth/callback`. The SDK checks `state`, exchanges the code with the PKCE verifier, and keeps the tokens in memory.
6. The bootstrap loads the session context (`GET /api/v1/me/session-context`, P-35), sets permissions and flags, caches the workspace, loads `/remotes/manifest.json`, and renders.

Sign-out is global by default: the Keycloak session ends, every tab drops its tokens, the app unmounts, and "You are signed out" waits for a click. A session that expires during use shows "Session ended". The shell never redirects on its own.

### Federation contract

| Item | Value |
|---|---|
| Host | `shell` (`rsbuild.config.ts`, `pluginPlatform({ role: 'shell' })`) |
| Remote entries | `/remotes/manifest.json`: `{ "<name>": { "entry", "version", "ownerDomain", "integrity" } }`. `integrity` is required outside `local`, `dev` and `test` |
| Remote the shell renders | `app2`, module `./App` |
| Props this shell passes to `app2` `./App` | None. The remote uses `useCurrentUser()` and `useSignOut()` |
| Shared | `react`, `react-dom` (and their JSX and client entries), `@opentelemetry/api`, every SDK subpath. Strict singletons; a remote takes the SDK from the shell (`import: false`) |

A remote must be built with `@bcbp-solutions-fzc-llc/webpack-preset` (`role: 'remote'`); a Vite ES-module remote does not load through the SDK's `loadRemote`. `mfe-dashboard` is built that way (Rsbuild, `pluginPlatform({ role: 'remote', name: 'app2' })`), and it must not be built against a newer SDK than this shell's: upgrade the shell first.

### nginx paths

| Path | Behavior |
|---|---|
| `GET /healthz` | `200` and the text `ok`. No access log |
| `GET /` | Shell document. `index.html` is `Cache-Control: no-cache`. Only extension-less paths fall through to `index.html` (the platform's rule, `platform-reactcommon` `examples/cloudfront/spa-rewrite.js`); a missing file under `/api/`, `/otel/`, `/config/`, `/remotes/`, `/assets/`, or any missing file with an extension, is 404 |
| `GET /config/runtime.json`, `/remotes/manifest.json`, `/version.json` | `no-cache`, `404` when the file is absent |
| `GET /assets/*` | Hashed files, `Cache-Control: public, max-age=31536000, immutable` |
| Dotfile paths (`/.git/…`, `/.env`) | `404` |
| Every response | gzip for text, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy`; no nginx version. CSP and HSTS come from CloudFront |

The container listens on **8080** as uid **101**.

---

## Architecture

```
web-shell/
├── src/
│   ├── index.ts                 # Async boundary; "unavailable" message on a fatal start-up error
│   ├── bootstrap.tsx            # SDK start-up sequence, session handling, render
│   ├── App.tsx                  # Signed-in routes, dashboard RemoteBoundary
│   ├── platform/
│   │   ├── iam.ts               # PUB-1 resolver and P-35 session context over the ApiClient
│   │   ├── SessionScreens.tsx   # Email sign-in, signed out, session ended, device clock, wrong workspace
│   │   ├── screen.tsx           # Full-screen host for those screens, outside the app root
│   │   ├── consent.ts           # Consent stand-in (essential only until accepted)
│   │   └── permissions.ts       # Role → UI permission map
│   ├── pages/                   # Login layouts, the shared email form hook, remember-email
│   └── components/BrandLogo.tsx
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
│   ├── integration/             # Login pages, session screens, App, bootstrap (SDK faked)
│   ├── e2e/                     # The real shell and SDK, end to end
│   ├── fixtures/                # FakeKeycloak, FakeNetwork, FakeBroadcastChannel
│   └── smoke/                   # GET-only checks against the served image or a deployment
├── vitest.config.ts             # happy-dom, build constants, SDK inlined; excludes test/smoke
├── vitest.smoke.config.ts       # test/smoke only, node environment
├── docs/                        # LLD, architecture diagrams, pipeline, runbooks
├── .claude/                     # Claude Code guidance, hooks, reviewer agent
├── .github/workflows/           # ci, test, quality, changelog, release
└── VERSIONING.md                # Image tags and how to cut a release
```

`src/` imports the SDK through public subpaths only (`@bcbp-solutions-fzc-llc/frontend-sdk/auth`, …); the ESLint plugin fails a root or deep import. `src/` never imports the dashboard's source.

Browser storage:

| Key | Store | Purpose |
|---|---|---|
| `@bcbp-solutions-fzc-llc/frontend-sdk:*` | `localStorage` | SDK metadata: workspace cache, session id, last activity, last user. No tokens |
| `bcbp.rememberEmail`, `bcbp.loginEmail` | `localStorage` | "Remember Email" on the login form only |

Tokens are never written to storage.

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
| `/remotes/manifest.json` | `config/remotes.local.json` (`app2` at `http://localhost:5002/remoteEntry.js`) |
| `GET /api/v1/public/tenants/resolve` | Any identifier → realm `tenant-bcbp` |
| `GET /api/v1/me/session-context` | Slug `bcbp`, roles `member`, `tenant_owner` (the signup owner; `DEV_ROLES=member,tenant_admin` overrides), 401 without a bearer token |
| `POST /otel/*` | `204`, dropped |

Set `DEV_API_URL` to proxy `/api` to a real API instead of the stubs, or `DEV_REALM` to stub a different realm.

The dashboard is a second process. Start `mfe-dashboard` (`npm run dev` there) so it serves `remoteEntry.js` at `http://localhost:5002`. While it is not running, `/t/bcbp/dashboard` shows the remote boundary's error and the rest of the shell keeps working.

### Common commands

| Command | Description |
|---|---|
| `npm run dev` | Rsbuild dev server on port 5001, with the dev stand-ins above |
| `npm run build` | `tsc` and the production bundle (`rsbuild build`) |
| `npm run preview` | Serve `dist/` on port 5001 |
| `npm run lint` | ESLint, including the `@bcbp-solutions-fzc-llc` platform rules |
| `npm run typecheck` | `tsc` over `src/` and `test/` (`tsconfig.test.json`) |
| `npm test` | Vitest once (unit, integration, e2e) |
| `npm run test-unit` / `test-int` / `test-e2e` | One layer |
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

## Testing

| Layer | Path | What it exercises |
|---|---|---|
| Unit | `test/unit/` | PUB-1 and P-35 mappings and ports, the entry point, remember-email, consent, the screen host, `BrandLogo`, the login variant, the dev server's platform middleware |
| Integration | `test/integration/` | Both login layouts and the carousel, the session screens, `App` routes, and the bootstrap's order and branches; axe-core over every shell screen (`accessibility.test.tsx`) |
| End to end | `test/e2e/` | The real bootstrap, screens, `App` and SDK against a fake Keycloak (PKCE) and network: email → PUB-1 → sign-in → the `app2` remote under `/t/<slug>/`, deep links, role-map permissions in the remote, deny-all, a failing remote, global sign-out, the device clock |
| Smoke | `test/smoke/` | `npm run test-smoke` against the served image (CI) or a deployment: the SPA rule, Cache-Control, script integrity, 404s, and the runtime files validated by the SDK. See [test/smoke/README.md](./test/smoke/README.md) |

Vitest uses happy-dom and Testing Library. `vitest.config.ts` defines `__ENVIRONMENT__` and `__BUILD_VERSION__` as `test`. The bootstrap test replaces every SDK subpath with a recording fake. The e2e suite runs the real SDK (Vitest inlines it, so each simulated page load gets a fresh one) against `test/fixtures/` fakes, modelled on platform-reactcommon's. No suite calls Keycloak, the IAM APIs or port 5002.

### Coverage

`npm run test:ci` fails when statements, branches, functions, or lines fall below **95%**. The gate reads `coverage/coverage-summary.json`. Coverage includes `src/**/*.{ts,tsx}` and excludes declaration files and CSS. The threshold is the same one `validate-test.yml` enforces. It is not lowered for this repo.

---

## Configuration

### Runtime (`/config/runtime.json`)

The SDK reads no environment variables in the browser. It loads `/config/runtime.json` at start-up and validates it strictly: an unknown key or an invalid value stops the app with "The app is unavailable right now." Change it per environment without rebuilding.

| Key | Image default (`public/config/runtime.json`) | Local (`config/runtime.local.json`) |
|---|---|---|
| `api.baseUrl` | `/api` | `/api` |
| `auth.idpOrigin` | `https://auth.bcbpsolutions.com` | `http://localhost:8080` |
| `auth.clientId` | `tender-web` | `app1` |
| `auth.redirectPath` | `/auth/callback` | `/auth/callback` |
| `auth.trialRealm` · `paidRealmPrefix` · `workspacePathPrefix` | `trial` · `tenant-` · `/t/` | same |
| `auth.idleTimeoutMs` | `1800000` | `1800000` |
| `telemetry` | `/otel`, sample `0.1`, `info` | `/otel`, sample `1`, `debug` |
| `remotes.allowedOrigins` | `[]` | `["http://localhost:5002"]` |
| `i18n` | `en` | `en` |

The full schema is in the SDK's README (Runtime configuration) and LLD §12.1.

### Build time

| Variable | Default | Purpose |
|---|---|---|
| `PLATFORM_ENVIRONMENT` | `prod` for a production build, `local` for `npm run dev` | `__ENVIRONMENT__`, the identity environment passed to `initializeCore` (`local`, `dev`, `test`, `staging`, `prod`) |
| `BUILD_VERSION` | `package.json` `version` | `__BUILD_VERSION__`, and the content of `/version.json` |
| `NODE_AUTH_TOKEN` | — | `npm ci` only: reads `@bcbp-solutions-fzc-llc/*` from GitHub Packages |

The image takes `PLATFORM_ENVIRONMENT`, `BUILD_VERSION` and `SOURCE_DATE_EPOCH` as build args, and the registry token as the BuildKit secret `npm_token`.

`docker.local.env` is for the Keycloak helper scripts (`DOCKER_CLI` on Windows). The shell does not read it.

---

## Security

| Topic | Guidance |
|---|---|
| **Public client** | No client secret. The possession proof is the PKCE verifier |
| **Token storage** | Tokens live in memory only, never in storage. "Remember Email" stores the email only |
| **Redirect** | The SDK checks `state` before the code is exchanged. The redirect URI is `{origin}{auth.redirectPath}` |
| **API calls** | The SDK's `ApiClient` sends the token to the page's own origin only and never sends identity headers. The ESLint plugin enforces subpath imports, no identity headers, no raw `window.*Storage`, no unsafe HTML |
| **Remote code** | Remotes execute in this origin. Entries load only from the page's origin or `remotes.allowedOrigins`, pinned by `integrity` outside local, dev and test |
| **CSP** | The bundle is Trusted-Types and `script-src 'self'` safe (preset output, `installTrustedTypesPolicy`). nginx sets no CSP header; the platform's CloudFront distribution does. Open item: `index.html` still loads Google Fonts, which the platform CSP blocks (LLD §15) |
| **Image** | nginx runs as uid 101. `.env` is not copied into the build context. The registry token is a BuildKit secret and never lands in a layer. Source maps are deleted from the image |
| **Reporting** | [SECURITY.md](./.github/SECURITY.md). Email vijay@bcbpsolutions.com with subject `[web-shell]` |

---

## CI

Five workflow files. Markdown-only pushes do not run `ci.yml`. Job order and the failure runbooks are in [docs/pipeline](./docs/pipeline/README.md).

Every `npm ci` reads `@bcbp-solutions-fzc-llc/*` from GitHub Packages with `GITHUB_TOKEN` (`packages: read`). This repository needs read access on each package's page: Package settings → Manage Actions access → Add repository.

- **`ci.yml`** — orchestrator. `validate-test.yml` and `validate-quality.yml` run in parallel with `build-image` (Hadolint, then a Buildx cache build). Trivy and the smoke job follow the image build; the smoke job sets up Node, runs `npm ci`, then `smoke-tests.sh` (size, startup gate, the smoke suite). Pull requests get a status comment. A push to `main` or `master` also pushes `ghcr.io/bcbp-solutions-fzc-llc/web-shell`, tagged with the branch name and `sha-<short>`, and Cosign-signs that digest.
- **`validate-test.yml`** — `npm ci`, `npm run test:coverage`, the 95% coverage gate, then `npm run build`.
- **`validate-quality.yml`** — ESLint (`--max-warnings 0`) and `npm run typecheck`. Workflow files must use literal operators and LF line endings, `Dockerfile` `FROM` lines must be digest-pinned, `.dockerignore` must exist, and `npm audit --omit=dev --audit-level=high` must pass.
- **`changelog-check.yml`** — a pull request that touches `src/`, `package.json`, `package-lock.json`, `Dockerfile`, `nginx/`, `rsbuild.config.ts`, `config/**`, `public/config/**`, or `index.html` must also update `CHANGELOG.md`.
- **`release.yml`** — tag `vX.Y.Z` or `vX.Y.Z-*`, or a manual run with a tag input. Re-validates, requires a matching changelog section, packs `web-shell_<tag>_dist.tar.gz` (source maps removed), pushes the semver image tags, scans, attaches the SBOM and SLSA provenance, signs with Cosign, and opens the GitHub Release. Tagging does not deploy a cluster.

Image tag rules, the Cosign identity, and the maintainer steps are in [VERSIONING.md](./VERSIONING.md).

Dependabot is enabled for npm, Docker, and GitHub Actions.

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

Two stages, both digest-pinned: `node:26-bookworm` runs `npm ci` and `npm run build`, then deletes the source maps; `nginxinc/nginx-unprivileged:1.31-alpine` serves `/usr/share/nginx/html` as uid 101. The CI smoke job fails the image above 200 MB, requires `/healthz`, `/` (a document that contains `id="app"`), `/config/runtime.json` and `/version.json` to return 200, fails when the image contains a `.map` file, and then runs the smoke suite against the container (`npm run test-smoke`, [test/smoke/README.md](./test/smoke/README.md)). To run it locally: `docker run -d --rm -p 127.0.0.1:18080:8080 web-shell:local`, then `SMOKE_BASE_URL=http://127.0.0.1:18080 npm run test-smoke`.

### Local Keycloak compose

| Container | Image | Host port | Purpose |
|---|---|---|---|
| `keycloak` | `quay.io/keycloak/keycloak:26.8.1` | `8080` | Realm `tenant-bcbp`, client `app1`, theme `bcbp` |

`npm run keycloak:dev` starts that one service. It does not start the shell. Use `npm run dev` for the shell.

### Health

| Endpoint | Returns | Meaning |
|---|---|---|
| `GET /healthz` | `200` and `ok` | nginx is serving. It does not check Keycloak, the IAM APIs or `app2` |

---

## Cross-service dependencies

### Keycloak (through the SDK)

| Call | When |
|---|---|
| `GET /realms/{realm}/protocol/openid-connect/auth` | Browser redirect to sign in, or a silent `prompt=none` restore |
| `POST /realms/{realm}/protocol/openid-connect/token` | Code exchange and refresh |
| `GET /realms/{realm}/protocol/openid-connect/logout` | Sign out |

`{realm}` is the workspace's realm (`trial`, or `tenant-<slug>`). The SDK builds these URLs from `{auth.idpOrigin}/realms/{realm}`; it does not fetch discovery. The shell does not call the Keycloak Admin API. `scripts/seed-keycloak-user.mjs` uses `kcadm` inside the dev container only.

### IAM HTTP APIs (same origin, `/api`)

| Call | When |
|---|---|
| `GET /api/v1/public/tenants/resolve?identifier=` (PUB-1) | The email sign-in screen, and workspace switching. No token |
| `GET /api/v1/me/session-context` (P-35) | Once after sign-in. Without it the app renders with deny-all permissions |

### Dashboard remote (`app2`)

The shell loads `app2`'s entry from `/remotes/manifest.json` in the browser and renders its `./App` with no props; the remote reads the user and sign-out from the SDK. A missing or failing remote stays inside its boundary; the shell keeps running.

### Telemetry

Traces, logs and metrics are exported over OTLP/HTTP to `telemetry.otlpBaseUrl` (`/otel`), gated by consent. The consent stand-in grants `essential` only.

---

## Out of scope

| Concern | Where it lives |
|---|---|
| Passwords, MFA, user registration, token issuance | Keycloak |
| Dashboard layout, tickets, user management screens | `mfe-dashboard` (`app2`) |
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
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Module layout, bootstrap, sign-in and dashboard flows, storage, and the threat model |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Local setup, extension rules, tests, and the pull request checklist |
| [VERSIONING.md](./VERSIONING.md) | SemVer rules, image tags, Cosign verify, how to cut a release |
| [CHANGELOG.md](./CHANGELOG.md) | User-facing history. Releases are still `[Unreleased]` |
| [SECURITY.md](./.github/SECURITY.md) | How to report a vulnerability |
| [.github/pull_request_template.md](./.github/pull_request_template.md) | What a pull request needs, including `npm run test:ci` |
| [.claude/CLAUDE.md](./.claude/CLAUDE.md) | Guidance for Claude Code: critical rules, commands, reference files |
| `platform-reactcommon` README and LLD | The SDK: API overview, integration guide, runtime config reference |

---

## License / ownership

BCBP Solutions FZC LLC — internal platform shell. Not for external distribution.
