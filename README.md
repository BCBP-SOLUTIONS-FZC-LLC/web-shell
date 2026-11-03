# web-shell

The browser shell for the BCBP micro-frontend platform. It owns the sign-in page, the Keycloak PKCE session, and the routes that decide whether the user sees that page or the dashboard. After sign-in it loads the dashboard as a Module Federation remote (`app2`) and renders it inside this origin.

**Repository:** `github.com/BCBP-SOLUTIONS-FZC-LLC/web-shell`
**Runtime:** Node.js 26 · Vite 8 · React 19.3 · private npm package `app1` (`"private": true`) · production image is nginx on port **8080**
**Contract:** Module Federation container `app1`, file `remoteEntry.js`, expose `./App`. Versioning of the image and that contract is in [VERSIONING.md](./VERSIONING.md).

---

## Mental model

| This shell owns | Lives elsewhere |
|---|---|
| The login page and the route decision: `/` and `/dashboard/*` show the login page until a session exists; a signed-in visit to `/` redirects to `/dashboard` | Dashboard pages, navigation inside the dashboard, and dashboard data (`mfe-dashboard`, loaded as `app2`) |
| Authorization Code + PKCE (S256) against Keycloak: authorize redirect, code exchange, session in `sessionStorage`, logout | Credentials, password policy, MFA, and token issuance (Keycloak). This repo ships a local realm and theme for development |
| The label passed into the dashboard (`userLabel`) and the logout callback (`onLogout`) | Tenant membership, roles, feature flags, and audit (IAM services) |
| Shared singletons so the remote uses this shell's React: `react` `^19.3.0`, `react-dom` `^19.3.0`, `react-router-dom` `^7.18.4` | Any other remote. Only `app2` is wired today |
| Static hosting of `index.html`, `remoteEntry.js`, `mf-manifest.json`, hashed `/assets/`, and `GET /healthz` | Cluster deploy. Publishing a tag pushes an image; it does not roll a cluster |

`VITE_*` values are compiled into the browser bundle. They are public configuration. Do not put secrets in them.

---

## Why this shell exists

The dashboard is a separate build. The browser still needs one origin that can:

- Send the user to Keycloak and finish the redirect without the dashboard knowing the PKCE details.
- Load `app2/remoteEntry.js` from `VITE_APP2_URL` and keep a single copy of React and React Router.
- Keep serving the document when the remote is down. A failed remote render shows "Dashboard could not be loaded" instead of a blank page.

The shell is both the host and a federation container named `app1`. Another host can mount the exposed `./App`. Local development runs the shell itself at `http://localhost:5001`.

---

## What the browser sees

There is no backend in this repository. The production process is nginx serving the Vite `dist/` tree.

### Routes

| Path | Signed out | Signed in |
|---|---|---|
| `/` | Login page | Redirect to `/dashboard` |
| `/dashboard/*` | Login page | Lazy-loaded `app2/App` |
| anything else | Redirect to `/` | Redirect to `/dashboard` |

While Keycloak's redirect is being exchanged, the page shows "Completing sign-in…". A missing Keycloak config skips the redirect and stays on the login page.

### Sign-in sequence

1. `src/main.tsx` calls `captureOAuthCallbackFromUrl()` before React renders, so a refresh cannot drop `code` and `state`.
2. The login form requires a work email. `redirectToKeycloakLogin` builds an authorize URL with `login_hint`, `state`, and a PKCE S256 challenge, then navigates the same tab to Keycloak.
3. Keycloak redirects to `{origin}/dashboard` (or `VITE_KEYCLOAK_REDIRECT_URI` when that is set) with `code` and `state`.
4. `completeOAuthCallbackFromUrl` checks `state`, posts the code and verifier to the token endpoint, and stores the session at `sessionStorage['app1.oauth.session']`.
5. `App` treats the user as signed in when that session has an `accessToken`, then renders the dashboard.

Logout clears the session and sends the browser to Keycloak's end-session endpoint with `post_logout_redirect_uri` set to `{origin}/`.

In `vite dev`, discovery and token calls try the same-origin proxy `/__kc` first (`vite.config.ts` forwards it to `VITE_KEYCLOAK_URL`). The nginx image calls Keycloak directly. There is no `/__kc` location in `nginx/default.conf`.

### Federation contract

| Item | Value |
|---|---|
| Container | `app1` (`module-federation.config.ts`) |
| Host entry the shell loads | `${VITE_APP2_URL}/remoteEntry.js`, remote name `app2` |
| Exposed module | `./App` → `src/App.tsx` |
| Props this shell passes to `app2/App` | `userLabel: string`, `onLogout: () => void` |
| Shared | `react`, `react-dom`, `react-router-dom`, each `singleton: true` |

`userLabel` is the session email, then the session username, then `User`.

### nginx paths

| Path | Behavior |
|---|---|
| `GET /healthz` | `200` and the text `ok`. No access log |
| `GET /` | Shell document. `index.html` is `Cache-Control: no-cache`. Unknown paths fall through to `index.html` |
| `GET /remoteEntry.js`, `GET /mf-manifest.json` | `no-cache`, `404` when the file is absent |
| `GET /assets/*` | Hashed files, `Cache-Control: public, max-age=31536000, immutable` |

The container listens on **8080** as uid **101**.

---

## Architecture

```
web-shell/
├── src/
│   ├── main.tsx                 # Captures the OAuth callback, mounts #app
│   ├── App.tsx                  # Auth bootstrap, routes, dashboard error boundary
│   ├── pages/LoginPage.tsx      # Email form, Keycloak reachability, remembered email
│   ├── components/BrandLogo.tsx
│   └── auth/
│       ├── keycloak.config.ts   # Reads VITE_* once at module load
│       ├── keycloak.ts          # Login, logout, session label
│       └── oauth-pkce.ts        # PKCE, token exchange, sessionStorage
├── module-federation.config.ts  # name, expose, shared versions
├── vite.config.ts               # Port 5001, /__kc proxy, app2 remote URL
├── nginx/default.conf           # Runtime server for dist/
├── Dockerfile                   # Node 26 builder, nginx-unprivileged runtime
├── keycloak/                    # Local realm import and bcbp login theme
├── scripts/                     # Local Keycloak compose, health check, user seed
├── test/
│   ├── unit/                    # Auth and small components, no router
│   ├── integration/             # Login page
│   ├── e2e/                     # App routes and auth bootstrap
│   └── fixtures/                # Stand-in for app2/App
├── .github/workflows/           # ci, test, quality, changelog, release
└── VERSIONING.md                # Image tags and how to cut a release
```

`src/` never imports the dashboard's source. Vite resolves `app2/App` from the remote at dev and build time. Tests alias that specifier to `test/fixtures/DashboardApp.tsx` so the suite does not fetch port 5002.

Browser storage this shell writes:

| Key | Store | Purpose |
|---|---|---|
| `app1.oauth.session` | `sessionStorage` | Access token, optional refresh and id token, email, username |
| `app1.oauth.pkce_verifier`, `app1.oauth.state`, `app1.oauth.redirect_uri` | `sessionStorage` | In-flight PKCE. Removed after a successful exchange |
| `app1.oauth.pending.<state>` | `sessionStorage`, with a `localStorage` copy | Survives the redirect if the tab's session storage is cleared |
| `bcbp.rememberEmail`, `bcbp.loginEmail` | `localStorage` | "Remember me" on the login form only. No tokens |

---

## Local development

### Prerequisites

- Node.js 26 and npm
- Docker, when you want the local Keycloak realm or the production image

### Setup

```bash
git clone https://github.com/BCBP-SOLUTIONS-FZC-LLC/web-shell
cd web-shell
npm ci
cp .env.example .env
npm run keycloak:setup
npm run dev
```

The shell is at **http://localhost:5001**. Keycloak admin is at **http://localhost:8080** (`admin` / `admin`). The first Keycloak start can take one to two minutes. `npm run keycloak:setup` copies `docker.local.env` when needed, starts the compose stack, waits until Keycloak is ready, and seeds the local user. The seed script prints that user's email. The password it sets is in `scripts/seed-keycloak-user.mjs`.

The dashboard is a second process. Start `mfe-dashboard` so it serves `remoteEntry.js` at `VITE_APP2_URL` (default `http://localhost:5002`). Until it is up, `/dashboard` shows the load-failure message from `DashboardBoundary`.

### Common commands

| Command | Description |
|---|---|
| `npm run dev` | Vite on port 5001, strict port, `/__kc` proxy to Keycloak |
| `npm run build` | `tsc` and the production bundle |
| `npm run preview` | Serve the production bundle on port 5001 |
| `npm test` | Vitest once (unit, integration, e2e) |
| `npm run test:coverage` | Same, with the v8 coverage report |
| `npm run test:ci` | Coverage plus the 95% gate (`.github/scripts/coverage-gate.mjs`) |
| `npm run hooks:install` | Copy `.githooks/pre-commit` into `.git/hooks` |
| `npm run keycloak:dev` | Keycloak in the foreground |
| `npm run keycloak:dev:detach` | Keycloak in the background |
| `npm run keycloak:logs` | Follow the Keycloak container log |
| `npm run keycloak:status` | Readiness check against `http://localhost:8080` |
| `npm run keycloak:setup` | Start Keycloak, wait, seed the local user |
| `npm run keycloak:seed-user` | Seed only, when Keycloak is already up |
| `npm run docker:dev` | Dev server inside a Node 26 container (Windows path mount) |
| `npm run docker:dev:mac` | Same mount syntax for macOS and Linux |

### Run one test file

```bash
npx vitest run test/unit/oauth-pkce.test.ts
npx vitest run test/e2e/app-flows.test.tsx
```

### Local Keycloak

`docker-compose.keycloak.yml` runs `quay.io/keycloak/keycloak:26.8.1` with `start-dev --import-realm`. The imported realm is `bcbp`. The public client is `app1`, standard flow only, PKCE S256, redirect URIs `http://localhost:5001/*` and `http://127.0.0.1:5001/*`. The `bcbp` login theme is mounted from `keycloak/themes/bcbp`.

Port **8080** is Keycloak in this compose file and also the port the shell image listens on. Map the shell image to another host port when both are running. See Docker below.

---

## Testing

| Layer | Path | What it exercises |
|---|---|---|
| Unit | `test/unit/` | Keycloak config, PKCE, the auth facade, `BrandLogo`, `main.tsx` |
| Integration | `test/integration/` | Login page: configured, unconfigured, and error paths |
| End to end | `test/e2e/` | `App` bootstrap, redirects, dashboard mount, auth errors |

Vitest uses happy-dom and Testing Library. `vitest.config.ts` sets `VITE_KEYCLOAK_URL`, realm `bcbp`, and client `app1`, and aliases `app2/App` to the fixture. The fixture throws when `globalThis.__DASHBOARD_THROW__` is set, which is how the error boundary is tested.

### Coverage

`npm run test:ci` fails when statements, branches, functions, or lines fall below **95%**. The gate reads `coverage/coverage-summary.json`. Coverage includes `src/**/*.{ts,tsx}` and excludes declaration files and CSS. The threshold is the same one `validate-test.yml` enforces. It is not lowered for this repo.

---

## Environment variables

Vite inlines these at **build** time. Changing them on a running container has no effect. Restart is not enough. The image has to be rebuilt.

| Variable | Local default (`.env.example`) | Purpose |
|---|---|---|
| `VITE_KEYCLOAK_URL` | `http://localhost:8080` | Keycloak base URL. Required for sign-in |
| `VITE_KEYCLOAK_REALM` | `bcbp` | Realm. Required for sign-in |
| `VITE_KEYCLOAK_CLIENT_ID` | `app1` | Public client id. Required for sign-in |
| `VITE_KEYCLOAK_REDIRECT_URI` | unset → `{origin}/dashboard` | Must match a redirect URI on the Keycloak client |
| `VITE_APP2_URL` | `http://localhost:5002` | Origin of the dashboard `remoteEntry.js` |

`isKeycloakConfigured()` is true only when URL, realm, and client id are all non-empty after trim.

The image build accepts `VITE_KEYCLOAK_URL` and `VITE_APP2_URL` as Docker build args. CI sets them from GitHub Actions variables of the same name, and otherwise uses the localhost defaults. Realm, client id, and redirect URI are **not** image build args, and `.dockerignore` excludes `.env`, so a plain `docker build` compiles those three as empty. Pass them in the build environment before `npm run build` inside the image when you need a configured production bundle. `BUILD_VERSION` and `SOURCE_DATE_EPOCH` are image metadata only.

`docker.local.env` is for the Keycloak helper scripts (`DOCKER_CLI` on Windows). It is not read by Vite.

---

## Security

| Topic | Guidance |
|---|---|
| **Public client** | `app1` has no client secret. The possession proof is the PKCE verifier |
| **Token storage** | The access token stays in `sessionStorage` under `app1.oauth.session`. "Remember me" stores the email only |
| **Redirect** | `state` is checked before the code is exchanged. The redirect URI is the configured value or `{origin}/dashboard` |
| **Remote code** | `app2` executes in this origin. `VITE_APP2_URL` must point at a remote you trust |
| **Image** | nginx runs as uid 101. `.env` is not copied into the build context |
| **Reporting** | [SECURITY.md](./.github/SECURITY.md). Email vijay@bcbpsolutions.com with subject `[web-shell]` |

---

## CI

Five workflow files. Markdown-only pushes do not run `ci.yml`. Job order and the failure runbooks are in [docs/pipeline](./docs/pipeline/README.md).

- **`ci.yml`** — orchestrator. `validate-test.yml` and `validate-quality.yml` run in parallel with `build-image` (Hadolint, then a Buildx cache build). Trivy and the smoke script follow the image build. Pull requests get a status comment. A push to `main` or `master` also pushes `ghcr.io/bcbp-solutions-fzc-llc/web-shell`, tagged with the branch name and `sha-<short>`, and Cosign-signs that digest.
- **`validate-test.yml`** — `npm ci`, `npm run test:coverage`, the 95% coverage gate, then `npm run build`.
- **`validate-quality.yml`** — workflow files must use literal operators and LF line endings, `Dockerfile` `FROM` lines must be digest-pinned, `.dockerignore` must exist, and `npm audit --omit=dev --audit-level=high` must pass.
- **`changelog-check.yml`** — a pull request that touches `src/`, `package.json`, `package-lock.json`, `Dockerfile`, `nginx/`, `vite.config.ts`, `module-federation.config.ts`, or `index.html` must also update `CHANGELOG.md`.
- **`release.yml`** — tag `vX.Y.Z` or `vX.Y.Z-*`, or a manual run with a tag input. Re-validates, requires a matching changelog section, packs `web-shell_<tag>_dist.tar.gz`, pushes the semver image tags, scans, attaches the SBOM and SLSA provenance, signs with Cosign, and opens the GitHub Release. Tagging does not deploy a cluster.

Image tag rules, the Cosign identity, and the maintainer steps are in [VERSIONING.md](./VERSIONING.md).

Dependabot is enabled for npm, Docker, and GitHub Actions.

---

## Docker

### Production image

```bash
docker build -t web-shell:local .
docker run --rm -p 8080:8080 web-shell:local
curl -s http://localhost:8080/healthz
```

When local Keycloak already owns host port 8080:

```bash
docker run --rm -p 18080:8080 web-shell:local
curl -s http://localhost:18080/healthz
```

Two stages, both digest-pinned: `node:26-bookworm` runs `npm ci` and `npm run build`; `nginxinc/nginx-unprivileged:1.31-alpine` serves `/usr/share/nginx/html` as uid 101. The CI smoke test fails the image above 200 MB and requires `/healthz`, `/` (a document that contains `id="app"`), and `/remoteEntry.js` to return 200.

### Local Keycloak compose

| Container | Image | Host port | Purpose |
|---|---|---|---|
| `keycloak` | `quay.io/keycloak/keycloak:26.8.1` | `8080` | Realm `bcbp`, client `app1`, theme `bcbp` |

`npm run keycloak:dev` starts that one service. It does not start the shell. Use `npm run dev` for the shell.

### Health

| Endpoint | Returns | Meaning |
|---|---|---|
| `GET /healthz` | `200` and `ok` | nginx is serving. It does not check Keycloak or `app2` |

---

## Cross-service dependencies

### Keycloak

| Call | When |
|---|---|
| `GET /realms/{realm}/.well-known/openid-configuration` | Login page reachability check, and before the token request |
| `GET /realms/{realm}/protocol/openid-connect/auth` | Browser redirect to sign in |
| `POST /realms/{realm}/protocol/openid-connect/token` | Exchange the authorization code |
| `GET /realms/{realm}/protocol/openid-connect/logout` | Sign out |

The shell does not call the Keycloak Admin API. `scripts/seed-keycloak-user.mjs` uses `kcadm` inside the dev container only.

### Dashboard remote (`app2`)

The shell fetches `${VITE_APP2_URL}/remoteEntry.js` in the browser and renders its `App` with `userLabel` and `onLogout`. A missing remote is a page-level error, not a crash of the login route.

### IAM HTTP APIs

This repository does not call org-membership, authz, or any other platform API. The access token is stored for the session label and is not attached to outgoing API calls here.

---

## Out of scope

| Concern | Where it lives |
|---|---|
| Passwords, MFA, user registration, token issuance | Keycloak |
| Dashboard layout, tickets, user management screens | `mfe-dashboard` (`app2`) |
| Tenant, workspace, and role decisions | IAM services. This shell does not read them yet |
| Notifications, localization, and live updates | Not implemented in this repository |

---

## Contributing

Setup, how to extend the shell, the test gate, and the pull request checklist are in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Related documents

| Document | Description |
|---|---|
| [docs/README.md](./docs/README.md) | Pipeline map, architecture diagrams, and runbooks |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Module layout, sign-in and dashboard flows, storage, and the threat model |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Local setup, extension rules, tests, and the pull request checklist |
| [VERSIONING.md](./VERSIONING.md) | SemVer rules, image tags, Cosign verify, how to cut a release |
| [CHANGELOG.md](./CHANGELOG.md) | User-facing history. Releases are still `[Unreleased]` |
| [SECURITY.md](./.github/SECURITY.md) | How to report a vulnerability |
| [.github/pull_request_template.md](./.github/pull_request_template.md) | What a pull request needs, including `npm run test:ci` |

---

## License / ownership

BCBP Solutions FZC LLC — internal platform shell. Not for external distribution.
