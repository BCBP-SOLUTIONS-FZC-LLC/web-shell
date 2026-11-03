# Contributing

This is the internal browser shell for the BCBP micro-frontend platform. This guide covers development setup, how to extend the shell, test requirements, and the pull request process for `web-shell`.

Product behavior is described in [README.md](./README.md). Module layout and the sign-in flow are described in [ARCHITECTURE.md](./ARCHITECTURE.md). Image tags and releases are described in [VERSIONING.md](./VERSIONING.md).

## Prerequisites

- Node.js 22 (matches CI and the image builder)
- npm
- Docker, when you want the local Keycloak realm or a production-image smoke run

There is no private module download. `npm ci` uses the committed `package-lock.json`.

## Development setup

```bash
git clone https://github.com/BCBP-SOLUTIONS-FZC-LLC/web-shell
cd web-shell
npm ci
cp .env.example .env
npm run hooks:install     # copies .githooks/pre-commit into .git/hooks
npm run keycloak:setup   # local realm on :8080; first start can take 1–2 minutes
npm run dev               # shell on http://localhost:5001
npm run test:ci           # unit, integration, e2e, then the 95% coverage gate
npm run build             # tsc and the production bundle
```

`npm test` runs the same Vitest suite without the coverage gate. Docker is required for Keycloak and for building the image. The test suite uses happy-dom and does not need Docker.

The dashboard remote is a separate repo. Start `mfe-dashboard` so `http://localhost:5002/remoteEntry.js` is served, or `/dashboard` shows the load-failure message. Tests alias `app2/App` to `test/fixtures/DashboardApp.tsx` and do not fetch that port.

Local ports: shell **5001**, Keycloak **8080**, dashboard **5002**. The production image also listens on **8080**. Map it to another host port when Keycloak is already running (`docker run -p 18080:8080`).

`npm run hooks:install` copies `.githooks/pre-commit` into `.git/hooks/pre-commit`. Run it again after that file changes. On each commit the hook refuses a staged `.env` or `docker.local.env`, then runs the same workflow, line-ending, and Dockerfile pin checks as `validate-quality`, then `tsc --noEmit`. The Vitest suite, the 95% gate, Hadolint, Trivy, and the image smoke script stay in CI. Run `npm run test:ci` and `npm run build` before you open a pull request. Git for Windows runs the hook with its Bash.

## Project layout

```
src/
  main.tsx               ← Captures the OAuth callback, mounts #app
  App.tsx                ← Auth bootstrap, routes, dashboard error boundary
  pages/LoginPage.tsx    ← Email form, Keycloak reachability, remembered email
  components/            ← Shell-owned UI (BrandLogo)
  auth/
    keycloak.config.ts   ← Reads VITE_* when the module loads
    keycloak.ts          ← Login, logout, session label
    oauth-pkce.ts        ← PKCE, token exchange, sessionStorage
module-federation.config.ts  ← Container name, expose, shared singleton versions
vite.config.ts           ← Port 5001, /__kc dev proxy, app2 remote URL
nginx/default.conf       ← Runtime server for dist/
Dockerfile               ← Node 22 builder, nginx-unprivileged runtime
keycloak/                ← Local realm import and the bcbp login theme
scripts/                 ← Local Keycloak compose, health check, user seed, hook install
.githooks/pre-commit     ← Local commit gate; install with npm run hooks:install
test/
  unit/                  ← Auth and small components
  integration/           ← Login page
  e2e/                   ← App routes and auth bootstrap
  fixtures/              ← Stand-in for app2/App
  helpers/load-auth.ts   ← Env stub + dynamic import for auth modules
.github/workflows/       ← ci, test, quality, changelog, release
```

`src/` does not import the dashboard's source. Vite resolves `app2/App` from `${VITE_APP2_URL}/remoteEntry.js`. `npm run build` typechecks `src/` only (`tsconfig.json` `include`).

## Extending the shell

### Adding a route

1. Add the route in `src/App.tsx` inside the existing `BrowserRouter`. Signed-out and signed-in behavior both belong in that tree.
2. Keep unknown paths on the catch-all redirect (`/` when signed out, `/dashboard` when signed in) unless the new route is part of the public contract.
3. Add an end-to-end test in `test/e2e/` that visits the path signed out and signed in.
4. A new public path is a contract change. Update the routes table in `README.md` and, if a host depends on it, the runtime-contract table in `VERSIONING.md`.

### Adding sign-in behavior

1. Put PKCE, token, and storage changes in `src/auth/oauth-pkce.ts`. Keep `src/auth/keycloak.ts` as the facade `App` and `LoginPage` call.
2. `keycloakConfig` reads `import.meta.env` when the module loads. Tests that change env must call `stubKeycloakEnv` and `loadAuthModules()` from `test/helpers/load-auth.ts` (`vi.stubEnv`, then `vi.resetModules`, then dynamic import). A static import will keep the old values.
3. An empty config is a whitespace env value such as `' '`, because `env()` trims. An empty-string stub is unreliable.
4. Add unit coverage in `test/unit/oauth-pkce.test.ts` or `test/unit/keycloak.test.ts`. Add an `App` test in `test/e2e/` when the change is visible in the route tree.
5. The shell uses its own PKCE flow. `getKeycloak()` returns `null`. `keycloak-js` is installed and unused by the facade. Switching the session implementation needs a design conversation and a rewrite of the auth tests.

### Adding a Module Federation export or shared dependency

1. Change `module-federation.config.ts`. The container name is `app1`, the file is `remoteEntry.js`, and the exposed module is `./App`.
2. Shared packages are singletons with a `requiredVersion`: `react` `^19.3.0`, `react-dom` `^19.3.0`, `react-router-dom` `^7.18.4`. Raising a required range so `app2` cannot load is a **MAJOR** bump. See [VERSIONING.md](./VERSIONING.md).
3. Props passed into `app2/App` are declared in `src/vite-env.d.ts` (`userLabel`, `onLogout`). Update that declaration, `src/App.tsx`, and `test/fixtures/DashboardApp.tsx` together.
4. Update the federation table in `README.md`.

### Adding an environment variable

1. Add the name to `src/vite-env.d.ts` and read it through the `env()` helper in `src/auth/keycloak.config.ts` when it is auth config. Vite only inlines variables that start with `VITE_`.
2. Add it to `.env.example` with a comment.
3. Add a row to the environment table in `README.md`.
4. If the production image must contain the value, add a Dockerfile `ARG` and `ENV`, and pass the same name from `.github/workflows/ci.yml` and `release.yml` build args. `.dockerignore` excludes `.env`, so a value that exists only in a local `.env` will be empty in the image.
5. `VITE_*` values are compiled into the browser bundle. They are public. Do not put secrets in them.

### Adding an nginx location

1. Edit `nginx/default.conf`. The server listens on 8080.
2. `remoteEntry.js`, `mf-manifest.json`, and `index.html` stay `Cache-Control: no-cache`. Hashed files under `/assets/` stay immutable.
3. Extend `.github/scripts/smoke-tests.sh` when the new path is part of the startup contract.
4. Note the path in the pull request deployment notes. Publishing a tag does not deploy a cluster.

## Testing requirements

| Layer | Location | Docker | Notes |
|---|---|---|---|
| Unit | `test/unit/` | No | Auth modules, `BrandLogo`, `main.tsx`. Auth tests import through `test/helpers/load-auth.ts` |
| Integration | `test/integration/` | No | Login page: configured, unconfigured, and error paths |
| End to end | `test/e2e/` | No | `App` bootstrap, redirects, dashboard mount, auth errors. Remote is the fixture |
| Smoke | CI `smoke` job | Image only | `.github/scripts/smoke-tests.sh`: image ≤ 200 MB, `GET /healthz` returns `ok`, `GET /` contains `id="app"`, `GET /remoteEntry.js` returns 200 |

Run one file:

```bash
npx vitest run test/unit/oauth-pkce.test.ts
npx vitest run test/e2e/app-flows.test.tsx
```

### Tests that protect the contract

These tests pin behavior other repos and the login flow depend on. Change them only when the contract change is intentional, and update `README.md` and `VERSIONING.md` in the same pull request.

- **`test/unit/oauth-pkce.test.ts`** — state mismatch is rejected, a missing verifier is rejected, a code is exchanged once, and the dev proxy `/__kc` is skipped when `DEV` is off.
- **`test/unit/keycloak.test.ts`** — an existing session short-circuits Keycloak, and `getKeycloak()` stays `null`.
- **`test/e2e/app-flows.test.tsx`** — anonymous routes stay on the login page, a stored session opens the dashboard, a thrown remote shows the failure message, and a stale bootstrap from a second effect run is ignored.
- **`test/e2e/app-unconfigured.test.tsx`** and **`test/integration/login-page-unconfigured.test.tsx`** — missing Keycloak env renders the login page and does not redirect.

### Coverage gate

`npm run test:ci` runs Vitest with the v8 reporter and then `.github/scripts/coverage-gate.mjs`. The gate fails when statements, branches, functions, or lines are below **95%**. `COVERAGE_THRESHOLD` overrides the number. CI does not set it. Coverage includes `src/**/*.{ts,tsx}` and excludes declaration files and CSS.

```bash
npm run test:coverage
```

The text report prints uncovered lines. Cover the branch you changed. The gate is the floor, not a request to assert on unreachable lines.

## Typecheck

`npm run build` runs `tsc` before `vite build`. `noUnusedLocals` and `noUnusedParameters` are on. There is no separate ESLint script. CI's quality job checks workflow hygiene, digest-pinned `FROM` lines, LF on workflow scripts, and `npm audit --omit=dev --audit-level=high`.

## Guardrails

- Leave `.env` and `docker.local.env` untracked. Both are gitignored. `.env.example` is the committed template.
- Keep access tokens in `sessionStorage` under `app1.oauth.session`. The `localStorage` copy of `app1.oauth.pending.<state>` exists so the PKCE verifier survives the redirect. Remember-me stores the email only (`bcbp.loginEmail`).
- Keep `VITE_APP2_URL` a build-time origin. Do not take a remote URL from the query string or any other untrusted input. The remote executes in this origin.
- Keep Keycloak Admin API calls in `scripts/` for the local realm seed. The browser shell talks to the authorize, token, logout, and discovery endpoints only.
- Keep Dockerfile `FROM` lines digest-pinned (`image:tag@sha256:...`). `validate-quality.yml` rejects a floating tag.
- Save `.github/scripts/`, `Dockerfile`, and `nginx/` as LF. `.gitattributes` enforces that, and the quality job rejects CR.
- Leave the coverage gate at 95%.

## Documentation update checklist

| What changed | Documents to update |
|---|---|
| Route, sign-in step, or storage key | `README.md` (routes, sign-in, storage table) |
| Federation name, expose, shared range, or `app2` props | `module-federation.config.ts`, `src/vite-env.d.ts`, `README.md` federation table, `VERSIONING.md` when the bump class changes |
| New or renamed `VITE_*` variable | `src/vite-env.d.ts`, `.env.example`, `README.md` environment table, Dockerfile `ARG` and both workflow build-args when the image must bake it |
| nginx path or listen port | `nginx/default.conf`, smoke script when it is a startup check, `README.md` nginx table, PR deployment notes |
| Release, tag, or image-signing behavior | `VERSIONING.md` and `.github/workflows/release.yml` |
| User-visible shell, dependency, image, or nginx change | `CHANGELOG.md` under `[Unreleased]` |

## Branch naming

Feature branches follow one of these forms:

- `feat/<short-topic>` — new capability
- `fix/<short-topic>` — bug fix
- `docs/<short-topic>` — documentation-only change
- `chore/<short-topic>` — dependencies, tooling, CI, refactors with no behavioral change

Base new branches on the latest `main`.

## Pull request checklist

`.github/pull_request_template.md` is the checklist GitHub shows. Match it:

- [ ] `npm run test:ci` passes (unit, integration, e2e, coverage at least 95%)
- [ ] `npm run build` passes (typecheck and production bundle)
- [ ] Manual check when the change is visible: login, remote load, navigation
- [ ] No debug logs, commented-out code, secrets, or `.env` values
- [ ] `CHANGELOG.md` `[Unreleased]` updated when the pull request touches `src/`, `package.json`, `package-lock.json`, `Dockerfile`, `nginx/`, `vite.config.ts`, `module-federation.config.ts`, or `index.html` (`.github/workflows/changelog-check.yml` fails the pull request otherwise)
- [ ] Module Federation expose and shared versions still match consumers
- [ ] New `VITE_*` variables documented, and given a Dockerfile `ARG` when the image build needs them
- [ ] Tokens stay in the existing session storage flow
- [ ] Remote URLs are not taken from untrusted input
- [ ] Documentation checklist above reviewed

`CODEOWNERS` requests review from `@BCBP-SOLUTIONS-FZC-LLC/web-shell`. Workflow files, `Dockerfile`, and `nginx/` are called out there as well.

## Commit style

Use a short imperative subject and say why:

```
Keep the PKCE verifier across the Keycloak redirect

sessionStorage is dropped on some browser handoffs. Copy the pending
record to localStorage and delete it after the code exchange.
```

A one-line subject is enough when the reason is obvious:

```
Add a CI pipeline and a 95% test gate for the shell
```

## Deployment

Releases go through GitHub Actions. Details and the Cosign verify commands are in [VERSIONING.md](./VERSIONING.md).

**On push to `main` or `master`:**

1. `validate-test` (tests, 95% gate, `npm run build`) and `validate-quality` (workflow hygiene, digest pin, production npm audit) run in parallel with the image build.
2. Hadolint runs before the image build.
3. Trivy (CRITICAL and HIGH, unfixed) and the smoke script run after the image exists.
4. The image `ghcr.io/bcbp-solutions-fzc-llc/web-shell` is pushed with the branch tag and `sha-<short>`, then Cosign-signed.

**On a `vX.Y.Z` or `vX.Y.Z-*` tag:** validate, require a matching `## [X.Y.Z]` changelog section, pack `web-shell_<tag>_dist.tar.gz`, push the image, scan, attach the SBOM and SLSA provenance, sign, and open the GitHub Release. The Git tag keeps the `v`. The image tags are `X.Y.Z`, `X.Y`, `X`, and `latest` for a stable release. A pre-release tag publishes `X.Y.Z-rc.N` only.

Tagging does not deploy a cluster. Call out a new `VITE_*` build arg, a shared-range bump, or an nginx path change in the pull request deployment notes so whoever rolls the image can rebuild with the right arguments.
