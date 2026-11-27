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
| App | `dist/` with the production CSP (`buildCsp` reads `nginx/security.d/csp.conf.example`, the one CSP source) and the nginx SPA rule; a runtime config pointed at the fake Keycloak; a manifest whose `dashboard` entry is a stub built only on the shell's shared React and SDK (integrity `sha384`); PUB-1, P-35, P-1 and P-27; recorders for `/otel/*` and `/csp-report`; `GET /__test/state` and `/__test/reset` |
| Fake Keycloak (second origin) | Authorize (the user counts as signed in; `prompt=none` fails without an SSO session), the token endpoint with PKCE and CORS, and the end-session endpoint the global sign-out POSTs a form to; OIDC discovery for its realm (public, CORS), another realm 404 without CORS as Keycloak answers a missing one |

## Cases (`shell.spec.ts`)

| Case | Locks |
|---|---|
| Login page | No CSP violation; Geist loaded from `/assets/`; carousel images hashed under `/assets/`; no third-party request |
| Sign-in | PKCE through the fake Keycloak, `/t/acme/dashboard`, the remote's entry loaded with its integrity through Trusted Types, role map (`Invite` for an owner), no token in storage |
| Reload | A reload of the saved paid workspace loads its realm's discovery document (the SDK's realm probe, alpha.9) under `connect-src`, then restores silently to the dashboard; no CSP violation |
| `navigate()` | A remote's `navigate()` under the basename changes the URL without a reload (`registerNavigator`), and the mounted remote is mounted again at the new path; no CSP violation |
| Sign-out | The form POST reaches Keycloak under `form-action` with `client_id`, `id_token_hint`, `post_logout_redirect_uri`; "You are signed out"; the next sign-in sends `prompt=login` |
| Start-up failure | A missing `/config/runtime.json` shows the unavailable page and `the app could not start` reaches `/otel/v1/logs` |
| Read-only notice | P-35 `read_only` shows "Workspace is read-only (subscription ended)" under the production CSP; its contrast ratio measured in the page (≥ 4.5; axe cannot be injected into the signed-in page) and no CSP violation |
| Workspace banner | P-1 `status=trial` shows "3 days left in your trial" under the production CSP; contrast ratio ≥ 4.5 and no CSP violation; at a 300 px-high window, scrolled to the end, the content ends above the notice stack and the stack sits at the window's bottom; `--shell-notices-height` on `<html>` equals the stack's height (set through the CSSOM under the CSP) |
| Sidebar | At a desktop width, after sign-in the sidebar's Dashboard link is the current page; the current item and the sidebar's buttons reach a contrast ratio ≥ 4.5 on their backgrounds; no CSP violation; the sidebar is the window's full height, the page's content starts after it, `--shell-sidebar-width` on `<html>` equals its width and `--shell-header-height` is `0px`; Collapse sidebar folds it to the 64 px rail, the width published follows, the links keep their names as titles, and a reload starts collapsed (the choice saved in SDK storage). At a phone width (390 px) it is hidden and `--shell-sidebar-width` is `0px` while the bar's height is published; Open menu shows it as a modal drawer (focus moved into it, Tab kept out of the page behind it), Close menu stays clickable above it, Escape returns focus to the menu button, and a link closes it. The new-version notice (a newer `/version.json`, a 10 s poll) heads the page beside the sidebar and under the bar, with Reload clickable at both widths. Switch workspace (a typed email, then a mouse click on Continue) reaches the realm's sign-in, and a mouse click on Sign out signs out: WebKit does not focus a clicked button, so a switcher that closed on blur would drop the click |
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

CI's `Dashboard contract` job builds `BCBP-SOLUTIONS-FZC-LLC/mfe-dashboard` at `vars.DASHBOARD_REF` (default `main`) and runs this. The repository is private: the checkout uses `CI_REPO_READ_TOKEN`, which needs read access to it. It is informational: it does not gate `push`.

## Account contract (`me.spec.ts`)

The same idea for `mfe-me`: `ME_DIST` is a built `mfe-me` `dist/` (with its `remote-manifest-entry.json`); the manifest then also lists `me` (`ownerDomain: iam`) and the sidebar shows **My account**. `npm run test-contract` runs it with the dashboard contract; without `ME_DIST` it skips.

```bash
(cd ../mfe-me && npm ci && npm run build)
ME_DIST=../mfe-me/dist npm run test-contract -- --project=chromium
```

| Case | Locks |
|---|---|
| Load | The real `mfe-me` loads (integrity, share scope including `/security`, its CSS applied) with no CSP violation and no failed `/remotes/` request |
| Tabs | The six section tabs move between sections under the shell's router, including from a nested page, and the URL stays `/t/acme/me/<section>` |
| Security | G6's console link points at this workspace's realm, opens in a new tab with `noopener noreferrer` |

The fake IAM here serves no profile, so the page shows its load failure; the screens' data flows are tested in `mfe-me`.

