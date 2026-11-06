# Contributing

This is the internal browser shell for the BCBP micro-frontend platform. This guide covers development setup, how to extend the shell, test requirements, and the pull request process for `web-shell`.

Product behavior is described in [README.md](./README.md). Module layout, the bootstrap and the sign-in flow are described in [ARCHITECTURE.md](./ARCHITECTURE.md). Image tags and releases are described in [VERSIONING.md](./VERSIONING.md).

## Prerequisites

- Node.js 26 (matches CI and the image builder)
- npm
- A GitHub token with `read:packages`, SSO-authorised for the organisation, exported as `NODE_AUTH_TOKEN`
- Docker, when you want the local Keycloak realm or a production-image smoke run

`@bcbp-solutions-fzc-llc/frontend-sdk`, `webpack-preset` and `eslint-plugin` are private packages on GitHub Packages. `.npmrc` maps the scope to `https://npm.pkg.github.com` and reads the token from `NODE_AUTH_TOKEN`. Everything else comes from the public registry through the committed `package-lock.json`.

## Development setup

```bash
git clone https://github.com/BCBP-SOLUTIONS-FZC-LLC/web-shell
cd web-shell
gh auth refresh -s read:packages
export NODE_AUTH_TOKEN=$(gh auth token)
npm ci
npm run hooks:install     # copies .githooks/pre-commit into .git/hooks
npm run keycloak:setup    # local realm tenant-bcbp on :8080; first start can take 1–2 minutes
npm run dev               # shell on http://localhost:5001, with stubbed IAM endpoints
npm run lint              # ESLint with the platform rules
npm run arch-lint         # component boundaries (.dependency-cruiser.cjs)
npm run typecheck         # tsc over src/ and test/
npm run test:ci           # unit, integration and e2e, then the 95% coverage gate
npm run build             # tsc and the production bundle
```

`npm test` runs the same Vitest suite without the coverage gate. Docker is required for Keycloak and for building the image. The test suite uses happy-dom and does not need Docker.

The dev server serves `/config/runtime.json` and `/remotes/manifest.json` from `config/`, and stubs PUB-1 and P-35 so sign-in works with only Keycloak running (`config/dev-platform.mjs`). `DEV_API_URL=https://… npm run dev` proxies `/api` to a real API instead.

The dashboard remote is a separate repo. Start `mfe-dashboard` so `http://localhost:5002/remoteEntry.js` is served (it builds as remote `dashboard` with the preset's Rsbuild plugin); otherwise `/t/bcbp/dashboard` shows the remote boundary's error. Tests never fetch that port: the integration tests replace `RemoteBoundary`, and the e2e suite stubs the remote's entry script.

Local ports: shell **5001**, Keycloak **8080**, dashboard **5002**. The production image also listens on **8080**. Map it to another host port when Keycloak is already running (`docker run -p 18080:8080`).

`npm run hooks:install` copies `.githooks/pre-commit` into `.git/hooks/pre-commit`. Run it again after that file changes. On each commit the hook refuses a staged `.env` or `docker.local.env`, then runs the same workflow, line-ending, and Dockerfile pin checks as `validate-quality`, then `tsc --noEmit`. ESLint, the Vitest suite, the 95% gate, Hadolint, Trivy, and the image smoke script stay in CI. Run `npm run lint`, `npm run test:ci` and `npm run build` before you open a pull request. Git for Windows runs the hook with its Bash.

## Project layout

`src/` follows the Frontend Architecture Constitution's structure: presentation → application → domain; infrastructure implements domain contracts; `app/` is the composition root.

```
src/
  app/
    bootstrap/index.ts   ← Async boundary (Rsbuild's entry); "unavailable" message on a fatal start-up error
    bootstrap/bootstrap.tsx ← Composition root: SDK start-up sequence, session handling, wiring, render
    providers/ShellRoot.tsx ← PlatformProvider with the live session context
    routes/App.tsx       ← Signed-in routes, dashboard RemoteBoundary, widgets with the SDK's state
    layouts/             ← screen.tsx (full-screen host), sessionScreens.tsx (mounts the session screens)
  presentation/
    pages/login/         ← LoginPage, useEmailSignIn (the remembered-email repository is passed in)
    features/session-screens/ ← Email sign-in, signed out, session ended, device clock, wrong workspace (components)
    components/          ← BrandLogo, PageLinks
    widgets/             ← Update notice, missing-permissions notice (state passed in)
  application/           ← Use cases (no React, no browser APIs): resolveWorkspace, requestPasswordReset, loadSessionContext; signIn.ts
  domain/                ← Contracts, errors, rules: RememberedEmailRepository, WorkspaceNotFoundError, permissions (role map)
  infrastructure/
    api/iam.ts           ← PUB-1 resolver and P-35 session context (the SDK's /auth ports)
    auth/passwordReset.ts ← Keycloak reset-credentials URL for a workspace
    storage/rememberedEmail.ts ← "Remember Email" in localStorage (the one raw-storage file)
    federation/navigator.ts ← The router as the SDK's navigate() target
    i18n/shellMessages.ts ← Registers the shell's text before any screen
  shared/
    i18n/                ← The shell's text: en.json (keys → English), catalogues.ts, useShellText, shellText
    constants/links.ts   ← Help and legal links (shown only with an official URL)
    ui/                  ← Images, theme, index.css
    types/globals.d.ts   ← __ENVIRONMENT__, __BUILD_VERSION__
rsbuild.config.ts       ← Platform plugin, React, Tailwind, dev server
config/                  ← Dev only: runtime.local.json, remotes.local.json, dev-platform.mjs
public/config/runtime.json  ← Runtime config the image ships (production defaults)
public/remotes/manifest.json ← Remote manifest the image ships ({})
eslint.config.js         ← typescript-eslint, React hooks, @bcbp-solutions-fzc-llc rules
.dependency-cruiser.cjs  ← Architecture lint: components and what each may depend on
.npmrc                   ← GitHub Packages scope and NODE_AUTH_TOKEN
nginx/default.conf       ← Runtime server for dist/
Dockerfile               ← Node 26 builder, nginx-unprivileged runtime
keycloak/                ← Local realm import (tenant-bcbp) and the bcbp login theme
scripts/                 ← Local Keycloak compose, health check, user seed, hook install
.githooks/pre-commit     ← Local commit gate; install with npm run hooks:install
test/
  unit/                  ← IAM mappings, entry point, small helpers, dev middleware
  integration/           ← Login pages, session screens, App, bootstrap (SDK faked)
  e2e/                   ← The real shell and SDK against test/fixtures fakes
  fixtures/              ← FakeKeycloak, FakeNetwork, FakeBroadcastChannel
  smoke/                 ← GET-only checks against the image or a deployment (npm run test-smoke)
  browser/               ← Playwright: the build in Chromium, Firefox, WebKit under the production CSP (npm run test-browser)
docs/lld/web-shell-lld.md ← Low-level design (the contract)
.claude/                 ← Claude Code guidance, settings (hooks), hook scripts, reviewer agents, skills
.mcp.json                ← Claude Code MCP servers (context7, pinned)
.github/workflows/       ← ci, test, quality, changelog, release
```

`src/` imports the SDK through public subpaths only, and never the dashboard's source. `npm run build` typechecks `src/` only (`tsconfig.json`); `npm run typecheck` adds `test/` (`tsconfig.test.json`).

## Extending the shell

### Adding a route

1. Add the route in `src/app/routes/App.tsx` inside the existing `BrowserRouter`. It renders only for a signed-in user, under the `/t/<slug>` basename.
2. Keep unknown paths on the catch-all redirect to `/dashboard` unless the new route is part of the public contract.
3. Call `useRouteTemplate('/t/:slug/…')` in the route's component so telemetry groups by template.
4. Add a test in `test/integration/app.test.tsx` that visits the path.
5. A new public path is a contract change. Update the routes table in `README.md` and, if a host depends on it, the runtime-contract table in `VERSIONING.md`.

### Changing sign-in or session behaviour

1. PKCE, tokens, refresh, idle timeout and cross-tab sign-out belong to the SDK (`@bcbp-solutions-fzc-llc/frontend-sdk/auth`). Change them in `platform-reactcommon`, not here.
2. The shell's part is `src/app/bootstrap/bootstrap.tsx` (which screen, when to call `idp.login`), the screens in `src/presentation/features/session-screens/` (mounted by `src/app/layouts/sessionScreens.tsx`), and the IAM ports in `src/infrastructure/api/iam.ts`.
3. No screen may sign in without a click after a logout, an expiry or a device-clock refusal.
4. Cover a new branch in `test/integration/bootstrap.test.tsx` (SDK subpaths are fakes there) or `test/integration/session-screens.test.tsx`. A change the user sees in the sign-in or sign-out flow also gets a case in `test/e2e/shell.test.tsx`, which runs the real SDK.
5. Update LLD §5–§6 and `.claude/request-flows.md`.

### Adding a remote or changing what the shell passes to one

1. Add the remote to `config/remotes.local.json` for development. Each environment's `/remotes/manifest.json` comes from the deploy pipeline.
2. Render it with `<RemoteBoundary remote="<name>" module="./<Module>" props={…} />`. The remote must be built with `@bcbp-solutions-fzc-llc/webpack-preset` (`role: 'remote'`).
3. The shared map comes from the preset; do not add entries in `rsbuild.config.ts`. Bumping the SDK raises the version remotes require; see [VERSIONING.md](./VERSIONING.md).
4. `dashboard` `./App` gets no props (`src/app/routes/App.tsx`). Data a remote needs from the shell goes into the `PlatformProvider` shell value and is read through SDK hooks, never props. Update the federation table in `README.md`.

### Adding a runtime config key or a build constant

1. Runtime settings live in `/config/runtime.json` and are validated by the SDK, which rejects unknown keys. A new key is an SDK schema change; add it there first, then to `public/config/runtime.json` and `config/runtime.local.json`.
2. A build-time constant goes in `rsbuild.config.ts` `source.define`, `src/shared/types/globals.d.ts`, and `vitest.config.ts` `define`. If the image needs it, add a Dockerfile `ARG` and pass it from the workflows' `build-args`.
3. Add a row to the configuration tables in `README.md`.
4. Runtime config is served to every browser. Do not put secrets in it.

### Adding or changing user-facing text

1. Add a key to `src/shared/i18n/en.json` (`area.thing`, e.g. `login.heading`; placeholders `{name}`, ICU-lite).
2. Render it with `useShellText()` in React, or `shellText()` outside it (an error message). `ShellKey` makes an unknown key a type error.
3. Never write the words in the component: `test/unit/shell-text.test.ts` reads presentation's syntax tree and fails JSX text, `{'…'}` children, literal `aria-*`, `alt`, `title`, `placeholder` and `label` attributes, and `textContent` / `innerText` assignments. Brand words (`BCBP SOLUTIONS`, the logo's alt) are its only exceptions. It cannot see words in plain string data (an array, a constant, a fallback), so type those as `ShellKey`.
4. An error shown to the user is a key too: the session screens map every failure to `login.workspaceNotFound`, `login.error.signIn` or `login.error.passwordReset`, never an error's own message.
5. A new locale: add `<locale>.json` next to `en.json`, add it to `CATALOGUES` in `src/shared/i18n/catalogues.ts` and to the environments' `runtime.json` `i18n.supportedLocales`. A key missing in it falls back to the default locale's catalogue (the SDK); a locale with no catalogue of its own gets its language's, else English (`catalogueFor`).

### Adding a metric

Follow [docs/observability.md § Adding a metric](docs/observability.md#adding-a-metric): pick the tier with its decision tree, create it with the SDK's `getServiceMeter` (Tier 3, `portal_web_shell_*`) or `getDomainMeter` (a ratified Tier 2 name), add it to the Inventory, and run `npm run metrics-check`. Never create `platform_*` metrics or use the OpenTelemetry metrics API directly.

### Adding an nginx location

1. Edit `nginx/default.conf`. The server listens on 8080.
2. `index.html`, `/config/runtime.json`, `/remotes/manifest.json` and `/version.json` stay `Cache-Control: no-cache`. Hashed files under `/assets/` stay immutable.
3. Add the behaviour to `test/smoke/deployment.test.ts` (and `smoke-tests.sh` only for a startup check), and update LLD §10.1.
4. Note the path in the pull request deployment notes. Publishing a tag does not deploy a cluster.

## Testing requirements

| Layer | Location | Docker | Notes |
|---|---|---|---|
| Unit | `test/unit/` | No | IAM mappings and ports, entry point, remember-email, consent, screen host, `BrandLogo`, session-context retry, navigator, dev platform middleware |
| Integration | `test/integration/` | No | Login layouts and carousel, session screens, `App`, bootstrap order and branches. SDK subpaths are `vi.mock` fakes where needed; axe-core over every shell screen (`accessibility.test.tsx`) |
| End to end | `test/e2e/` | No | The real shell and SDK against `test/fixtures/` fakes (Keycloak, network, BroadcastChannel); only the remote's entry script is stubbed |
| Smoke | `test/smoke/`, CI `smoke` job | Image or deployment | `.github/scripts/smoke-tests.sh`: image ≤ 200 MB and the startup gate, then `npm run test-smoke` against the container (SPA rule, Cache-Control, integrity, 404s, SDK-validated runtime files). [test/smoke/README.md](./test/smoke/README.md) |
| Browser | `test/browser/`, CI `browser` job | `dist/` | Playwright over HTTPS with the production CSP: fonts, sign-in, the remote with integrity, `navigate()`, sign-out POST, start-up report, contrast |
| Dashboard contract | `test/browser/dashboard.spec.ts`, CI `dashboard-contract` | A built mfe-dashboard `dist/` (`REMOTE_DIST`) | The real remote in this shell: integrity, CSS, role map, navigation, Logout |

Run one file:

```bash
npx vitest run test/integration/bootstrap.test.tsx
npx vitest run test/unit/iam.test.ts
```

### Tests that protect the contract

These tests pin behavior other repos and the login flow depend on. Change them only when the contract change is intentional, and update `README.md` and `VERSIONING.md` in the same pull request.

- **`test/integration/bootstrap.test.tsx`** — the exact SDK initialisation order, no automatic login after a logout or a device-clock refusal, the app never renders for a wrong-workspace login, deny-all without a session context, and the app unmounts on sign-out.
- **`test/unit/iam.test.ts`** — the PUB-1 → `Workspace` and P-35 → `SessionContext` ports, through the real `ApiClient` (`createTestPlatform`, `mockApi`), against the SDK's contract cases in `@bcbp-solutions-fzc-llc/frontend-sdk/contracts`; PUB-1 is called without a token.
- **`test/integration/session-screens.test.tsx`** — "not found" and "unreachable" show the same message.
- **`test/integration/app.test.tsx`** — `/dashboard/*` renders `dashboard` `./App` with no props, under the workspace basename.
- **`test/e2e/shell.test.tsx`** — the whole sign-in with the real SDK: PKCE to the realm PUB-1 names, tokens never stored, the URL under `/t/<slug>/`, the remote reading the user and permissions through SDK hooks, and no silent sign-in after a global sign-out.
- **`test/smoke/deployment.test.ts`** — what nginx (and CloudFront, live) must serve: only extension-less paths get `index.html`, the runtime files are uncached and pass the SDK's validation, hashed assets are immutable and match their integrity.

### Coverage gate

`npm run test:ci` runs Vitest with the v8 reporter and then `.github/scripts/coverage-gate.mjs`. The gate fails when statements, branches, functions, or lines are below **95%**. `COVERAGE_THRESHOLD` overrides the number. CI does not set it. Coverage includes `src/**/*.{ts,tsx}` and excludes declaration files and CSS.

```bash
npm run test:coverage
```

The text report prints uncovered lines. Cover the branch you changed. The gate is the floor, not a request to assert on unreachable lines.

## Lint and typecheck

`npm run lint` runs ESLint with typescript-eslint, the React hooks rules, and `@bcbp-solutions-fzc-llc/eslint-plugin`'s recommended rules on `src/`: SDK imports through public subpaths only, no identity headers, no raw `window.localStorage` / `sessionStorage`, no unsafe HTML, API route templates. It also enforces the layer rules (`eslint.config.js`, proven by `test/unit/layer-rules.test.ts`): `domain/` imports no React, SDK runtime, other layer or browser global; `application/` no React, presentation, infrastructure, `app/`, SDK runtime (except the `/problem` error classes) or browser global; `infrastructure/` no presentation, application or `app/`; `presentation/` nothing from `infrastructure/`, `app/` or the SDK, except `/auth` types in `presentation/features/`. Presentation never uses `fetch`, `XMLHttpRequest`, storage, IndexedDB, `location`, `history`, `navigator` or `open`, bare or through `window`, `globalThis`, `self` or `document.location`. A use case needs something from outside: the bootstrap injects it. `validate-quality` runs it with `--max-warnings 0`, then `npm run arch-lint` and `npm run typecheck`.

### Architecture lint

`npm run arch-lint` is the shell's counterpart of the IAM services' `go-arch-lint`. `.dependency-cruiser.cjs` declares the **components** (where each lives) and the **deps** (`mayDependOn` other components, `typeOnlyDependOn` for types only, `vendors` packages, `typeOnlyVendors` for SDK port types), and dependency-cruiser checks every import in `src/` in allowed mode: an undeclared dependency fails, and so does a file in no component, a cycle or an unresolvable import.

| Component | In | May depend on |
|---|---|---|
| `domain` | `src/domain/` | SDK types only |
| `application` | `src/application/` | `domain`; SDK types and `/problem` errors |
| `infrastructure` | `src/infrastructure/` | `domain`, `i18n`; the SDK |
| `i18n` | `src/shared/i18n/` | SDK `/i18n`, `/react` |
| `constants` | `src/shared/constants/` | `i18n` |
| `ui_assets` | `src/shared/ui/` | — |
| `components` | `src/presentation/components/` | `ui_assets`, `i18n`, `constants`; React |
| `widgets` | `src/presentation/widgets/` | `i18n`; React |
| `pages` | `src/presentation/pages/` | `components`, `ui_assets`, `i18n`, `constants`, `domain`; `application` types only; React |
| `features` | `src/presentation/features/` | `pages`, `components`, `i18n`, `domain`; `application` types only; React; SDK `/auth` types only |
| `layouts` | `src/app/layouts/` | `features`, `i18n`, `application`; React; SDK `/auth` types |
| `providers` | `src/app/providers/` | `application`; React, SDK `/react`; SDK `/auth` types |
| `routes` | `src/app/routes/` | `widgets`, `i18n`; React, React Router, SDK `/react` |
| `bootstrap` | `src/app/bootstrap/bootstrap.tsx` | everything |
| `entry` | `src/app/bootstrap/index.ts` | `bootstrap` (dynamic), `i18n` (`en.json`) |

A new folder or module: add it to a component (or a new one, with its deps) in the same PR; keep this table and ARCHITECTURE's in step. `test/unit/arch-lint.test.ts` proves each rule fires on probe files. ESLint keeps the per-layer import rules for editor feedback, and owns what a dependency graph cannot see (browser globals).

`npm run build` runs `tsc` before `rsbuild build`. `strict`, `noUnusedLocals` and `noUnusedParameters` are on. TypeScript is pinned to `~6.0.3`: `typescript-eslint` does not support TypeScript 7 yet, and the SDK builds on 6.

## Guardrails

- Do not re-implement what the platform SDK exports. `test/unit/no-sdk-duplicates.test.ts` fails on a module-level name that is an SDK export and on hand-built problem responses in tests (use `mockProblem`). The shell's remaining copies of unpublished platform code are listed in LLD §1.2.
- Leave `.env` and `docker.local.env` untracked. Both are gitignored. Never commit `NODE_AUTH_TOKEN`; the image takes it as the BuildKit secret `npm_token` only.
- Never write a token to storage. Use the SDK's `storage(appId)` for anything per workspace. `bcbp.loginEmail` (the typed email) is the one raw `localStorage` value, because it is needed before a workspace is known.
- Take remote entries from the manifest only. Do not take a remote URL from the query string or any other untrusted input. The remote executes in this origin.
- Call platform APIs through the SDK's `ApiClient` with route templates (`/v1/me/session-context`), never a hand-built URL, and never send identity headers.
- Keep Keycloak Admin API calls in `scripts/` for the local realm seed.
- Keep Dockerfile `FROM` lines digest-pinned (`image:tag@sha256:...`). `validate-quality.yml` rejects a floating tag.
- Save `.github/scripts/`, `Dockerfile`, and `nginx/` as LF. `.gitattributes` enforces that, and the quality job rejects CR.
- Leave the coverage gate at 95%.

## Documentation update checklist

| What changed | Documents to update |
|---|---|
| Route, sign-in step, or storage key | `README.md` (routes, sign-in, storage table), `docs/lld/web-shell-lld.md` (§5, §6, §9.3), `.claude/request-flows.md` |
| Remote, `dashboard` props, or SDK version | `src/app/routes/App.tsx`, `config/remotes.local.json`, `README.md` federation table, `VERSIONING.md` when the bump class changes |
| Runtime config key or build constant | `public/config/runtime.json`, `config/runtime.local.json`, `src/shared/types/globals.d.ts`, `README.md` configuration tables, Dockerfile `ARG` and the workflow build-args when the image must bake it |
| nginx path or listen port | `nginx/default.conf`, `test/smoke/deployment.test.ts`, `README.md` nginx table, LLD §10.1, `.claude/architecture.md`, PR deployment notes |
| SDK version | `package.json` (all three, exact), README, ARCHITECTURE, VERSIONING, LLD header, `.claude/CLAUDE.md`, CHANGELOG (`.claude/operations.md` checklist) |
| A diagram | `docs/architecture/mermaid/*.mmd` and the identical block in `ARCHITECTURE.md` (`node .claude/hooks/check-diagrams.mjs`) |
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

`main`'s branch rules require linear history, a pull request and the required checks, and refuse force pushes and deletion. Pull requests are squash-merged. A PR stacked on another one shows conflicts after its base is squash-merged even when nothing differs: `/stack-sync <PR>` (Claude Code) or `.claude/skills/stack-sync/scripts/sync.sh <branch> <old base>` merges `main` only when its tree equals the old base's, then retarget the PR to `main`.

`.github/pull_request_template.md` is the checklist GitHub shows. Match it:

- [ ] `npm run lint` and `npm run typecheck` pass
- [ ] `npm run test:ci` passes (unit, integration, e2e, coverage at least 95%)
- [ ] `npm run build` passes (typecheck and production bundle)
- [ ] Manual check when the change is visible: login, remote load, navigation
- [ ] No debug logs, commented-out code, secrets, or `.env` values
- [ ] `CHANGELOG.md` `[Unreleased]` updated when the pull request touches `src/`, `package.json`, `package-lock.json`, `Dockerfile`, `nginx/`, `rsbuild.config.ts`, `config/**`, `public/config/**`, or `index.html` (`.github/workflows/changelog-check.yml` fails the pull request otherwise)
- [ ] Remotes still load against the shell's SDK version
- [ ] New runtime config keys or build constants documented
- [ ] No token written to storage
- [ ] Remote URLs are not taken from untrusted input
- [ ] Documentation checklist above reviewed

`CODEOWNERS` requests review from `@BCBP-SOLUTIONS-FZC-LLC/web-shell`. Workflow files, `Dockerfile`, and `nginx/` are called out there as well.

## Commit style

Use a short imperative subject and say why:

```
Unmount the app before showing "You are signed out"

A sign-out in another tab left the previous user's data under the
dialog on a shared device.
```

A one-line subject is enough when the reason is obvious:

```
Add a CI pipeline and a 95% test gate for the shell
```

## Deployment

Releases go through GitHub Actions. Details and the Cosign verify commands are in [VERSIONING.md](./VERSIONING.md).

**On push to `main` or `master`:**

1. `validate-test` (tests, 95% gate, `npm run build`) and `validate-quality` (ESLint, typecheck, workflow hygiene, digest pin, production npm audit) run in parallel with the image build.
2. Hadolint runs before the image build.
3. Trivy (CRITICAL and HIGH, unfixed) and the smoke job (startup gate, then `npm run test-smoke` against the container) run after the image exists.
4. The image `ghcr.io/bcbp-solutions-fzc-llc/web-shell` is pushed with the branch tag and `sha-<short>`, then Cosign-signed.

**On a `vX.Y.Z` or `vX.Y.Z-*` tag:** validate, require a matching `## [X.Y.Z]` changelog section, pack `web-shell_<tag>_dist.tar.gz`, push the image, scan, attach the SBOM and SLSA provenance, sign, and open the GitHub Release. The Git tag keeps the `v`. The image tags are `X.Y.Z`, `X.Y`, `X`, and `latest` for a stable release. A pre-release tag publishes `X.Y.Z-rc.N` only.

Tagging does not deploy a cluster. Call out a new runtime config key, an SDK version bump, or an nginx path change in the pull request deployment notes so whoever rolls the image updates that environment's `/config/runtime.json` and remotes.
