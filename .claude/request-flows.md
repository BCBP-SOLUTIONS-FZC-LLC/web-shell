# Request flows

Condensed from the [LLD](../docs/lld/web-shell-lld.md) §5–§6; the step numbers here are not LLD §5's.

## Bootstrap (every page load)

1. `installTrustedTypesPolicy` → `loadRuntimeConfig` → `initializeCore` (`web-shell`, `portal`, environment `cfg.environment ?? __ENVIRONMENT__`) → `setRuntimeConfig`. A throw so far → "The app is unavailable right now."
2. (Consent: the SDK's default, essential only) → tracing, logging, metrics, `installGlobalErrorHandlers`, `startWebVitals` → runtime-config flags → `registerShellMessages` (`infrastructure/i18n/shellMessages.ts`: the `shell` catalogue, default locale, before any screen).
3. `createOidcProvider(cfg.auth, workspaceResolver)` → `setTokenSource(initializeAuth(idp))` → `idp.init()`.
4. Anonymous → sign-in (below); return. Wrong workspace → `showWrongWorkspace`; return.
5. `idp.subscribe` → `roleMapAuthorizer(permissions)` → P-35 into a store (`warn` and deny-all on failure; a refusal that `blockedWorkspace` names → `showWorkspaceUnavailable` (A6/A8) and return, after one more ask 5 s later for a membership refusal (`settleRefusal`)) → a trial with a slug: no context → `showWorkspaceLoading` ("Loading your workspace…"; also during the first load's 5 s refusal re-ask) → any first failure but a workspace state (offline, 404, 500 too) retried now (1 s, 2 s, 4 s), a workspace state → `settleRefusal` (its re-ask failing otherwise → the retries once more; a refusal then is final) → `showWorkspaceUnavailable`, still none → `showWorkspaceLoadFailed` ("We couldn't load your workspace": Try again (reload), Sign out, Switch workspace), P-35 `slug` (trimmed, lower-cased by `toSessionContext`) ≠ the workspace's → `showWrongWorkspace` (nothing cached, URL kept); every refusal screen goes through `refuse()` (sets `refused`); each returns, as does a sign-out, an expiry or a refusal during any boot await (`stopped()` = signed out, `expired` or `refused`, which also keeps a late background context or banner load from applying and stops the hourly banner refresh) → subject, context flags, `rememberWorkspace` (URL → `/t/<slug>/`) → `initializeI18n` (`detect`: P-35 `locale`) → `loadManifest` (`error` on failure) → `startVersionPolling` → render.

After render: `registerNavigator` (router under the basename; other paths load in full). Without a context (never a trial with a slug), and only after a transient first failure, P-35 is retried after 1 s, 2 s, 4 s (a network failure while online, a timeout, 429, 502, 503 or 504 (the SDK ApiClient's own rule); one request per attempt, `loadSessionContextOnce`) and applied live; a sign-out stops it, or an expiry discards it, and a sign-out during boot stops before the app mounts. Any start-up throw after `initializeCore` is logged `error 'the app could not start'` before the unavailable page. A retry that answers with a workspace state goes through `settleRefusal` (a membership refusal asked once more after 5 s; deny-all kept meanwhile; a context then is applied, another failure keeps deny-all), then unmounts the app and shows `showWorkspaceUnavailable`. Once the context is known, P-1 (and P-27 for `manage:members`) load in the background (`loadWorkspaceStatus`): banners, the read-only grace date, and the A5 welcome once per device after a recent upgrade; a failure logs `workspace status unavailable`.

## Sign-in

| Signed-out reason | Shell |
|---|---|
| `signed-out` | "You are signed out", waits for a click |
| `device-clock` | "Check your device's clock", waits for a click |
| `none`, `login-required` | Workspace: failed attempt's (a trial one re-checked with PUB-1 by the SDK; none when PUB-1 no longer knows it: straight to the sign-in screen, with or without a slug in the URL, never `chooseWorkspace`) → `chooseWorkspace` (URL slug, cache; a cached trial re-checked with PUB-1, ≤ 5 s) → sign-in screen (email, workspace name or `/t/<slug>` URL; PUB-1, no token). Then `idp.login({ workspace, loginHint?, prompt? })`, the hint only for an email; `prompt: 'login'` for a trial workspace with neither a slug nor a `tenantIdHint` (`uncheckable`: nothing can check it after sign-in) |

The SDK builds the authorize URL (`{idpOrigin}/realms/{realm}/protocol/openid-connect/auth`, S256, `state`, `nonce`, `login_hint`), adds `prompt=login` after a sign-out, and defaults `returnUrl` to the current page. The shell passes no `returnUrl`, and `prompt` only in the `uncheckable` case, on every way in (`credentialsFor`; `signInAgain`'s `prompt` callback; a remote's switch).

## Forgot password

Typed email, workspace name or URL (`toIdentifier`) → PUB-1 (generic message on failure) → `location.assign({idpOrigin}/realms/{realm}/login-actions/reset-credentials?client_id={clientId})`. No sign-in starts. Empty field → "Enter your work email or workspace name first…".

## Callback and restore

`{origin}/auth/callback?code&state&iss` → SDK checks `iss` and `state`, exchanges the code with the verifier, keeps tokens in memory, moves the URL to the page the user opened. A reload may do one `prompt=none` round trip; failure is `login-required` with the workspace (or without one, above). Before restoring a saved paid realm the SDK loads its discovery document (≤ 1.5 s; alpha.9): a deleted realm is re-checked with PUB-1 (a revert restores into the trial realm).

## During use

| Event | Shell |
|---|---|
| `expired` | "Session ended" over the app (text: `serverEnded`, `idle`, other); Sign in → `signInAgain` with the sign-in screen as `ask` and `prompt: (w) => credentialsFor(w).prompt` (`'login'` for a trial nothing can check; SDK alpha.9). Not while a refusal screen is up (`refused`): that screen stays, since "Session ended" would sign in to the same, possibly foreign, session |
| `anonymous` / `signed-out` (here or another tab) | Unmount `#app`, then "You are signed out"; Sign in → `idp.login({ workspace })` |
| P-35 `read_only`, or a `DENY_TENANT_READ_ONLY` answer seen on the page | "Workspace is read-only (subscription ended)" at the bottom (`useReadOnly`), no action; for a cancelled workspace, P-1's `read_only_until` adds "Access ends on <date>" |
| New `/version.json` | "A new version is available." with Reload (`useAppUpdate`); never forced |
| `switchWorkspace(id)` | Nothing once `stopped()` (checked before and after PUB-1); else `toIdentifier` (trimmed, a name lower-cased, a URL's slug) → `workspaceResolver.resolve` → names no workspace or not found: "Workspace not found"; PUB-1 unreachable or rate-limited: the promise rejects (no dialog); else `idp.switchWorkspace(target, credentialsFor(target))` |
| Switch workspace on the wrong-workspace, A6/A8 or workspace-not-loaded dialog | Sign-in screen → `idp.switchWorkspace(w, { prompt: 'login' })` (credentials page, never a live SSO session) |
| Remote `useSignOut()` | `idp.logout()`; global by default: form POST to the realm's end-session endpoint (ID token out of URLs; CSP `form-action` must allow the IdP), then `/` shows the signed-out dialog |

## Dashboard load

`/t/<slug>/dashboard/*` → `RemoteBoundary('dashboard', './App')` → SDK `loadRemote`: kill switch, entry origin, `<script integrity>`, timeout, retries, `window.__platform_mfe_dashboard.init(shareScope)`, `get('./App')`. Failure → boundary "Something went wrong." / "Try again" (asks the container again, no reload). `/t/<slug>/tenders/*` loads `tenders` (mfe-tender) the same way, from `window.__platform_mfe_tenders`; the remote renders its own routes below `/tenders`. `/t/<slug>/drafting/*` (`drafting`, mfe-drafting) and `/t/<slug>/workflows/*` (`workflows`, mfe-workflow-designer) load the same way, from `window.__platform_mfe_drafting` and `window.__platform_mfe_workflows`.

## APIs the shell calls

| Call | Auth | Where |
|---|---|---|
| `GET /config/runtime.json` | — | `loadRuntimeConfig` |
| `GET /api/v1/public/tenants/resolve?identifier=` (PUB-1) | none | `workspaceResolver` |
| `POST {idp}/realms/{realm}/protocol/openid-connect/token` | — | SDK |
| `GET {idp}/realms/{realm}/.well-known/openid-configuration` | — | SDK (before a redirect to a saved paid realm; alpha.9) |
| `GET /api/v1/me/session-context` (P-35) | Bearer | `sessionContextSource` |
| `GET /api/v1/tenants/:id` (P-1) | Bearer | `workspaceStatusSource` |
| `GET /api/v1/tenants/:id/seat-usage` (P-27) | Bearer | `workspaceStatusSource` (`manage:members` only) |
| `GET /remotes/manifest.json`, `/version.json` | — | SDK `/mfe` |
| `POST /otel/v1/{traces,logs,metrics}` | — | SDK telemetry, consent-gated |
