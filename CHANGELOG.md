# Changelog

All notable changes to this shell are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning aligned with SemVer.

`0.1.0` is the first release. Everything before it is in its section below. `package.json` `version` matches the latest tag without the `v`. This file tracks what is true in each release and what is still outstanding. The development diary, when one is needed, is `git log`.

Pull requests that change the shell, its dependencies, or the image add an entry under `[Unreleased]`. `.github/workflows/changelog-check.yml` fails a pull request that touches `src/`, `package.json`, `package-lock.json`, `Dockerfile`, `nginx/`, `rsbuild.config.ts`, `config/**`, `public/config/**`, or `index.html` without updating this file. `.github/workflows/release.yml` rejects a tag that has no matching `## [X.Y.Z]` section (`verify-changelog-entry.sh` looks for the version without the `v`).

## [Unreleased]


### Added

- **Claude Code automation for this repository (`2026-11-06`).** No change to the app, the bundle or the image.
  - **Hooks:** `.claude/settings.json` now wires the two existing hooks, which until now did not run.
    - `guard.sh` blocks edits to `../mfe-dashboard`, `platform-reactcommon`, `node_modules/`, `dist/`, `coverage/` and env files.
    - `post-edit.sh` now also runs arch-lint on an edited `src/` file and its imports, and checks the platform package pins on `package.json` (`.claude/hooks/check-sdk-pins.mjs`).
  - **Subagent:** `doc-sync-reviewer`, which checks documentation against the code.
  - **Skills:** `/sdk-upgrade <version>` (with `bump.sh`) and `/stack-sync <PR>` (with `sync.sh`, which refuses when `main` has diverged from the old base).
  - **MCP:** `.mcp.json` adds `context7`, pinned to `@upstash/context7-mcp@4.4.4`.
  - **Tested:**
    - the guard blocked a write into `dist/` in a live session;
    - the post-edit hook passes clean files and fails an import cycle and loose pins;
    - `sync.sh` was run in a throwaway repository, merging when `main` equals the old base and refusing when it diverged;
    - `bump.sh` refuses an unpublished version.

- **Dependabot can read GitHub Packages (`2026-11-05`).** Its npm job failed with 401 on `npm.pkg.github.com` (run of 2026-11-05: `@bcbp-solutions-fzc-llc/frontend-sdk`, `eslint-plugin`), so no npm update could open, public packages included. `.github/dependabot.yml` now declares the `github-packages` registry with the Dependabot secret `PACKAGES_READ_TOKEN` and ignores `@bcbp-solutions-fzc-llc/*` (moved by hand, in lockstep). Same as mfe-dashboard #29. Needs the secret: an organization Dependabot secret shared with both repositories.

- **The Enterprise Platform Observability Standard, for the shell (`2026-11-05`).** `docs/observability.md` documents the shell's place in the three tiers (identity `portal` / `web-shell`; Tier 3 prefix `portal_web_shell_`; `domain`, `service`, `environment` injected by the SDK), its metric inventory (none of its own today: Tier 1 `platform_web_*` is SDK-bound and pending ratification, the signals are logs), how to add a metric, and that no dashboards, recording rules, SLOs or HPA live in this repo. `npm run metrics-check` (`.github/scripts/metrics-check.mjs`, in `Validate / Quality`) checks every metric `src/` creates **with the SDK's own meters** (`getServiceMeter` / `getDomainMeter` under the shell's identity), so the rules are the SDK's and are not restated here; the script adds only what the SDK cannot see: metrics created outside it (OpenTelemetry metrics API, prom-client), names and labels that are not literals, and metrics missing from the inventory. 9 tests; a probe shows a bad metric failing with the SDK's rule.

### Changed

- **ARCHITECTURE.md covers what the IAM services' architecture documents cover (`2026-11-06`).** New sections, each checked against the code:
  - **Flows:** API request flow (the SDK `ApiClient`: token, correlation, timeout, retries, problems); pre-login workspace resolution (PUB-1, the cache and the URL slug); session context (P-35), roles and flags; session events and cross-tab sync.
  - **Data and runtime:** data model, cache strategy, observability stack, Content Security Policy and Trusted Types, concurrency and races.
  - **Deployment and contracts:** hosting until CloudFront, release and rollback safety, contract lifecycle.
  - **Diagrams:** six new `.mmd` sources, listed in `docs/architecture/README.md`.

- **Documentation brought in line with the code before the next release; the SDK retry rule is now checked (`2026-11-06`).** An independent review of every document against `main` (and of the code since `v0.2.0`, which found no regression) led to these fixes:
  - **Operators:**
    - README's sign-out is a form POST (the CSP's `form-action` must allow the IdP), not a GET.
    - The `environment` and `flags` keys are in the README and LLD §9.1 config tables.
    - VERSIONING and README describe the released `0.1.0` and `0.2.0`, with compatibility rows for both.
    - The smoke README covers ingress hosting until CloudFront.
    - LLD §15 lists the missing Dependabot secret.
  - **Rules and diagrams:**
    - The composition root's allowed imports and the `shared/` and presentation rows match `.dependency-cruiser.cjs`.
    - The sign-in diagram shows the bootstrap, not the screens, calling `idp.login`. The bootstrap diagram shows the catalogue loading before any screen.
    - Imports that carry only types (or only what the label names) and the remote's run-time load are drawn dashed.
    - CONTRIBUTING no longer passes props to a remote.
    - The constitution assessment has a status: V1–V4 fixed, V5 open.
  - **CI and tests:**
    - `validate-quality` is described with arch-lint and metrics-check everywhere.
    - Test descriptions name the tests that exist (no consent test, one login layout).
    - The LLD's test table renders as one table.
  - **Stale facts:** the dev proxy answers 503, the contract suite has 4 cases, the identity's environment comes from `runtime.json`, and earlier entries in this section give the paths step 2 moved.
  - **Code: `isTransient` checked against the SDK.** It copies the SDK ApiClient's retry rule, which the SDK does not export. A new test runs the real ApiClient against 12 statuses and fails if the two disagree, so an SDK upgrade that changes the rule breaks the build instead of silently diverging. Dropping 429 from the copy makes it fail.

- **An error boundary around the shell's own screens (`2026-11-06`).** The constitution requires error boundaries. The dashboard had one (`RemoteBoundary`), but a render error in the shell's own routes or widgets left a blank page, logged only by the global handler.
  - `App.tsx` now wraps its router in the SDK's `MFEErrorBoundary` with `mfe="web-shell"`, which logs the error, records it for the SDK's web-error metric (counting once Tier 1 is ratified) and reloads once for a chunk-load error. It shows `presentation/widgets/AppError`: "Something went wrong on this page.", the trace or request reference when there is one, and Try again, which re-renders.
  - The page never shows the error's own message; its words are new catalogue keys `app.error` and `app.error.reference`.
  - The SDK logs it as `remote failed to render` with `mfe: web-shell` (`docs/observability.md`).
  - Tests: integration (a failing child shows the page, focused, without the internal message; Try again recovers) and axe. 203 tests at 100%, browser 18/18, contract 12/12; entry 9.8 KB of 12 KB.

- **Frontend Architecture Constitution, step 2: `src/` in the constitution's folders (`2026-11-06`).** Violation V1 of the assessment (#45). The last roadmap step that changes code.
  - **New layout:**

    | Folder | Contents |
    |---|---|
    | `app/` | `bootstrap/` (`index.ts`, `bootstrap.tsx`), `providers/ShellRoot.tsx`, `routes/App.tsx`, `layouts/` (screen host, session-screen mounting) |
    | `presentation/` | `pages/login/`, `features/session-screens/`, `components/`, `widgets/` |
    | `application/use-cases/` | adds `loadSessionContext.ts` |
    | `domain/` | adds `rules/permissions.ts` |
    | `infrastructure/` | `api/iam.ts`, `auth/passwordReset.ts`, `storage/rememberedEmail.ts`, `federation/navigator.ts`, `i18n/shellMessages.ts` |
    | `shared/` | `i18n/`, `constants/links.ts`, `ui/` (images, theme, CSS), `types/globals.d.ts` |

    Files keep their names (camelCase) and their git history (`git mv`). Tests stay in `test/` (ADR 0008).
  - **Session screens split:** the dialogs and the sign-in screen are components in `presentation/features/session-screens/`. `app/layouts/sessionScreens.tsx` mounts them, with the same `askForWorkspace` / `show*` functions. Presentation no longer imports the screen host, which would have been a dependency upward into `app/`.
  - **Widgets:** the update and missing-permissions notices move to `presentation/widgets/`. They take their state and reload action as props from `App.tsx`, so presentation reaches neither the SDK nor navigation.
  - **Lint:**
    - ESLint layer rules rewritten for the new folders, with a new `infrastructure/` rule (no presentation, application or `app/`).
    - `application/` may use the SDK's `/problem` error classes (`loadSessionContext` tests for `NetworkError` and `TimeoutError`), as the assessment's dependency plan allows.
    - The arch-lint component map follows the new folders (15 components).
    - Tighter than before: presentation may import only **types** from `application/` (use cases come in as props), in ESLint and arch-lint (`typeOnlyDependOn`). The ESLint presentation rule covers any folder under `presentation/`, not only the named ones. Presentation may import `domain/` values (errors, the role map), which are pure.
    - The `no-raw-storage` exemption moves to `infrastructure/storage/rememberedEmail.ts`.
  - **Build paths:** Rsbuild's entry is now `./src/app/bootstrap/index.ts`. `metrics-check` reads the identity from `src/app/bootstrap/bootstrap.tsx`. The `@config` path in `index.css` follows the move.
  - **Behaviour unchanged:** the same CSS (content hash identical), the same chunks and budget (entry 9.7 KB). 200 tests at 100%; browser suite 18/18 (Chromium, Firefox, WebKit, production CSP); contract 12/12 against mfe-dashboard.
  - **Docs:** layout, module rules and both diagrams rewritten in ARCHITECTURE, the LLD (§2.1, §3, §3.1), `.claude/`, CONTRIBUTING and README.

- **Architecture lint, like the IAM services' go-arch-lint (`2026-11-06`).** `.dependency-cruiser.cjs` declares the shell's components and what each may depend on, in the same shape as `.go-arch-lint.yml`:
  - **Components:** `domain`, `application`, `i18n`, `assets`, `components`, `pages`, `screen_host`, `session_screens`, `infrastructure`, `routes`, `composition_root` and `entry` at the time; step 2 (above) replaced them with the 15 components of the new folders (`.dependency-cruiser.cjs`, CONTRIBUTING § Architecture lint), each with its `in` paths.
  - **Deps:** `mayDependOn` (other components), `vendors` (packages) and `typeOnlyVendors` (SDK port types).
  - **Checks:** `npm run arch-lint` runs dependency-cruiser in allowed mode over `src/`. An undeclared dependency fails, and so does a file in no component, a cycle or an unresolvable import. It runs in `Validate / Quality` after ESLint.
  - **Proof:** `test/unit/arch-lint.test.ts` lints a copy of `src/` with probe files and shows each rule fires (9 tests). The probes include the session screens importing a sign-in function from `/auth`, a page importing infrastructure, and a file outside any component.
  - **ESLint unchanged:** it keeps the per-layer import rules for editor feedback, plus the browser-global rules a dependency graph cannot see.
  - **New dev dependency:** `dependency-cruiser` `18.7.0`, pinned exactly. It is a dev dependency only, so nothing changes in the bundle or the image.
  - **Results:** 190 tests at 100%.

- **Frontend Architecture Constitution, step 5: every user-facing word through the SDK's `/i18n` (`2026-11-06`).** Violation V4 of the assessment (ADR 0005, both in #45). The shell's user-facing text, 61 keys, moves to one English catalogue, `src/shared/i18n/en.json`, under the `shell` namespace. That covers the sign-in page and carousel, the session screens, the help and legal link labels, the app banners and the unavailable page.
  - **`src/shared/i18n`:** `useShellText()` (the SDK's `useT('shell')`), `shellText()` (its `t`) and `ShellKey` (an unknown key is a type error). It offers text lookup only, and presentation reaches the SDK's i18n runtime through it and nothing else. A new lint block lets `shared/` import no shell layer and only `/i18n` and `/react` from the SDK.
  - **`src/platform/shellMessages.ts`** (since step 2: `src/infrastructure/i18n/shellMessages.ts`): `registerShellMessages()` registers the namespace and loads it with `setLocale(defaultLocale)`. The bootstrap calls it right after the flags, before any screen. The sign-in screens show before `initializeI18n` (after sign-in), and the SDK's `t` gives back the key until a catalogue is loaded. `initializeI18n` still picks the user's locale.
  - **Catalogue choice (`catalogueFor`):** exact tag, else language, else English. A default locale such as `en-GB`, or one not translated yet, shows words, not keys. Keys missing in a catalogue fall back to the default locale's (the SDK).
  - **Sign-in errors are words from the catalogue:** a failure other than "workspace not found" shows `login.error.signIn` or `login.error.passwordReset`, never the error's own message, which is untranslated and may be a server's. The page's `notice` is a key.
  - **`index.ts`:** the unavailable page reads `en.json` directly. It shows when the SDK may not have loaded, and nothing shared may be imported before the async boundary.
  - **Unchanged:** brand words (`BCBP SOLUTIONS`, the logo's alt) stay as they are.
  - **Guards:**
    - `test/unit/shell-text.test.ts` reads presentation's TypeScript syntax tree and fails JSX text, `{'…'}` children, literal `aria-*`, `alt`, `title`, `placeholder` and `label` attributes, and `textContent` assignments. Over the previous code it finds 29 such literals.
    - The bootstrap integration test checks the catalogue loads before the IdP starts. The e2e suite, which starts every page from a fresh SDK, fails without it.
  - **Results:** English text unchanged. 181 tests at 100%; browser suite 18/18 (Chromium, Firefox, WebKit, production CSP); contract 12/12 against mfe-dashboard. The catalogue (1.7 KB gzip) sits in the entry chunk, where the first screen needs it: entry 9.7 KB of 12 KB.

- **Frontend Architecture Constitution, step 4: the layer rules are lint errors (`2026-11-06`).** `eslint.config.js` now enforces the dependency rules step 3 introduced, so violations V2 and V3 of the assessment cannot come back (roadmap step 4, §5):
  - **Domain** (`src/domain/`, `.ts` and `.tsx`): no React, no SDK runtime (type imports allowed), no other shell layer, no browser global (`window`, `document`, `globalThis`, `self`, `localStorage`, `fetch`, `location`, …).
  - **Application** (`src/application/`): no React, no presentation or infrastructure, no SDK runtime (type imports allowed; the runtime is injected), no browser global.
  - **Pages and components:** nothing from `platform/` or the SDK (the rule CLAUDE.md already stated, now checked). Step 2 (above) rewrote these rules for the new folders: presentation never imports `infrastructure/`, `app/` or the SDK.
  - **Session screens** (`platform/SessionScreens.tsx`, since step 2 `presentation/features/session-screens/` mounted by `app/layouts/sessionScreens.tsx`): no other `platform/` module but `screen`; from the SDK, `/auth` types only, so they cannot sign in on their own (no login without a click).
  - **All presentation:** no `fetch`, `XMLHttpRequest`, storage, IndexedDB, `location`, `history`, `navigator` or `open`, bare or through `window`, `globalThis`, `self` or `document.location`.
  `test/unit/layer-rules.test.ts` lints a violation of each rule under its layer's path and checks the allowed imports pass (10 tests), so the rules are proven to fire. No source change was needed: `src/` already passes. 161 tests at 100%.

- **Frontend Architecture Constitution, step 3: use cases and repositories (`2026-11-06`).** Presentation no longer reaches storage, the IAM API or browser navigation (violations V2 and V3 of `docs/architecture/constitution-assessment.md`):
  - **Domain** (`src/domain/`): the `RememberedEmailRepository` contract and `WorkspaceNotFoundError` (no user-facing text).
  - **Application** (`src/application/`): `resolveWorkspaceUseCase` (PUB-1 through the SDK's `WorkspaceResolver` port; not found, rate-limited and unreachable alike) and `requestPasswordResetUseCase` (reset URL and navigation injected); no React, no browser APIs.
  - **Infrastructure:** the remembered email's `localStorage` implementation moves from `pages/rememberEmail.ts` to `platform/rememberedEmail.ts` (since step 2 `infrastructure/storage/rememberedEmail.ts`; the `no-raw-storage` exemption moves with it; same keys).
  - **Presentation:** `LoginPage` takes the repository as a prop; `askForWorkspace` and `showWrongWorkspace` take the use cases and keep the words (`WORKSPACE_NOT_FOUND` for `WorkspaceNotFoundError`).
  - **Composition root:** the bootstrap builds the use cases from infrastructure.
  Behaviour unchanged: 153 tests at 100% (new: use-case unit tests; the session screens tested over the real use cases with a fake PUB-1); browser suite 18/18; contract 12/12 against the released mfe-dashboard `v0.3.0`. Folder names stay until roadmap step 2.

- **Platform SDK `1.0.0-alpha.6`: one build for every environment (`2026-11-06`).** All three packages move to `1.0.0-alpha.6`, pinned exactly; the shell goes first, since a remote built on alpha.6 requires `^1.0.0-alpha.6`. The bootstrap now loads `/config/runtime.json` **before** `initializeCore` and passes its `environment` (new optional key, the registry vocabulary) to the identity, then `setRuntimeConfig`; the SDK refuses a config that names another environment than the identity's. Order of the move:
  1. **This release:** the environment comes from `runtime.json` when the file names one, else from the build-time `PLATFORM_ENVIRONMENT` (`__ENVIRONMENT__`). If the config cannot be loaded at all, the identity takes the build-time environment so the failure is still reported (`WebShellStartupFailures`).
  2. **Operators:** each environment's deployed `runtime.json` gets `"environment": "<its environment>"`. The deploy check is the smoke suite: `SMOKE_MODE=live ENVIRONMENT=<target> npm run test-smoke` fails a file that names none or another. The image's default `public/config/runtime.json` names none on purpose (checked in image mode), and `config/runtime.local.json` names `local`.
  3. **Then this repo** drops `__ENVIRONMENT__` / `PLATFORM_ENVIRONMENT` (LLD §15), and a file without the key stops at the unavailable page.
  Checked: 143 tests at 100% (new: the environment from the file, the build-time fallback, the report without a config; e2e with the real SDK: a file naming `dev` makes the identity `dev`); image smoke 27 passed; the deploy check against nginx (target matches; another environment fails; no key fails); browser suite 18/18; contract 12/12 against the released mfe-dashboard `v0.3.0` (alpha.5). alpha.6's other changes (`formatDate` calendar dates, console warnings while logging is off) need nothing here.

- **A permanent guard against duplicating the SDK (`2026-11-05`).** `test/unit/no-sdk-duplicates.test.ts` runs on every PR: no module-level name in `src/`, `config/` or the browser-suite server may be one of the SDK's public exports (about 170), which also flags the shell's copies of unpublished platform code (`retrySessionContext`, `createStore`, `isTransient`, `ShellRoot`, `buildCsp`) the day the SDK publishes them; and no test or dev-server code may hand-build a problem body. It found one more on its first run: `test/unit/session-context.test.ts` built `ProblemError`s by hand; they now come from the SDK (`parseProblemResponse` of `mockProblem(typeForStatus(status))`, or of a bare response for 502, as the ApiClient does).

- **Tests and the dev server use the SDK's problem responses (`2026-11-05`).** The e2e suite, its network fixture, the browser suite's server and `config/dev-platform.mjs` built error bodies by hand (`{ title: 'Unauthorized', status: 401 }` as `application/json`), duplicating the SDK's `/testing` `mockProblem`, and unlike the platform's real ones (no `type`, `errorCode`, `timestamp`, not `application/problem+json`), so the SDK's problem parsing was not what the tests exercised. They now use `mockProblem(PlatformProblemTypes.…)`. The platform has no 502 type: the e2e outage case and the dev server's unreachable `DEV_API_URL` answer 503 (Service Unavailable), which the SDK treats the same (transient).

- **No logic duplicated from the platform SDK (`2026-11-05`).** An independent review of `src/` against the SDK's public exports and dist (and platform-reactcommon's source) found two real duplicates, both removed:
  - **Consent.** `src/platform/consent.ts` (`cmp`, granting `essential` only) did exactly what the SDK's runtime already does by default (`ESSENTIAL_ONLY_CONSENT`), and nothing called its `accept()`. It is deleted and the bootstrap no longer calls `setConsentProvider`; v1 stays essential-only through the SDK's default.
  - **A second retry layer.** The bootstrap's background P-35 retry wrapped the ApiClient, which already retries GETs (2 times, jitter, `Retry-After`, statuses 429 / 502 / 503 / 504, online network errors, timeouts): one outage could cost up to 12 requests, and the shell's "transient" rule (any 5xx, offline included) disagreed with the SDK's. Background attempts now go through `loadSessionContextOnce` (`retry: false`: one request each, the SDK's retries having run on the first load), and `isTransient` is the ApiClient's rule. A 500, 501 or offline answer is now final, as it is for the SDK.
  - Also: `iam.ts` reads the paid-realm prefix from the runtime config only (it restated the schema's `tenant-` default).
  - Still copied, with no SDK export to use instead (requested upstream, `platform-reactcommon-shell-helpers-export.md`): the session-context retry and store and `ShellRoot` (from `examples/shell`), the realm URL in `passwordReset.ts`, the CSP example.

- **Audit against platform-reactcommon: no re-implemented SDK behaviour (`2026-11-05`).** `src/`, the tests and the CI scripts were checked against the SDK's public exports and platform-reactcommon's examples and test tooling (LLD §1.2 lists what the shell takes from unpublished parts and why). One duplicate removed here: the browser suite's server read its own copy of the platform CSP; it now reads `nginx/security.d/csp.conf.example`, so the repository holds the policy once, and that file is enforced in Chromium, Firefox and WebKit on every run (18/18). platform-reactcommon is asked to export the pieces every shell copies (session-context retry and live provider, realm URLs, `buildCsp`): `platform-reactcommon-shell-helpers-export.md`.

## [0.2.0] - 2026-11-05

**Breaking: the dashboard remote is `dashboard` (was `app2`).** This release loads mfe-dashboard **`v0.3.0`** and later; it cannot load `v0.2.0` or earlier, and web-shell `v0.1.0` cannot load `v0.3.0`. Release and deploy the two together. Platform SDK `1.0.0-alpha.5`, unchanged. Image: `ghcr.io/bcbp-solutions-fzc-llc/web-shell:0.2.0`.

**Deploying it with mfe-dashboard `v0.3.0`.** In each environment, at the same deploy: the manifest key `app2` becomes `dashboard`, with the entry and integrity from `mfe-dashboard_v0.3.0_remote-manifest-entry.json` (`sha384-tpsCnAmK…`) and `entry` on the shell's origin, `/remotes/dashboard/0.3.0/remoteEntry.js`; the ingress serves the dashboard's files under `/remotes/dashboard/<version>/` (was `/remotes/app2/`); any `remotes.killSwitch` entry or `remote.app2.disabled` flag becomes `dashboard` / `remote.dashboard.disabled`. Everything else is as in 0.1.0 below (`docs/hosting-without-cloudfront.md`, `SMOKE_MODE=live`). Checked: the contract suite against the released `v0.3.0` (checksums and integrity verified): 12/12 in three engines.

### Changed

- **Breaking: the dashboard remote is `dashboard`, not `app2` (`2026-11-05`).** Requested by mfe-dashboard (its #26): `app2` was the starter template's name. The shell now loads `dashboard` (`src/App.tsx` `DASHBOARD_REMOTE`): manifest key `dashboard`, container global `__platform_mfe_dashboard`, kill-switch name and flag `remote.dashboard.disabled`, `mfe` log label, hosting path `/remotes/dashboard/<version>/`. **This shell cannot load mfe-dashboard `v0.2.0` or earlier (`app2`); it pairs with `v0.3.0`.** Release them together and switch each environment's manifest key (and any `killSwitch` entry) at the same deploy. `config/remotes.local.json`, the tests and the docs follow. The contract suite's server now reads the remote's name from the build's `remote-manifest-entry.json` and fails with a plain message when it differs from the shell's. Checked: contract 12/12 against mfe-dashboard's rename branch (`b6d06df`); against `v0.2.0` it reports the name mismatch.

## [0.1.0] - 2026-11-05

First release. The shell runs the platform SDK's start-up once per page, owns sign-in and the session screens, and hosts the dashboard remote `app2` through Module Federation. Image: `ghcr.io/bcbp-solutions-fzc-llc/web-shell:0.1.0` (signed, with SBOM and SLSA provenance).

**Compatibility.** Platform SDK `1.0.0-alpha.5` (`frontend-sdk`, `webpack-preset`, `eslint-plugin`). Loads remotes built on alpha.4 or alpha.5: mfe-dashboard `v0.1.1` (alpha.4) and `v0.2.0` (alpha.5), both checked with the contract suite. A remote built on alpha.5 needs this release or later; deploy it no earlier than this shell.

**Deploying it.** Each environment serves its own `/config/runtime.json` and `/remotes/manifest.json` (with the remote's integrity), routes `/api` (IAM PUB-1 and P-35) and `/otel` on the shell's origin, registers `<origin>/auth/callback` and `<origin>/` in each realm, and sends the platform CSP with the IdP origin in `form-action` (the global sign-out POSTs a form to Keycloak). Until CloudFront exists, follow `docs/hosting-without-cloudfront.md` (ingress routing, mounted CSP and HSTS). Check with `SMOKE_MODE=live npm run test-smoke`. Set `auth.signInUrl` in `runtime.json` only once this shell and an alpha.5 dashboard are deployed. Open items: `docs/lld/web-shell-lld.md` §15.

### Added

- **Sign-in through the platform SDK (`@bcbp-solutions-fzc-llc/frontend-sdk`), Authorization Code + PKCE against Keycloak.** The login page takes a work email. The shell resolves it to a workspace through PUB-1 (`GET /api/v1/public/tenants/resolve`), then redirects the same tab to that workspace's realm with the email as `login_hint`. The callback path is `/auth/callback`. Tokens are held in memory only, never in storage; a reload restores the session silently (`prompt=none`). A known workspace (from `/t/<slug>/` or the SDK's workspace cache) skips the email screen. "Remember Email" stores the email in `localStorage` (`bcbp.rememberEmail`, `bcbp.loginEmail`) and nothing else. Sign-out is global by default: the Keycloak session ends and every tab follows. The shell owns the signed-out, session-ended, device-clock, wrong-workspace, and workspace-not-found screens (`src/platform/SessionScreens.tsx`); none of them signs in without a click.

- **Bootstrap (`src/bootstrap.tsx`).** Runs once behind the async boundary in `src/index.ts`, in the SDK's order: Trusted Types policy → `initializeCore` (service `web-shell`, domain `portal`) → `/config/runtime.json` → consent → tracing, logging, metrics, global error handlers, web vitals → OIDC provider and token source → IAM P-35 session context (`GET /api/v1/me/session-context`) → authorizer, flags, `rememberWorkspace` → i18n → `/remotes/manifest.json` → `/version.json` polling → render inside `<PlatformProvider>`. A failure before the runtime config is loaded shows "The app is unavailable right now." Without a session context the app renders with deny-all permissions and platform flags only.

- **Routes.** Only an authenticated session renders the app. After sign-in the SDK moves the URL under `/t/<slug>/`, and the router uses that as its basename. `/dashboard/*` renders the dashboard remote; any other path redirects to `/dashboard`.

- **Module Federation host.** Built with Rsbuild 2 (Rspack) and `@bcbp-solutions-fzc-llc/webpack-preset/rsbuild` (`pluginPlatform({ role: 'shell' })`): container `shell`, React, React DOM, the OTel API, and every SDK subpath shared as strict singletons, Trusted Types and no `eval` in the output, integrity on every lazily loaded chunk and on the entry script in `index.html`. `/dashboard/*` renders `<RemoteBoundary remote="app2" module="./App">`; the remote reads the user and sign-out through SDK hooks. The remote's entry comes from `/remotes/manifest.json`. A remote that fails stays inside its boundary ("Something went wrong. / Try again").

- **Production image.** Two digest-pinned stages: `node:26-bookworm` runs `npm ci` (registry token as the BuildKit secret `npm_token`) and `npm run build`, then deletes the hidden source maps; `nginxinc/nginx-unprivileged:1.31-alpine` serves `dist/` on port **8080** as uid **101**. `GET /healthz` returns `ok`. `index.html`, `/config/runtime.json`, `/remotes/manifest.json`, and `/version.json` are `Cache-Control: no-cache`. Hashed files under `/assets/` are immutable. Only extension-less paths fall through to `index.html` (the platform's rule, `platform-reactcommon` `examples/cloudfront/spa-rewrite.js`); a missing file under `/api/`, `/otel/`, `/config/`, `/remotes/`, `/assets/`, or any missing file with an extension, is 404. Build args: `BUILD_VERSION`, `SOURCE_DATE_EPOCH`, `PLATFORM_ENVIRONMENT` (default `prod`). Everything environment-specific is in `/config/runtime.json` at run time. Image name: `ghcr.io/bcbp-solutions-fzc-llc/web-shell`.

- **CI (`2026-10-27`).** `.github/workflows/ci.yml` on pull requests and on pushes to `main` or `master` (Markdown-only commits skipped):
  - `validate-test` — Vitest unit and integration, then `.github/scripts/coverage-gate.mjs` at **95%** for statements, branches, functions, and lines, then `npm run build`.
  - `validate-quality` — ESLint with the platform rules (`--max-warnings 0`), `tsc` over sources and tests, workflow files use literal operators and LF, Dockerfile `FROM` lines are digest-pinned, `.dockerignore` exists, and `npm audit --omit=dev --audit-level=high` passes.
  - `npm ci` reads `@bcbp-solutions-fzc-llc/*` from GitHub Packages with `GITHUB_TOKEN` (`packages: read`); the image builds pass the same token as the BuildKit secret `npm_token`.
  - Image build runs Hadolint first, then Buildx (`linux/amd64`). Trivy fails the job on unfixed CRITICAL or HIGH findings. The smoke script fails an image over 200 MB, requires `/healthz`, `/` (document contains `id="app"`), `/config/runtime.json`, and `/version.json`, and fails when the image contains a `.map` file.
  - A push to `main` or `master` publishes the image with the branch tag and `sha-<short>`, and Cosign-signs the digest.
  - `.github/workflows/changelog-check.yml` enforces the changelog rule above.
  - `.github/workflows/release.yml` on `vX.Y.Z` and `vX.Y.Z-*` re-validates, requires the changelog section, packs `web-shell_<tag>_dist.tar.gz`, pushes image tags `X.Y.Z`, `X.Y`, and `X` (plus `latest` when the tag has no pre-release suffix), attaches the SBOM and SLSA provenance, signs with Cosign, and opens the GitHub Release. Tagging does not deploy a cluster.
  - Dependabot is enabled for npm, Docker, and GitHub Actions.

- **Test suite.** Vitest 5, happy-dom, Testing Library. `test/unit` covers the IAM port mappings, the entry point, remember-email, consent, the screen host, `BrandLogo`, the session-context retry, and the navigator adapter. `test/integration` covers the login page, the carousel, the session screens, `App` routing, and the bootstrap order and branches with every SDK subpath replaced by a recording fake. Nothing in the suite calls Keycloak, the IAM APIs, or port 5002.

- **Local Keycloak.** `docker-compose.keycloak.yml` runs Keycloak 26.8.1 in `start-dev` and imports realm `tenant-bcbp` (`keycloak/import/tenant-bcbp-realm.json`) with public client `app1` (standard flow, PKCE S256, redirect URIs `http://localhost:5001/*` and `http://127.0.0.1:5001/*`, post-logout redirect `+`) and the `bcbp` login theme. `npm run keycloak:setup` starts it, waits until it is ready, and seeds the local user. Admin console: `http://localhost:8080` (`admin` / `admin`).

- **Local platform stand-ins.** `npm run dev` (Rsbuild dev server, `http://localhost:5001`) serves `/config/runtime.json` from `config/runtime.local.json` and `/remotes/manifest.json` from `config/remotes.local.json`, answers the two IAM endpoints with stubs (every identifier resolves to realm `tenant-bcbp`, slug `bcbp`, role `tenant_admin`), and drops `/otel` posts (`config/dev-platform.mjs`). `DEV_API_URL` proxies `/api` to a real API instead; `DEV_REALM` changes the stubbed realm.

- **Pre-commit hook.** `.githooks/pre-commit`, installed with `npm run hooks:install`, refuses a staged `.env` or `docker.local.env` and runs the workflow hygiene checks, the Dockerfile digest pin, and the typecheck. The test suite and the image scan stay in CI.

- **Operator docs.** [README.md](./README.md) (routes, federation, local setup, CI, image), [ARCHITECTURE.md](./ARCHITECTURE.md) (module layout, sign-in and dashboard flows, storage, threat model), [docs/](./docs/README.md) (diagram sources, the CI and release pipeline, runbooks for the coverage gate, the image scan, and a failed tag), [VERSIONING.md](./VERSIONING.md) (SemVer for the image and the runtime contract, tag scheme, Cosign verify, maintainer steps), [CONTRIBUTING.md](./CONTRIBUTING.md) (how to extend the shell and what a pull request must include).

### Changed

- **A final session-context answer is not asked again (`2026-11-05`).** The bootstrap retried P-35 once after 1 s even when the first answer was final (401, 403, 404: the endpoint missing in an environment); it now starts the background retry only after a transient failure (network, timeout, 429, 5xx). Found through an e2e flake (about 1 in 10 full runs in CI): that stray request from one simulated page reached the next test, applied its context and cached the workspace, so the next sign-in skipped the email screen. 0 in 15 full runs after the fix; an 8-second idle probe sees no request leak.

- **Browser jobs run in Playwright's container (`2026-11-05`).** `Browser tests` and `Dashboard contract` now run in `mcr.microsoft.com/playwright:v1.64.1-noble` (digest-pinned): the browsers, their system libraries and Node 26 come with the image. Before, `npx playwright install --with-deps` fetched 114 MB through apt; on two `main` runs the Ubuntu mirror served it at 86 kB/s (22 min), `Browser tests` hit its 20-minute limit and the image push was skipped. A first step fails clearly if the image lacks the browsers of the installed `@playwright/test`: bump the tag and digest together with it. Checked: the browser suite passes inside the image (18/18).

- **Dashboard contract: the image case is a normal check again (`2026-11-05`).** mfe-dashboard #23 imports its logos, so they load inside the shell; the `test.fail()` marker is removed (the case passed "unexpectedly" against the dashboard's `main` `25745a4`, as intended) and LLD §15 item 13 is closed.

- **Platform SDK `1.0.0-alpha.5` (`2026-11-05`).** All three packages move from `1.0.0-alpha.4` to `1.0.0-alpha.5`, pinned exactly. The release adds an optional `auth.signInUrl` to `runtime.json` (where a remote run standalone sends a signed-out user) and documents `initializeCore` / `loadRuntimeConfig` / `setRuntimeConfig` for a remote's standalone page. Nothing in `src/` changes: the shell is the sign-in page and does not set `signInUrl`. Upgrade order (platform): this shell first, since a remote built on alpha.5 requires `^1.0.0-alpha.5`; then mfe-dashboard; only then may deployed `runtime.json` files set `auth.signInUrl` (alpha.4 and earlier refuse the unknown key). The e2e suite's email-screen wait now allows 5 s like its other waits (Testing Library's 1 s default timed out once on a CI runner). Checked: this shell loads mfe-dashboard's published `v0.1.1` (alpha.4) in the contract suite (12/12, the image case an expected failure), and the browser suite passes (18/18).

- **Release tags only on a signed image (`2026-11-05`).** `release.yml` pushes the image by digest (`push-by-digest`), scans and builds the SBOM from that digest, exports provenance, signs and verifies it, and only then adds `X.Y.Z`, `X.Y`, `X` and `latest` (`.github/scripts/tag-signed-image.sh`, from mfe-dashboard #22: `imagetools create` for metadata-action's tags, then each must resolve to the signed digest). Before, the tags were pushed first, so a failed scan, provenance export or signature left them on an unscanned or unsigned image, as happened to mfe-dashboard's `v0.1.0`. Checked with actionlint, shellcheck and a stubbed `docker` (matching digest, another digest, no tags); not yet run on GitHub Actions.

- **Contract: the dashboard's images (`2026-11-05`).** `dashboard.spec.ts` checks that every image the real dashboard renders loads. It fails today in all three engines, so it is marked `test.fail()` (an expected failure: the job stays green, and goes red when the case starts passing, which is the cue to remove the marker): mfe-dashboard's `BrandLogo` uses root-relative `/image/logo-main-black.png` (and `-white`, `logo.png`), which resolve on the shell's origin, where web-shell serves no such file, so the sidebar logo is broken inside the shell. The fix is in mfe-dashboard (import the images). Found by signing in through the real local Keycloak 26.8.1, which also confirmed that the alpha.4 sign-out POST ends the SSO session (a `prompt=none` request then answers `login_required`). Also fixed a race in both browser specs' sign-out cases (flaky once in WebKit in CI): the "You are signed out" dialog appears before the form POST reaches Keycloak, so they now wait for the recorded POST and the return to `/` (30/30 each after the fix).

- **Docs aligned with `main` after #25–#27 (`2026-11-05`).** README, ARCHITECTURE (failure domains, deployment, host and remote checklist, decisions 16–18), the LLD (status, revision history, §10.1, §14, §15) and `.claude/` (layout, module rules, SDK subpaths, hosting, tests, release, SDK-upgrade exception, the uninstalled `settings.json`) now describe the current status: release-ready code, never tagged; the release workflow not yet run; mfe-dashboard `v0.1.0`+ compatible with its own release pending; hosting until CloudFront.

- **The release workflow, checked before its first run (`2026-11-05`).** mfe-dashboard's `v0.1.0` release failed at "Export SLSA provenance" with the same script this repository had; three more release steps differed from it:
  - `export-image-provenance.sh` read a Cosign attestation that does not exist: `build-push-action` (`provenance: mode=max`) stores provenance as a BuildKit attestation in the image index. It now reads it with `docker buildx imagetools inspect` (checked against `web-shell:main`). Without this the first tag would have pushed an image and stopped before signing it or opening the Release.
  - `extract-release-notes.sh` piped `tee` into `true`, which could cut the notes short on a closed pipe; plain redirects now (a 3 000-line section extracted whole).
  - `BUILD_VERSION` is the version without the `v` (`0.1.0`), in the tarball and the image, as mfe-dashboard reports it.
  - Source maps were deleted, though comments said they were "uploaded privately". A release now keeps them as the workflow artifact `sourcemaps-<tag>` (90 days), never in the bundle, the image or the Release.

- **Hosting until CloudFront (`2026-11-05`).** CloudFront is expected next month. Until then environments follow `docs/hosting-without-cloudfront.md`: the ingress routes `/api`, `/otel`, `/csp-report` and `/remotes/app2/` on the shell's origin, and the image gets the platform CSP and HSTS as mounted files (`nginx/security.d/csp.conf.example`, new `hsts.conf.example`). It lists the extra settings if the dashboard must live on its own origin, and what to remove when CloudFront arrives. The smoke job now mounts both files and checks both headers.

- **Release checks (`2026-11-05`).**
  - **Dashboard contract** (`test/browser/dashboard.spec.ts`, `npm run test-contract`, CI `Dashboard contract`): this shell's production build with a **real** mfe-dashboard build (`REMOTE_DIST`; CI builds `BCBP-SOLUTIONS-FZC-LLC/mfe-dashboard` at `vars.DASHBOARD_REF`, default `main`) in Chromium, Firefox and WebKit under the production CSP: the remote's integrity, share scope and CSS, the shell's role map reaching it (`User management`), its navigation without a reload, and its Logout through the shell's form POST to Keycloak. A wrong integrity fails it. Informational: it reports in the PR summary but does not gate `push`. Run against mfe-dashboard `main` (`e1b04c3`, alpha.4): 9/9 passed.
  - **Optional per-environment CSP in the image.** `nginx/default.conf` includes `/etc/nginx/security.d/*.conf` (empty in the image). An environment served without CloudFront mounts `nginx/security.d/csp.conf.example` there; behind CloudFront nothing is mounted. Nothing is written at start, so a read-only root filesystem works. The smoke job checks both: no CSP by default, the platform CSP on every location with the file mounted.
  - **Start-up failure runbook** (`docs/runbook-startup-failure.md`): the `the app could not start` record, an example Loki alert (`WebShellStartupFailures`) for ops to deploy, and a diagnosis table.
  - The PR summary is posted on failures too (`if: always()`).
  - **Browser-suite flake fixed.** The start-up failure case failed about once in 90 runs, in WebKit only: it left the page to force the page-hide beacon, which WebKit sometimes drops. It now stays on the unavailable page and waits for the SDK's regular export (45/45 after the change).

- **Launch hardening (`2026-11-05`).**
  - **The session context recovers without a reload.** A P-35 failure from a network error, timeout, 429 or 5xx is retried after 1 s, 2 s and 4 s (`src/platform/sessionContext.ts`, as alpha.4's reference shell). When it answers, the authorization subject, the tenant flags and the provider's `context` update live (`src/platform/ShellRoot.tsx`), so the remote's permissions appear and "We couldn't load your permissions" goes away. If that moves the URL under `/t/<slug>/`, the router is rebuilt with the new basename. A sign-out stops the retries, and a sign-out (here or in another tab) during start-up stops it before the app mounts. The provider's `locale` now follows `setLocale`.
  - **The user's IAM language is used.** `initializeI18n` gets `detect` from the P-35 `locale`, before the browser's languages.
  - **A remote's `navigate()` stays in the page.** The router is registered as the SDK's navigator (`src/platform/navigator.ts`): a path under `/t/<slug>/` goes through React Router; any other path is a full load. `App.tsx` hands over its `navigate` through `onRouter` and still imports only the SDK's `/react`.
  - **A failed start is reported.** Any throw after `initializeCore` is logged as the essential error `the app could not start` (to the runtime config's collector, or the default `/otel` when the config never arrived) before the unavailable page, so a broken deploy shows in the platform's logs.
  - **Real-browser suite** (`test/browser`, `npm run test-browser`, CI `Browser tests`, gates `push`): the production build in Chromium, Firefox and WebKit over HTTPS with the production CSP and Trusted Types, a fake Keycloak on a second origin and a remote stub on the shared SDK. Covers fonts and hashed images with no third-party request, PKCE sign-in, the remote's integrity, `navigate()`, the sign-out form POST under `form-action`, the start-up report, and colour contrast. Contrast: the "BCBP SOLUTIONS" logotype's pink (3.4:1 on white) is exempt as a logo (WCAG 1.4.3) and marked `data-logotype`; nothing else failed.
  - **Bundle budget** (`npm run budget`, `.github/scripts/bundle-budget.mjs`, in `Validate / Test`): entry 12 KB, all JS and CSS 300 KB, largest file 85 KB (gzip), images 2.7 MB. Today: 8 KB, 247 KB, 67 KB, 2.2 MB.
  - **Carousel photos and the logo are bundled** from `src/assets/images/` into `/assets/` with a content hash, so they are cached immutably instead of revalidated on every visit. `public/image/` is gone (with the unused `cityscape.jpg`).
  - **Removed:** the previous login layout `LoginPage1`, `?variant=login1` and `src/pages/loginVariant.ts`.
  - **Package renamed** from `app1` to `web-shell` (`package.json`; it is not published). The local Keycloak client is still `app1`.
  - **Dev audit warnings cleared:** `overrides.minimatch` `^11.0.4` (eslint's dependency; GHSA-g3hv-75wg-m249). `npm audit` reports 0.
  - `@playwright/test` 1.64.1 (dev).

- **Platform SDK `1.0.0-alpha.4` (`2026-11-05`).** `@bcbp-solutions-fzc-llc/frontend-sdk`, `webpack-preset`, and `eslint-plugin` move from `1.0.0-alpha.3` to `1.0.0-alpha.4`, pinned exactly; the preset's new `SdkVersionPlugin` fails the build if they drift. What changes for the shell:
  - **The dashboard must be rebuilt with it, and both must deploy together.** The SDK reads a remote's container from `window.__platform_mfe_<name>` (`__platform_mfe_app2`), not `window.app2`. An `mfe-dashboard` built with the alpha.3 preset defines the old global, and this shell shows "Something went wrong." in its slot.
  - **Global sign-out is a form POST** to the realm's end-session endpoint, so the ID token stays out of the URL, history and access logs. The CSP `form-action` must allow the IdP origin (for example `form-action 'self' https://auth.bcbpsolutions.com`), or the browser blocks it and the Keycloak session stays alive. CloudFront owns the CSP; the smoke suite's `live` mode now checks it.
  - **`no-raw-storage` now flags bare `localStorage`.** `src/pages/rememberEmail.ts` is exempt in `eslint.config.js` (it is needed before a workspace exists and must survive sign-out, which the SDK's `storage()` does not offer). Nothing else changed in `src/`.
  - SDK `storage()` keys gained the `@bcbp-solutions-fzc-llc/frontend-sdk:storage:` prefix; old values are not migrated. The shell writes none.
  - The e2e suite defines `__platform_mfe_app2` and asserts the sign-out POST (URL, `client_id`, `id_token_hint`, `post_logout_redirect_uri`).

- **Launch decisions applied (`2026-11-04`).**
  - Fonts are self-hosted: Geist and Inter from Fontsource (`@fontsource-variable/geist`, `@fontsource-variable/inter` 5.3.0, SIL OFL 1.1), bundled into `/assets/` with hashed names. `index.html` no longer loads `fonts.googleapis.com`, so the platform CSP (`font-src 'self'; style-src 'self'`) holds. `rsbuild.config.ts` now bundles relative CSS `url()`s and keeps root-relative ones as written. Tailwind's `sans` is `Geist Variable`, `Inter Variable`, system fonts.
  - "Forgot your password?" is a button: it resolves the typed email through PUB-1 and opens Keycloak's reset page for that realm (`{idpOrigin}/realms/{realm}/login-actions/reset-credentials?client_id={clientId}`, `src/platform/passwordReset.ts`). Without an email it asks for one; an unknown email shows the generic message.
  - Help and legal links (`src/pages/links.ts`, `PageLinks.tsx`) render only when their URL is set. No official Privacy, Terms, Trust & Security or Help page exists on bcbpsolutions.com yet, so none is shown; the dead `#…` anchors are gone.
  - Consent for v1 is essential only, by decision (no analytics consent manager): `src/platform/consent.ts` documents it.
  - "A new version is available." with Reload appears when the SDK's `useAppUpdate()` reports a newer `/version.json`.

- **Production-readiness fixes (`2026-11-04`).**
  - Login page weight: the carousel photos are resized to 1600 px (JPEG q45, 160–380 KB each; `public/image/` 15 MB → 2.5 MB), and the carousel sets `src` only on the current slide, the next one, and slides already loaded, so a first visit fetches two photos instead of nine. Unused `building.jpg` and three `logo-*.png` files are removed.
  - nginx: gzip for text responses, `server_tokens off`, and baseline headers on every response (`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy`), kept in every location by `add_header_inherit merge`. Dotfile paths (`/.git/…`, `/.env`) are 404 instead of `index.html`. CloudFront's CSP and HSTS stay the source of those two.
  - Accessibility: the login error and notice are `role="alert"`; session dialogs take focus when shown; the `login1` layout is a `<main>` landmark. `test/integration/accessibility.test.tsx` runs axe-core (`axe-core` dev dependency) over both login layouts, every dialog and the unavailable page.
  - Failure states: without a session context the app shows "We couldn't load your permissions, so some actions are hidden." with Reload; the "unavailable" page has a Try again button.
  - Smoke suite (image mode) also checks the headers, gzip, no server version and dotfile 404s. `@rsbuild/core` 2.3.0 → 2.3.1.

- **Docs aligned with the current shell (`2026-11-04`).** New low-level design `docs/lld/web-shell-lld.md` (responsibilities, PUB-1/P-35 mappings, role map, start-up order, flows, hosting, tests, compatibility, open items) and `.claude/` (CLAUDE.md with the critical rules, architecture, request-flows and operations references, an `invariant-reviewer` agent, and `guard.sh` / `post-edit.sh` / `check-diagrams.mjs` hook scripts). README, ARCHITECTURE, CONTRIBUTING, the docs index, the pipeline page and the image runbook now describe the e2e and smoke suites and the `mfe-dashboard` Rsbuild remote; the stale "`app2` cannot load through the SDK yet" gap is removed and the Google Fonts CSP gap is listed.

- **End-to-end and smoke suites, laid out as platform-reactcommon's `test/` (`2026-11-04`).** `test/e2e/shell.test.tsx` boots the real bootstrap, screens, `App` and SDK against `test/fixtures/` fakes (Keycloak with PKCE, the network, BroadcastChannel); only the remote's entry script is stubbed. It covers email sign-in through PUB-1, deep links, the role map reaching the remote through SDK hooks, deny-all without a session context, a failing remote and Try again, global sign-out, and the device clock. Vitest now inlines the SDK so each simulated page load gets a fresh one. `test/smoke/deployment.test.ts` (`npm run test-smoke`, `vitest.smoke.config.ts`) checks the served image in the CI `smoke` job, or a deployment with `SMOKE_MODE=live`. The checks cover the SPA rule, Cache-Control, script integrity, 404s and the SDK-validated runtime files. The smoke job now sets up Node and runs `npm ci`. `test/unit/dev-platform.test.ts` covers the dev server's platform middleware. `test/setup.ts` skips its DOM setup in `@vitest-environment node` files. New scripts: `test-unit`, `test-int`, `test-e2e`, `test-smoke`. Coverage is 100% on all four metrics.

- **Platform SDK `1.0.0-alpha.3` (`2026-11-04`).** `@bcbp-solutions-fzc-llc/frontend-sdk`, `webpack-preset`, and `eslint-plugin` move from `1.0.0-alpha.2` to `1.0.0-alpha.3`, still pinned exactly and on one version. The release changes only `/testing`: `createTestPlatform()` now scopes `storage()` to its signed-in workspace. No runtime source changed between the two releases. The bundle hashes still change: the shell now shares the SDK as `1.0.0-alpha.3`, and the SDK's own chunks were re-split. Upgrade the shell before its remotes. A remote built with the `alpha.3` preset requires `^1.0.0-alpha.3`, which an `alpha.2` shell cannot satisfy. A remote still on `alpha.2` keeps working with this shell.

- **SDK audit follow-ups (`2026-11-04`).** An independent audit of `src/`, the build and the hosting config against `frontend-sdk` and `webpack-preset` 1.0.0-alpha.2 found no reimplemented SDK function. Two small alignments: nginx now sends `Cache-Control: no-cache` on unhashed files (`public/` images, favicons) and on `index.html` fallbacks, as the platform sets it on every object (`examples/cloudfront` README), so browsers never cache them heuristically; and `rsbuild.config.ts` no longer sets `distPath.js`, which the preset already decides (`assets/[name].[contenthash].js`). The build output is byte-identical without it.

- **Role map keyed on IAM's roles (`2026-11-04`).** `src/platform/permissions.ts` now keys only on the closed set the session context returns (iam-org-membership LLD §5.4 P-35, rev 2.47, #48): `member`, `tenant_owner`, `tenant_admin`, `tender_admin`. **Fixes tenant owners:** `tenant_owner`, the role the signup owner holds (often without `tenant_admin`), was missing, so owners had no `manage:members` and `app2` hid User management from them; it now has `tenant_admin`'s grants. Every role gets `read:members` (any active member may view members, §10.4); only `tenant_owner` and `tenant_admin` get `manage:members`. The `preparator` key is gone: it is a department level (`departments[].level`), never a role, so it never matched. `tender_admin` gets `read`, `update` and `delete` on tenders, provisional until Tender Service confirms them (IAM does not own tender rights). The dev stub's session context now returns `member`, `tenant_owner` (`DEV_ROLES` overrides).

- **No shell copies of SDK behaviour (`2026-11-03`).** After a sign-out, the shell no longer passes `prompt: 'login'` to `idp.login()`: the SDK's `logout()` sets a shared signed-out flag and its `login()` adds `prompt=login` on its own, in every tab. The shell no longer passes `returnUrl` either: the SDK defaults it to the current page, hash included. nginx now follows the platform's SPA rule (`examples/cloudfront/spa-rewrite.js`): only extension-less paths get `index.html`, so a missing chunk, remote, config or API file is a real 404 the SDK can react to (`reloadOnceForChunkError`) instead of an HTML page. `test/unit/iam.test.ts` now runs the PUB-1 and P-35 ports through the real `ApiClient` (`createTestPlatform`, `mockApi`) against the SDK's own contract cases (`@bcbp-solutions-fzc-llc/frontend-sdk/contracts/tenant-resolve-cases.json`, `session-context-cases.json`), as the SDK's reference shell does, instead of hand-written cases with the SDK's `http` and `config` mocked.

- **Breaking for `app2`: the shell passes no props (`2026-11-03`).** `/dashboard/*` renders `<RemoteBoundary remote="app2" module="./App">` without `userLabel` and `onLogout`; the remote reads the user with `useCurrentUser()` and signs out with `useSignOut()` from the shell value `PlatformProvider` holds. Deploy an `app2` that uses the hooks (mfe-dashboard #12) before this shell: an older `app2` would show `User` and fall back to its standalone logout.

- **Dependencies (`2026-11-03`).** Node.js 22 → 26 (image builder `node:26-bookworm`, CI `node-version: 26`, `docker:dev` scripts). Runtime image `nginxinc/nginx-unprivileged` 1.30-alpine → 1.31-alpine, with `apk upgrade` at build time so Alpine fixes the base has not picked up still land. TypeScript 6.0 → 7.0. Patch and minor bumps: `react`/`react-dom` 19.3.1, `react-router-dom` 7.18.5, `keycloak-js` 26.2.5, `@module-federation/vite` 1.23.8, `vite` 8.3.5, `vitest`/`@vitest/coverage-v8` 5.1.0, `@vitejs/plugin-react` 6.2.1, `tailwindcss`/`@tailwindcss/vite` 4.3.4, `postcss` 8.5.32, `autoprefixer` 10.6.2, `@types/node` 26.6.6. Actions: `docker/build-push-action` v7.4.0, `docker/login-action` v4.7.0, `docker/setup-buildx-action` v4.4.1, `github/codeql-action` v4.39.1, `hadolint/hadolint-action` v3.5.0, `actions/upload-artifact` v7.0.2, `actions/download-artifact` v8.0.2. The Module Federation `requiredVersion` ranges stay at `^19.3.0` / `^7.18.4` so remotes on earlier patches still load.

- **Breaking: the shell moved to the platform SDK and Rsbuild (`2026-11-03`).** `@bcbp-solutions-fzc-llc/frontend-sdk`, `webpack-preset`, and `eslint-plugin` `1.0.0-alpha.2` (pinned exactly, all three on one version) from GitHub Packages, through `.npmrc` and `NODE_AUTH_TOKEN` with `read:packages`. Vite and `@module-federation/vite` are replaced by Rsbuild 2 and the preset's Rsbuild plugin (`rsbuild.config.ts`); Tailwind runs through `@tailwindcss/postcss`. All `VITE_*` variables are gone: the environment is `/config/runtime.json` (`public/config/runtime.json` is the default the image ships; it points at `https://auth.bcbpsolutions.com`, client `tender-web`) and `/remotes/manifest.json` (the image ships `{}`). The redirect URI is now `/auth/callback` and signed-in URLs live under `/t/<slug>/`. The local realm is renamed `bcbp` → `tenant-bcbp`, because the SDK requires a paid workspace's realm to be `tenant-<slug>`; recreate the Keycloak container to re-import it. TypeScript is back on `~6.0.3`: `typescript-eslint` has no TypeScript 7 support yet, and the SDK builds on 6. ESLint (`npm run lint`) with `@bcbp-solutions-fzc-llc/eslint-plugin` recommended rules, and `npm run typecheck` (`tsconfig.test.json`, sources and tests), run in `validate-quality`. Hidden source maps are deleted from the image and from the release bundle.

### Removed

- **`.mf/diagnostics/latest.json` (`2026-11-05`).** A Module Federation v2 tooling error log (a Windows `D:\` path) committed in #2, unused since the move to the SDK preset. `.mf/` is now gitignored.

- **Breaking (`2026-11-03`).** The shell no longer exposes `./App` and no longer serves `remoteEntry.js` or `mf-manifest.json`; the SDK's model is a shell that only hosts remotes. Removed with it: `src/main.tsx`, `src/auth/` (`oauth-pkce.ts`, `keycloak.ts`, `keycloak.config.ts`), the `sessionStorage['app1.oauth.session']` and `localStorage['app1.oauth.pending.<state>']` records, the login page's Keycloak reachability banner, the `/__kc` dev proxy, `keycloak-js`, `vite.config.ts`, `module-federation.config.ts`, `@mf-types/`, `autoprefixer`, and the `VITE_KEYCLOAK_URL` / `VITE_APP2_URL` image build args.

### Known gaps

- **Official help and legal URLs.** Privacy Policy, Terms of Service, Trust & Security and "Trouble logging in?" are hidden until their URLs are set in `src/pages/links.ts`; none is published on bcbpsolutions.com yet.

- **The IAM endpoints are stubbed locally only.** PUB-1 and P-35 must exist behind `/api` in every real environment. Without P-35 the shell renders with deny-all permissions, logs a warning, and retries a transient failure three times in the background.

- **The shipped runtime config is a default.** `public/config/runtime.json` uses the SDK defaults (`https://auth.bcbpsolutions.com`, client `tender-web`). Each environment serves its own `/config/runtime.json` and `/remotes/manifest.json` (CloudFront, or a file mounted over the image's). The image's manifest is `{}`, so the dashboard slot is empty until one is provided.

- **The CSP comes from CloudFront.** The image sends none by default. CloudFront's policy (`platform-reactcommon/examples/cloudfront`) must include the IdP origin in `form-action` for the global sign-out. An environment without CloudFront mounts `nginx/security.d/csp.conf.example`.

- **`mfe-dashboard` is still on alpha.3.** Until it is rebuilt with the alpha.4 preset, this shell cannot load it, locally or deployed.

- **Essential telemetry only (v1 decision).** `src/platform/consent.ts` grants `essential` only: errors and essential warnings are exported; traces, metrics and info logs are not, until a consent manager is added.

- **No cluster deploy.** `release.yml` publishes the image and the GitHub Release. Nothing in this repo applies a Helm chart or rolls a deployment. An operator rolls the new tag and serves that environment's `/config/runtime.json` and `/remotes/manifest.json`.

- **Pre-v1.** Per SemVer, a `v0.x` tag would not promise compatibility across minor bumps. No tag exists yet. The contract table in [VERSIONING.md](./VERSIONING.md) is what a future `v1.0.0` would freeze.

### Current architecture notes

- This is a static browser app. The production process is nginx. There is no Go service, database, or message bus in this repository.
- Only `PLATFORM_ENVIRONMENT` and `BUILD_VERSION` are compiled in (`__ENVIRONMENT__`, `__BUILD_VERSION__`). Everything else is read from `/config/runtime.json` at start-up and validated strictly by the SDK; an unknown key or an invalid value stops the app with the "unavailable" message.
- The access token is sent only to the page's own origin (`/api`), by the SDK's `ApiClient`. Identity headers are never sent from the browser.
- Port **8080** is Keycloak in the local compose file and the listen port of the shell image. Run the image with a different host port when both are up.
- Coverage is enforced in CI and is not lowered for this repo. `COVERAGE_THRESHOLD` can override `.github/scripts/coverage-gate.mjs` locally. The workflow does not set it.
- `CODEOWNERS` requests review from `@BCBP-SOLUTIONS-FZC-LLC/web-shell`, including workflow files, the Dockerfile, and `nginx/`.
