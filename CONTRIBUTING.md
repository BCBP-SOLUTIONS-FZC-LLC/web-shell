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
    features/welcome/      ← The first-visit welcome intro (WelcomeSplash)
    components/          ← BrandLogo, PageLinks
    widgets/             ← Update notice, missing-permissions notice (state passed in)
  application/           ← Use cases (no React, no browser APIs): resolveWorkspace, requestPasswordReset, loadSessionContext; signIn.ts
  domain/                ← Contracts, errors, rules: RememberedEmailRepository, WelcomeIntroRepository, WorkspaceNotFoundError, permissions (role map)
  infrastructure/
    api/iam.ts           ← PUB-1 resolver and P-35 session context (the SDK's /auth ports)
    auth/passwordReset.ts ← Keycloak reset-credentials URL for a workspace
    storage/rememberedEmail.ts ← "Remember Email" in localStorage (one of the two raw-storage files)
    storage/welcomeIntro.ts ← First-visit intro flag in localStorage (the other raw-storage file)
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

### Adding a domain contract, error or rule

1. Put it in `src/domain/` (`repositories/` for a contract the infrastructure implements, `errors.ts` for an error, `rules/` for a pure rule such as the role map). No React, no browser global, no SDK runtime (types only), no other layer: ESLint and arch-lint fail it.
2. Keep words out of it: an error carries no user-facing text (the screens map it to a catalogue key).
3. Unit-test it in `test/unit/` (flat directory).

### Adding a use case

1. Add `src/application/use-cases/<verb><Noun>.ts` exporting a factory that takes its ports (`resolveWorkspaceUseCase(resolver)`, `requestPasswordResetUseCase({ resolveWorkspace, resetUrl, open })`). No React and no browser global; the SDK only as types and `/problem` error classes.
2. Build it in the composition root (`src/app/bootstrap/bootstrap.tsx`) from infrastructure, and pass it to the screen that needs it (`SignInUseCases` in `src/application/signIn.ts` for the sign-in screens).
3. Test it in `test/unit/use-cases.test.ts` with fake ports, and test the screen against the real use case with a fake port (`test/integration/session-screens.test.tsx`).

### Adding an infrastructure adapter (an API port, storage, navigation)

1. Put it in `src/infrastructure/<api|auth|storage|federation|i18n>/`. It may import `domain/`, `shared/i18n` and the SDK, never presentation, application or `app/`.
2. API calls go through the SDK's `ApiClient` (`createApiClient()`, created lazily: the runtime config must be loaded first) with a route template, never `fetch`. Map the response at the edge (`toWorkspace`, `toSessionContext`): snake_case to camelCase, no nulls.
3. Raw `localStorage` is allowed only in `src/infrastructure/storage/rememberedEmail.ts` and `welcomeIntro.ts` (the two `no-raw-storage` exemptions). Anything else per workspace uses the SDK's `storage(appId)`.
4. Wire it only in `src/app/bootstrap/bootstrap.tsx` (the only module that imports `infrastructure/`). Test it in `test/unit/` with the real `ApiClient` (`createTestPlatform`, `mockApi`, `mockProblem`), against the SDK's contract cases when the API has them.

### Adding a session screen or dialog

1. Add the component to `src/presentation/features/session-screens/SessionScreens.tsx`: it renders and takes callbacks; it never signs in, never imports `/auth` values, never navigates.
2. Add the `show…` function that mounts it to `src/app/layouts/sessionScreens.tsx`, and call it from the bootstrap. A sign-in may start only from the user's click.
3. Words from the catalogue (`useShellText`); move focus into the dialog (`Dialog` does).
4. Test the screen in `test/integration/session-screens.test.tsx`, add it to `test/integration/accessibility.test.tsx` (axe), and add an integration case for the new bootstrap branch, plus e2e when the user sees the flow change.

### Adding a widget or component

1. `src/presentation/widgets/` for a piece of the signed-in app that takes state and actions as props (`UpdateAvailable`, `ContextUnavailable`, `AppError`); `src/presentation/components/` for a reusable piece (`BrandLogo`, `PageLinks`). Neither imports the SDK, `infrastructure/` or `app/`.
2. The route (`src/app/routes/App.tsx`) reads SDK hooks and passes plain props down.
3. Tailwind classes for styling. A `style` prop only for a value computed at run time (`BrandLogo`'s size, `LoginPage`'s `--hero-shift`): React sets it through the CSSOM, which the CSP allows. No `<style>` element, no style attribute in HTML, no runtime CSS-in-JS (the CSP has no `unsafe-inline`).

### Adding a development stand-in

`config/dev-platform.mjs` stands in for what CloudFront and the platform APIs provide during `npm run dev` (runtime config, manifest, PUB-1, P-35, `/otel`). Add a stub there, answer errors with the SDK's `mockProblem`, document it in README § Local development, and cover it in `test/unit/dev-platform.test.ts`. A stand-in must not change what the production bundle does.

### Adding a development or tooling environment variable

1. Read it where it is used (`config/dev-platform.mjs`, `test/smoke/env.ts`, `test/browser/server.ts`, `.github/scripts/*`), with a safe default.
2. Add it to README § Development and tooling variables. The page reads no environment variable at run time: what it needs is runtime config, or a build constant (§ Adding a runtime config key or a build constant).

### Upgrading the platform SDK

Run `/sdk-upgrade <version>` in Claude Code, or follow the checklist in `.claude/operations.md`: all three packages together at one exact version, the shell before remotes, `npm run test-contract` against the dashboard's build, and the version in every document that names it.

### Adding a remote or changing what the shell passes to one

1. Add the remote to `config/remotes.local.json` for development. Each environment's `/remotes/manifest.json` comes from the deploy pipeline.
2. Render it with `<RemoteBoundary remote="<name>" module="./<Module>" />`, with no props: data a remote needs goes into the `PlatformProvider` shell value and is read through SDK hooks. The remote must be built with `@bcbp-solutions-fzc-llc/webpack-preset` (`role: 'remote'`).
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
| Unit | `test/unit/` | No | IAM mappings and ports, entry point, remember-email, the welcome-intro flag, screen host, `BrandLogo`, session-context retry, navigator, dev platform middleware, layer rules, arch-lint, text catalogue, no-SDK-duplicates, metrics-check, use cases |
| Integration | `test/integration/` | No | The login page and carousel, the welcome intro, session screens, `App`, bootstrap order and branches. SDK subpaths are `vi.mock` fakes where needed; axe-core over every shell screen (`accessibility.test.tsx`) |
| End to end | `test/e2e/` | No | The real shell and SDK against `test/fixtures/` fakes (Keycloak, network, BroadcastChannel); only the remote's entry script is stubbed |
| Smoke | `test/smoke/`, CI `smoke` job | Image or deployment | `.github/scripts/smoke-tests.sh`: image ≤ 200 MB and the startup gate, then `npm run test-smoke` against the container (SPA rule, Cache-Control, integrity, 404s, SDK-validated runtime files). [test/smoke/README.md](./test/smoke/README.md) |
| Browser | `test/browser/`, CI `browser` job | `dist/` | Playwright over HTTPS with the production CSP: fonts, the welcome intro, sign-in, the remote with integrity, `navigate()`, sign-out POST, start-up report, the hero's opening and reduced motion, contrast |
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

Run one test by name:

```bash
npx vitest run test/e2e/shell.test.tsx -t "Sign out"
npx vitest run test/unit/session-context.test.ts -t "agrees with the SDK ApiClient"
npx vitest run test/unit/layer-rules.test.ts
```

### happy-dom note

Vitest runs in happy-dom at `http://localhost:5001/`. It computes no layout, so colour contrast and anything visual are checked in the browser suite, not in `accessibility.test.tsx`. `test/setup.ts` stubs `fetch` and `location.assign/replace` and loads the shell's catalogue for every DOM test; a file marked `// @vitest-environment node` gets none of that.

### SDK-in-tests note

`vitest.config.ts` inlines the SDK (`server.deps.inline`), so `vi.resetModules()` gives each simulated page load in `test/e2e/` a fresh SDK; the e2e suite also clears the runtime global (`Symbol.for('@bcbp-solutions-fzc-llc/frontend-sdk')`). `test/integration/bootstrap.test.tsx` replaces every SDK subpath with a recording fake; keep the real catalogue functions (`importOriginal`) when a test needs the shell's text.

### Browser-suite note

`npm run test-browser` and `npm run test-contract` run against `dist/`: build first. Install the browsers once with `npx playwright install chromium firefox webkit` (test/browser/README.md); CI runs them in the Playwright container. They serve HTTPS with the production CSP (except the colour-contrast case) and fail on any CSP report.

### Coverage gate

`npm run test:ci` runs Vitest with the v8 reporter and then `.github/scripts/coverage-gate.mjs`. The gate fails when statements, branches, functions, or lines are below **95%**. `COVERAGE_THRESHOLD` overrides the number. CI does not set it. Coverage includes `src/**/*.{ts,tsx}` and excludes declaration files and CSS.

```bash
npm run test:coverage
```

The text report prints uncovered lines. Cover the branch you changed. The gate is the floor, not a request to assert on unreachable lines.

## Lint and typecheck

`npm run lint` runs ESLint with typescript-eslint, the React hooks rules, and `@bcbp-solutions-fzc-llc/eslint-plugin`'s recommended rules on `src/`: SDK imports through public subpaths only, no identity headers, no raw `window.localStorage` / `sessionStorage`, no unsafe HTML, API route templates. It also enforces the layer rules (`eslint.config.js`, proven by `test/unit/layer-rules.test.ts`): `domain/` imports no React, SDK runtime, other layer or browser global; `application/` no React, presentation, infrastructure, `app/`, SDK runtime (except the `/problem` error classes) or browser global; `infrastructure/` no presentation, application or `app/`; `presentation/` nothing from `infrastructure/`, `app/` or the SDK, except `/auth` types in `presentation/features/`. Presentation never uses `fetch`, `XMLHttpRequest`, storage, IndexedDB, `location`, `history`, `navigator` or `open`, bare or through `window`, `globalThis`, `self` or `document.location`. A use case needs something from outside: the bootstrap injects it. `validate-quality` runs it with `--max-warnings 0`, then `npm run arch-lint`, `npm run metrics-check` and `npm run typecheck`.

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
| `bootstrap` | `src/app/bootstrap/bootstrap.tsx` | `domain`, `application`, `infrastructure`, `i18n`, `ui_assets`, `layouts`, `providers`, `routes`; any package. Not presentation or `constants`: it reaches the screens through `layouts`, `providers` and `routes` |
| `entry` | `src/app/bootstrap/index.ts` | `bootstrap` (dynamic), `i18n` (`en.json`) |

A new folder or module: add it to a component (or a new one, with its deps) in the same PR; keep this table and ARCHITECTURE's in step. `test/unit/arch-lint.test.ts` proves each rule fires on probe files. ESLint keeps the per-layer import rules for editor feedback, and owns what a dependency graph cannot see (browser globals).

`npm run build` runs `tsc` before `rsbuild build`. `strict`, `noUnusedLocals` and `noUnusedParameters` are on. TypeScript is pinned to `~6.0.3`: `typescript-eslint` does not support TypeScript 7 yet, and the SDK builds on 6.

## Guardrails and forbidden patterns

- Do not re-implement what the platform SDK exports. `test/unit/no-sdk-duplicates.test.ts` fails on a module-level name that is an SDK export and on hand-built problem responses in tests (use `mockProblem`). The shell's remaining copies of unpublished platform code are listed in LLD §1.2.
- Leave `.env` and `docker.local.env` untracked. Both are gitignored. Never commit `NODE_AUTH_TOKEN`; the image takes it as the BuildKit secret `npm_token` only.
- Never write a token to storage. Use the SDK's `storage(appId)` for anything per workspace. `bcbp.loginEmail` (the typed email) and `bcbp.welcomeSeen` (`1`) are the raw `localStorage` values, because they are needed before a workspace is known.
- Take remote entries from the manifest only. Do not take a remote URL from the query string or any other untrusted input. The remote executes in this origin.
- Call platform APIs through the SDK's `ApiClient` with route templates (`/v1/me/session-context`), never a hand-built URL, and never send identity headers.
- Keep Keycloak Admin API calls in `scripts/` for the local realm seed.
- Keep Dockerfile `FROM` lines digest-pinned (`image:tag@sha256:...`). `validate-quality.yml` rejects a floating tag.
- Save `.github/scripts/`, `Dockerfile`, and `nginx/` as LF. `.gitattributes` enforces that, and the quality job rejects CR.
- Leave the coverage gate at 95%.
- Never write user-facing words in a component, and never show an error's own message: catalogue keys only (`test/unit/shell-text.test.ts`).
- Never start a sign-in without the user's click after a sign-out, an expiry or a device-clock refusal, and unmount the app before "You are signed out".
- Never pass props to a remote; never let presentation import `infrastructure/`, `app/` or the SDK, or call `fetch`, storage or navigation. Fix a lint or arch-lint failure by injecting a port from the bootstrap, never by widening a rule or `anyVendorDeps`.
- No inline script or style, no `eval`, no third-party origin in `index.html`; fonts are self-hosted.
- Never edit `../mfe-dashboard` or `platform-reactcommon` from this repository (the Claude Code guard blocks it); change them in their own pull requests.

## Documentation update checklist

| What changed | Documents to update |
|---|---|
| Route, sign-in step, or storage key | `README.md` (routes, sign-in, storage table), `docs/lld/web-shell-lld.md` (§5, §6, §9.3), `.claude/request-flows.md` |
| Remote, `dashboard` props, or SDK version | `src/app/routes/App.tsx`, `config/remotes.local.json`, `README.md` federation table, `VERSIONING.md` when the bump class changes |
| Runtime config key or build constant | `public/config/runtime.json`, `config/runtime.local.json`, `src/shared/types/globals.d.ts`, `README.md` configuration tables, `ARCHITECTURE.md`, LLD §9.1, `CHANGELOG.md`, Dockerfile `ARG` and the workflow build-args when the image must bake it |
| nginx path or listen port | `nginx/default.conf`, `test/smoke/deployment.test.ts`, `README.md` nginx table, LLD §10.1, `.claude/architecture.md`, PR deployment notes |
| SDK version | `package.json` (all three, exact), README, ARCHITECTURE, VERSIONING, LLD header, `.claude/CLAUDE.md`, CHANGELOG (`.claude/operations.md` checklist) |
| A diagram | `docs/architecture/mermaid/*.mmd` and the identical block in `ARCHITECTURE.md` (`node .claude/hooks/check-diagrams.mjs`) |
| Release, tag, or image-signing behavior | `VERSIONING.md` and `.github/workflows/release.yml` |
| User-visible shell, dependency, image, or nginx change | `CHANGELOG.md` under `[Unreleased]`, in a section typed and dated with its topic (`### Fixed (YYYY-MM-DD — topic)`), with *(Previously: …)* for a behaviour change; update `### Known gaps` and `### Current architecture notes` when they change (the Format paragraph at the top of `CHANGELOG.md`) |

## Branch naming

Feature branches follow one of these forms:

- `feat/<short-topic>` — new capability
- `fix/<short-topic>` — bug fix
- `docs/<short-topic>` — documentation-only change
- `chore/<short-topic>` — dependencies, tooling, CI, refactors with no behavioral change
- `test/<short-topic>` — tests only

Base new branches on the latest `main`.

## Pull request checklist

`main`'s branch rules require linear history, a pull request and the required checks, and refuse force pushes and deletion. Pull requests are squash-merged. A PR stacked on another one shows conflicts after its base is squash-merged even when nothing differs: `/stack-sync <PR>` (Claude Code) or `.claude/skills/stack-sync/scripts/sync.sh <branch> <old base>` merges `main` only when its tree equals the old base's, then retarget the PR to `main`.

`.github/pull_request_template.md` is the checklist GitHub shows; the items are the same, grouped:

- [ ] `npm run lint`, `npm run arch-lint`, `npm run metrics-check` and `npm run typecheck` pass
- [ ] `npm run test:ci` passes (unit, integration, e2e, coverage at least 95%)
- [ ] `npm run build` passes (typecheck and production bundle)
- [ ] Manual check when the change is visible: login, remote load, navigation
- [ ] For `src/`, `nginx/`, `Dockerfile`, `rsbuild.config.ts`, `config/` or `index.html`: `npm run test-browser` after a build when the change touches what a real engine checks (CSP, fonts, sign-out POST, contrast), and `npm run test-contract` when it touches the remote contract
- [ ] No debug logs, commented-out code, secrets, or `.env` values
- [ ] No hard-coded user-facing text; no fix that widens a lint or arch-lint rule
- [ ] `CHANGELOG.md` `[Unreleased]` updated when the pull request touches `src/`, `package.json`, `package-lock.json`, `Dockerfile`, `nginx/`, `rsbuild.config.ts`, `config/**`, `public/config/**`, or `index.html` (`.github/workflows/changelog-check.yml` fails the pull request otherwise)
- [ ] Documentation checklist in CONTRIBUTING reviewed; diagrams equal their sources (`node .claude/hooks/check-diagrams.mjs`)
- [ ] Remotes still load against the shell's SDK version (all three `@bcbp-solutions-fzc-llc/*` packages on one exact version)
- [ ] New runtime config keys (in `public/config/runtime.json` and `config/runtime.local.json`) or build constants documented
- [ ] No token written to storage (`bcbp.rememberEmail`, `bcbp.loginEmail` and `bcbp.welcomeSeen` are the only raw `localStorage` keys)
- [ ] Remote URLs are not taken from untrusted input

`CODEOWNERS` requests review from `@BCBP-SOLUTIONS-FZC-LLC/web-shell`. Workflow files, `Dockerfile`, and `nginx/` are called out there as well.

## Commit style

Use a short imperative subject and say why:

```
Unmount the app before showing "You are signed out"

A sign-out in another tab left the previous user's data under the
dialog on a shared device.
```

Reference the LLD section, the ADR or the invariant when it explains the change:

```
Check isTransient against the SDK ApiClient's real retries

The SDK does not export its retry rule, so the shell keeps a copy
(LLD §1.2). A test runs the real client against 12 statuses and fails
when they disagree.
```

A one-line subject is enough when the reason is obvious:

```
Add a CI pipeline and a 95% test gate for the shell
```

## Deployment

Releases go through GitHub Actions. Details and the Cosign verify commands are in [VERSIONING.md](./VERSIONING.md).

**On push to `main` or `master`:**

1. `validate-test` (tests, 95% gate, `npm run build`) and `validate-quality` (ESLint, arch-lint, metrics-check, typecheck, workflow hygiene, digest pin, production npm audit) run in parallel with the image build. `browser` (its own production build in the Playwright container, production CSP) and `dashboard-contract` (also builds mfe-dashboard; informational) start at once too.
2. Hadolint runs before the image build.
3. Trivy (fails on a CRITICAL, HIGH or UNKNOWN CVE that has a fix; unfixed ones and `.trivyignore` entries are skipped) and the smoke job (startup gate, then `npm run test-smoke` against the container) run after the image exists.
4. After `validate-test`, `validate-quality`, Trivy, smoke and `browser` pass, the image `ghcr.io/bcbp-solutions-fzc-llc/web-shell` is pushed with the branch tag and `sha-<short>`, then Cosign-signed.

**On a `vX.Y.Z` or `vX.Y.Z-*` tag:** validate, require a matching `## [X.Y.Z]` changelog section, pack `web-shell_<tag>_dist.tar.gz`, push the image, scan, attach the SBOM and SLSA provenance, sign, and open the GitHub Release. The Git tag keeps the `v`. The image tags are `X.Y.Z`, `X.Y`, `X`, and `latest` for a stable release. A pre-release tag publishes `X.Y.Z-rc.N` only.

Tagging does not deploy a cluster. Call out a new runtime config key, an SDK version bump, or an nginx path change in the pull request deployment notes so whoever rolls the image updates that environment's `/config/runtime.json` and remotes.
