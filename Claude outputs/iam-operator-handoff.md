# IAM Handoff: What the Operator Console Needs

| Field | Value |
|---|---|
| Audience | IAM team (Org & Membership, Catalog / Admin Config, Realm Provisioner, AuthZ Enrichment, Keycloak) |
| Purpose | The answers and routes the frontend needs from IAM before the platform operator console (spec screens O1–O4, remote `mfe-operator`) can be built and signed in |
| Date | 26 November 2026 |
| Companions | [web-shell-operator-handoff.md](web-shell-operator-handoff.md), [reactcommon-operator-handoff.md](reactcommon-operator-handoff.md) |
| Built from | `iam-product-screen-spec.md` v0.1 (§1, §6 O1–O4, §11, §13, §14); the SDK's current realm and client handling. Frontend-side findings only: nothing in the IAM repos was re-read for this note, so correct any statement below that the services contradict |
| Format | Questions are numbered `OP-FE-Q*` (new series, parallel to the `IAM-FE-Q*` numbers in spec §14) |

---

## 1. What the spec already says about operators

| Item | Source |
|---|---|
| Operators are vendor staff using a separate console, signed in through the **platform realm** with the `platform_operator` role | Spec §1, §6 O |
| Operator routes are accepted only under `/api/v1/operator/*` | Spec §6 O |
| The console is **not usable yet**: the platform realm and gateway provider are open go-live items (HLD §17.2, OP-G1…G6) | Spec §6 O, §13 phase 3 |
| Screens and routes | O1 `CAT-1`, `CAT-2`, `CAT-6` (departments); O2 `CAT-4`, `CAT-5`, `CAT-5a` (plans, trial profiles); O3 `O-4` (feature-flag overrides); O4 `O-7` (reassign owner) |
| Internal only, no UI until IAM exposes operator routes | Suspension, realm operations, region-portability audit, service-account keys (RP-13, RP-14, Token Service) |

## 2. Why the frontend is asking

web-shell signs a user in to a **tenant** realm (`tenant-<slug>` or the shared `trial` realm), then loads P-35 for roles and plan. An operator has no tenant, so:

- there is no slug for the workspace lookup (PUB-1);
- P-35 would answer `404 MEMBER_NOT_FOUND`;
- the SDK has one `clientId` (`tender-web`) for all realms and no operator concept.

The frontend plan is to run the operator console in the same shell codebase (ideally as a second deployment on its own origin) with SDK support for an operator realm. That plan is only safe if IAM confirms the points below.

## 3. Questions to answer (blocking)

| # | Question | Why the frontend needs it | Blocks |
|---|---|---|---|
| **OP-FE-Q1** | What is the **platform realm's name** (for example `platform`), and is it a single realm for all operators? | Goes into runtime config as `auth.operatorRealm`. The SDK will reject a name that looks like a tenant realm (`tenant-…`) or the trial realm | SDK config, shell |
| **OP-FE-Q2** | Which **OIDC client ID** do operators use? Is it `tender-web` (as for tenants) or a separate one? Which **redirect URIs** and **post-logout URIs** are registered, and for which origins? | The shell signs in with Auth Code + PKCE. The redirect must match the deployment's origin exactly. If the client differs, the SDK needs an `operatorClientId` | SDK config, shell, deployment |
| **OP-FE-Q3** | How should the UI know a signed-in user is an operator? **(a)** the realm alone (anyone who can sign in to the platform realm is an operator), **(b)** a realm-role claim in the token (which claim name and shape?), or **(c)** an operator session-context route | The tenant rule is "roles are not in the token; read P-35". Operators have no P-35. (a) is simplest and needs no token parsing; (b) means the browser reads a role claim; (c) is a new route. The gateway still authorises every request in all three; this only drives what the UI shows | SDK, shell |
| **OP-FE-Q4** | Is there an **operator equivalent of P-35** (`session-context`) that returns, at minimum, display name, operator role and MFA freshness? If not, is that intended? | Without it the shell skips session context entirely in operator mode. With it the shell can use the same flow as tenants | SDK, shell |
| **OP-FE-Q5** | Is the **gateway provider for `/api/v1/operator/*` live** in dev and staging, and **on which origin** does the browser call it? The shell calls `/api` on its own origin; a separate operator origin needs `/api` routed to the gateway | A second origin needs its own ingress or CloudFront route for `/api`, `/otel`, `/csp-report` and `/remotes/operator/`. Cookies and CORS differ per origin | Deployment, shell |
| **OP-FE-Q6** | **MFA for operators:** is MFA enforced by Keycloak for the platform realm, and does the gateway refuse stale `auth_time` on operator mutations (as `DENY_MFA_STALE` does for tenants)? What is the freshness window? | The UI runs step-up (`prompt=login&max_age`) before sensitive calls and needs a window to compare against. Tenants get `mfa_freshness_seconds` from P-35 | SDK (`useStepUp`), `mfe-operator` |

## 4. Missing routes the screens appear to need

The spec lists the operator routes for departments and plans (CAT-*), flag overrides (O-4) and owner reassignment (O-7). The screens as written need more than that. Please confirm whether these exist, are planned, or the screens should change.

| # | Need | Screen | Why |
|---|---|---|---|
| **OP-FE-Q7** | **List and search tenants** (operator-scope): id, slug, name, plan, status, `ownerless_since` | O3, O4 | O3 must pick a tenant to override flags for. O4 is defined as "tenants with `ownerless_since`": something has to return that list. Tenant-facing P-1 returns one tenant for a tenant token only |
| **OP-FE-Q8** | **Read one tenant's current flag overrides** (a `GET` beside the O-4 `PATCH`) | O3 | O-4 is a full replacement of the allow-listed flags (`sso_enabled`, `custom_branding`, `require_mfa_all_users`, scalars only). The UI must show the current values before replacing them, or it will overwrite unseen ones |
| **OP-FE-Q9** | **List a tenant's active members** (operator-scope: id, display name, roles) | O4 | O-7 takes an active member to promote. P-4 is tenant-facing and needs a tenant token, which an operator does not have. Names come from User Profile, whose `users:batch` is also tenant-scoped |
| **OP-FE-Q10** | **Optimistic locking on operator writes:** do O-4, O-7 and the CAT operator writes use `record_version`? Which field name | All | The tenant rule is a conflict dialog on `409`. The UI needs to know which operator routes carry a version |
| **OP-FE-Q11** | **Audit of operator actions:** are operator writes recorded as audit entries (families `config.*`, `tenant.*`), and can the tenant's Owner see them in E7? | O1–O4, E7 | Operators change tenant flags and owners. The tenant's audit screen should show who did it. The entry's actor type for an operator (`user`? a new type?) must be known so E7 labels it |
| **OP-FE-Q12** | **Departments (CAT-1/2/6):** confirm that delete is refused with `405` (spec says so), that "retire" is `is_active=false`, and what happens in tenants where the department is already active | O1 | Wording of the confirm dialog and the error states |

## 5. What the frontend will do once answered

| IAM answer | Frontend consequence |
|---|---|
| Q1, Q2 | `auth.operatorRealm` and `auth.operatorClientId` in `runtime.json`; redirect URIs registered for the operator origin |
| Q3 (a) | SDK exposes `useIsOperator()` from the realm; no token claim parsing |
| Q3 (b) | SDK exposes the claim on `SessionUser`; shell role map adds a platform permission |
| Q3 (c) / Q4 | Shell uses the operator session-context route instead of skipping it |
| Q5 | Second deployment on its own origin (recommended), or `/operator` on the tenant origin |
| Q6 | `useStepUp` gets an operator window source |
| Q7–Q9 | O3 and O4 screens built as specified; without them the screens are reduced or removed |

## 6. What IAM does not need to do

- The frontend never sends identity headers. The gateway strips and re-injects `x-user-id`, `x-tenant-id` and `x-tenant-roles`.
- The browser will not call Realm Provisioner or Token Service routes (RP-*, internal only). Suspension, realm operations and service-account keys stay out of the console until IAM exposes operator routes for them.
- Every authorisation decision stays in AuthZ Enrichment. UI hints are not enforcement.

## 7. Suggested order

1. Answer Q1, Q2, Q3, Q5 first. They unblock the SDK and shell configuration work.
2. Q7–Q9 next: they decide whether O3 and O4 can be built at all.
3. Q4, Q6, Q10–Q12 before the first release.

## 8. Risks

- The platform realm and the operator gateway provider are not live. The frontend will build against mocks; no release date should be promised from this document.
- If operators and tenants shared one origin, any gap in the gateway's operator-route check would be reachable from tenant browsers. Q5 and the separate-origin recommendation reduce that exposure.
