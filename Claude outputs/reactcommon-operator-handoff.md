# platform-reactcommon Handoff: Operator Workspace Support in the SDK

| Field | Value |
|---|---|
| Repo | `platform-reactcommon` (SDK `@bcbp-solutions-fzc-llc/frontend-sdk` `1.0.0-alpha.6`, `webpack-preset`, `eslint-plugin`) |
| Purpose | The SDK changes web-shell needs so a platform operator can sign in to the platform realm and use the `mfe-operator` remote |
| Date | 26 November 2026 |
| Companions | [web-shell-operator-handoff.md](web-shell-operator-handoff.md), [iam-operator-handoff.md](iam-operator-handoff.md) |
| Built from | `packages/frontend-sdk/src/auth/types.ts`, `auth/workspace.ts`, `auth/oidc.ts`, `config/schema.ts`, `react/hooks.ts`, `authz/roles.ts`; `ARCHITECTURE.md` (bootstrap, remote loading) |
| Not verified | `src/react/provider.tsx`, the `/authz` subject and `denyAll` code, `storage/` (`workspaceNamespace`), the generated contracts, the design doc. Check them before finalising the API below |

---

## 1. Why the SDK has to change

What the code shows today:

| Finding | Where | Effect on an operator login |
|---|---|---|
| `Workspace` is `{ realm, trial, slug? }`, "one login = one tenant" | `auth/types.ts` | An operator is not a tenant |
| `realmMatches` accepts only `trialRealm` or `${paidRealmPrefix}${slug}` | `auth/workspace.ts` | A platform realm never matches |
| `rememberWorkspace` refuses a slug and realm that do not match, and puts `/t/<slug>/` in the URL | `auth/workspace.ts` | Cannot be used for an operator |
| Every cached workspace entry requires a slug; restore works from `slugFromPath` (`/t/<slug>`) or the most recent cached entry | `auth/workspace.ts`, `auth/oidc.ts` | An operator has no slug to restore from |
| `login()` checks only the realm's shape (`^[a-z0-9][a-z0-9-]{0,62}$`) | `auth/oidc.ts` | A call with the platform realm would pass that check, but the other tenant logic around it would not |
| One `auth.clientId` (`tender-web`) for every realm | `config/schema.ts` | The platform realm may need its own |
| `SessionUser` has `sub`, name, email, `tenantId`, `authTime`; no roles ("the JWT has none") | `auth/types.ts` | The SDK cannot say who is an operator |
| Roles and permissions come from the session context (P-35) | `auth/types.ts`, `react/hooks.ts` | With no session context, `useHasPermission` and `<Can>` deny everything (to be confirmed in `/authz`) |
| No `platform_operator` or operator concept anywhere | grep of `src/` | Nothing to build on |

The rule in web-shell's `CLAUDE.md` is "never reimplement SDK behaviour; change it in `platform-reactcommon`", so these changes belong here.

## 2. Proposed changes

The shapes below are proposals for review, not final API.

### 2.1 Config (`/config`)

| Change | Detail |
|---|---|
| `auth.operatorRealm` | Optional string, slug-shaped. Absent means operator mode is off (all existing deployments) |
| `auth.operatorClientId` | Optional; falls back to `auth.clientId` |
| Schema refinement | `operatorRealm` must not equal `trialRealm` and must not start with `paidRealmPrefix`, so an operator realm can never be mistaken for a tenant realm (same style as the existing `trialRealm` check) |
| Safety | A deployment that sets neither behaves exactly as today |

### 2.2 `/auth`

Add an operator workspace kind. One way to model it, to be reviewed against the design doc:

```ts
export interface Workspace {
  readonly realm: string;
  readonly trial: boolean;
  readonly slug?: string;
  readonly tenantIdHint?: string;
  /** Platform operator realm: not a tenant, never cached, no slug, no /t/<slug>/ URL. */
  readonly operator?: boolean;
}
```

Behaviour to specify and test:

| Area | Required behaviour |
|---|---|
| `realmMatches` | An operator workspace matches only `auth.operatorRealm` |
| `rememberWorkspace` | Does nothing for an operator workspace: no cache write, no URL change |
| `chooseWorkspace` / restore | In operator mode, restore from the operator realm only; never offer a tenant workspace, never use the tenant workspace cache |
| `login`, `reauthenticate`, `switchWorkspace`, `logout` | Use the operator client and realm; step-up keeps `prompt=login&max_age` |
| ID token checks | `iss` must equal the operator realm's issuer; a missing `tenant_id` is normal for operators and must not log the "trial ID token has no valid tenant_id" error |
| Storage | An operator session gets its own storage namespace and is cleared on sign-out like any other (check `workspaceNamespace`) |
| Cross-tab | `logout` and `workspace-switched` messages keep working; an operator tab must not be switched into a tenant workspace by another tab's message |
| Signed-out state | The existing `signed-out`, `expired` and `device-clock` states apply unchanged |

### 2.3 Knowing who is an operator

Two options. IAM's answer (see the IAM document) decides.

| Option | What the SDK does | Cost |
|---|---|---|
| **A. The realm is the signal (recommended if IAM confirms)** | Expose `useIsOperator()`, true when the signed-in workspace is the operator workspace. No token parsing | Small. The gateway still authorises every request; this is a UI hint only |
| B. A role claim | Expose realm roles from the token on `SessionUser` (for example `roles?`), and parse them with the existing role-token rule | Larger. A new claim to trust in the browser, and the spec's rule that roles are not in the token for tenants would need a documented exception |

### 2.4 `/react` and `/authz`

| Change | Detail |
|---|---|
| Authenticated session with no session context | Must be a supported, documented state in operator mode. `useSessionContext()` returns `undefined` by design, not as a failure |
| Permissions | Provide a way to set an authz subject for operators (for example role `platform_operator`) so `useHasPermission` and `<Can>` can gate operator screens. Confirm how `denyAll` is chosen today |
| `useReadOnly`, `useStepUp` | `useStepUp` reads `mfaFreshnessSeconds` from the session context; define the operator equivalent (IAM question) or a config default |
| Platform provider | The shell's own `ShellRoot.tsx` mirrors `examples/shell`; update the example shell to match |

### 2.5 `/nav`, `/mfe`

No change expected. `ownerDomain` for the `operator` remote is `iam`, which is already in the registry. Confirm that the manifest loader and kill-switch work the same for a shell with no tenant (they read only runtime config and the manifest).

## 3. Release mechanics (from the repo's own rules)

| Step | Command or file |
|---|---|
| Changeset | `.changeset/` entry per package changed |
| Generated contracts | `pnpm contracts:sync` and `contracts:check` (nothing backend-shaped is written by hand) |
| Public API report | `pnpm api` then `api:check` (API Extractor reports must be updated) |
| Exports and docs | `pnpm exports:sync`, `docs:sync`, `docs:check` |
| Tests | unit (`test/unit/auth`, `config`, `react`, `authz`), integration (`bootstrap`, `session`), e2e (reference shell), `test/browser` where a real engine matters |
| Full gate | `pnpm verify` (CI runs `pnpm ci`) |
| Version | Next pre-release after `1.0.0-alpha.6` (for example `1.0.0-alpha.7`). Not breaking for tenant deployments |
| Compatibility | A new config key is refused by older SDKs, so **the shell upgrades first**, then remotes (as with `auth.signInUrl` in alpha.5). `webpack-preset`'s `SdkVersionPlugin` requires the three packages on one version |
| Example | Update `examples/shell` with the operator branch so the reference shell stays the pattern the web-shell follows |

## 4. Acceptance criteria

- A deployment with no `auth.operatorRealm` behaves exactly as `alpha.6` (existing tests unchanged).
- With `auth.operatorRealm` set, a sign-in to that realm reaches `authenticated` with no PUB-1, no slug, no cached workspace, no URL change, and no error log about `tenant_id`.
- Sign-out, expiry, idle timeout, step-up and cross-tab sign-out work for operator sessions.
- A tenant session can never be restored into the operator realm or the other way round.
- `useIsOperator()` (or the chosen signal) is true only for the operator workspace.
- `pnpm verify` passes; the public API report and docs are updated.

## 5. Risks

- Touching the workspace type affects every shell and remote. Keep the new field optional and cover both modes in the same test files.
- The realm-as-signal option is a UI hint only. Do not let any code path treat it as authorisation.
- The `/auth` module is security-sensitive (PKCE, `iss` checks, token handling). Get an extra reviewer, and the repo's `invariant-reviewer` and `api-change-reviewer` agents, on the diff.

## 6. Open items

| # | Item | Owner |
|---|---|---|
| 1 | Realm signal or role claim (§2.3), depends on IAM | IAM, platform-reactcommon |
| 2 | Operator `mfaFreshnessSeconds` source for `useStepUp` | IAM, platform-reactcommon |
| 3 | Whether `Workspace.operator` or a separate type fits the design doc better | platform-reactcommon |
| 4 | Whether the operator deployment (separate origin) needs any `/security` or CSP-builder change | platform-reactcommon, web-shell |
