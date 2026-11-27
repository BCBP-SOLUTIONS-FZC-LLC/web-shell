# web-shell Handoff: Operator Console Support

| Field | Value |
|---|---|
| Repo | `xpertpms/web-shell` (v0.4.0, SDK `1.0.0-alpha.6`) |
| Purpose | What the shell team must change so the platform operator console (spec screens O1–O4, remote `mfe-operator`) runs in the same shell codebase, signed in through the platform realm |
| Date | 26 November 2026 |
| Companions | [reactcommon-operator-handoff.md](reactcommon-operator-handoff.md) (SDK changes the shell depends on), [iam-operator-handoff.md](iam-operator-handoff.md) (answers the shell depends on), [web-shell-iam-handoff.md](web-shell-iam-handoff.md) (the tenant-side IAM work) |
| Built from | IAM spec §1, §6 (O1–O4), §11, §13; web-shell `README`, LLD, `App.tsx`, `permissions.ts`, `iam.ts`; SDK `auth/types.ts`, `auth/workspace.ts`, `auth/oidc.ts`, `config/schema.ts` |
| Not verified | `src/app/bootstrap/bootstrap.tsx`, `ShellRoot.tsx`, `sessionScreens.tsx`, the login page internals; the SDK's `/react` provider and `/authz` subject code. File names below point where the change most likely lands; confirm when you open them |

---

## 1. Why this is more than a role check

Operators are vendor staff. Per the spec they sign in through the **platform realm** with the `platform_operator` role, and the gateway accepts them only on `/api/v1/operator/*`. They are not members of any tenant.

web-shell today assumes every user belongs to one tenant:

- It resolves a workspace slug (PUB-1) and signs in to `tenant-<slug>` or the shared `trial` realm.
- After sign-in it loads P-35 (`/me/session-context`) and moves the URL to `/t/<slug>/…`.
- `App.tsx` shows `ContextUnavailable` whenever there is no session context.
- The role map holds only IAM's four tenant roles.

An operator has no tenant, so P-35 answers `404 MEMBER_NOT_FOUND` for them and the shell would render deny-all.

## 2. Decision for review: same codebase, separate deployment

| Option | Description | Assessment |
|---|---|---|
| A. Same origin as tenants | `/operator/*` in the tenant shell | The manifest is per environment, not per user, so every tenant browser can see the `operator` remote's entry URL. The code is fetched only when the route opens, and the gateway still blocks non-operators, but it widens the exposure and mixes tenant and operator sessions on one origin |
| **B. Same codebase, second deployment (recommended)** | The same shell image at a second origin (for example `operator.bcbpsolutions.com`) with its own `runtime.json` (operator realm configured) and a manifest listing only `operator` | One codebase to maintain, no operator entry in tenant manifests, separate origin for storage and cookies. Needs one more ingress route and DNS entry |
| C. Separate app | A different repo with its own shell | Duplicates the bootstrap, session screens and CSP work |

The rest of this document works for A or B. Where it differs, it says so.

## 3. Required changes

| # | Change | Likely file | Depends on |
|---|---|---|---|
| 1 | **Operator mode switch.** Decide at start-up whether the page is an operator page (B: `auth.operatorRealm` is set in `runtime.json` and the deployment is the operator one; A: path starts with `/operator`). In operator mode: skip the PUB-1 workspace lookup, sign in to the operator realm, skip P-35, never call `rememberWorkspace`, never move the URL to `/t/<slug>/` | `app/bootstrap/bootstrap.tsx` | SDK #2 (operator workspace) |
| 2 | **No `ContextUnavailable` for operators.** The notice must not appear when there is no session context by design | `app/routes/App.tsx` | SDK #4 |
| 3 | **Routes.** `/operator/*` renders `<RemoteBoundary remote="operator" module="./App" />` with no props and `useRouteTemplate('/operator')`. In deployment B the operator deployment has no `/t/:slug` routes at all, and the tenant deployment has no `/operator` route | `app/routes/App.tsx` | n/a |
| 4 | **Operator sign-in page.** No email field and no workspace lookup: a single "Sign in as platform operator" button to the operator realm. Text in `shared/i18n/en.json`; no hard-coded words | `presentation/pages/login/`, `shared/i18n` | SDK #2 |
| 5 | **Role map.** Add an operator permission group (for example `manage:platform`) kept **apart** from `IAM_ROLES`. The map's rule says its keys are IAM's closed tenant role set, so this needs an explicit exception in `permissions.ts` and a test | `domain/rules/permissions.ts` | IAM #4 (how the role is learned) |
| 6 | **Session screens.** The signed-out, session-ended, wrong-workspace and workspace-not-found screens assume a tenant. Operator mode needs signed-out and session-ended only; "wrong workspace" and "not found" must never render | `presentation/features/session-screens/`, `app/layouts/sessionScreens.tsx` | n/a |
| 7 | **Config.** Add `auth.operatorRealm` (and `auth.operatorClientId` if IAM says the client differs) to the shell's runtime config and to `config/runtime.local.json` for development. Older SDKs refuse unknown keys, so this ships only with the new SDK pin | `public/config/runtime.json`, `config/` | SDK #1 |
| 8 | **Manifest entry** for `operator`: `ownerDomain: iam`, `integrity` (sha384). Deployment A: in the shared manifest. Deployment B: in the operator deployment's manifest only | environment manifest, `config/remotes.local.json` | `mfe-operator` build |
| 9 | **CSP and nginx.** The existing rule stays: `form-action` must allow the IdP origin (global sign-out is a form POST). Confirm the operator origin's CSP, ingress routes (`/api`, `/otel`, `/csp-report`, `/remotes/operator/`) and that the platform realm's redirect URIs include the operator origin | `nginx/`, `docs/hosting-without-cloudfront.md` | IAM #3 |
| 10 | **Telemetry.** Metrics for the shell's own screens are unchanged. The remote's metrics use `ownerDomain: iam` | n/a | n/a |
| 11 | **Tests.** Integration test for the new bootstrap branch (required by the repo rules); e2e for operator sign-in, no P-35 call, no `/t/` move, deny for a non-operator realm; browser contract spec for the `operator` remote (the suite refuses any build not named `dashboard` today) | `test/integration`, `test/e2e`, `test/browser` | all above |
| 12 | **Docs.** README, ARCHITECTURE, LLD (§2, §4, §6, §15) and CHANGELOG change together; update the `.dependency-cruiser.cjs` component map if a new folder is added | docs | n/a |

## 4. Repo rules that constrain this work

- **Never reimplement SDK behaviour.** Operator sign-in, token handling and realm choice belong in the SDK. If the SDK cannot do it, change the SDK (see the companion document); do not copy logic into the shell (`no-sdk-duplicates.test.ts`).
- **SDK upgrade order.** All three platform packages move together, exact pins, shell before remotes.
- **No dead links, no hard-coded words, CSP-safe** apply to the new page.
- **Presentation never imports infrastructure or the SDK** (the session screens may import `/auth` types only).
- **Coverage gate 95%** and arch-lint stay green.

## 5. Suggested order

1. Agree option A or B (§2) and get IAM's answers (IAM document #1–#5).
2. SDK ships the operator workspace support (companion document).
3. Bump the shell's SDK pin, then do #7, #1, #2, #4, #6.
4. Add #3, #5, #8 when `mfe-operator` has a first build.
5. #9 and #11 before any deployment.

## 6. Acceptance criteria

- An operator signing in to the platform realm lands on `/operator/…` with no PUB-1 call, no P-35 call and no `/t/` in the URL.
- A tenant user cannot reach the operator remote's screens even by typing the URL (the gateway returns `403`; the UI shows no operator screens).
- A signed-out or expired operator session shows the existing signed-out and session-ended screens and never signs in without a click.
- No tenant deployment lists the `operator` remote when option B is chosen.
- `npm run test:ci`, `arch-lint`, `lint`, `typecheck` and the browser suite pass.

## 7. Risks

- The operator realm and the gateway provider are not live (HLD §17.2, OP-G1…G6). Develop against mocks; do not promise a release date.
- Option A widens what tenants can see. Get a security decision before choosing it.
- Operator mode adds a second path through the bootstrap. Keep it small and covered by tests, so tenant sign-in behaviour does not change.

## 8. Open items

| # | Item | Owner |
|---|---|---|
| 1 | Option A or B | Frontend platform, security |
| 2 | Operator deployment hostname, DNS, ingress | Platform deployment |
| 3 | Whether the operator client ID differs from `tender-web` | IAM |
| 4 | Whether operator MFA and step-up use the same `auth_time` rule as tenants | IAM |
