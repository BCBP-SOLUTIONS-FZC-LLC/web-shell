# Operations

## Commands

| Command | What |
|---|---|
| `npm ci` | Needs `NODE_AUTH_TOKEN` (`gh auth refresh -s read:packages`; `export NODE_AUTH_TOKEN=$(gh auth token)`) |
| `npm run dev` / `preview` | Rsbuild on :5001 with `config/dev-platform.mjs` (`DEV_API_URL`, `DEV_REALM`, `DEV_ROLES`) |
| `npm run keycloak:setup` | Keycloak 26.8.1 on :8080, realm `tenant-bcbp`, client `app1`, seed user |
| `npm run lint` / `typecheck` / `build` | ESLint (platform rules) / `tsc -p tsconfig.test.json` / `tsc && rsbuild build` |
| `npm test`, `test-unit`, `test-int`, `test-e2e` | Vitest (all, or one layer) |
| `npm run test:ci` | Coverage + `.github/scripts/coverage-gate.mjs` (95%) |
| `npm run metrics-check` | `.github/scripts/metrics-check.mjs`: creates every metric `src/` defines once more with the SDK's own `getServiceMeter` / `getDomainMeter` (identity from `src/bootstrap.tsx`), so the SDK's `InvalidMetricError` is the verdict; adds only what the SDK cannot see: metrics created outside the SDK, non-literal names or labels, and the `docs/observability.md` Inventory. No rule is restated here |
| `npm run budget` | `.github/scripts/bundle-budget.mjs` over `dist/`: entry 12 KB, JS+CSS 300 KB, largest 85 KB (gzip), images 2.7 MB. Raise a limit only on purpose, with a CHANGELOG line |
| `npm run test-browser` | Playwright over `dist/` (build first): Chromium, Firefox, WebKit, production CSP, HTTPS (openssl self-signed cert in `test/browser/.build/`), fake Keycloak on a second origin. `-- --project=webkit` for one engine |
| `npm run test-contract` | `REMOTE_DIST=<mfe-dashboard>/dist` (built, with `remote-manifest-entry.json`): `dashboard.spec.ts` with the real remote. Build mfe-dashboard in a copy, never in the sibling checkout |
| `npm run test-smoke` | `SMOKE_BASE_URL=http://127.0.0.1:<port>` after `docker run -p 127.0.0.1:<port>:8080 <image>`; `SMOKE_MODE=live` for a deployment |
| `npm run hooks:install` | `.githooks/pre-commit` (env files, workflow hygiene, digest pin, `tsc --noEmit`) |

Image locally: `docker build --secret id=npm_token,env=NODE_AUTH_TOKEN -t web-shell:local .` Keycloak owns host :8080, so map the image elsewhere (`-p 18080:8080`, or any free port).

## CI (`ci.yml`)

| Job | Gate |
|---|---|
| `Validate / Test / test` | `npm ci`, coverage, gate 95%, build, size budget |
| `Validate / Quality / quality` | ESLint `--max-warnings 0`, `metrics-check`, typecheck, workflow LF and literal operators, digest pins, `.dockerignore`, `npm audit --omit=dev --audit-level=high` |
| `Build image (cache)` | Hadolint, Buildx `web-shell-ci-test` (secret `npm_token`) |
| `Trivy CVE scan` | Unfixed CRITICAL/HIGH/UNKNOWN fail; `.trivyignore` with reason and expiry |
| `Smoke tests` | Node 26 + `npm ci`, then `smoke-tests.sh`: ≤ 200 MB, `/healthz`, startup gate, `npm run test-smoke` (`SMOKE_MODE=image`) |
| `Browser tests` | In the digest-pinned `mcr.microsoft.com/playwright:v<version>-noble` container (browsers, their libraries and Node 26 preinstalled; nothing from apt), `npm ci`, a check that the image holds this `@playwright/test`'s browsers, build, `npm run test-browser`; report uploaded on failure. Gates push. **Bump the container tag and digest with `@playwright/test`** |
| `Dashboard contract` | Same container; builds mfe-dashboard (`vars.DASHBOARD_REF`, default `main`), runs `test-contract`. Informational |
| `PR summary` / `Push image → GHCR` | Comment on PRs / `main`: GHCR tags, Cosign |
| `changelog` | `CHANGELOG.md` when `src/`, `package*.json`, `Dockerfile`, `nginx/`, `rsbuild.config.ts`, `config/**`, `public/config/**`, `index.html` change |

Registry: every `npm ci` uses `GITHUB_TOKEN` with `packages: read`. A 403 `read_package` means the package's "Manage Actions access" lacks this repository (frontend-sdk, webpack-preset, eslint-plugin each). Granting it is a settings change: ask the user.

Runbooks: `docs/runbook-coverage-gate.md`, `docs/runbook-image-scan.md`, `docs/runbook-release.md`, `docs/runbook-startup-failure.md` (alert `WebShellStartupFailures`); hosting before CloudFront: `docs/hosting-without-cloudfront.md`; job graph `docs/pipeline/README.md`.

## Release

`vX.Y.Z[-*]` tag → `release.yml`: re-validate, `## [X.Y.Z]` changelog section, `web-shell_<tag>_dist.tar.gz` (`BUILD_VERSION` without the `v`), source maps as workflow artifact `sourcemaps-<tag>`, image pushed by digest, scan, SBOM, SLSA provenance (BuildKit attestation, read with `docker buildx imagetools inspect`), Cosign, then the semver tags and `latest` on the signed digest (`tag-signed-image.sh`), GitHub Release. Tagging never deploys. See `VERSIONING.md` and `docs/runbook-release.md`.

It has run for `v0.1.0` and `v0.2.0` (2026-11-05), both green end to end. Its provenance step was the one that failed mfe-dashboard's `v0.1.0`; fixed here before the first tag (#27). Tags are added last (#30), so a failed run leaves only an untagged digest in GHCR and moves no version tag or `latest`: fix the cause, then delete and push the Git tag again (`docs/runbook-release.md`).

## SDK upgrade checklist

1. Read `platform-reactcommon` `CHANGELOG.md` for the version; diff `git diff vOLD vNEW -- packages/` there.
2. `npm install --save-exact` all three packages to the same version.
3. lint, typecheck, `test:ci`, build; check the bundle shares the new version (`grep -o '1\.0\.0-alpha\.[0-9]*' dist/assets/*.js | sort | uniq -c`).
4. Update the version in README, ARCHITECTURE, VERSIONING, the LLD header, `.claude/CLAUDE.md`, and add a CHANGELOG entry.
5. Merge before any remote moves to that version. Exception: a release that changes the shell–remote contract (alpha.4's container global) ships the shell and every remote together; check with `REMOTE_DIST=<dashboard dist> npm run test-contract`.

## Claude Code settings and hooks

| File | What |
|---|---|
| `.claude/settings.json` | **Not installed.** Without it the two hooks below do not run. A proposed version (read-only and test commands allowed; both hooks wired) was written outside the repo; adding it is the user's decision |
| `.claude/hooks/guard.sh` (PreToolUse) | Blocks edits to `../mfe-dashboard`, `platform-reactcommon`, `node_modules/`, `dist/`, `coverage/`, `.env`, `docker.local.env` |
| `.claude/hooks/post-edit.sh` (PostToolUse) | ESLint on an edited `*.ts/tsx/js/mjs` (exit 2 shows problems); for `docs/architecture/mermaid/*.mmd` or `ARCHITECTURE.md`, checks each embedded diagram equals its source (`check-diagrams.mjs`) |
| `.claude/agents/invariant-reviewer.md` | Read-only review of a diff against the Critical Rules |
| `.claude/settings.local.json` | Personal, gitignored |
