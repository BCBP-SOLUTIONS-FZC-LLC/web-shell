# Changelog

All notable changes to this shell are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning aligned with SemVer.

This shell has never been tagged or deployed. There is no released version yet, so everything lives under `[Unreleased]`. `package.json` `version` is `0.0.0` and is not a published release. This file tracks what is currently true and what is still outstanding. The development diary, when one is needed, is `git log`.

Pull requests that change the shell, its dependencies, or the image add an entry under `[Unreleased]`. `.github/workflows/changelog-check.yml` fails a pull request that touches `src/`, `package.json`, `package-lock.json`, `Dockerfile`, `nginx/`, `rsbuild.config.ts`, `config/**`, `public/config/**`, or `index.html` without updating this file. `.github/workflows/release.yml` rejects a tag that has no matching `## [X.Y.Z]` section (`verify-changelog-entry.sh` looks for the version without the `v`).

## [Unreleased]

### Added

- **Sign-in through the platform SDK (`@bcbp-solutions-fzc-llc/frontend-sdk`), Authorization Code + PKCE against Keycloak.** The login page takes a work email. The shell resolves it to a workspace through PUB-1 (`GET /api/v1/public/tenants/resolve`), then redirects the same tab to that workspace's realm with the email as `login_hint`. The callback path is `/auth/callback`. Tokens are held in memory only, never in storage; a reload restores the session silently (`prompt=none`). A known workspace (from `/t/<slug>/` or the SDK's workspace cache) skips the email screen. "Remember Email" stores the email in `localStorage` (`bcbp.rememberEmail`, `bcbp.loginEmail`) and nothing else. Sign-out is global by default: the Keycloak session ends and every tab follows. The shell owns the signed-out, session-ended, device-clock, wrong-workspace, and workspace-not-found screens (`src/platform/SessionScreens.tsx`); none of them signs in without a click.

- **Bootstrap (`src/bootstrap.tsx`).** Runs once behind the async boundary in `src/index.ts`, in the SDK's order: Trusted Types policy → `initializeCore` (service `web-shell`, domain `portal`) → `/config/runtime.json` → consent → tracing, logging, metrics, global error handlers, web vitals → OIDC provider and token source → IAM P-35 session context (`GET /api/v1/me/session-context`) → authorizer, flags, `rememberWorkspace` → i18n → `/remotes/manifest.json` → `/version.json` polling → render inside `<PlatformProvider>`. A failure before the runtime config is loaded shows "The app is unavailable right now." Without a session context the app renders with deny-all permissions and platform flags only.

- **Routes.** Only an authenticated session renders the app. After sign-in the SDK moves the URL under `/t/<slug>/`, and the router uses that as its basename. `/dashboard/*` renders the dashboard remote; any other path redirects to `/dashboard`.

- **Module Federation host.** Built with Rsbuild 2 (Rspack) and `@bcbp-solutions-fzc-llc/webpack-preset/rsbuild` (`pluginPlatform({ role: 'shell' })`): container `shell`, React, React DOM, the OTel API, and every SDK subpath shared as strict singletons, Trusted Types and no `eval` in the output, integrity on every lazily loaded chunk and on the entry script in `index.html`. `/dashboard/*` renders `<RemoteBoundary remote="app2" module="./App">` with `userLabel` (email, then name, then `User`) and `onLogout`. The remote's entry comes from `/remotes/manifest.json`. A remote that fails stays inside its boundary ("Something went wrong. / Try again").

- **Production image.** Two digest-pinned stages: `node:26-bookworm` runs `npm ci` (registry token as the BuildKit secret `npm_token`) and `npm run build`, then deletes the hidden source maps; `nginxinc/nginx-unprivileged:1.31-alpine` serves `dist/` on port **8080** as uid **101**. `GET /healthz` returns `ok`. `index.html`, `/config/runtime.json`, `/remotes/manifest.json`, and `/version.json` are `Cache-Control: no-cache`. Hashed files under `/assets/` are immutable. Unknown paths fall through to `index.html`. Build args: `BUILD_VERSION`, `SOURCE_DATE_EPOCH`, `PLATFORM_ENVIRONMENT` (default `prod`). Everything environment-specific is in `/config/runtime.json` at run time. Image name: `ghcr.io/bcbp-solutions-fzc-llc/web-shell`.

- **CI (`2026-10-27`).** `.github/workflows/ci.yml` on pull requests and on pushes to `main` or `master` (Markdown-only commits skipped):
  - `validate-test` — Vitest unit and integration, then `.github/scripts/coverage-gate.mjs` at **95%** for statements, branches, functions, and lines, then `npm run build`.
  - `validate-quality` — ESLint with the platform rules (`--max-warnings 0`), `tsc` over sources and tests, workflow files use literal operators and LF, Dockerfile `FROM` lines are digest-pinned, `.dockerignore` exists, and `npm audit --omit=dev --audit-level=high` passes.
  - `npm ci` reads `@bcbp-solutions-fzc-llc/*` from GitHub Packages with `GITHUB_TOKEN` (`packages: read`); the image builds pass the same token as the BuildKit secret `npm_token`.
  - Image build runs Hadolint first, then Buildx (`linux/amd64`). Trivy fails the job on unfixed CRITICAL or HIGH findings. The smoke script fails an image over 200 MB, requires `/healthz`, `/` (document contains `id="app"`), `/config/runtime.json`, and `/version.json`, and fails when the image contains a `.map` file.
  - A push to `main` or `master` publishes the image with the branch tag and `sha-<short>`, and Cosign-signs the digest.
  - `.github/workflows/changelog-check.yml` enforces the changelog rule above.
  - `.github/workflows/release.yml` on `vX.Y.Z` and `vX.Y.Z-*` re-validates, requires the changelog section, packs `web-shell_<tag>_dist.tar.gz`, pushes image tags `X.Y.Z`, `X.Y`, and `X` (plus `latest` when the tag has no pre-release suffix), attaches the SBOM and SLSA provenance, signs with Cosign, and opens the GitHub Release. Tagging does not deploy a cluster.
  - Dependabot is enabled for npm, Docker, and GitHub Actions.

- **Test suite.** Vitest 5, happy-dom, Testing Library. `test/unit` covers the IAM port mappings, the entry point, remember-email, consent, the screen host, `BrandLogo`, and the login variant. `test/integration` covers both login layouts, the carousel, the session screens, `App` routing, and the bootstrap order and branches with every SDK subpath replaced by a recording fake. Nothing in the suite calls Keycloak, the IAM APIs, or port 5002.

- **Local Keycloak.** `docker-compose.keycloak.yml` runs Keycloak 26.8.1 in `start-dev` and imports realm `tenant-bcbp` (`keycloak/import/tenant-bcbp-realm.json`) with public client `app1` (standard flow, PKCE S256, redirect URIs `http://localhost:5001/*` and `http://127.0.0.1:5001/*`, post-logout redirect `+`) and the `bcbp` login theme. `npm run keycloak:setup` starts it, waits until it is ready, and seeds the local user. Admin console: `http://localhost:8080` (`admin` / `admin`).

- **Local platform stand-ins.** `npm run dev` (Rsbuild dev server, `http://localhost:5001`) serves `/config/runtime.json` from `config/runtime.local.json` and `/remotes/manifest.json` from `config/remotes.local.json`, answers the two IAM endpoints with stubs (every identifier resolves to realm `tenant-bcbp`, slug `bcbp`, role `tenant_admin`), and drops `/otel` posts (`config/dev-platform.mjs`). `DEV_API_URL` proxies `/api` to a real API instead; `DEV_REALM` changes the stubbed realm.

- **Pre-commit hook.** `.githooks/pre-commit`, installed with `npm run hooks:install`, refuses a staged `.env` or `docker.local.env` and runs the workflow hygiene checks, the Dockerfile digest pin, and the typecheck. The test suite and the image scan stay in CI.

- **Operator docs.** [README.md](./README.md) (routes, federation, local setup, CI, image), [ARCHITECTURE.md](./ARCHITECTURE.md) (module layout, sign-in and dashboard flows, storage, threat model), [docs/](./docs/README.md) (diagram sources, the CI and release pipeline, runbooks for the coverage gate, the image scan, and a failed tag), [VERSIONING.md](./VERSIONING.md) (SemVer for the image and the runtime contract, tag scheme, Cosign verify, maintainer steps), [CONTRIBUTING.md](./CONTRIBUTING.md) (how to extend the shell and what a pull request must include).

### Changed

- **Role map keyed on IAM's roles (`2026-11-04`).** `src/platform/permissions.ts` now keys only on the closed set the session context returns (iam-org-membership LLD §5.4 P-35, rev 2.47, #48): `member`, `tenant_owner`, `tenant_admin`, `tender_admin`. **Fixes tenant owners:** `tenant_owner`, the role the signup owner holds (often without `tenant_admin`), was missing, so owners had no `manage:members` and `app2` hid User management from them; it now has `tenant_admin`'s grants. Every role gets `read:members` (any active member may view members, §10.4); only `tenant_owner` and `tenant_admin` get `manage:members`. The `preparator` key is gone: it is a department level (`departments[].level`), never a role, so it never matched. `tender_admin` gets `read`, `update` and `delete` on tenders, provisional until Tender Service confirms them (IAM does not own tender rights). The dev stub's session context now returns `member`, `tenant_owner` (`DEV_ROLES` overrides).

- **Dependencies (`2026-11-03`).** Node.js 22 → 26 (image builder `node:26-bookworm`, CI `node-version: 26`, `docker:dev` scripts). Runtime image `nginxinc/nginx-unprivileged` 1.30-alpine → 1.31-alpine, with `apk upgrade` at build time so Alpine fixes the base has not picked up still land. TypeScript 6.0 → 7.0. Patch and minor bumps: `react`/`react-dom` 19.3.1, `react-router-dom` 7.18.5, `keycloak-js` 26.2.5, `@module-federation/vite` 1.23.8, `vite` 8.3.5, `vitest`/`@vitest/coverage-v8` 5.1.0, `@vitejs/plugin-react` 6.2.1, `tailwindcss`/`@tailwindcss/vite` 4.3.4, `postcss` 8.5.32, `autoprefixer` 10.6.2, `@types/node` 26.6.6. Actions: `docker/build-push-action` v7.4.0, `docker/login-action` v4.7.0, `docker/setup-buildx-action` v4.4.1, `github/codeql-action` v4.39.1, `hadolint/hadolint-action` v3.5.0, `actions/upload-artifact` v7.0.2, `actions/download-artifact` v8.0.2. The Module Federation `requiredVersion` ranges stay at `^19.3.0` / `^7.18.4` so remotes on earlier patches still load.

- **Breaking: the shell moved to the platform SDK and Rsbuild (`2026-11-03`).** `@bcbp-solutions-fzc-llc/frontend-sdk`, `webpack-preset`, and `eslint-plugin` `1.0.0-alpha.2` (pinned exactly, all three on one version) from GitHub Packages, through `.npmrc` and `NODE_AUTH_TOKEN` with `read:packages`. Vite and `@module-federation/vite` are replaced by Rsbuild 2 and the preset's Rsbuild plugin (`rsbuild.config.ts`); Tailwind runs through `@tailwindcss/postcss`. All `VITE_*` variables are gone: the environment is `/config/runtime.json` (`public/config/runtime.json` is the default the image ships; it points at `https://auth.bcbpsolutions.com`, client `tender-web`) and `/remotes/manifest.json` (the image ships `{}`). The redirect URI is now `/auth/callback` and signed-in URLs live under `/t/<slug>/`. The local realm is renamed `bcbp` → `tenant-bcbp`, because the SDK requires a paid workspace's realm to be `tenant-<slug>`; recreate the Keycloak container to re-import it. TypeScript is back on `~6.0.3`: `typescript-eslint` has no TypeScript 7 support yet, and the SDK builds on 6. ESLint (`npm run lint`) with `@bcbp-solutions-fzc-llc/eslint-plugin` recommended rules, and `npm run typecheck` (`tsconfig.test.json`, sources and tests), run in `validate-quality`. Hidden source maps are deleted from the image and from the release bundle.

### Removed

- **Breaking (`2026-11-03`).** The shell no longer exposes `./App` and no longer serves `remoteEntry.js` or `mf-manifest.json`; the SDK's model is a shell that only hosts remotes. Removed with it: `src/main.tsx`, `src/auth/` (`oauth-pkce.ts`, `keycloak.ts`, `keycloak.config.ts`), the `sessionStorage['app1.oauth.session']` and `localStorage['app1.oauth.pending.<state>']` records, the login page's Keycloak reachability banner, the `/__kc` dev proxy, `keycloak-js`, `vite.config.ts`, `module-federation.config.ts`, `@mf-types/`, `autoprefixer`, and the `VITE_KEYCLOAK_URL` / `VITE_APP2_URL` image build args.

### Known gaps

- **`app2` cannot load through the SDK yet.** The SDK's `loadRemote` injects a classic script and reads the container from `window.app2`. `mfe-dashboard` is a Vite ES-module remote, so the dashboard shows the boundary's error until it is rebuilt with `@bcbp-solutions-fzc-llc/webpack-preset` (`role: 'remote', name: 'app2', exposes: { './App': … }`). That change is in the dashboard's repository, not this one.

- **The IAM endpoints are stubbed locally only.** PUB-1 and P-35 must exist behind `/api` in every real environment. Without P-35 the shell renders with deny-all permissions and logs a warning.

- **The shipped runtime config is a default.** `public/config/runtime.json` uses the SDK defaults (`https://auth.bcbpsolutions.com`, client `tender-web`). Each environment serves its own `/config/runtime.json` and `/remotes/manifest.json` (CloudFront, or a file mounted over the image's). The image's manifest is `{}`, so the dashboard slot is empty until one is provided.

- **No CSP headers yet.** The bundle is CSP-safe (Trusted Types policy, no `eval`, no inline script), but `nginx/default.conf` sets no `Content-Security-Policy`. The platform's headers come from CloudFront (`platform-reactcommon/examples/cloudfront`).

- **Consent is a stand-in.** `src/platform/consent.ts` grants `essential` only, so telemetry and analytics export stays off until a real consent management platform is wired in.

- **No cluster deploy.** `release.yml` publishes the image and the GitHub Release. Nothing in this repo applies a Helm chart or rolls a deployment. An operator rolls the new tag and serves that environment's `/config/runtime.json` and `/remotes/manifest.json`.

- **Pre-v1.** Per SemVer, a `v0.x` tag would not promise compatibility across minor bumps. No tag exists yet. The contract table in [VERSIONING.md](./VERSIONING.md) is what a future `v1.0.0` would freeze.

### Current architecture notes

- This is a static browser app. The production process is nginx. There is no Go service, database, or message bus in this repository.
- Only `PLATFORM_ENVIRONMENT` and `BUILD_VERSION` are compiled in (`__ENVIRONMENT__`, `__BUILD_VERSION__`). Everything else is read from `/config/runtime.json` at start-up and validated strictly by the SDK; an unknown key or an invalid value stops the app with the "unavailable" message.
- The access token is sent only to the page's own origin (`/api`), by the SDK's `ApiClient`. Identity headers are never sent from the browser.
- Port **8080** is Keycloak in the local compose file and the listen port of the shell image. Run the image with a different host port when both are up.
- Coverage is enforced in CI and is not lowered for this repo. `COVERAGE_THRESHOLD` can override `.github/scripts/coverage-gate.mjs` locally. The workflow does not set it.
- `CODEOWNERS` requests review from `@BCBP-SOLUTIONS-FZC-LLC/web-shell`, including workflow files, the Dockerfile, and `nginx/`.
