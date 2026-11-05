# Request flows

Condensed from the [LLD](../docs/lld/web-shell-lld.md) §5–§6. Step numbers refer to LLD §5.

## Bootstrap (every page load)

1. `installTrustedTypesPolicy` → `initializeCore` (`web-shell`, `portal`) → `loadRuntimeConfig`/`setRuntimeConfig`. A throw so far → "The app is unavailable right now."
2. `setConsentProvider(cmp)` → tracing, logging, metrics, `installGlobalErrorHandlers`, `startWebVitals` → runtime-config flags.
3. `createOidcProvider(cfg.auth, workspaceResolver)` → `setTokenSource(initializeAuth(idp))` → `idp.init()`.
4. Anonymous → sign-in (below); return. Wrong workspace → `showWrongWorkspace`; return.
5. `idp.subscribe` → `roleMapAuthorizer(permissions)` → P-35 into a store (`warn` and deny-all on failure) → subject, context flags, `rememberWorkspace` (URL → `/t/<slug>/`) → `initializeI18n` (`detect`: P-35 `locale`) → `loadManifest` (`error` on failure) → `startVersionPolling` → render.

After render: `registerNavigator` (router under the basename; other paths load in full). Without a context, P-35 is retried after 1 s, 2 s, 4 s (network, timeout, 429, 5xx) and applied live; a sign-out stops it, and a sign-out during boot stops before the app mounts. Any start-up throw after `initializeCore` is logged `error 'the app could not start'` before the unavailable page.

## Sign-in

| Signed-out reason | Shell |
|---|---|
| `signed-out` | "You are signed out", waits for a click |
| `device-clock` | "Check your device's clock", waits for a click |
| `none`, `login-required` | Workspace: failed attempt's → `chooseWorkspace` (URL slug, cache) → email screen (PUB-1, no token). Then `idp.login({ workspace, loginHint? })` |

The SDK builds the authorize URL (`{idpOrigin}/realms/{realm}/protocol/openid-connect/auth`, S256, `state`, `nonce`, `login_hint`), adds `prompt=login` after a sign-out, and defaults `returnUrl` to the current page. The shell passes neither.

## Forgot password

Typed email → PUB-1 (generic message on failure) → `location.assign({idpOrigin}/realms/{realm}/login-actions/reset-credentials?client_id={clientId})`. No sign-in starts. Empty email → "Enter your work email first…".

## Callback and restore

`{origin}/auth/callback?code&state&iss` → SDK checks `iss` and `state`, exchanges the code with the verifier, keeps tokens in memory, moves the URL to the page the user opened. A reload may do one `prompt=none` round trip; failure is `login-required` with the workspace.

## During use

| Event | Shell |
|---|---|
| `expired` | "Session ended" over the app (text: `serverEnded`, `idle`, other); Sign in → `signInAgain` with the email screen as `ask` |
| `anonymous` / `signed-out` (here or another tab) | Unmount `#app`, then "You are signed out"; Sign in → `idp.login({ workspace })` |
| New `/version.json` | "A new version is available." with Reload (`useAppUpdate`); never forced |
| `switchWorkspace(id)` | PUB-1 → not found: "Workspace not found"; else `idp.switchWorkspace` |
| Remote `useSignOut()` | `idp.logout()`; global by default: form POST to the realm's end-session endpoint (ID token out of URLs; CSP `form-action` must allow the IdP), then `/` shows the signed-out dialog |

## Dashboard load

`/t/<slug>/dashboard/*` → `RemoteBoundary('app2', './App')` → SDK `loadRemote`: kill switch, entry origin, `<script integrity>`, timeout, retries, `window.__platform_mfe_app2.init(shareScope)`, `get('./App')`. Failure → boundary "Something went wrong." / "Try again" (asks the container again, no reload).

## APIs the shell calls

| Call | Auth | Where |
|---|---|---|
| `GET /config/runtime.json` | — | `loadRuntimeConfig` |
| `GET /api/v1/public/tenants/resolve?identifier=` (PUB-1) | none | `workspaceResolver` |
| `POST {idp}/realms/{realm}/protocol/openid-connect/token` | — | SDK |
| `GET /api/v1/me/session-context` (P-35) | Bearer | `sessionContextSource` |
| `GET /remotes/manifest.json`, `/version.json` | — | SDK `/mfe` |
| `POST /otel/v1/{traces,logs,metrics}` | — | SDK telemetry, consent-gated |
