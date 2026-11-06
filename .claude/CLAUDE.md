# CLAUDE.md

This file provides guidance to Claude Code when working with **web-shell**, the browser shell of the Tender Management SaaS platform's React micro-frontends. Detailed reference lives in the sibling files listed under [See Also](#see-also). This file is what must always be in context.

## What This Repo Is

A **private Rsbuild application** (npm name `web-shell`, `"private": true`, `version` = the latest tag) that ships as a static bundle in an nginx image (`ghcr.io/bcbp-solutions-fzc-llc/web-shell`, port 8080, uid 101). It runs the platform SDK's start-up sequence once per page, owns the sign-in and session screens and the IAM ports, and hosts the dashboard remote `dashboard` (`mfe-dashboard`) through Module Federation. It exposes nothing.

Node 26, TypeScript `~6.0.3` (typescript-eslint has no TS 7 support), React 19.3, Rsbuild 2 (Rspack), Tailwind 4 + daisyUI. Platform packages from **GitHub Packages** (`.npmrc`, `NODE_AUTH_TOKEN` with `read:packages`): `@bcbp-solutions-fzc-llc/frontend-sdk`, `webpack-preset`, `eslint-plugin`, all **`1.0.0-alpha.6`, pinned exactly, on one version**.

**Status:** Released: **`v0.2.0`** (remote `dashboard`, pairs with mfe-dashboard `v0.3.0`) is current and `latest`; **`v0.1.0`** (remote `app2`, pairs with mfe-dashboard `v0.2.0`) is kept as its rollback. Both were published by `release.yml` (signed, SBOM, SLSA provenance, tags added after signing). Not deployed yet. A release changes the shell–remote contract only together with mfe-dashboard (check with `npm run test-contract`). CloudFront arrives next month; until then environments follow `docs/hosting-without-cloudfront.md`. Open items: [LLD §15](../docs/lld/web-shell-lld.md#15-open-items). v1 decisions: essential-only consent; fonts self-hosted; Forgot password → Keycloak reset.

**The shell owns:** `src/app/bootstrap/bootstrap.tsx` (SDK order, session branches, render), `src/app/routes/App.tsx` (routes under `/t/<slug>/`, `RemoteBoundary` for `dashboard` `./App`), `src/app/` (composition root: bootstrap, providers, routes, layouts incl. the session-screen host), `src/presentation/` (login page, session screens, components, widgets), `src/application/` + `src/domain/` (sign-in and session-context use cases, contracts, role map), `src/infrastructure/` (PUB-1 and P-35 ports, password reset, remembered email, navigator, text registration; consent is the SDK's essential-only default), `src/shared/` (the `shell` text catalogue, links, UI assets; no hard-coded words), `rsbuild.config.ts`, `config/dev-platform.mjs` (dev stand-ins), `nginx/default.conf`, `Dockerfile`.

**Does NOT own:** PKCE, tokens, refresh, idle timeout, cross-tab sign-out, workspace cache, telemetry, remote loading, chunk integrity, the shared map (all SDK / preset, in `platform-reactcommon`); Keycloak; IAM APIs and roles; dashboard screens (`mfe-dashboard`); each environment's runtime config, manifest and CSP (deploy pipeline, CloudFront).

## Common Commands

```bash
export NODE_AUTH_TOKEN=$(gh auth token)   # once per shell; needs read:packages
npm ci
npm run dev               # :5001 with config/dev-platform.mjs stand-ins (Keycloak: npm run keycloak:setup)
npm run lint              # ESLint + platform rules (CI: --max-warnings 0)
npm run arch-lint         # component boundaries, .dependency-cruiser.cjs (like go-arch-lint)
npm run typecheck         # tsc over src/ and test/
npm test                  # Vitest: unit, integration, e2e
npm run test:ci           # + coverage gate 95% (100% today)
npm run build             # tsc + rsbuild build
npm run budget            # bundle size budget, after a build
npm run metrics-check     # observability standard for metrics in src/ (docs/observability.md)
npm run test-browser      # Playwright, Chromium/Firefox/WebKit under the production CSP, after a build
npm run test-contract     # same, against a real mfe-dashboard build: REMOTE_DIST=../mfe-dashboard/dist
npm run test-smoke        # needs SMOKE_BASE_URL (test/smoke/README.md)
```

Run one test: `npx vitest run test/e2e/shell.test.tsx -t "sign-out"`. Full list: [`operations.md`](operations.md).

## Architecture

`src/` uses the constitution's folders. `app/bootstrap/index.ts` (async boundary) → `app/bootstrap/bootstrap.tsx` (the composition root: the only module that wires `infrastructure/` and renders `#app`) → `app/routes/App.tsx`. Presentation → application → domain; infrastructure implements domain contracts. Presentation never imports `infrastructure/`, `app/` or the SDK (the session screens: `/auth` types only); its words come from `shared/i18n`. `eslint.config.js` and `npm run arch-lint` enforce the layers. Layout: **[`architecture.md`](architecture.md)**; flows: **[`request-flows.md`](request-flows.md)**; the narrative with diagrams is [`ARCHITECTURE.md`](../ARCHITECTURE.md); the contract is the [LLD](../docs/lld/web-shell-lld.md).

## Critical Rules (do not break)

- **Never reimplement SDK behaviour.** PKCE, token handling, refresh, idle timeout, cross-tab sign-out, `prompt=login` after logout, return URLs, workspace caching, the `/t/<slug>/` move, telemetry, `loadRemote`, integrity, the shared map: use the SDK; change it in `platform-reactcommon`. Before adding a helper, check the SDK's exports (`node_modules/@bcbp-solutions-fzc-llc/frontend-sdk/dist/<subpath>/index.d.ts`).
- **`test/unit/no-sdk-duplicates.test.ts` stays green.** It fails when a module-level name in `src/`, `config/` or `test/browser/server.ts` is an SDK export (import it instead; when the SDK publishes one of the copies in LLD §1.2, delete the copy) or a test hand-builds a problem body (use `mockProblem`). Never silence it with a rename.
- **SDK imports through public subpaths only** (`@bcbp-solutions-fzc-llc/frontend-sdk/<subpath>`); never the root, never `dist/` internals. The ESLint plugin enforces it in `src/`.
- **No token in storage, logs or the channel.** The only raw `localStorage` use is `bcbp.rememberEmail` / `bcbp.loginEmail` in `src/infrastructure/storage/rememberedEmail.ts` (behind the domain's `RememberedEmailRepository`), the one file `eslint.config.js` exempts from `no-raw-storage`. Presentation (`presentation/`) gets it and the sign-in use cases injected by the bootstrap; it never imports storage, `infrastructure/api/iam.ts` or navigation.
- **No login without a click** after a logout, a device-clock refusal or an expiry. The app is **unmounted** before "You are signed out". A wrong-workspace login never renders.
- **Remotes get no props.** Data a remote needs goes into the `PlatformProvider` shell value and is read through SDK hooks.
- **Role map keys are IAM's closed set** (`member`, `tenant_owner`, `tenant_admin`, `tender_admin`); department levels are never roles. UI hints only.
- **CSP `form-action` must allow the IdP origin** (SDK alpha.4 signs out globally with a form POST to Keycloak); CloudFront owns the CSP, smoke `live` checks it. The image sends none; `nginx/security.d/csp.conf.example` (and `hsts.conf.example`) is mounted only where no CloudFront fronts it, never both. Until CloudFront exists (expected next month), every environment does that: `docs/hosting-without-cloudfront.md`.
- **CSP-safe:** no inline script or style (`inlineScripts`/`inlineStyles: false`), no `eval`, no runtime CSS-in-JS. Never add a third-party origin to `index.html`; fonts are self-hosted (`@fontsource-variable/*`).
- **No dead or invented links.** Help and legal URLs live only in `src/shared/constants/links.ts` and render only when set; never guess an official URL.
- **nginx SPA rule:** only extension-less paths get `index.html`; `/api`, `/otel`, `/csp-report`, `/config`, `/remotes`, `/assets` and any missing file with an extension stay 404. Unhashed files are `no-cache`, `/assets/` immutable. Change `test/smoke/deployment.test.ts` with it.
- **SDK upgrades:** all three packages together, exact pins, **shell before remotes** (a remote must not be built against a newer SDK than the shell's), unless the release changes the shell–remote contract (alpha.4): then they deploy together. Run `npm run test-contract` against the dashboard's build. Add a CHANGELOG entry.
- **Registry token never in an image layer** (BuildKit secret `npm_token`). Dockerfile `FROM` lines stay digest-pinned.
- **Sibling repos are read-only from here:** `../mfe-dashboard` (another session/team owns it) and `../../../XPertSharedLib/react/platform-reactcommon`. Read them; change them in their own PRs.
- **Diagrams:** edit `docs/architecture/mermaid/*.mmd` and keep the block under its `> Source:` line in `ARCHITECTURE.md` identical (the post-edit hook checks).
- **Metrics follow the Enterprise Platform Observability Standard** (`docs/observability.md`): only through the SDK meters (`getServiceMeter` for Tier 3 `portal_web_shell_*`, `getDomainMeter` for registry Tier 2); never `platform_*` (SDK-bound after ratification), never a label the SDK injects (`domain`, `service`, `environment`) or an unbounded one; every metric listed in the Inventory. `metrics-check` enforces it in CI.
- **Architecture lint stays green** (`npm run arch-lint`, `.dependency-cruiser.cjs`). A new module joins a component; a new dependency is declared in `deps`, never by widening `anyVendorDeps` or adding a component to the composition root's exceptions. `test/unit/arch-lint.test.ts` proves the rules fire.
- **Coverage gate stays at 95%.** Required checks keep their names: `Validate / Test / test`, `Validate / Quality / quality`, `changelog`, `Smoke tests`.

## Conventions

- Tests: `test/unit` (small modules; real SDK pieces via `/testing` where useful), `test/integration` (bootstrap wiring with `vi.mock` fakes of every SDK subpath), `test/e2e` (the real shell and SDK against `test/fixtures/` fakes; only the remote's entry script stubbed), `test/smoke` (GET-only against a served image or deployment; not in `npm test`), `test/browser` (Playwright against `dist/` with the production CSP; not in `npm test`). A change that only a real engine can check (CSP, Trusted Types, fonts, form POSTs, contrast) needs a browser case. A new bootstrap branch needs an integration test; a user-visible flow change needs an e2e case.
- Wait on conditions with real-time bounds (`waitFor`, `findBy*`), never on fixed sleeps.
- Docs: plain, direct English; tables over prose; every claim checkable against the code. A change to routes, storage keys, config keys, nginx paths or the remote contract updates README, ARCHITECTURE, the LLD and CHANGELOG together.
- Commits: short imperative subject that says why (CONTRIBUTING § Commit style). Branches `feat/ fix/ docs/ chore/ test/`; PRs into `main`.

## See Also

| File | Contents |
|---|---|
| [`architecture.md`](architecture.md) | Repository layout, module rules, build, hosting, tests |
| [`request-flows.md`](request-flows.md) | Bootstrap, sign-in, callback, restore, expiry, sign-out, workspace switch, dashboard load |
| [`operations.md`](operations.md) | Commands, CI jobs, registry access, image, smoke, release; Claude Code settings and hooks |

**Subagent** (read-only; pass it a diff file): `invariant-reviewer` before a PR touching `src/`, `rsbuild.config.ts`, `nginx/`, `Dockerfile`, `index.html` or `config/`.
