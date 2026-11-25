# web-shell — Low-Level Design

## Tender Management SaaS Platform — Browser Shell

| | |
|---|---|
| **Repository** | `github.com/BCBP-SOLUTIONS-FZC-LLC/web-shell` (private) |
| **Artifact** | Static bundle served by nginx (`ghcr.io/bcbp-solutions-fzc-llc/web-shell`), never installed as a package (`web-shell`, `"private": true`; `version` = the latest tag) |
| **Platform SDK** | `@bcbp-solutions-fzc-llc/frontend-sdk`, `webpack-preset`, `eslint-plugin` `1.0.0-alpha.9`, pinned exactly, all three on one version |
| **Status** | Released: **`v0.4.0`** (2026-11-11; remotes `dashboard` and `tenders`, SDK `1.0.0-alpha.6`, pairs with mfe-dashboard `v0.3.0`; mfe-tender unreleased) is current and `latest`; **`v0.3.0`** (2026-11-06; remote `dashboard` only, same SDK) is its rollback; **`v0.2.0`** (SDK alpha.5) and **`v0.1.0`** (remote `app2`) are superseded. All were published by `release.yml` (signed, SBOM, SLSA provenance, tags added after signing). Not deployed yet ([CHANGELOG.md](../../CHANGELOG.md)). Pairs: web-shell `0.4.0` + mfe-dashboard `0.3.0` (+ mfe-tender, mfe-drafting, mfe-workflow-designer once released); rollback web-shell `0.3.0`. Hosting until CloudFront (next month): [hosting-without-cloudfront.md](../hosting-without-cloudfront.md). Open: §15. |
| **Owners** | `@BCBP-SOLUTIONS-FZC-LLC/web-shell` (CODEOWNERS) |

### Revision history

| Date | Change |
|---|---|
| 2026-11-25 | The session context is asked again on focus, at most once a minute, and applied without a reload; a refusal or another workspace's context replaces the app with its screen (§5 step 18a, §6.6e, §11, §12, §15 #25) |
| 2026-11-25 | Routes `/drafting/*` (remote `drafting`, mfe-drafting) and `/workflows/*` (remote `workflows`, mfe-workflow-designer): §2, §3, §4.5, §6, §7, §11, §12, §14, §15 #5, #9 and #22 |
| 2026-11-25 | Sixth review: a remote's switch does nothing once stopped (§4.4, §6.6); a trial's second ask that fails otherwise is retried (§5 step 11b); the loading screen only for a re-asked refusal (§5 step 11a); A5 tolerates a 10-minute slow clock (§6.6c); emails may have `/` before `@`, and a URL of any length gives its slug (§6.1); a P-35 body without `slug` keeps its context (§4.2); a late refusal after an expiry unmounts the app under "Session ended" (§5 step 18) |
| 2026-11-25 | SDK `1.0.0-alpha.9`: `signInAgain` takes the `prompt` callback, so `withCredentialsCheck` is deleted (§1.2, §6.1, §6.4); the SDK checks a saved paid realm with Keycloak's discovery document before a redirect and re-checks it with PUB-1 when the realm is gone (a revert, offboarding) (§6.3); `login-required` with no workspace keeps the stricter rule, which the SDK now documents as allowed (§6.1) |
| 2026-11-25 | SDK `1.0.0-alpha.8`: the PUB-1 port throws on an answer that is not a resolve response (a WAF challenge page), so the SDK keeps the saved workspace (§4.1) |
| 2026-11-25 | SDK `1.0.0-alpha.7` (web-shell's IAM-screens asks): a trial session with a slug awaits P-35 and is checked against its slug (`showWrongWorkspace`, new `showWorkspaceLoadFailed`); `login-required` without a workspace asks for the email (with or without a slug); a trial sign-in with neither a slug nor a `tenantIdHint` passes `prompt: 'login'`; a trial with a slug retries every P-35 failure but a workspace state; `stopped()` guards the late retry and the banner load; trial banner days rounded down, `trial-ended`; Switch workspace passes `prompt: 'login'`: §2, §5 steps 11b and 18, §6.1, §6.3, §6.6, §6.6c, §7, §7.1, §8, §9.3, §12, §14, §15 #19 |
| 2026-11-25 | Third review: a remote's `switchWorkspace` cleans up its identifier and a trial slug is lower-cased (§4.1, §6.3, §6.6); the background retry settles a refusal like the first load (§5 step 18, §7, §7.1); the load-failed text says the workspace stays closed (§7); A5 only on a paid plan, the notice stack sticky in the page's flow (§2, §6.6c) |
| 2026-11-25 | Fourth review: a trial sign-in nothing can check asks for credentials on every way in (anonymous, Session ended through `withCredentialsCheck`, a remote's switch) (§6.1, §6.6, §15 #19); "Loading your workspace…" while P-35 is awaited (§2, §5 steps 11a, 11b); the banners worked out again every hour and A5 marked seen when shown (§6.6c); a remote's switch rejects when PUB-1 cannot answer (§4.4, §6.6); `--shell-notices-height` for remotes (§4.5, §15 #21); the remembered-email change of the third round reverted (§9.3 as before) |
| 2026-11-25 | Fifth review: a refusal screen stays on expiry and stops the boot (`refused`, §6.4, §5 step 11b, §7.1); P-35 `slug` trimmed and lower-cased (§4.2); trial days to the nearest day (§6.6c); `withCredentialsCheck` listed as a shell workaround (§1.2); smoke `live` checks P-35 is routed (§7, §12) |
| 2026-11-24 | Workspace banners, the read-only grace date and A5 from IAM P-1 and P-27 (`workspaceBanners`, `loadWorkspaceStatus`, `WorkspaceBanners`, `UpgradeWelcomeDialog`): §1.1, §1.2, §2, §3, §4.2a, §5 steps 17a and 18, §6.6b, §6.6c, §7, §9.3, §10.3, §11, §12, §15 #20 |
| 2026-11-24 | A6/A8 from P-35's refusal codes (`workspaceBlock`, `blockedWorkspace`, `settleRefusal`, `WorkspaceUnavailableDialog`): §2, §3, §4.2, §5, §7, §7.1, §8, §12, §15 #19 |
| 2026-11-24 | Read-only notice from `useReadOnly()` (IAM spec §7.10): §2, §3, §6.6b, §12 |
| 2026-11-24 | IAM screen UI permissions in the role map (§4.3); sign-in takes an email, workspace name or pasted URL (`toIdentifier`), remember-email never stores a URL (§1, §2, §3, §6.1, §8, §9, §12) |
| 2026-11-11 | Released `v0.4.0` (#68): remote `tenders` added, dashboard contract as `v0.3.0`. Status, pairs and open items updated |
| 2026-11-11 | Route `/tenders/*` for remote `tenders` (mfe-tender): §2, §4, §6, §11, §12, §13 and §15 #18 |
| 2026-11-11 | §15 #6 closed: IAM confirmed PUB-1 and P-35 behind `/api` in dev, staging and prod (reply of 2026-11-10), and IAM added `Cache-Control: no-store` to P-35's 200 |
| 2026-11-06 | Released `v0.3.0` (#62): SDK alpha.6, the constitution refactor, the error page; same remote contract as `v0.2.0`. Status, pairs and open items updated |
| 2026-11-06 | Claude Code tooling hardened (#60): the edit guard compares canonical paths and blocks `.env` / `docker.local.env` at any depth; `sync.sh` and `bump.sh` validate their arguments |
| 2026-11-06 | Documentation modelled on the IAM services (#54, #55, #57, #58, #59): ARCHITECTURE flows, data model, caching, observability, CSP, concurrency, contracts; README integration guide and validation; CONTRIBUTING recipes per layer; CHANGELOG in typed, dated sections |
| 2026-11-06 | Documents aligned with the code before the next release (#53); `isTransient` checked against the SDK `ApiClient`'s real retries |
| 2026-11-06 | Claude Code tooling (#52, #56): hooks wired (`settings.json`), `doc-sync-reviewer`, `/sdk-upgrade`, `/stack-sync`, `context7` |
| 2026-11-06 | Error boundary around the shell's own screens (#51): the SDK's `MFEErrorBoundary` (`web-shell`) shows `AppError` instead of a blank page |
| 2026-11-06 | Constitution step 2 (#50): `src/` in the constitution's folders (`app/`, `presentation/`, `application/`, `domain/`, `infrastructure/`, `shared/`); session screens split into components and their mounting; App notices as widgets |
| 2026-11-06 | Architecture lint (#49): `.dependency-cruiser.cjs` component map, `npm run arch-lint` in `Validate / Quality` |
| 2026-11-06 | Constitution step 5 (#48): every user-facing word in the `shell` namespace of the SDK's `/i18n` (`shared/i18n`, `en.json`), loaded before any screen (`infrastructure/i18n/shellMessages.ts`); sign-in errors never show an error's own message |
| 2026-11-06 | Constitution step 4 (#47): the layer rules are ESLint errors (`test/unit/layer-rules.test.ts`) |
| 2026-11-06 | Constitution step 3 (#46): use cases (`application/`) and repository contracts (`domain/`); presentation no longer reaches storage, PUB-1 or browser navigation |
| 2026-11-06 | Frontend Architecture Constitution assessment, target, roadmap and ADRs 0001–0008 (#45: `docs/architecture/constitution-assessment.md`, `docs/adr/`) |
| 2026-11-06 | SDK `1.0.0-alpha.6`: `runtime.json` names the environment; config loaded before the identity; deploy check in smoke `live` |
| 2026-11-05 | Observability standard: inventory (`docs/observability.md`), `metrics-check` in CI |
| 2026-11-05 | Released `v0.1.0` and `v0.2.0`; status and open items updated |
| 2026-11-05 | Remote renamed `app2` → `dashboard` (breaking; pairs with mfe-dashboard `v0.3.0`) |
| 2026-11-05 | SDK `1.0.0-alpha.5` (optional `auth.signInUrl` for standalone remotes; host-page docs). Checked against mfe-dashboard `v0.1.1` (alpha.4) |
| 2026-11-05 | Docs aligned with `main` after #25–#27: status, layout, hosting until CloudFront, release workflow, compatibility, open items |
| 2026-11-05 | Release workflow fixed before its first run (#27): provenance via `imagetools`, release notes, `BUILD_VERSION` without `v`, source maps artifact |
| 2026-11-05 | Hosting until CloudFront (#26): ingress routing, mounted CSP and HSTS |
| 2026-11-05 | Release checks: dashboard contract test against a real mfe-dashboard build, optional mounted CSP in nginx, start-up failure runbook |
| 2026-11-05 | Launch hardening: background P-35 retry with a live provider, i18n `detect`, SDK navigator, start-up failure report, real-browser suite, bundle budget, hashed images, `LoginPage1` removed, package renamed `web-shell` |
| 2026-11-05 | SDK `1.0.0-alpha.4`: container global `__platform_mfe_app2`, global sign-out as a form POST (CSP `form-action` needs the IdP), `no-raw-storage` exemption for remember-email |
| 2026-11-04 | Launch decisions: self-hosted fonts, Forgot password → Keycloak reset, links shown only with official URLs, essential-only consent for v1, update banner |
| 2026-11-04 | Production-readiness fixes: login photo weight, nginx gzip and baseline headers, dotfile 404s, accessibility, missing-context notice, Try again |
| 2026-11-04 | First LLD. Describes `main` after the move to the SDK on Rsbuild (#16), app2 on SDK hooks (#17), the IAM role map (#18), the audit follow-ups (#19), SDK `1.0.0-alpha.3` (#20) and the e2e and smoke suites (#21) |

### Table of Contents

1. [Document overview](#1-document-overview)
2. [Responsibilities and boundaries](#2-responsibilities-and-boundaries)
3. [Architecture and module layout](#3-architecture-and-module-layout)
4. [Domain model and contracts](#4-domain-model-and-contracts)
5. [Initialisation order](#5-initialisation-order)
6. [Key flows](#6-key-flows)
7. [Failure handling](#7-failure-handling)
8. [Security](#8-security)
9. [Configuration and storage](#9-configuration-and-storage)
10. [Hosting](#10-hosting)
11. [Observability](#11-observability)
12. [Testing](#12-testing)
13. [CI/CD](#13-cicd)
14. [Compatibility](#14-compatibility)
15. [Open items](#15-open-items)

---

## 1. Document overview

This LLD is the contract for the shell: what it owns, what the SDK owns for it, the order it starts the page in, the files it serves, and how each is tested. [ARCHITECTURE.md](../../ARCHITECTURE.md) is the narrative with diagrams; [README.md](../../README.md) is how to run it; [VERSIONING.md](../../VERSIONING.md) is the release contract.

### 1.1 Relationship to other documents

| Document | What this LLD takes from it |
|---|---|
| `platform-reactcommon` `docs/design/frontend-sdk-design.md` | §C1 (the ports a shell implements: `/auth` `WorkspaceResolver`, `SessionContextSource`), §C2 (shell bootstrap order), §C3 (web distribution: SPA rule, cache, CSP) |
| `platform-reactcommon` `docs/lld/platform-reactcommon-lld.md` | §5.4 behaviour of `ApiClient`, `IdentityProvider`, `loadRemote`, boundaries; §6.2 initialisation order; §12.1 `runtime.json` schema; §12.3 reserved storage keys |
| `platform-reactcommon` `examples/shell` | The reference shell. `src/infrastructure/api/iam.ts` and the bootstrap follow it; differences are listed in §2.3 |
| `iam-org-membership` LLD rev 2.47 (rev 2.58 for P-1/P-27 fields) | PUB-1 `GET /api/v1/public/tenants/resolve`, P-35 `GET /api/v1/me/session-context`, P-1 `GET /api/v1/tenants/:id`, P-27 `GET /api/v1/tenants/:id/seat-usage`, the closed role set (§5.4) and member-management grants (§10.4) |
| IAM product and screen spec v0.1 (2026-11-19) | The IAM screens' UI permissions (§2.2, §4.3) and the identifier-first sign-in (§6 A2) |

### 1.2 Rule: no copies of SDK behaviour

The shell implements only what the SDK leaves to a shell: the screens, the IAM ports (PUB-1, P-35; P-1 and P-27 for the banners), the role map, and the routes (consent is the SDK's essential-only default in v1). PKCE, tokens, refresh, idle timeout, cross-tab sign-out, workspace caching, the `/t/<slug>/` URL, telemetry, remote loading, chunk integrity and the shared map are the SDK's and the preset's. A change to any of those is made in `platform-reactcommon`.

Audit (2026-11-05) of `src/`, the tests and the CI scripts against platform-reactcommon. Nothing re-implements a published SDK, preset or lint-plugin behaviour. What the shell takes from platform-reactcommon's **unpublished** parts:

| In this repository | Taken from platform-reactcommon | Why it is here | To remove the copy |
|---|---|---|---|
| `infrastructure/api/iam.ts`, `domain/rules/permissions.ts`, `presentation/features/session-screens/`, `app/layouts/` (`sessionScreens.tsx`, `screen.tsx`) | `examples/shell/src/*` (pattern) | The ports and screens every shell must own (design doc §C1); adapted (§2.3) | Not a copy to remove |
| `application/use-cases/loadSessionContext.ts` (`isTransient`, `retrySessionContext`, `createStore`), `app/providers/ShellRoot.tsx` | `examples/shell/src/session-context.ts`, `ShellRoot.tsx`, nearly verbatim; `isTransient` is now the SDK ApiClient's rule (429, 502–504, online network error, timeout), and background attempts send one request each (`loadSessionContextOnce`, `retry: false`) | The SDK exports no session-context retry and no `PlatformProvider` that reads a live context | SDK export requested (`platform-reactcommon-shell-helpers-export.md`) |
| `infrastructure/auth/passwordReset.ts` (`/realms/<realm>/login-actions/reset-credentials`) | The SDK's realm URL scheme (internal to `/auth`) | The SDK exports no realm-URL or password-reset builder | Same request |
| `nginx/security.d/csp.conf.example` (read by `test/browser/server.ts`) | `examples/cloudfront/csp.mjs` `buildCsp` | The CSP builder is not in any package; one copy here, enforced in three engines by the browser suite | Same request (publish `buildCsp`) |
| `test/fixtures/keycloak.ts`, `network.ts` | `test/fixtures/` (pattern) | The SDK's `/testing` `mockApi` answers only `api.baseUrl` routes; the e2e suite also needs `/config`, `/remotes` and `/otel` | Not a copy to remove |
| `.github/scripts/metrics-check.mjs` | — | Uses the SDK's own `getServiceMeter` / `getDomainMeter` as the verdict; restates no rule | — |

Enforced on every PR by `test/unit/no-sdk-duplicates.test.ts`: no module-level name in `src/`, `config/` or the browser-suite server may be an SDK export (so the day the SDK publishes one of the copies above, the test says to import it and delete the copy), and no test or dev-server code may hand-build a problem response instead of `mockProblem`.

Removed as duplicates of the SDK (2026-11-05): `platform/consent.ts` (the runtime's default `ESSENTIAL_ONLY_CONSENT`), a second retry layer around the ApiClient's own GET retry, the restated `tenant-` default in `iam.ts`, and hand-built problem responses in the tests and the dev server (now the SDK's `/testing` `mockProblem`).

---

## 2. Responsibilities and boundaries

### 2.1 In scope

| Area | Module |
|---|---|
| Async boundary and the fatal "unavailable" message | `src/app/bootstrap/index.ts` |
| The SDK start-up sequence and session handling | `src/app/bootstrap/bootstrap.tsx` |
| Signed-in routes and the `dashboard`, `tenders`, `drafting` and `workflows` `RemoteBoundary`s | `src/app/routes/App.tsx` |
| IAM ports: PUB-1 → `Workspace`, P-35 → `SessionContext`, P-1 → `TenantStatus`, P-27 → `SeatUsage` | `src/infrastructure/api/iam.ts` |
| Workspace banners (spec §5.6), the read-only grace date, the upgrade welcome (A5) | `src/domain/rules/workspaceBanners.ts`, `src/application/use-cases/loadWorkspaceStatus.ts`, `src/presentation/widgets/WorkspaceBanners.tsx`, `src/infrastructure/storage/upgradeWelcome.ts` |
| Session screens: sign-in, signed out, session ended, device clock, wrong workspace, workspace not found, workspace unavailable (trial ended, suspended, access paused, no access), workspace not loaded (a trial whose P-35 never loaded), workspace upgraded (A5) | `src/presentation/features/session-screens/` (components), `src/app/layouts/sessionScreens.tsx` (mounting), `src/app/layouts/screen.tsx` (host) |
| Login page, identifier form (email, workspace name or URL), remember-email, help and legal links | `src/presentation/pages/login/`, `src/presentation/components/PageLinks.tsx`, `src/shared/constants/links.ts` |
| Password reset hand-off to Keycloak | `src/infrastructure/auth/passwordReset.ts` |
| Update, workspace-banner, read-only and missing-permissions notices | `src/presentation/widgets/`, mounted by `src/app/routes/App.tsx` with `useAppUpdate`, `useReadOnly`, `useSessionContext` and the `notices` prop; banners, read-only and missing-permissions share one bottom stack (`App.tsx`), sticky in the page's flow after the remote, never fixed over it |
| The shell's text: the `shell` namespace of the SDK's `/i18n`, English catalogue, registration before any screen | `src/shared/i18n/` (`en.json`, `catalogues.ts`, `useShellText`, `shellText`, `shellDate`), `src/infrastructure/i18n/shellMessages.ts` |
| Consent (v1: essential only) | The SDK's default consent provider; the shell sets none |
| Role → UI permission map | `src/domain/rules/permissions.ts` |
| Session context retry and store; P-35 refusal → workspace state (A6/A8) | `src/application/use-cases/loadSessionContext.ts` (`blockedWorkspace`, `settleRefusal`), `src/domain/rules/workspaceAccess.ts` |
| Build (`shell` host), `/version.json` | `rsbuild.config.ts` |
| Dev-only platform stand-ins | `config/dev-platform.mjs` |
| Static hosting | `nginx/default.conf`, `Dockerfile` |

### 2.2 Out of scope (owned elsewhere)

| Concern | Owner |
|---|---|
| Credentials, MFA, token issuance, realms | Keycloak |
| PKCE, token handling, refresh, idle timeout, cross-tab sign-out, workspace cache | SDK `/auth` |
| Tenant resolution, session context, roles, authorization decisions | IAM services, the gateway (AuthZ Enrichment) |
| Dashboard screens, user management | `mfe-dashboard` (remote `dashboard`) |
| Tender screens | `mfe-tender` (remote `tenders`) |
| `mfe-drafting` (remote `drafting`), `mfe-workflow-designer` (remote `workflows`) | Rsbuild remotes with `pluginPlatform({ role: 'remote', name: 'drafting' })` and `name: 'workflows'` on SDK alpha.6 (peer `^1.0.0-alpha.6`), so each needs a shell on alpha.6 or later with its route (the release after `v0.4.0`). Not released yet; no contract run (§15 #22) |
| Drafting screens | `mfe-drafting` (remote `drafting`) |
| Workflow designer | `mfe-workflow-designer` (remote `workflows`) |
| Each environment's `/config/runtime.json`, `/remotes/manifest.json`, CSP and security headers | Deploy pipeline, CloudFront |
| Cluster rollout | Operators. A tag publishes an image; nothing deploys it |

### 2.3 Differences from the SDK's reference shell

| Reference shell (`examples/shell`) | This shell | Why |
|---|---|---|
| Slug-or-email identifier form | The login page (`LoginPage`) takes an email, a workspace name or a pasted workspace URL (IAM spec §6 A2) | Product layout; only an email becomes `login_hint` |
| Example role map | `IAM_ROLES` closed set with §10.4 and IAM screen spec §4.3 grants (§4.3) | IAM's roles |
| No remember-email | `bcbp.rememberEmail`, `bcbp.loginEmail` in `localStorage` | Needed before a workspace exists, when the SDK's `storage()` ignores writes |
| Text written in the components | Every word a key of the `shell` namespace; `registerShellMessages` loads it with `setLocale(defaultLocale)` before the first screen, then `initializeI18n` after sign-in as in the reference | The sign-in screens show before `initializeI18n`; the SDK's `t` gives back the key until a catalogue is loaded |
| `login-required` with no workspace and no slug in the URL: the next cached workspace (`chooseWorkspace`) | The sign-in screen, with or without a slug in the URL (§6.1 step 1) | On a shared device the next cached workspace may be another person's; the SDK's `SessionState` contract allows both |
| A trial session with a slug checked against its session-context slug | The same, plus "Loading your workspace…", retries of every non-refusal failure before anything mounts, and "We couldn't load your workspace" (§5 step 11b) | The shell never opens a trial workspace it cannot check |
| Webpack | Rsbuild 2 with `pluginPlatform({ role: 'shell' })` | Same Module Federation v1 protocol; remotes built with any of the three load |

---

## 3. Architecture and module layout

`src/` follows the Frontend Architecture Constitution's structure. Tests stay in `test/` (ADR 0008).

```
src/
  app/                          composition root
    bootstrap/index.ts          Rsbuild entry: async boundary → bootstrap(); showUnavailable on a throw
    bootstrap/bootstrap.tsx     the only module that wires infrastructure/ and renders #app
    providers/ShellRoot.tsx     PlatformProvider with the live context and locale
    routes/App.tsx              BrowserRouter (basename /t/<slug>), /dashboard/* → RemoteBoundary dashboard ./App,
                                /tenders/* → RemoteBoundary tenders ./App, /drafting/* → drafting,
                                /workflows/* → workflows
    layouts/screen.tsx          #shell-screen host (fixed overlay outside #app)
    layouts/sessionScreens.tsx  askForWorkspace and the show* functions: mount the session screens
  presentation/
    pages/login/                LoginPage, useEmailSignIn
    features/session-screens/   SignInScreen and the dialogs (components; callbacks in, no mounting)
    components/                 BrandLogo, PageLinks
    widgets/                    UpdateAvailable, ContextUnavailable (state as props), ReadOnlyNotice (until?),
                                WorkspaceBanners (banners as props), AppError (the error page)
  application/                  signIn.ts (SignInUseCases); use-cases/ resolveWorkspace, requestPasswordReset,
                                loadSessionContext (blockedWorkspace, settleRefusal, isTransient, retrySessionContext,
                                createStore), loadWorkspaceStatus (P-1, P-27 for the banners)
  domain/                       repositories/rememberedEmail.ts (contract), errors.ts (WorkspaceNotFoundError),
                                rules/permissions.ts (IAM_ROLES, permissions: role → action:resource),
                                 rules/identifier.ts (toIdentifier, isEmailIdentifier, isRememberableIdentifier),
                                rules/workspaceAccess.ts (workspaceBlock: P-35 errorCode → WorkspaceBlock),
                                rules/workspaceBanners.ts (workspaceBanners, readOnlyUntil, recentlyUpgraded),
                                repositories/workspaceStatus.ts (WorkspaceStatusSource, UpgradeWelcomeRepository)
  infrastructure/
    api/iam.ts                  toWorkspace, toSessionContext, toTenantStatus, toSeatUsage, workspaceResolver,
                                sessionContextSource, loadSessionContextOnce, workspaceStatusSource
    auth/passwordReset.ts       passwordResetUrl (Keycloak reset-credentials)
    storage/rememberedEmail.ts  localStorageRememberedEmail (implements RememberedEmailRepository)
    storage/upgradeWelcome.ts   upgradeWelcomeStorage (SDK storage('shell'); implements UpgradeWelcomeRepository)
    federation/navigator.ts     shellNavigator: the router as the SDK's navigate() target
    i18n/shellMessages.ts       registerShellMessages (bootstrap only)
  shared/
    i18n/                       index.ts (useShellText, shellText, shellDate, ShellKey), catalogues.ts, en.json (every user-facing word)
    constants/links.ts          help and legal links (labels are keys; URLs unset until official)
    ui/                         assets/images (bundled into /assets/ with a hash), theme/, index.css (Tailwind 4, daisyUI)
    types/globals.d.ts          __ENVIRONMENT__, __BUILD_VERSION__
config/                         dev only: runtime.local.json, remotes.local.json, dev-platform.mjs
public/                         config/runtime.json (prod defaults), remotes/manifest.json ({}), favicons
nginx/default.conf              the image's server
test/                           unit, integration, e2e, fixtures, smoke, browser (§12)
```

### 3.1 Dependency rules

| Layer | May import | Never |
|---|---|---|
| `domain/` | SDK types only | React, the browser, any other layer |
| `application/` | `domain/`; SDK types and the `/problem` error classes | React, the browser, `infrastructure/`, `presentation/`, `app/` (ports are injected by the bootstrap) |
| `infrastructure/` | `domain/`, `shared/i18n`, SDK subpaths | `presentation/`, `application/`, `app/` |
| `presentation/` (any folder) | pages: components, `domain/`, `application/` types, `shared/`; features: pages, components, `domain/`, `application/` types, `shared/i18n`; components: `shared/` only; widgets: `shared/i18n` only | `infrastructure/`, `app/`, the SDK, `application/` values, storage, the network, navigation |
| `presentation/features/` | as above, plus SDK `/auth` types | SDK `/auth` values (no login without a click) |
| `shared/` | `i18n`: SDK `/i18n` (`t`, `formatDate`), `/react` (`useT`); `constants`: `shared/i18n`; `ui`, `types`: nothing | any shell layer. `shared/i18n` exposes text lookup and date formatting only |
| `app/` | `bootstrap.tsx` (the composition root, the only module that imports `infrastructure/`) wires every layer except presentation and `shared/constants`, which it reaches through `layouts`, `providers` and `routes`; `routes`, `providers` and `layouts` only what they render or provide (CONTRIBUTING § Architecture lint). `bootstrap.tsx` builds the use cases from infrastructure and passes them to the screens; `index.ts` imports `bootstrap.tsx` dynamically and `shared/i18n/en.json` statically (the unavailable page cannot use the SDK) | — |

The SDK is imported through public subpaths only. `@bcbp-solutions-fzc-llc/eslint-plugin` `configs.recommended` on `src/` fails a root or deep import, identity headers, raw `window.*Storage`, unsafe HTML and non-template API paths; `npm run lint` runs with `--max-warnings 0` in `validate-quality`.

Enforced twice. `eslint.config.js` (`@typescript-eslint/no-restricted-imports`, `no-restricted-globals`, `no-restricted-properties`; `test/unit/layer-rules.test.ts`): import rules per layer, plus browser globals. Presentation may not use `fetch`, `XMLHttpRequest`, storage, IndexedDB, `location`, `history`, `navigator` or `open`, bare or through `window`, `globalThis`, `self` (and `document.location`); domain and application may not use any browser global. `.dependency-cruiser.cjs` (`npm run arch-lint`; `test/unit/arch-lint.test.ts`): every component and its allowed dependencies, in allowed mode, so an undeclared dependency, a file in no component, a cycle or an unresolvable import fails.

SDK subpaths `src/` uses: `/core`, `/config`, `/tracing`, `/logging`, `/metrics`, `/flags`, `/auth`, `/http`, `/authz`, `/i18n`, `/mfe`, `/nav`, `/problem`, `/security`, `/storage`, `/react`.

### 3.2 Build

`rsbuild.config.ts`: `pluginReact()`, `pluginPlatform({ role: 'shell' })`, and `pluginVersionJson` (emits `/version.json` = `{ "version": BUILD_VERSION }`).

| Setting | Value | Reason |
|---|---|---|
| Entry | `index: ./src/app/bootstrap/index.ts` | Emits `index.html` |
| `source.define` | `__ENVIRONMENT__` (`PLATFORM_ENVIRONMENT`, default `prod` / `local` in dev; only the fallback for a `runtime.json` without `environment`), `__BUILD_VERSION__` | The only compiled-in values |
| `output.distPath` | css, font, image, svg, media, wasm, assets → `assets` | Every hashed file under `/assets/` (immutable). JS paths are the preset's |
| `inlineScripts`, `inlineStyles` | `false` | CSP `script-src 'self'`, `style-src 'self'` |
| `tools.cssLoader.url.filter` | root-relative `url()`s left as written | They point at `public/`; relative ones (the self-hosted fonts) are bundled into `/assets/` with a hash (`font-src 'self'`) |
| `dev` | `hmr: false`, `liveReload: true`, port 5001, `strictPort` | No HMR client in a federated page |

The preset provides: container `shell`, a `var` library, strict singletons for `react`, `react-dom` (and their JSX/client entries), `@opentelemetry/api` and every SDK subpath (`ProvideSdkRspackPlugin`), `GlobalThisOnlyPlugin` (no `Function('return this')`), `ChunkIntegrityPlugin` (sha384 on the entry in `index.html` and every lazy chunk), `crossOriginLoading: 'anonymous'`, hidden source maps.

---

## 4. Domain model and contracts

### 4.1 PUB-1 → `Workspace` (`toWorkspace`)

`GET /api/v1/public/tenants/resolve?identifier=<email or slug>`, no token (`auth: false`), rate-limited per IP.

| PUB-1 response | `Workspace` |
|---|---|
| Not a resolve response (not a JSON object with a boolean `found`: a WAF challenge page sent with a 2xx, an empty body) | Throws (SDK `1.0.0-alpha.8`): a failed call, so the SDK keeps the saved workspace; a 429 or another error already throws. The sign-in screen shows the generic message |
| `found !== true`, or `realm` missing or empty | `undefined` (the screen shows the generic message; the SDK drops a saved entry for that slug) |
| `strategy: 'shared'` | `{ realm, trial: true, slug?: identifier trimmed and lower-cased (only when it was not an email; P-35 writes slugs that way), tenantIdHint?: tenant_id }` |
| otherwise | `{ realm, trial: false, slug?: realm minus auth.paidRealmPrefix (when it starts with it) }` |

`auth.paidRealmPrefix` defaults to `tenant-` (as in the SDK's example). A paid realm must be `tenant-<slug>`: the SDK refuses to cache a workspace whose slug and realm disagree. Tested against the SDK's `contracts/tenant-resolve-cases.json`.

### 4.2 P-35 → `SessionContext` (`toSessionContext`)

`GET /api/v1/me/session-context` with the bearer token.

| P-35 | `SessionContext` |
|---|---|
| `tenant_id`, `slug` | `tenantId`, `slug` (trimmed and lower-cased, as a PUB-1 trial slug is in `toWorkspace`: the trial slug check in §5 step 11b compares the two, and the focus refresh (§6.6e) compares it with the page's; a body without one keeps its context in both) |
| `roles`, `departments`, `feature_flags` (may be `null`) | `roles`, `departments`, `featureFlags` (never `null`, default `[]`) |
| `read_only` | `readOnly` (`true` only when `true`) |
| `plan`, `mfa_freshness_seconds`, `locale` | `plan`, `mfaFreshnessSeconds`, `locale` (only when present) |

Refusals that are workspace states: §7.1.

Tested against `contracts/session-context-cases.json`.

### 4.2a P-1 → `TenantStatus`, P-27 → `SeatUsage` (`toTenantStatus`, `toSeatUsage`)

`GET /api/v1/tenants/:id` (P-1, any active member) and `GET /api/v1/tenants/:id/seat-usage` (P-27, owner and tenant admin) with the bearer token; `:id` is P-35's `tenant_id`. Route templates with `params`, so the metric label is the template. The SDK ships no contract cases for these; `test/unit/workspace-status.test.ts` pins the mapping to IAM's reply of 2026-11-24 (iam-org-membership #64).

| P-1 / P-27 | Shell |
|---|---|
| `name`, `status` | `name`, `status` |
| `trial_ends_at`, `subscription_started_at`, `ownerless_since`, `read_only_until` (left out when empty) | `trialEndsAt`, `subscriptionStartedAt`, `ownerlessSince`, `readOnlyUntil` (absent when absent or `null`) |
| `active_users`, `pending_invitations`, `licensed_seats` | `activeUsers`, `pendingInvitations`, `licensedSeats` |

### 4.3 Role map (`permissions.ts`)

Keys are IAM's closed role set: `member`, `tenant_owner`, `tenant_admin`, `tender_admin`. Department levels (`preparator`, `reviewer`, `approver`) are never roles.

| Role | Grants |
|---|---|
| `member` | `read:tender`, `read:members` |
| `tender_admin` | member + `update:tender`, `delete:tender`, `manage:tender-access` |
| `tenant_admin` | tender_admin + `manage:members`, `manage:sso`, `manage:delegation-policy`, `read:audit` |
| `tenant_owner` | tenant_admin + `manage:admin-roles`, `manage:tenant-settings` (the signup owner usually holds `tenant_owner` without `tenant_admin`) |

`setAuthorizer(roleMapAuthorizer(permissions))`; the subject is `{ roles, tenantId }` from P-35, or none (deny all). These are UI hints; the gateway and services authorise every request. Tender grants are provisional until Tender Service confirms them.

The IAM grants follow the IAM screen spec v0.1 §2.2 and §4.3. Two differences from §4.3: granting or removing `tenant_owner` / `tenant_admin` is `manage:admin-roles`, because the spec's `manage:roles:admin` has two colons and the SDK's `roleMapAuthorizer` throws on it; and it is owner only, following the HLD (§6.4) until IAM-FE-Q14 is answered. `manage:sso` also needs the plan's feature flag, which the screens check.

### 4.4 Shell value (`PlatformProvider shell`)

| Field | Source | Read by remotes through |
|---|---|---|
| `user` | `session.user` | `useCurrentUser()` |
| `workspace` | `session.workspace` | `useWorkspace()` |
| `context` | P-35, or `undefined` | `useSessionContext()`, `useHasPermission()`, `useFeatureFlag()` |
| `locale` | `document.documentElement.lang` (set by `initializeI18n`) | `useLocale()` |
| `switchWorkspace(identifier)` | Nothing once the boot has stopped (sign-out, expiry, refusal); else cleaned up as the sign-in box's input (`toIdentifier`), PUB-1, then `idp.switchWorkspace`; not found → "Workspace not found"; PUB-1 unreachable or rate-limited → the promise rejects | `useSwitchWorkspace()` |
| `signOut(o)` | `idp.logout(o)`; global unless `{ global: false }` | `useSignOut()` |

### 4.5 Remote contract

| Item | Value |
|---|---|
| Remote | `dashboard`, module `./App`, default export a component |
| Container global | `window.__platform_mfe_dashboard` (preset `containerName`, SDK alpha.4); a remote built with an older preset defines `dashboard` and fails as `incompatible` |
| Props | None |
| Entry | `/remotes/manifest.json` `{ "dashboard": { entry, version, ownerDomain, integrity? }, "tenders": { … }, "drafting": { … }, "workflows": { … } }`; `integrity` required outside `local`, `dev`, `test` |
| Build | `@bcbp-solutions-fzc-llc/webpack-preset` remote (`pluginPlatform({ role: 'remote', name: 'dashboard', exposes: { './App': … } })` or the webpack/Rspack equivalents), SDK `import: false` |
| Route template | `/t/:slug/dashboard` (`useRouteTemplate` in `App.tsx`) |
| Notice stack height | `--shell-notices-height` on `<html>` (`NOTICES_HEIGHT_VAR` in `App.tsx`): the bottom notice stack's height in px, `0px` when empty, kept current by a `ResizeObserver`, set through the CSSOM (the platform CSP allows it). A remote's fixed elements may end above it with `bottom: var(--shell-notices-height, 0px)`. Additive and optional: a remote that ignores it keeps working (§15 #21) |
| Second remote | `tenders` (mfe-tender), module `./App`, container `window.__platform_mfe_tenders`, no props (its optional `userLabel`, `onLogout` default to SDK hooks), build `name: 'tenders'`, `ownerDomain` `tender_management`, route template `/t/:slug/tenders`. react-router-dom is not shared, so it runs its own `BrowserRouter` under the shell's basename (§15 #18). A rename or a required prop is a MAJOR change |
| Third and fourth remotes | `drafting` (mfe-drafting, container `window.__platform_mfe_drafting`, route template `/t/:slug/drafting`) and `workflows` (mfe-workflow-designer, container `window.__platform_mfe_workflows`, route template `/t/:slug/workflows`), module `./App`, no props (mfe-drafting's optional `userLabel`, `onLogout` default to SDK hooks), `ownerDomain` `portal`, each with its own router under the shell's basename. Not released (§15 #22). A rename or a required prop is a MAJOR change |

---

## 5. Initialisation order

`src/app/bootstrap/index.ts` does `import('./bootstrap').then(m => m.bootstrap())` (the Module Federation async boundary) and catches into `showUnavailable`, which replaces `#app` with "The app is unavailable right now. Please try again later."

| # | Call | Notes |
|---|---|---|
| 1 | `installTrustedTypesPolicy()` | No-op without Trusted Types |
| 2 | `loadRuntimeConfig()` | Strict schema; checked against the file's own `environment` (no identity yet). On a throw, `initializeCore` with the build-time environment, so it can be reported |
| 3 | `initializeCore({ serviceName: 'web-shell', domain: 'portal', environment: cfg.environment ?? __ENVIRONMENT__, buildVersion: __BUILD_VERSION__ })` → `setRuntimeConfig(cfg)` | Registry-validated identity. One build for every environment (SDK alpha.6): the deployed file names the environment; the build-time one is the fallback until every file has the key. The SDK refuses a config whose `environment` differs from the identity's. Any throw from here on is fatal (§7): after `initializeCore` it is first logged as `error 'the app could not start'` (to `telemetry.otlpBaseUrl` once the config is read, else the default `/otel`) |
| 4 | (consent) | The SDK's default: essential only (v1). A consent manager would call `setConsentProvider` here |
| 5 | `initializeTracing`, `initializeLogging`, `initializeMetrics` (`cfg.telemetry`), `installGlobalErrorHandlers()`, `startWebVitals()` | |
| 6 | `setFlagProvider(runtimeConfigFlagProvider())`; `registerShellMessages(cfg.i18n.defaultLocale)` (`infrastructure/i18n/shellMessages.ts`) | Platform flags only, until P-35. The `shell` namespace is registered and loaded for the default locale (`registerNamespace` + `setLocale`) before any screen, so the sign-in screens never show keys; step 14 then picks the user's locale |
| 7 | `idp = createOidcProvider(cfg.auth, workspaceResolver)`, `setTokenSource(initializeAuth(idp))`, `session = await idp.init()` | May redirect once with `prompt=none` and never settle |
| 8 | Anonymous → §6.1 and return | The app is not rendered |
| 9 | `isWrongWorkspace(session.workspace, session.user)` → `showWrongWorkspace(idp, signInUseCases)` and return | Not cached, never rendered |
| 10 | `idp.subscribe(...)` | §6.4, §6.5 |
| 11 | `setAuthorizer(roleMapAuthorizer(permissions))`; `sessionContextSource.load()` into a store | Failure → `warn 'session context unavailable'`, context `undefined`. A sign-out or an expiry from here on stops the boot (`stopped()`, checked after every await) |
| 11a | After a failure: `settleRefusal(error, loadSessionContextOnce)`. A workspace state (`blockedWorkspace`) → `showWorkspaceUnavailable(block, idp, signInUseCases)` and return; a membership refusal is asked once more after 5 s first (`showWorkspaceLoading()` covers that wait, only for such a refusal: `refusalIsReasked`; a tenant state's screen comes at once), and a context from that second ask is used as a success | §7.1. Never rendered; the shell remembers nothing (no `rememberWorkspace`, no `/t/<slug>/` move). A sign-out or an expiry during the wait stops the boot |
| 11b | A trial workspace with a slug (`session.workspace.trial` and `slug`): without a context, `retrySessionContext` (1 s, 2 s, 4 s, as step 18) runs now, before anything mounts (`showWorkspaceLoading()`: "Loading your workspace…", words only), for every first failure that is not a workspace state (`retryable: blockedWorkspace(e) === undefined`: offline, 404 and 500 too; step 18 retries transient ones only). A retry answered with a workspace state → `settleRefusal` (as step 11: a membership refusal asked once more after 5 s) → `showWorkspaceUnavailable` and return; when that second ask fails otherwise (a 503, say), the retries run once more (1 s, 2 s, 4 s), as the first load's background retry would, and a refusal then (asked twice) is final; still no context → `showWorkspaceLoadFailed(idp, signInUseCases)` ("We couldn't load your workspace": Try again (reload), Sign out, Switch workspace with `prompt: 'login'`) and return. Then P-35's `slug` (trimmed and lower-cased, §4.2) ≠ the workspace's → `showWrongWorkspace(idp, signInUseCases)` and return. Every refusal screen here and in steps 11a and 18 is shown through `refuse()`, which sets `refused` | SDK alpha.7: every trial tenant shares one realm, so a silent restore can ride another trial tenant's SSO session, and a cached entry has no `tenantIdHint` for step 9. Never rendered; no `rememberWorkspace`, the URL kept. A sign-out or an expiry during the retries stops the boot (`stopped()` = signed out, expired or `refused`; every boot step checks it, and an expiry after a refusal screen leaves it in place: §6.4). Known limit: a workspace state carries no slug, so a foreign trial session IAM refuses shows that state's screen |
| 12 | `setAuthzSubject(context && { roles, tenantId })` | |
| 13 | With a context: `setFlagProvider(sessionContextFlagProvider(context))`, `rememberWorkspace({ ...session.workspace, slug: context.slug })` | Moves the URL under `/t/<slug>/` |
| 14 | `initializeI18n({ defaultLocale, supported, detect: () => context.locale })` | The user's IAM locale first, then the browser's languages |
| 15 | `loadManifest()` | Failure → `error 'manifest load failed'`; the app still renders |
| 16 | `startVersionPolling()` | `/version.json` every `appUpdate.pollIntervalMs` |
| 17 | `hideScreen()`, `createRoot(#app).render(<StrictMode><ShellRoot context={store} shell={…}><App basename? onRouter notices={notices}/></ShellRoot></StrictMode>)` | `notices`: a second `createStore<AppNotices>` that step 17a sets. `basename = workspacePathPrefix + slugFromPath(...)` when the URL has a slug. `onRouter` → `registerNavigator(shellNavigator(navigate, basename))` |
| 17a | `loadWorkspaceStatus` in the background (§6.6c), not awaited | Starts once the context is known; a failure logs `workspace status unavailable` |
| 18 | Without a context (never a trial with a slug: step 11b), and only when the first failure was transient (a network failure while online, a timeout, 429, 502, 503 or 504 (the SDK ApiClient's own rule); `isTransient`): `retrySessionContext` (1 s, 2 s, 4 s) over `loadSessionContextOnce` (`retry: false`: one request per attempt, the SDK's retries already ran on the first load) → `store.set`, step 12–13 again, then step 17a. A final answer (401, 403, 404) is not asked again; a retry that answers with a workspace state (§7.1) is settled with `settleRefusal` (a membership refusal asked once more after 5 s, the deny-all app kept meanwhile; a context from it is applied, another failure keeps deny-all), then a workspace state unmounts the app and shows that screen. After an expiry a refusal still unmounts the app (not asked again), and "Session ended" stays on top instead of its screen | Stopped by a sign-out or an expiry (`stopped()`): a context that answers after "Session ended" is not applied (no subject, no `rememberWorkspace`, no banner load). The provider re-renders with the context; no reload. When `rememberWorkspace` moved the URL under `/t/<slug>/`, `App` is rendered again keyed by the new basename (and the navigator with it) |
| 18a | The focus refresh (§6.6e): `focus` on `window` and `visibilitychange` to `visible`, at most once per `CONTEXT_REFRESH_MS` (60 s, counted from the render and from each ask) → `loadSessionContextOnce` (one request) | A changed context → `store.set`, step 12–13 again, step 17a (once) and the router (as step 18), and step 18 ends (its sleep, request and second ask are aborted, and an answer it already has is dropped: it may predate the change the refresh shows); the same context changes nothing (compared by content); a context whose `slug` is not the page's (the current context's, else the workspace's; compared only when both are known) → the wrong-workspace screen, app unmounted, never rebound; a workspace state → `settleRefusal` (a membership refusal asked once more after 5 s) → app unmounted, its screen; any other failure → `warn 'session context refresh failed'`, the context kept. One at a time; nothing once `stopped()` (the listeners are removed then, and on a sign-out) |

`test/integration/bootstrap.test.tsx` asserts this order with every SDK subpath replaced by a recording fake.

---

## 6. Key flows

### 6.1 Signed-out page load

| `session.reason` | Action |
|---|---|
| `signed-out` | `showSignedOut(signIn)`: waits for a click. An automatic login would ride the live SSO session and undo the logout |
| `device-clock` | `showDeviceClock(signIn)`: waits for a click |
| `none`, `login-required` | `signIn()` now |

`signIn()` picks the workspace in this order:

1. The workspace a failed silent attempt named (`reason: 'login-required'`). The SDK re-checks a trial one with PUB-1 first (at most 5 s, then the saved entry; converted → `tenant-<slug>`). When PUB-1 no longer knows it, `login-required` has no workspace (SDK alpha.7): the shell skips step 2 and asks (step 3), with or without a slug in the URL, never another cached workspace. With no slug in the URL this is stricter than the SDK's reference shell (which tries the next cached workspace); the SDK's `SessionState` contract allows both (alpha.9).
2. `chooseWorkspace({ pathname, resolver, cfg })`: the `/t/<slug>` in the URL (cached or resolved through PUB-1; a cached paid entry is used once Keycloak serves its realm's discovery document (≤ 3 s, no PUB-1 call), and re-checked with PUB-1 when the realm is gone (SDK alpha.9); a cached trial entry is re-checked with PUB-1, at most 5 s), else the most recently cached workspace.
3. `askForWorkspace(signInUseCases)`: the sign-in screen. It takes a work email, a workspace name or a pasted workspace URL (`toIdentifier`, `domain/rules/identifier.ts`): an email is sent as typed (trimmed), a name lower-cased, a URL as the slug the SDK's `slugFromPath` reads from its path. An email or a name is held to 254 characters (`maxLength` and the use case); a URL is read for its slug at any length (a remote's deep link). An email may have `/` before its `@` (`ops/billing@acme.com`), unless what comes before the `/` has a dot (a link pasted without its scheme); never `:`, `?` or `#`, which would let a pasted link's query (a token) be remembered or sent as `login_hint`. PUB-1 resolves it; "not found", 429, unreachable and an identifier that names no workspace (a URL without `/t/<slug>`) all show "We couldn't find a workspace for that. Try your workspace name — it's the part after /t/ in your workspace link — or ask your administrator."

Then `idp.login({ workspace, loginHint?, prompt? })`; `prompt: 'login'` only for a trial workspace with neither a slug nor a `tenantIdHint` (`uncheckable` in `bootstrap.tsx`), on every way in: the anonymous sign-in (`credentialsFor`), "Session ended" → `signInAgain` (its `prompt` callback, SDK alpha.9: `(w) => credentialsFor(w).prompt`) and a remote's `shell.switchWorkspace` (`idp.switchWorkspace(target, credentialsFor(target))`): nothing can check that session after sign-in, and the trial realm's SSO session may be someone else's. The hint is the typed email, or the remembered value for a known workspace, and only when it is an email (`isEmailIdentifier`): a workspace name is never a `login_hint`. `returnUrl` defaults to the current page in the SDK, and after a sign-out the SDK adds `prompt=login` itself; the shell passes no `returnUrl`, and `prompt` only in the `uncheckable` case.

### 6.1a Forgot password

"Forgot your password?" needs the typed email or workspace name; a pasted URL works too (an empty field shows "Enter your work email or workspace name first…"). PUB-1 resolves it through `toIdentifier` (failures show `WORKSPACE_NOT_FOUND`), then `location.assign(passwordResetUrl(workspace))`: `{auth.idpOrigin}/realms/{realm}/login-actions/reset-credentials?client_id={auth.clientId}`. Keycloak e-mails the reset link; the realm must have `resetPasswordAllowed`. No sign-in is started.

### 6.2 Callback

Keycloak redirects to `{origin}{auth.redirectPath}` (`/auth/callback`). The SDK checks `iss` and `state`, exchanges the code with the PKCE verifier, keeps the tokens in memory, and moves the URL back to the page the user opened. The bootstrap continues at step 9.

### 6.3 Silent restore

A reload or a new tab: `idp.init()` may redirect once with `prompt=none`. Before redirecting to a saved **paid** realm the SDK (alpha.9) loads that realm's discovery document (at most 1.5 s): served → the entry is used with no PUB-1 call; gone (Keycloak answers a missing realm 404 without CORS, so the SDK confirms against the trial realm's document) → the entry is re-checked with PUB-1, and a reverted workspace restores into the trial realm PUB-1 names, an unknown one ends as `login-required` with no workspace. PUB-1 down while the realm is gone still ends on Keycloak's 404 page, until PUB-1 answers; nothing the shell can do (SDK, LLD §8.2 rule 7). A live SSO session returns authenticated; otherwise `login-required` with the workspace, or without one when PUB-1 no longer knows a trial slug (§6.1, case 1). A trial session restored this way is checked against P-35's slug (§5 step 11b).

### 6.4 Expiry during use

`expired` → `showSessionEnded(s, …)` over the running app, text by cause (`serverEnded`: the workspace may have moved to its own plan; `idle`; other). "Sign in" calls `signInAgain({ idp, state, resolver, cfg, ask })`, which re-resolves the workspace when the server ended the session and reuses the cache otherwise; `ask` is the sign-in screen, and `prompt` is `(w) => credentialsFor(w).prompt` (SDK alpha.9): `'login'` for a trial workspace nothing can check (`uncheckable`), applied to the workspace `signInAgain` chooses; `state.idle` forces it too.

A refusal screen stays when the session then expires: once a refusal replaced the boot or the app (A6/A8, the trial slug check's wrong workspace, workspace not loaded, a late background refusal, a focus refresh's refusal or other workspace), the bootstrap sets `refused` through `refuse()` and the subscriber does not show "Session ended". Its Sign in would ride the same SSO session (a foreign trial one, say: the wrong-workspace screen would come straight back), and the refusal screen's own Sign out and Switch ask for credentials. A sign-out still shows "You are signed out".

### 6.5 Sign-out

Here (a remote's `useSignOut()`) or in another tab (`BroadcastChannel('platform-auth')`): `anonymous`/`signed-out` → the app root is unmounted (so the previous user's data is not left under the dialog), then `showSignedOut(() => idp.login({ workspace }))`. A global sign-out POSTs a hidden form to the realm's end-session endpoint (`id_token_hint`, `client_id`, `post_logout_redirect_uri`; the ID token stays out of URLs and history), which returns to `/`. The CSP `form-action` must allow the IdP origin, or the browser blocks the POST and the SSO session stays alive; that load shows the signed-out dialog (§6.1). The SDK clears per-workspace storage.

### 6.6 Workspace switch

`switchWorkspace(identifier)` from the shell value: nothing after a sign-out, an expiry or a refusal (`stopped()`, checked before and after PUB-1), so "Session ended" or a refusal screen is never covered; else `toIdentifier` as in the sign-in box (trimmed, a name lower-cased, a URL's slug), then PUB-1 (`workspaceResolver.resolve`); an identifier that names no workspace, or not found → `showWorkspaceNotFound()`; PUB-1 unreachable or rate-limited rejects the promise the remote awaits (no dialog), so the remote can offer a retry; else `idp.switchWorkspace(target, credentialsFor(target))` (`prompt: 'login'` for a trial nothing can check). The cleanup keeps a trial slug equal to P-35's for the §5 step 11b check. The wrong-workspace, A6/A8 and workspace-not-loaded dialogs' Switch workspace (§7.1) instead calls `idp.switchWorkspace(w, { prompt: 'login' })` after the sign-in screen.

### 6.6a New version

`startVersionPolling()` (§5 step 16) polls `/version.json`. When `useAppUpdate().available` turns true, `App` shows "A new version is available." with Reload (`role="status"`, top of the page). The reload is never forced.

### 6.6b Read-only workspace

While `useReadOnly()` is true (P-35 `read_only`, or a `DENY_TENANT_READ_ONLY` answer seen on the page), `App` shows "Workspace is read-only (subscription ended)" (`ReadOnlyNotice`, `role="status"`, IAM spec §7.10) at the bottom, above the missing-permissions notice in the same stack. It has no action. The remotes disable their own mutations. For a cancelled workspace, P-1's `read_only_until` (§4.2a, loaded in §6.6c) adds "Access ends on <date>" (`shellDate`, the current locale): when the grace ends and the workspace is suspended.

### 6.6c Workspace banners and the upgrade welcome

After render, once the session context is known, the bootstrap loads P-1, and P-27 when `hasPermission('manage', 'members')` (`loadWorkspaceStatus`), each failure logged and skipped. `workspaceBanners` (spec §5.5, §5.6) decides, in this order:

| Banner | When | Who |
|---|---|---|
| "N days left in your trial" ("1 day", "ends within a day"), "Your trial has ended" | P-1 `status=trial` with a readable `trial_ends_at`; days left to the nearest day, at least 1 (a new 14-day trial reads 14), and 0 ("within a day") only in the last 24 hours; once the end has passed while IAM still says `trial`, the `trial-ended` banner | Everyone |
| "Payment issue — update your card…" | `status=past_due` | Owner (`manage:tenant-settings`) |
| "All N seats are in use…" | `active_users + pending_invitations >= licensed_seats` (> 0). IAM has no overage (CD-54), so no grace date | Owner, tenant admin (`manage:members`) |
| "This workspace has no owner. Contact support…" | `ownerless_since` set | Tenant admin (not the owner) |

`App` shows them as `WorkspaceBanners` (`role="status"`, no action) at the top of the bottom stack, above the read-only and missing-permissions notices. The stack is `sticky bottom-0` in the page's flow, after the routes (`App` is a `min-h-screen` flex column, the routes in a `flex-1` wrapper): it stays at the window's bottom and the page ends below it, so the remote's last controls scroll clear of it. `NoticeStack` publishes its height as `--shell-notices-height` for remotes' fixed elements (§4.5). The banners are worked out again every hour from the loaded P-1/P-27 (`BANNER_REFRESH_MS`; P-1 and P-27 are not asked again), so the trial's days left move while a tab stays open; the refresh stops on a sign-out or an expiry. "Settings still applying" (`realm_sync_pending`) is for the SSO screen (E6) in mfe-admin. Audiences are UI hints, never more than IAM grants.

**Upgrade welcome (A5).** A trial converted to paid (IAM OM-4: `trial_ends_at` kept, `subscription_started_at` set) and still on a paid plan (`status` `active`, or `past_due` while a payment is retried; never `cancelled` or `trial`) less than 7 days ago (`recentlyUpgraded`; a device clock up to 10 minutes behind IAM's still counts, `CLOCK_SKEW_MS`, so the first load after the conversion is welcomed) shows `UpgradeWelcomeDialog` ("Welcome to your upgraded workspace", "<name> is now on a paid plan.", Continue) over the app, unless `upgradeWelcomeStorage` says this device has seen it in this workspace. It is marked seen when it is shown (not on Continue), so a screen that replaces it (Session ended, a late refusal) does not bring it back on the next load; Continue only closes it. The SDK's `storage('shell')` is cleared on sign-out, so a user who signs out within the 7 days sees it once more. It is never shown after the session expired (an `expired` flag the `idp.subscribe` handler sets) or while another screen is up (`isScreenShown()`, `app/layouts/screen.tsx`): its Continue hides the screen host, which would remove "Session ended" or "Workspace not found" and leave the user without their action.

### 6.6e Session-context refresh on focus

Roles, plan and flags come from P-35, not the token (IAM-UX-2), so a change made elsewhere (another admin promotes or demotes the user, a plan change) reaches this page only when P-35 is asked again. The bootstrap asks it again when the page gets focus (`focus`, or the tab becoming visible), at most once a minute (`CONTEXT_REFRESH_MS`), one request with no retries (`loadSessionContextOnce`; the next focus tries again). A changed context is applied as the background retry applies one: subject, flags, `rememberWorkspace`, the banners if not loaded yet, and the provider re-renders, so `useSessionContext`, `useHasPermission`, `useFeatureFlag`, `useReadOnly` and `<Can>` in the remotes follow without a reload. A deny-all page (P-35 failed at start-up with a final answer) gets its permissions this way too. Once a refresh has applied a context, the background retry (§5 step 18) ends: an answer it still gets may have been read before the change the refresh shows, so it never overwrites it.

| Refresh answer | Result |
|---|---|
| The same context | Nothing (compared by content) |
| A changed context for this workspace | Applied (§5 step 18a) |
| A context for another workspace (`slug` differs; a body without one, or a page without one, is not compared) | The wrong-workspace screen; the app unmounted; never rebound |
| A workspace state (A6/A8, access paused, no access) | Settled as on the first load (§7.1: a membership refusal asked once more after 5 s), then the app is unmounted and the screen shows |
| Offline, 5xx, timeout, any other refusal | `warn 'session context refresh failed'`; the page keeps its context (never deny-all) |

Nothing happens after a sign-out, an expiry or a refusal screen (`stopped()`; the listeners are removed), except that a refusal answering a refresh already in flight when the session expired unmounts the app under "Session ended", as the background retry does. A refusal on refresh logs nothing (its screen says it). The banners (P-1, P-27) are not loaded again: a user promoted on focus gets the remotes' new hints but no seats banner until a reload (§15 #25). A remote cannot ask for a refresh itself (after changing the user's own roles, or on `403 DENY_ROLE_INSUFFICIENT`): that needs an SDK hook (§15 #25).

### 6.7 Dashboard load

`/dashboard/*` → `useRouteTemplate('/t/:slug/dashboard')`, `<RemoteBoundary remote="dashboard" module="./App" fallback="Loading dashboard…">`. The SDK's `loadRemote`: kill switch (`remotes.killSwitch`, flag `remote.dashboard.disabled`), entry origin (page or `remotes.allowedOrigins`), classic `<script>` with `integrity`, timeout `remotes.loadTimeoutMs`, `retries`, container from `window.__platform_mfe_dashboard`, share-scope init. Any failure stays inside the boundary ("Something went wrong." / "Try again"); "Try again" asks the container again without a reload.

`/tenders/*` → `useRouteTemplate('/t/:slug/tenders')`, `<RemoteBoundary remote="tenders" module="./App" fallback="Loading tenders…">`, loaded the same way from `window.__platform_mfe_tenders` (flag `remote.tenders.disabled`). mfe-tender renders its own routes below `/tenders` and registers each page's template. Its props (`userLabel`, `onLogout`) are optional and default to `useCurrentUser` and `useSignOut`, so the shell passes none. Its manifest entry needs `ownerDomain: tender_management`.

`/drafting/*` and `/workflows/*` → `useRouteTemplate('/t/:slug/drafting')` / `('/t/:slug/workflows')`, `<RemoteBoundary remote="drafting" | "workflows" module="./App">` with "Loading drafting…" / "Loading workflows…" (`app.loadingDrafting`, `app.loadingWorkflows`), loaded the same way (flags `remote.drafting.disabled`, `remote.workflows.disabled`), no props. Each renders its own routes below its prefix.

---

## 7. Failure handling

| Step | Posture | Result |
|---|---|---|
| Identity, `/config/runtime.json` | fatal | "The app is unavailable right now." with Try again (reload) + `console.error` |
| Silent restore | degrade | Signed-out flow |
| PUB-1 | stop on the screen | One generic message; retry |
| P-35, a workspace state (§7.1) | stop on the screen | A6/A8 dialog with Sign out and Switch workspace; the app never renders (a refusal that a background retry or the focus refresh receives is settled the same way, then unmounts the app) |
| P-35, a trial with a slug, no context after the retries (§5 step 11b) | stop on the screen | "We couldn't load your workspace" with Try again (reload), Sign out and Switch workspace, after 3 retries of any failure that is not a workspace state; the app never renders: without P-35 the slug cannot be checked, so any failure but a workspace state (`INSUFFICIENT_ROLE`, 404 and 500 included) keeps it closed (the session may be another trial tenant's), and the text says so ("…so it stays closed. Try again later, sign out, or switch to another workspace."). Where P-35 is not deployed (404), every trial user with a slug stops here after about 7 s. Every environment where trial users sign in must serve P-35; smoke `live` fails one that does not (401 without a token, never 404) |
| P-35, any other failure (not a trial with a slug: §5 step 11b) | degrade | Deny-all, platform flags, no `/t/<slug>/` move, `warn` log; `App` shows "We couldn't load your permissions…" with Reload (`role="status"`); the focus refresh can still recover it (§6.6e) |
| P-1, P-27 (banners) | ignore | `warn 'workspace status unavailable'` (`what`: `tenant` or `seats`; no `what` when the load itself throws); no banners, no read-only date, no A5; not retried. A sign-out aborts the requests and logs nothing |
| Manifest | degrade | `error` log; the boundary shows its error |
| Remote load or render | degrade | Boundary message, "Try again" |
| Shell render (routes, widgets) | stop that tree | SDK `MFEErrorBoundary` `mfe="web-shell"` around `App`'s router: `error` log (the SDK's text `remote failed to render`, attribute `mfe: web-shell`), the SDK's web-error record (Tier 1, once ratified), then `AppError` (catalogue words, reference, Try again) |
| Telemetry export | ignore | SDK queues; nothing beyond `essential` without consent |
| `/healthz` | liveness only | Constant `ok`; does not check Keycloak, IAM or any remote |

### 7.1 P-35 refusals that are workspace states

`workspaceBlock(status, errorCode)` (`domain/rules/workspaceAccess.ts`), codes compared without case, status checked too. Codes from IAM's replies of 2026-11-24 (iam-org-membership #64, iam-authz-enrichment #44): Org & Membership checks the tenant first, then the member; the gateway refuses a member who is not active before the request reaches it.

| P-35 answer | Sent by | `WorkspaceBlock` | Screen (`WorkspaceUnavailableDialog`) |
|---|---|---|---|
| `403 TENANT_TRIAL_EXPIRED` | Org & Membership | `trial-expired` | "Your trial has ended" (A6) |
| `403 TENANT_SUSPENDED`, `404 TENANT_NOT_FOUND` (offboarded) | Org & Membership | `tenant-unavailable` | "Workspace unavailable" (A8) |
| `403 DENY_MEMBER_SUSPENDED`, `403 MEMBER_SUSPENDED` (the first seconds after a suspension) | gateway, Org & Membership | `member-paused` | "Your access is paused" (A8) |
| `403 DENY_UNRESOLVABLE_SUBJECT`, `404 MEMBER_NOT_FOUND` (the first seconds after a removal) | gateway, Org & Membership | `no-access` | "You don't have access to this workspace" (A8; also what a suspended member sees from a gateway without `DENY_MEMBER_SUSPENDED`) |
| Anything else (`INSUFFICIENT_ROLE`, a 404 without these codes, 5xx) | | none | Deny-all and the permissions notice (§7) (not a trial with a slug: §5 step 11b) |

**When it is final.** A tenant state (`trial-expired`, `tenant-unavailable`) is final at once. A membership refusal (`member-paused`, `no-access`) is asked once more after 5 s (`settleRefusal`): the gateway keeps a member's answer 5 s, and IAM's caches can lag a reactivation, a removal or a new member by seconds (AuthZ Enrichment's advice). A context from the second ask is used as a success; any other answer is taken as it is. This applies on all four paths: the first load, the pre-render retries of a trial with a slug (§5 step 11b), the background retry (§5 step 18, where the deny-all app stays during the second ask, a context from it is applied, and another failure keeps the deny-all app), and the focus refresh (§6.6e, where the app stays during the second ask, a context from it is applied, and another failure keeps the context and logs `session context refresh failed`). A refusal that answers either of the last two after an expiry unmounts the app without its screen: "Session ended" stays on top. A transient failure on the first load's second ask starts the retries (step 11b before render for a trial with a slug, else step 18). The dialog has no retry after that. Every refusal screen goes through `refuse()`: `stopped()` (sign-out, expiry or `refused`) then ends the boot steps and the hourly banner refresh, and an expiry leaves the screen in place (§6.4).

Each dialog offers Sign out and Switch workspace. Switch workspace uses the SDK's `switchWorkspace(w, { prompt: 'login' })` (SDK alpha.7; local logout, then login on the credentials page), as the wrong-workspace dialog does, so a live SSO session, possibly someone else's on a shared device, cannot bring the user straight back. A6 has no Upgrade or Reactivate action: P-35 refused, so the shell does not know the user's roles, and no upgrade URL exists yet (IAM spec §6 A6: "Proposed"). The shell remembers nothing for a refused workspace; a workspace the SDK's `chooseWorkspace` cached before login stays cached, so a reload restores into the same screen. The screens are dialogs over the page, not the spec's `/workspace-unavailable` route.

---

## 8. Security

| Topic | Rule | Where it holds |
|---|---|---|
| Client | Public OAuth client, PKCE S256, no secret | Runtime config has `clientId` only |
| Tokens | Memory only; never storage, `BroadcastChannel`, logs | SDK `/auth`; e2e asserts storage holds none |
| Identity headers | Never sent from the browser | SDK `/http`; `no-identity-headers` lint rule |
| API origin | Token to the page origin only, route templates | SDK `ApiClient`; `iam.ts` uses `/v1/...` templates |
| Login without a click | Never after logout, device-clock refusal or expiry | `showSignedOut`, `showDeviceClock`, `showSessionEnded`; bootstrap and e2e tests |
| Wrong workspace | App never rendered, workspace not cached | `isWrongWorkspace` before render; for a trial with a slug, P-35's slug, awaited before render (§5 step 11b) |
| Workspace refused by IAM (A6/A8) | App never rendered (a late refusal unmounts it), the shell remembers nothing | `settleRefusal` / `blockedWorkspace` before render (§5 step 11a, §7.1); bootstrap and e2e tests |
| Shared device | App unmounted before "You are signed out" | `idp.subscribe` handler; e2e |
| Remote code | Runs in this origin; manifest-only entries, allowed origins, integrity outside local/dev/test | SDK `/mfe` |
| Script integrity | sha384 on the entry and every lazy chunk | Preset `ChunkIntegrityPlugin`; smoke checks the entry |
| CSP | Bundle is `script-src 'self'` and Trusted Types safe; fonts and styles are same-origin (`font-src 'self'`, `style-src 'self'`); headers come from CloudFront; without CloudFront, from a mounted `/etc/nginx/security.d/csp.conf` | Preset output, `inlineScripts: false`, self-hosted fonts; smoke `live` mode checks headers; the smoke job checks the image sends none by default and the mounted file adds it |
| Sign-out POST | CSP `form-action 'self' <idpOrigin>`: the SDK's global sign-out is a form POST to Keycloak | CloudFront; smoke `live` mode checks `form-action` contains the runtime config's `auth.idpOrigin` |
| Outbound links | Help and legal links open in a new tab with `rel="noopener noreferrer"`; unset links are not rendered | `PageLinks.tsx` |
| Generic errors | The sign-in screen never says which input failed (email, workspace name or URL) | `WORKSPACE_NOT_FOUND` |
| Image | uid 101, digest-pinned bases, registry token as BuildKit secret, no source maps | `Dockerfile`; smoke checks `.map` |

The full STRIDE table is in [ARCHITECTURE.md § Threat model](../../ARCHITECTURE.md#threat-model).

---

## 9. Configuration and storage

### 9.1 `/config/runtime.json`

Validated strictly by the SDK (unknown keys rejected). Schema: SDK LLD §12.1.

| Key | Image default (`public/config/runtime.json`) | Local (`config/runtime.local.json`) |
|---|---|---|
| `environment` | none: each deployment writes its own; the identity takes it (SDK alpha.6), else `__ENVIRONMENT__` | `local` |
| `api` | `/api`, `timeoutMs` 35000, `propagationAllowlist` `[]` | same |
| `telemetry` | `/otel`, `sampleRatio` 0.1, `info`, `sendSessionHeader` | `/otel`, 1, `debug` |
| `auth.idpOrigin` · `clientId` | `https://auth.bcbpsolutions.com` · `tender-web` | `http://localhost:8080` · `app1` |
| `auth.trialRealm` · `paidRealmPrefix` · `workspacePathPrefix` | `trial` · `tenant-` · `/t/` | same |
| `auth.scopes` · `idleTimeoutMs` · `redirectPath` | `["openid"]` · 1800000 · `/auth/callback` | same |
| `remotes` | `killSwitch` `[]`, 10000 ms, `retries` 2, `allowedOrigins` `[]` | `retries` 1, `allowedOrigins` `["http://localhost:5002", "http://localhost:5003", "http://localhost:5004", "http://localhost:5005"]` |
| `i18n` · `appUpdate` | `en` · 300000 ms | same |
| `flags` | `{}` (platform flags; tenant flags come from P-35) | same |

### 9.2 Build-time constants

`PLATFORM_ENVIRONMENT` → `__ENVIRONMENT__` (`local`, `dev`, `test`, `staging`, `prod`); `BUILD_VERSION` → `__BUILD_VERSION__` and `/version.json`; `SOURCE_DATE_EPOCH`. `NODE_AUTH_TOKEN` is install-time only (BuildKit secret `npm_token` in the image).

### 9.3 Browser storage

| Key | Store | Written by |
|---|---|---|
| `@bcbp-solutions-fzc-llc/frontend-sdk:*` (workspace cache, session id, last activity, last user, signed-out mark) | `localStorage` | SDK. No tokens |
| `@bcbp-solutions-fzc-llc/frontend-sdk:storage:<namespace>:<appId>:<key>` | `localStorage` | Remotes through `storage(appId)`; cleared on sign-out. Values under the pre-alpha.4 keys are not read |
| `bcbp.rememberEmail`, `bcbp.loginEmail` | `localStorage` | `infrastructure/storage/rememberedEmail.ts` (the domain's `RememberedEmailRepository`), only when "Remember Email" is checked, and only an email or a bare workspace name, never a URL (a pasted link may carry a token or code; `isRememberableIdentifier`); with the box checked, a value that cannot be remembered clears both keys, as unchecked does (a kept email would become the next person's `login_hint` on a shared device); every access in `try`. The one file exempt from `no-raw-storage` (`eslint.config.js`) |
| `…:storage:<namespace>:shell:upgradeWelcomeSeen` | `localStorage` | `infrastructure/storage/upgradeWelcome.ts` through the SDK's `storage('shell')`: the upgrade welcome (A5) was seen; cleared on sign-out and workspace switch |

---

## 10. Hosting

### 10.1 nginx (`nginx/default.conf`, port 8080, uid 101)

| Location | Behaviour |
|---|---|
| server | `server_tokens off`; gzip (css, js, json, svg, text, html) with `Vary`; on every response (`add_header_inherit merge`): `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy` |
| `= /healthz` | `200 ok`, no access log |
| `= /config/runtime.json`, `= /remotes/manifest.json`, `= /version.json` | `no-cache`, 404 when absent |
| `= /index.html` | `no-cache` |
| `^~ /assets/` | `public, max-age=31536000, immutable`; 404 when absent |
| `~ /\.` (dotfiles) | 404 |
| `~ ^/(api\|otel\|csp-report\|config\|remotes\|assets)(/\|$)` | 404 when absent; never `index.html` |
| `~ \.[^/]*$` (any path with an extension) | `no-cache`; 404 when absent |
| `/` | `no-cache`; `try_files $uri /index.html` |

This is the platform's SPA rule (`platform-reactcommon` `examples/cloudfront/spa-rewrite.js`): only extension-less paths are app routes. nginx sets no CSP or HSTS: CloudFront does, and a second CSP here would be enforced alongside it. `include /etc/nginx/security.d/*.conf` (empty in the image) is for an environment without CloudFront, which mounts `nginx/security.d/csp.conf.example` and `hsts.conf.example` there: every environment until CloudFront is available (next month; [hosting-without-cloudfront.md](../hosting-without-cloudfront.md)).

### 10.2 Image

Builder `node:26-bookworm@sha256:…`: `npm ci` with the `npm_token` secret, `npm run build`, delete `*.map`. Runtime `nginxinc/nginx-unprivileged:1.31-alpine@sha256:…`, `apk upgrade`, `dist/` as uid 101. Ships `public/config/runtime.json` and `{}` as the manifest; an environment serves its own over those paths (CloudFront or a mount). Until CloudFront is available, environments follow [hosting-without-cloudfront.md](../hosting-without-cloudfront.md): path routing at the ingress, and the CSP and HSTS mounted under `/etc/nginx/security.d/`.

### 10.3 Dev server (`config/dev-platform.mjs`)

| Path | Answer |
|---|---|
| `GET /config/runtime.json`, `/remotes/manifest.json` | `config/*.local.json`, `no-cache` |
| `POST /otel/*` | `204` |
| `GET /api/v1/public/tenants/resolve` | Any non-empty identifier → `DEV_REALM` (default `tenant-bcbp`), `dedicated` |
| `GET /api/v1/me/session-context` | 401 without a bearer; else slug from the realm, roles `DEV_ROLES` (default `member,tenant_owner`); `read_only: true` when `DEV_TENANT_STATUS=cancelled` |
| `GET /api/v1/tenants/local-tenant`, `…/seat-usage` | P-1 `Local workspace`, `status` = `DEV_TENANT_STATUS` (default `active`; `trial` adds `trial_ends_at` in 14 days, `cancelled` adds `read_only_until` in 30); P-27 3 of 10 seats |
| other `/api/*` | 404 problem, or proxied to `DEV_API_URL` (503 problem when unreachable) |

None of it reaches the bundle or the image.

---

## 11. Observability

Identity: `service.name` `web-shell`, domain `portal`, environment from `runtime.json` `environment`, else the build-time `__ENVIRONMENT__`, version `__BUILD_VERSION__`. Telemetry goes to same-origin `/otel` and is consent-gated. v1 grants `essential` only (decision: no analytics consent manager), so only `error` and essential `warn` logs leave the page.

| Event | Level | When |
|---|---|---|
| `session context unavailable` | `warn` | P-35 failed (§5 step 11), and each failed retry (`attempt`) |
| `session context refresh failed` | `warn` | The focus refresh's P-35 failed, or a membership refusal's second ask failed otherwise (§6.6e); the page keeps its context |
| `workspace status unavailable` | `warn` | P-1 or P-27 failed (§6.6c; `what`: `tenant` or `seats`; no `what` when the load itself throws). Not logged for a request a sign-out aborted |
| `the app could not start` | `error` | Start-up threw after `initializeCore` (§5 step 3). Alert and diagnosis: [runbook](../runbook-startup-failure.md) |
| `manifest load failed` | `error` | `loadManifest` rejected (§5 step 15) |
| `the app could not start` | `console.error` only | Fatal start-up error (telemetry may not exist yet) |

Everything else (API spans, remote load logs and metrics, web vitals, global errors) is emitted by the SDK. Metrics follow the Enterprise Platform Observability Standard ([observability.md](../observability.md)): the shell creates none of its own today; the SDK injects `domain` `portal`, `service` `web-shell` and `environment`; Tier 1 `platform_web_*` is SDK-bound and pending ratification; a shell metric would be Tier 3 `portal_web_shell_*`, checked in CI by `metrics-check`. Route grouping: `useRouteTemplate('/t/:slug/dashboard')`, `('/t/:slug/tenders')`, `('/t/:slug/drafting')` and `('/t/:slug/workflows')` (each remote's pages register finer templates, such as `/t/:slug/tenders/:tenderId/risk`).

---

## 12. Testing

Vitest 5, happy-dom at `http://localhost:5001/`, Testing Library. `vitest.config.ts` defines the two build constants and **inlines the SDK** (`server.deps.inline`) so `vi.resetModules()` gives each simulated page load a fresh SDK. `test/setup.ts` stubs `fetch` and `location.assign/replace` and loads the `shell` catalogue (as the bootstrap does) for DOM tests and skips its DOM setup in `@vitest-environment node` files. Coverage of `src/**/*.{ts,tsx}` is gated at 95% on all four metrics (`.github/scripts/coverage-gate.mjs`); today it is 100%.

| Layer | Path | Real SDK | What it locks |
|---|---|---|---|
| Unit | `test/unit/` | partly (`createTestPlatform`, `mockApi`, `roleMapAuthorizer`) | P-1/P-27 mappings and ports, which banner shows to whom, the read-only date, the A5 window and seen flag (`workspace-status.test.ts`); the session-context retry and store, the P-35 refusal → `WorkspaceBlock` mapping and its one re-ask; the layer rules firing (`layer-rules.test.ts`); the `shell` catalogue, its fallback for a default locale without one, and no hard-coded user-facing text in presentation (`shell-text.test.ts`, on the TypeScript syntax tree); PUB-1/P-35 mappings against the SDK's contract cases, the entry point, remember-email, the role map, the screen host, `BrandLogo`, the dev middleware (node env, real HTTP) |
| Integration | `test/integration/` | no (`vi.mock` recording fakes) | The bootstrap's exact order and every branch (the focus refresh: once a minute, applied when changed, nothing when the same, a failure keeping the context, a refusal or another workspace's context replacing the app, a deny-all page recovering, nothing after an expiry or a sign-out; A6/A8, a trial whose P-35 slug differs or never loads never render the app; `login-required` without a workspace), the login page and carousel (only current and next photo fetched), session screens (alerts, dialog focus), `App` routes, the banners, the missing-context and read-only notices (with the grace date) (no action; one shared bottom stack, whose height is published as `--shell-notices-height`), axe-core over every shell screen (`accessibility.test.tsx`, colour contrast excluded) |
| End to end | `test/e2e/shell.test.tsx` | yes | Email → PUB-1 → PKCE → callback → `dashboard` under `/t/acme/dashboard`; tokens never stored; deep link; a deep link to `/t/acme/tenders/…`, `/drafting/…` or `/workflows/…` loading only that remote's entry; role map reaching the remote; a role given elsewhere reaching the remote on focus after a minute without a reload; deny-all; a trial deep link (`/t/beta`) whose session's P-35 slug is another tenant's showing the wrong-workspace screen with nothing injected; a trial whose P-35 answers 503 every time showing "We couldn't load your workspace" with nothing injected; a silent restore of a trial PUB-1 no longer knows showing the email screen after one PUB-1 call, never another saved workspace; P-35 refusals showing A6/A8 with no remote load and Sign out; trial, seats and read-only-date banners from P-1/P-27, no P-27 for a member; A5 once; failing remote and Try again; global sign-out (form POST to Keycloak) with no silent sign-in after; device clock; unknown email; a 503 outage retried in the background; the environment from `runtime.json`; Forgot password → the realm's reset page; a workspace name and pasted URLs (one with `@`) reaching PUB-1 as the slug without `login_hint`; a URL with no workspace asking PUB-1 nothing; P-35 `read_only` showing the read-only notice (none for a writable workspace); a WAF challenge page in place of PUB-1 keeps the saved trial workspace; a reload of a paid workspace Keycloak still serves asks PUB-1 nothing; after a revert deletes the paid realm a reload restores into the trial realm with one PUB-1 call |
| Smoke | `test/smoke/deployment.test.ts` | yes (config and manifest validation) | Against `SMOKE_BASE_URL`: the SPA rule, Cache-Control, entry integrity, no maps, 404s, `/healthz`; `image` mode adds nginx's baseline headers, gzip, no version, dotfile 404s; `live` mode adds CloudFront's CSP (including `form-action` allowing the IdP), HSTS and nosniff, and that IAM P-35 is routed (`GET /api/v1/me/session-context` without a token is 401, never 404: a trial workspace with a slug never opens without it) |
| Browser | `test/browser/shell.spec.ts` (Playwright) | the production build | Chromium, Firefox, WebKit over HTTPS with the production CSP and Trusted Types (`server.ts`), a fake Keycloak on a second origin, a remote stub on the shared SDK: fonts and hashed images with no third-party request, PKCE sign-in and the remote with integrity, `navigate()` without a reload, the sign-out form POST under `form-action`, the start-up failure at `/otel`, axe colour contrast on the login page (the logotype is exempt, WCAG 1.4.3), the read-only notice and a workspace banner under the production CSP with its contrast ratio measured (≥ 4.5), and at a 300 px-high window the remote's content ending above the sticky notice stack, which sits at the window's bottom, and `--shell-notices-height` equal to the stack's height; a reload loading the saved paid realm's discovery document under `connect-src` (SDK alpha.9). Any CSP report fails the test |
| Dashboard contract | `test/browser/dashboard.spec.ts` (`REMOTE_DIST`) | the production build | A real mfe-dashboard build served as `dashboard` with its own `remote-manifest-entry.json` integrity: it loads with its CSS and no CSP violation, every image it shows loads, the role map reaches it, its `NavLink` stays in the page, its Logout POSTs to Keycloak through the shell. A wrong integrity fails it |

E2E seams (`test/fixtures/`): `FakeKeycloak` (authorize via `approve()`, token endpoint with PKCE check and refresh rotation, OIDC discovery per realm (`discoveries`; a realm in `deleted` fails like Keycloak's 404 without CORS)), `FakeNetwork` (route table on the page origin; `/otel` → 204), `FakeBroadcastChannel`. Among the shell and SDK code only the remote's entry `<script>` is stubbed (browser seams are recorded: `location.assign`/`replace`, form `submit`, `createRoot`): it defines `window.__platform_mfe_dashboard` exposing a dashboard built on SDK hooks (or `__platform_mfe_tenders`, `__platform_mfe_drafting`, `__platform_mfe_workflows` for those entries). A page load clears `globalThis[Symbol.for('@bcbp-solutions-fzc-llc/frontend-sdk')]`, resets modules, and imports the bootstrap again; storage is kept.

---

## 13. CI/CD

| Workflow | Gate |
|---|---|
| `ci.yml` → `validate-test.yml` | `npm ci`, `npm run test:coverage`, coverage gate 95%, `npm run build`, `npm run budget` (entry 12 KB, JS+CSS 300 KB, largest 85 KB gzip; images 2.7 MB) |
| `ci.yml` → `validate-quality.yml` | ESLint `--max-warnings 0`, `npm run arch-lint`, `npm run metrics-check`, `npm run typecheck`, workflow hygiene, LF, digest pins, `.dockerignore`, `npm audit --omit=dev --audit-level=high` |
| `ci.yml` `build-image` | Hadolint, Buildx cache build `web-shell-ci-test` |
| `ci.yml` `trivy` | Unfixed CRITICAL/HIGH/UNKNOWN fail; SBOM artifact |
| `ci.yml` `smoke` | `smoke-tests.sh`: ≤ 200 MB, startup gate, then `npm run test-smoke` (`SMOKE_MODE=image`) against the container, then the per-environment CSP and HSTS (none by default; added by mounted `security.d/csp.conf` and `hsts.conf`) |
| `ci.yml` `dashboard-contract` | Builds mfe-dashboard (`vars.DASHBOARD_REF`, default `main`; private, checked out with `CI_REPO_READ_TOKEN`, which needs read access to it), then `REMOTE_DIST=… npm run test-contract`. Informational: does not gate `push` |
| `ci.yml` `browser` | Playwright browsers, `npm run build`, `npm run test-browser` (Chromium, Firefox, WebKit). Gates `push` |
| `ci.yml` `push` | `main`/`master`: GHCR branch and `sha-<short>` tags, Cosign keyless sign |
| `changelog-check.yml` | `CHANGELOG.md` required when `src/`, `package*.json`, `Dockerfile`, `nginx/`, `rsbuild.config.ts`, `config/**`, `public/config/**` or `index.html` change |
| `release.yml` | `vX.Y.Z[-*]`: re-validate, changelog section, dist tarball (`BUILD_VERSION` without the `v`), source maps as a workflow artifact, image pushed by digest, scan, SBOM, SLSA (BuildKit attestation via `imagetools`), Cosign, then the semver tags and `latest` on the signed digest (`tag-signed-image.sh`), GitHub Release |

Every `npm ci` reads `@bcbp-solutions-fzc-llc/*` from GitHub Packages with `GITHUB_TOKEN` (`packages: read`); each package grants this repository read under "Manage Actions access".

---

## 14. Compatibility

| Peer | Rule |
|---|---|
| SDK | Pinned exactly; the shell shares it as `1.0.0-alpha.9` under the preset's range `^1.0.0-0`. It loads remotes built on alpha.4 to alpha.9 (each requires `^<its SDK>`); the contract suite passes 12/12 with the alpha.9 shell against mfe-dashboard `v0.4.0` (alpha.6) |
| Remotes | A remote built with the preset requires `^<its SDK version>`: it must not be newer than the shell's. **Upgrade the shell first**, then remotes. A release that changes the shell–remote contract is the exception (alpha.4 changed the container global): the shell and every remote deploy together. `npm run test-contract` checks a pairing |
| React | Strict singleton `^19.0.0` from the preset; the shell ships 19.3 |
| `mfe-dashboard` (remote `dashboard`) | Rsbuild remote with `pluginPlatform({ role: 'remote', name: 'dashboard' })`, async-only chunk splitting, reads the user and sign-out through SDK hooks, takes no props. Released pairs: web-shell `v0.4.0` (current) and its rollback `v0.3.0` (both alpha.6) + mfe-dashboard `v0.3.0` (remote `dashboard`, alpha.5); the superseded web-shell `v0.2.0` with the same dashboard; mfe-dashboard `v0.4.0` (alpha.6) needs web-shell `v0.3.0` or later; the alpha.9 shell on `main` passes the contract suite against it (12/12 in three engines, 2026-11-25); and the superseded web-shell `v0.1.0` + mfe-dashboard `v0.2.0` (remote `app2`). `v0.3.0` passes the contract suite (`dashboard.spec.ts`, 12/12 in three engines) against mfe-dashboard `v0.3.0`. An alpha.3 build does not load in this shell |
| `mfe-tender` (remote `tenders`) | Rsbuild remote with `pluginPlatform({ role: 'remote', name: 'tenders' })` on SDK alpha.6 (peer `^1.0.0-alpha.6`), so it needs a shell on alpha.6 with the `/tenders/*` route (`v0.4.0` or later). Not released yet; no contract run (`npm run test-contract` serves only the dashboard) (§15 #18) |
| Keycloak | Each workspace realm registers `{origin}/auth/callback` and the origin as post-logout redirect for the client |

Details: [VERSIONING.md](../../VERSIONING.md).

---

## 15. Open items

Numbers are stable; closed items are removed (2, 4; 6 when IAM confirmed PUB-1 and P-35 behind `/api` in every environment, 2026-11-10; 14 when `v0.3.0` was released).

| # | Item | Owner |
|---|---|---|
| 1 | Official Privacy, Terms, Trust & Security and Help URLs: set them in `src/shared/constants/links.ts` (hidden until then; none exists on bcbpsolutions.com) | product / legal |
| 3 | Consent is essential only in v1 (decision; the SDK's default). A consent manager would be installed with `setConsentProvider` in the bootstrap | product |
| 5 | Deploy web-shell `0.4.0` with mfe-dashboard `0.3.0` (manifest key `dashboard`, `/remotes/dashboard/0.3.0/`); rollback web-shell `0.3.0` with the same dashboard (`0.1.0` + `0.2.0` used `app2`). `tenders` needs mfe-tender's release and manifest entry (§15 #18); `drafting` and `workflows` need their releases and manifest entries (§15 #22). mfe-dashboard `0.4.0` (alpha.6) needs web-shell `0.3.0` or later. After a pair is deployed, environments may set `auth.signInUrl` (older SDKs refuse the key), then `SMOKE_MODE=live` | operators |
| 7 | No cluster deploy; each environment serves its own runtime config and manifest (with the remote's integrity) and registers its redirect URIs in each realm | operators |
| 8 | Tender permissions in the role map are provisional | Tender Service |
| 9 | No CloudFront until next month: environments route `/api`, `/otel`, `/csp-report`, `/remotes/dashboard/` (and `/remotes/tenders/`, `/remotes/drafting/`, `/remotes/workflows/`, §15 #18 and #22) at the ingress and mount the CSP (IdP in `form-action`) and HSTS ([hosting-without-cloudfront.md](../hosting-without-cloudfront.md)); remove the mounts when CloudFront arrives | operators |
| 10 | Keycloak realms need SMTP and "Forgot password" enabled for the reset flow (§6.1a); unconfirmed | Keycloak ops |
| 11 | The `WebShellStartupFailures` alert ([runbook](../runbook-startup-failure.md)) is an example; it must be deployed to the Loki ruler | operators |
| 12 | One build for every environment (SDK alpha.6): each deployed `runtime.json` must name its `environment` (checked by `SMOKE_MODE=live ENVIRONMENT=<target> npm run test-smoke`); then the shell drops `__ENVIRONMENT__` / `PLATFORM_ENVIRONMENT`, and a file without the key stops at the unavailable page | operators, then this repo |
| 13 | Dependabot's npm job needs the Dependabot secret `PACKAGES_READ_TOKEN` (read:packages; an organisation secret shared with mfe-dashboard) to read GitHub Packages; until it exists every npm update run fails with 401 | org admin |
| 15 | The constitution exceptions in ADRs 0002, 0005–0008 (no TanStack Query or Zustand, the SDK's i18n, shell-local UI, the nginx image, tests in `test/`) await Architecture Review | architecture review |
| 16 | Copies of unpublished platform code wait for SDK exports (§1.2): `isTransient` (a test fails if it diverges from the `ApiClient`), `retrySessionContext`, `createStore`, `ShellRoot`, the realm URL in `passwordReset.ts` | platform-reactcommon |
| 17 | Adopt `platform-design-system` when the platform publishes it (ADR 0006; constitution roadmap step 7) | platform |
| 18 | `tenders` (mfe-tender) has a route (web-shell `v0.4.0`) but no release: when mfe-tender is tagged, environments add its manifest entry (`ownerDomain: tender_management`) and route `/remotes/tenders/`; `npm run test-contract` serves only the dashboard, so no browser run loads the real `remoteEntry.js` here yet. Because the remote runs its own router, a shell-router navigation into `/tenders/…` (the SDK's `navigate` through `shellNavigator`, e.g. from the dashboard while tenders is mounted) changes the URL without re-rendering the remote's routes; the fix is a shared react-router-dom singleton in the preset (platform-reactcommon) or SDK `navigate`-only routing in mfe-tender. Theme and CSS ownership when embedded is open (mfe-tender LLD §15 #7) | mfe-tender, operators, this repo |
| 19 | A6 has no Upgrade or Reactivate action (needs an upgrade URL and the user's role without P-35); a suspended member sees "You don't have access" until the gateway sending `DENY_MEMBER_SUSPENDED` (iam-authz-enrichment #44) is deployed; the spec's `/workspace-unavailable` route is not implemented (the screens are dialogs); a foreign trial session that P-35 refuses with a workspace state shows that state's screen, not the wrong-workspace one (the refusal carries no slug); a trial sign-in with neither a slug nor a `tenantIdHint` (if IAM drops `tenant_id`, OQ-10) is never checked after sign-in, so every sign-in to it asks for credentials (`prompt: 'login'`: the anonymous sign-in, "Session ended" and a remote's switch) | IAM, product |
| 20 | The banners have no actions (Upgrade for the owner, update the card): the billing screens and their URLs do not exist yet. A5 shows again after a sign-out within its 7 days (SDK storage is cleared on sign-out). P-1 and P-27 have no SDK contract cases | product, platform |
| 21 | mfe-dashboard's fixed sidebar (`fixed inset-y-0 start-0 z-40`, `src/app/layouts/AppShellLayout.tsx:178`) sits under the shell's bottom notice stack while a banner or notice shows. The shell publishes the stack's height as `--shell-notices-height` on `<html>` (§4.5); the dashboard should end its fixed elements above it (`bottom: var(--shell-notices-height, 0px)`). Additive: nothing breaks without it | mfe-dashboard |
| 22 | `drafting` (mfe-drafting) and `workflows` (mfe-workflow-designer) have routes but no release (neither repository has a tag; both build on SDK alpha.6 on their working branches). When each is tagged, environments add its manifest entry (`ownerDomain: portal`, the workflow designer's README says so; mfe-drafting does not say, so `portal` is provisional) and route `/remotes/drafting/` or `/remotes/workflows/`. `npm run test-contract` serves only the dashboard. The shell-router navigation limit of #18 applies to both | mfe-drafting, mfe-workflow-designer, operators |
| 25 | A remote cannot ask the shell to reload P-35 (mfe-admin after a self role change, or on `403 DENY_ROLE_INSUFFICIENT`): that needs `useRefreshSessionContext()` and a `refreshContext` shell field in the SDK (web-shell's handoff `platform-reactcommon-session-context-refresh.md`, kept outside this repository with the other cross-team handoffs). The banners (P-1, P-27) follow the first context only: a role or plan change applied by the focus refresh does not load them again. When it ships, web-shell implements `refreshContext` with the focus refresh's rules (§6.6e) and adds it to §4.4. Until then a role change made in this tab shows on the next focus after a minute, or a reload | platform-reactcommon, this repo |
