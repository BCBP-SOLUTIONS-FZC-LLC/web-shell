# Changelog

All notable changes to this shell are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning aligned with SemVer.

This shell has never been tagged or deployed. There is no released version yet, so everything lives under `[Unreleased]`. `package.json` `version` is `0.0.0` and is not a published release. This file tracks what is currently true and what is still outstanding. The development diary, when one is needed, is `git log`.

Pull requests that change the shell, its dependencies, or the image add an entry under `[Unreleased]`. `.github/workflows/changelog-check.yml` fails a pull request that touches `src/`, `package.json`, `package-lock.json`, `Dockerfile`, `nginx/`, `vite.config.ts`, `module-federation.config.ts`, or `index.html` without updating this file. `.github/workflows/release.yml` rejects a tag that has no matching `## [X.Y.Z]` section (`verify-changelog-entry.sh` looks for the version without the `v`).

## [Unreleased]

### Added

- **Sign-in with Keycloak, Authorization Code + PKCE (S256).** The login page takes a work email and redirects the same tab to the realm authorize endpoint with `login_hint`, `state`, and a code challenge. `src/main.tsx` captures `code` and `state` before React renders. The token exchange checks `state`, posts the verifier, and stores the session at `sessionStorage['app1.oauth.session']` (access token, and when present the refresh token, id token, email, and username). A second presentation of the same code reuses that session. Logout clears it and sends the browser to the realm end-session endpoint with `post_logout_redirect_uri={origin}/`. "Remember me" stores the email in `localStorage` (`bcbp.rememberEmail`, `bcbp.loginEmail`) and stores no token. The in-flight PKCE record is copied to `localStorage` under `app1.oauth.pending.<state>` so the verifier can survive the redirect, and it is removed after the exchange.

- **Routes.** `/` and `/dashboard/*` show the login page until a session exists. A signed-in visit to `/` redirects to `/dashboard`. Any other path redirects to `/` when signed out and to `/dashboard` when signed in. While the code exchange is running the page shows "Completing sign-in…". Missing `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, or `VITE_KEYCLOAK_CLIENT_ID` leaves the user on the login page and does not call Keycloak.

- **Module Federation host and container.** The shell is container `app1`, file `remoteEntry.js`, and it exposes `./App` (`module-federation.config.ts`). After sign-in, `/dashboard/*` lazy-loads `app2/App` from `${VITE_APP2_URL}/remoteEntry.js` and passes `userLabel` (session email, then username, then `User`) and `onLogout`. Shared singletons, each with `requiredVersion`: `react` `^19.3.0`, `react-dom` `^19.3.0`, `react-router-dom` `^7.18.4`. A remote that throws renders "Dashboard could not be loaded" and leaves the login route usable.

- **Production image.** Two digest-pinned stages: `node:22-bookworm` runs `npm ci` and `npm run build`; `nginxinc/nginx-unprivileged:1.27-alpine` serves `dist/` on port **8080** as uid **101**. `GET /healthz` returns `ok`. `remoteEntry.js`, `mf-manifest.json`, and `index.html` are `Cache-Control: no-cache`. Hashed files under `/assets/` are immutable. Unknown paths fall through to `index.html`. Build args the image accepts today: `VITE_KEYCLOAK_URL`, `VITE_APP2_URL`, `BUILD_VERSION`, `SOURCE_DATE_EPOCH`. Image name: `ghcr.io/bcbp-solutions-fzc-llc/web-shell`.

- **CI (`2026-10-27`).** `.github/workflows/ci.yml` on pull requests and on pushes to `main` or `master` (Markdown-only commits skipped):
  - `validate-test` — Vitest unit, integration, and end-to-end, then `.github/scripts/coverage-gate.mjs` at **95%** for statements, branches, functions, and lines, then `npm run build`.
  - `validate-quality` — workflow files use literal operators and LF, Dockerfile `FROM` lines are digest-pinned, `.dockerignore` exists, and `npm audit --omit=dev --audit-level=high` passes.
  - Image build runs Hadolint first, then Buildx (`linux/amd64`). Trivy fails the job on unfixed CRITICAL or HIGH findings. The smoke script fails an image over 200 MB and requires `/healthz`, `/` (document contains `id="app"`), and `/remoteEntry.js`.
  - A push to `main` or `master` publishes the image with the branch tag and `sha-<short>`, and Cosign-signs the digest.
  - `.github/workflows/changelog-check.yml` enforces the changelog rule above.
  - `.github/workflows/release.yml` on `vX.Y.Z` and `vX.Y.Z-*` re-validates, requires the changelog section, packs `web-shell_<tag>_dist.tar.gz`, pushes image tags `X.Y.Z`, `X.Y`, and `X` (plus `latest` when the tag has no pre-release suffix), attaches the SBOM and SLSA provenance, signs with Cosign, and opens the GitHub Release. Tagging does not deploy a cluster.
  - Dependabot is enabled for npm, Docker, and GitHub Actions.

- **Test suite.** Vitest 5, happy-dom, Testing Library. `test/unit` covers PKCE, the auth facade, config, `BrandLogo`, and `main.tsx`. `test/integration` covers the login page. `test/e2e` covers routing and the dashboard boundary. `app2/App` is aliased to `test/fixtures/DashboardApp.tsx`, so the suite does not fetch port 5002. Auth tests load `src/auth/*` through `test/helpers/load-auth.ts` after `vi.stubEnv` and `vi.resetModules`, because `keycloakConfig` reads the environment when the module loads.

- **Local Keycloak.** `docker-compose.keycloak.yml` runs Keycloak 26.8.1 in `start-dev` and imports realm `bcbp` with public client `app1` (standard flow, PKCE S256, redirect URIs `http://localhost:5001/*` and `http://127.0.0.1:5001/*`) and the `bcbp` login theme. `npm run keycloak:setup` starts it, waits until it is ready, and seeds the local user. Admin console: `http://localhost:8080` (`admin` / `admin`). The shell's dev server is `http://localhost:5001` and proxies `/__kc` to `VITE_KEYCLOAK_URL`. That proxy exists only in `vite dev`. The nginx image calls Keycloak directly.

- **Pre-commit hook.** `.githooks/pre-commit`, installed with `npm run hooks:install`, refuses a staged `.env` or `docker.local.env` and runs the workflow hygiene checks, the Dockerfile digest pin, and `tsc --noEmit`. The test suite and the image scan stay in CI.

- **Operator docs.** [README.md](./README.md) (routes, federation, local setup, CI, image), [ARCHITECTURE.md](./ARCHITECTURE.md) (module layout, sign-in and dashboard flows, storage, threat model), [docs/](./docs/README.md) (diagram sources, the CI and release pipeline, runbooks for the coverage gate, the image scan, and a failed tag), [VERSIONING.md](./VERSIONING.md) (SemVer for the image and the runtime contract, tag scheme, Cosign verify, maintainer steps), [CONTRIBUTING.md](./CONTRIBUTING.md) (how to extend the shell and what a pull request must include).

### Known gaps

- **Realm, client id, and redirect URI are not image build args.** The Dockerfile passes `VITE_KEYCLOAK_URL` and `VITE_APP2_URL` only. `.dockerignore` excludes `.env`. A plain `docker build`, and the current CI build when those two GitHub variables are unset, compiles `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID`, and `VITE_KEYCLOAK_REDIRECT_URI` as empty. The resulting image serves the shell and `/healthz`, and the login page treats Keycloak as unconfigured. A production image has to be built with those three values in the environment before `npm run build`. CI defaults the two build args it does pass to `http://localhost:8080` and `http://localhost:5002`.

- **`keycloak-js` is a dependency and is unused by the facade.** Sign-in is the PKCE implementation in `src/auth/oauth-pkce.ts`. `getKeycloak()` returns `null`. Removing or adopting the library is a separate change. The auth tests pin the current behavior.

- **Dev-only npm advisory.** `@module-federation/dts-plugin` pulls `undici` advisories that `npm audit` reports as high. They are not in the production dependency set, so `npm audit --omit=dev` is clean and the quality gate passes. `npm audit fix --force` would downgrade `@module-federation/vite`. The image is scanned again by Trivy.

- **No cluster deploy.** `release.yml` publishes the image and the GitHub Release. Nothing in this repo applies a Helm chart or rolls a deployment. An operator rebuilds with the right `VITE_*` values and rolls the new tag.

- **The access token is not sent anywhere.** It is stored for the session label and for the signed-in route check. This shell does not call org-membership, AuthZ, or any other platform API.

- **Pre-v1.** Per SemVer, a `v0.x` tag would not promise compatibility across minor bumps. No tag exists yet. The contract table in [VERSIONING.md](./VERSIONING.md) is what a future `v1.0.0` would freeze.

### Current architecture notes

- This is a static browser app. The production process is nginx. There is no Go service, database, or message bus in this repository.
- Vite inlines every `VITE_*` value at build time. Changing them on a running container does nothing. The values are public in the bundle.
- In `vite dev`, discovery and token calls try `/__kc` first, then the configured Keycloak origin, then that origin with `localhost` rewritten to `127.0.0.1`. The production bundle skips `/__kc`.
- Port **8080** is Keycloak in the local compose file and the listen port of the shell image. Run the image with a different host port when both are up.
- Coverage is enforced in CI and is not lowered for this repo. `COVERAGE_THRESHOLD` can override `.github/scripts/coverage-gate.mjs` locally. The workflow does not set it.
- `CODEOWNERS` requests review from `@BCBP-SOLUTIONS-FZC-LLC/web-shell`, including workflow files, the Dockerfile, and `nginx/`.
