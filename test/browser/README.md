# Real-browser suite

The production build (`dist/`) in **Chromium, Firefox and WebKit** under the **production response headers**, the checks happy-dom cannot make. Modelled on `platform-reactcommon` `test/browser`.

```bash
npm run build
npm run test-browser                      # all three engines
npm run test-browser -- --project=webkit  # one engine
npx playwright install chromium firefox webkit   # once, if the browsers are missing
```

## What runs

`global-setup.ts` starts two HTTPS servers on `127.0.0.1` (`server.ts`, a throwaway self-signed certificate made with `openssl` in `test/browser/.build/`; HTTPS because the CSP's `upgrade-insecure-requests` would otherwise upgrade WebKit's requests):

| Server | Serves |
|---|---|
| App | `dist/` with the platform CSP (`platform-reactcommon` `examples/cloudfront/csp.mjs`, copied in `buildCsp`) and the nginx SPA rule; a runtime config pointed at the fake Keycloak; a manifest whose `dashboard` entry is a stub built only on the shell's shared React and SDK (integrity `sha384`); PUB-1 and P-35; recorders for `/otel/*` and `/csp-report`; `GET /__test/state` and `/__test/reset` |
| Fake Keycloak (second origin) | Authorize (the user counts as signed in; `prompt=none` fails without an SSO session), the token endpoint with PKCE and CORS, and the end-session endpoint the global sign-out POSTs a form to |

## Cases (`shell.spec.ts`)

| Case | Locks |
|---|---|
| Login page | No CSP violation; Geist loaded from `/assets/`; carousel images hashed under `/assets/`; no third-party request |
| Sign-in | PKCE through the fake Keycloak, `/t/acme/dashboard`, the remote's entry loaded with its integrity through Trusted Types, role map (`Invite` for an owner), no token in storage |
| `navigate()` | A remote's navigation under the basename changes the URL without a reload (`registerNavigator`) |
| Sign-out | The form POST reaches Keycloak under `form-action` with `client_id`, `id_token_hint`, `post_logout_redirect_uri`; "You are signed out"; the next sign-in sends `prompt=login` |
| Start-up failure | A missing `/config/runtime.json` shows the unavailable page and `the app could not start` reaches `/otel/v1/logs` |
| Colour contrast | axe `color-contrast` over the login page. The page is served without its CSP for this case only (axe is an injected script). The "BCBP SOLUTIONS" logotype (`data-logotype`) is exempt: WCAG 1.4.3 sets no contrast requirement for text that is part of a logo |

After every case, any report the browser sent to `/csp-report` fails it.

Tests run one at a time (`workers: 1`): they share the fake Keycloak session and the recorders, and reset them in `beforeEach`.

## Dashboard contract (`dashboard.spec.ts`)

With `REMOTE_DIST` set to a built mfe-dashboard `dist/` (it must contain `remote-manifest-entry.json`, which the dashboard's `npm run build` writes), the server serves that build as `dashboard` under `/remotes/dashboard/<version>/` with its own integrity, and `shell.spec.ts` is skipped:

```bash
git clone --depth 1 https://github.com/BCBP-SOLUTIONS-FZC-LLC/mfe-dashboard.git /tmp/mfe-dashboard
(cd /tmp/mfe-dashboard && npm ci && npm run build)
npm run build && REMOTE_DIST=/tmp/mfe-dashboard/dist npm run test-contract
```

| Case | Locks |
|---|---|
| Loads | The real remote renders "Dashboard" with its own stylesheet, no failed `/remotes/` request, no CSP violation |
| Images | Every `<img>` the dashboard renders loads. (mfe-dashboard's `BrandLogo` used `/image/…` until its #23; this case caught it.) A root-relative `src` (`/image/x.png`) resolves against the shell's origin, where the remote's files are not served |
| Role map and navigation | An owner sees "User management" (the shell's role map through SDK hooks); its `NavLink` opens the page without a reload |
| Logout | The dashboard's Logout signs out through the shell: the form POST reaches Keycloak, "You are signed out" |

CI's `Dashboard contract` job builds `BCBP-SOLUTIONS-FZC-LLC/mfe-dashboard` at `vars.DASHBOARD_REF` (default `main`) and runs this. It is informational: it does not gate `push`.
