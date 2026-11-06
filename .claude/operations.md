# Operations

## Commands

| Command | What |
|---|---|
| `npm ci` | Needs `NODE_AUTH_TOKEN` (`gh auth refresh -s read:packages`; `export NODE_AUTH_TOKEN=$(gh auth token)`) |
| `npm run dev` / `preview` | Rsbuild on :5001 with `config/dev-platform.mjs` (`DEV_API_URL`, `DEV_REALM`, `DEV_ROLES`) |
| `npm run keycloak:setup` | Keycloak 26.8.1 on :8080, realm `tenant-bcbp`, client `app1`, seed user |
| `npm run lint` / `typecheck` / `build` | ESLint (platform rules) / `tsc -p tsconfig.test.json` / `tsc && rsbuild build` |
| `npm run arch-lint` | dependency-cruiser over `src/` with `.dependency-cruiser.cjs`: the component map (`components`, `deps.mayDependOn`, `vendors`, `typeOnlyVendors`) in allowed mode, plus no cycles and no unresolvable imports. Like go-arch-lint |
| `npm test`, `test-unit`, `test-int`, `test-e2e` | Vitest (all, or one layer) |
| `npm run test:ci` | Coverage + `.github/scripts/coverage-gate.mjs` (95%) |
| `npm run metrics-check` | `.github/scripts/metrics-check.mjs`: creates every metric `src/` defines once more with the SDK's own `getServiceMeter` / `getDomainMeter` (identity from `src/app/bootstrap/bootstrap.tsx`), so the SDK's `InvalidMetricError` is the verdict; adds only what the SDK cannot see: metrics created outside the SDK, non-literal names or labels, and the `docs/observability.md` Inventory. No rule is restated here |
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
| `Validate / Quality / quality` | ESLint `--max-warnings 0`, `arch-lint`, `metrics-check`, typecheck, workflow LF and literal operators, digest pins, `.dockerignore`, `npm audit --omit=dev --audit-level=high` |
| `Build image (cache)` | Hadolint, Buildx `web-shell-ci-test` (secret `npm_token`) |
| `Trivy CVE scan` | Unfixed CRITICAL/HIGH/UNKNOWN fail; `.trivyignore` with reason and expiry |
| `Smoke tests` | Node 26 + `npm ci`, then `smoke-tests.sh`: ≤ 200 MB, `/healthz`, startup gate, `npm run test-smoke` (`SMOKE_MODE=image`), then the per-environment CSP and HSTS: none by default, added by mounted `security.d/csp.conf` and `hsts.conf` |
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
3. lint, arch-lint, typecheck, metrics-check, `test:ci` (and `no-sdk-duplicates`: delete any copy the SDK now exports, LLD §1.2), build, budget, test-browser; check the bundle shares the new version (`grep -o '1\.0\.0-alpha\.[0-9]*' dist/assets/*.js | sort | uniq -c`).
4. Update the version in README, ARCHITECTURE, VERSIONING, the LLD header, `.claude/CLAUDE.md`, and add a CHANGELOG entry. New `runtime.json` keys also go in README, LLD §9.1, `public/config/runtime.json`, `config/runtime.local.json` and `test/smoke`. Run the `invariant-reviewer` and `doc-sync-reviewer` subagents on the diff.
5. Merge before any remote moves to that version. Exception: a release that changes the shell–remote contract (alpha.4's container global) ships the shell and every remote together; check with `REMOTE_DIST=<dashboard dist> npm run test-contract`.

## Claude Code settings and hooks

| File | What |
|---|---|
| `.claude/settings.json` | Checked in. Wires the two hooks below (needs `jq`). No permission rules: each developer keeps those in `settings.local.json` |
| `.claude/hooks/guard.sh` (PreToolUse: Edit, Write, MultiEdit, NotebookEdit) | Compares canonical paths (`..`, `.`, symlinks and case resolved). Blocks any path in `mfe-dashboard` or `platform-reactcommon`, `.env` and `docker.local.env` at any depth (`*.example` stays editable), and `node_modules/`, `dist/`, `coverage/` at the repository root |
| `.claude/hooks/post-edit.sh` (PostToolUse) | ESLint on an edited `*.ts/tsx/js/mjs` (exit 2 shows problems), then for `src/**` arch-lint on the file and its imports (`.dependency-cruiser.cjs`); for `package.json`, the three platform packages exact and on one version (`check-sdk-pins.mjs`); for `docs/architecture/mermaid/*.mmd` or `ARCHITECTURE.md`, each embedded diagram equals its source (`check-diagrams.mjs`) |
| `.claude/agents/invariant-reviewer.md` | Read-only review of a diff against the Critical Rules |
| `.claude/agents/doc-sync-reviewer.md` | Read-only review of a diff for documentation drift: paths, module tables vs `eslint.config.js` / `.dependency-cruiser.cjs`, diagram arrows vs real imports, counts, commands, behaviour claims, CHANGELOG |
| `.claude/skills/sdk-upgrade/` | `/sdk-upgrade <version>` (user-invoked): the SDK upgrade checklist above as a workflow; `scripts/bump.sh` refuses a non-exact version (e.g. `^1.0.0`) before installing anything, then a version any of the three packages has not published; installs all three at that version and checks the pins |
| `.claude/skills/stack-sync/` | `/stack-sync <PR>` (user-invoked): after a stacked PR's base is squash-merged, `scripts/sync.sh` first refuses an option-like or unknown branch or base and a working tree that is not clean, then merges `main` into the branch only when `main`'s tree equals the old base's, by recording `main` (`-s ours`) and applying only `main`'s changes since the branch was cut, and keeps the merge only when the branch's diff against `main` is exactly its own change (else it resets the branch and names the files); then the PR is retargeted to `main` |
| `.mcp.json` | `context7` (`@upstash/context7-mcp@4.4.4`, pinned): current docs for React, Rsbuild, Tailwind, dependency-cruiser, Playwright. Approve it once when Claude Code asks. It cannot see the private SDK: read its `dist/<subpath>/index.d.ts` |
| `.claude/settings.local.json` | Personal, gitignored |
