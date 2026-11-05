# Pipeline

How GitHub Actions builds, tests, and publishes `web-shell`. Workflows live in [`.github/workflows/`](../../.github/workflows). Scripts they call live in [`.github/scripts/`](../../.github/scripts).

Five workflow files. Markdown-only pushes and pull requests skip `ci.yml` (`paths-ignore: '**.md'`). A commit that also touches code still runs.

| Workflow | When | What it decides |
|---|---|---|
| [`ci.yml`](../../.github/workflows/ci.yml) | Pull request or push to `main` or `master`, or a manual run | Tests, image, scan, smoke. Push to `main` also publishes and signs |
| [`validate-test.yml`](../../.github/workflows/validate-test.yml) | Called by `ci.yml` and `release.yml` | Vitest, the 95% coverage gate, then `npm run build` |
| [`validate-quality.yml`](../../.github/workflows/validate-quality.yml) | Called by `ci.yml` and `release.yml` | ESLint with the platform rules, the typecheck, workflow hygiene, digest-pinned `FROM` lines, production `npm audit` |
| [`changelog-check.yml`](../../.github/workflows/changelog-check.yml) | Pull request touching the shell, the lockfile, the Dockerfile, nginx, the Rsbuild config, the runtime config, or `index.html` | `CHANGELOG.md` is in the diff |
| [`release.yml`](../../.github/workflows/release.yml) | Tag `vX.Y.Z` or `vX.Y.Z-*`, or a manual run with a tag input | Changelog section, image, SBOM, provenance, GitHub Release |

Dependabot opens pull requests for npm, Docker, and GitHub Actions (`.github/dependabot.yml`). The npm job uses the `github-packages` registry with the Dependabot secret `PACKAGES_READ_TOKEN` (without it every npm update fails with a 401 on `npm.pkg.github.com`) and ignores `@bcbp-solutions-fzc-llc/*`, which are upgraded by hand, all three together. A `@playwright/test` update also needs the browser jobs' container tag and digest bumped in the same PR.

Node on every job is **26**. Every `npm ci` reads `@bcbp-solutions-fzc-llc/*` from GitHub Packages with `GITHUB_TOKEN` (`packages: read`), and the image builds pass it as the BuildKit secret `npm_token`. The repository needs read access on each package's page (Package settings → Manage Actions access); without it `npm ci` fails with 403. `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` is set so JavaScript actions run on the runner's current Node.

## Pull request and main

```mermaid
flowchart LR
    test["validate-test\nVitest and 95% gate\nnpm run build, size budget"]
    quality["validate-quality\nESLint, tsc, pin, LF, npm audit"]
    build["build-image\nHadolint then Buildx cache"]
    trivy["trivy\nCRITICAL HIGH UNKNOWN"]
    smoke["smoke\nsize, startup gate, no .map\nnpm run test-smoke"]
    browser["browser\nChromium, Firefox, WebKit\nproduction CSP"]
    contract["dashboard-contract\nreal mfe-dashboard build\ninformational"]
    summary["pr-summary\npull requests only"]
    push["push\nmain and master only\nGHCR and Cosign"]

    test --> trivy
    build --> trivy
    test --> smoke
    build --> smoke
    test --> summary
    quality --> summary
    build --> summary
    trivy --> summary
    smoke --> summary
    browser --> summary
    contract --> summary
    test --> push
    quality --> push
    trivy --> push
    smoke --> push
    browser --> push
```

Source: [`mermaid/ci-flow.mmd`](mermaid/ci-flow.mmd).

`build-image` does not wait for the test job. Trivy and smoke wait for both the test job and the image. A test failure still skips the scan and the smoke run. `validate-quality` does not block those two. It does block `push`. The summary comment is posted whatever the results (`if: always()`), failures included. `dashboard-contract` builds mfe-dashboard (`vars.DASHBOARD_REF`, default `main`) and runs the shell with that real remote in three browsers; it reports in the summary but never blocks `push`, since that repository's `main` moves on its own.

| Job | Gate |
|---|---|
| `validate-test` | `npm ci`, `npm run test:coverage`, [`.github/scripts/coverage-gate.mjs`](../../.github/scripts/coverage-gate.mjs) at 95% for statements, branches, functions, and lines, upload `coverage/`, then `npm run build` (`tsc` and `rsbuild build`) and `npm run budget` ([`.github/scripts/bundle-budget.mjs`](../../.github/scripts/bundle-budget.mjs): entry 12 KB, JS+CSS 300 KB, largest file 85 KB gzip, images 2.7 MB). See [the coverage runbook](../runbook-coverage-gate.md) |
| `validate-quality` | `npm run lint -- --max-warnings 0` and `npm run typecheck`. No HTML entities in workflows or scripts. LF in `.github/scripts`, `.github/workflows`, `Dockerfile`, and `nginx/`. Every `FROM` is `image:tag@sha256:…`. `.dockerignore` exists. `npm audit --omit=dev --audit-level=high` |
| `build-image` | Hadolint on `Dockerfile`, then a `linux/amd64` build tagged `web-shell-ci-test` and stored in the Actions cache. Build args: `BUILD_VERSION` and `SOURCE_DATE_EPOCH`; secret `npm_token`. `PLATFORM_ENVIRONMENT` keeps its default, `prod` |
| `trivy` | Reloads that cached image. Fails on unfixed **CRITICAL**, **HIGH**, or **UNKNOWN**. SARIF is uploaded and does not fail the job by itself. CycloneDX SBOM is an artifact named `sbom-<sha>`. Allowlist file: [`.trivyignore`](../../.trivyignore). See [the image runbook](../runbook-image-scan.md) |
| `smoke` | Same cached image, then Node 26 and `npm ci` (`NODE_AUTH_TOKEN`). [`.github/scripts/smoke-tests.sh`](../../.github/scripts/smoke-tests.sh): at most 200 MB, `GET /healthz` contains `ok`, `GET /` is 200 and contains `id="app"`, `GET /config/runtime.json` and `GET /version.json` are 200, no `.map` file is in the image, then `npm run test-smoke` with `SMOKE_MODE=image` against the container ([test/smoke](../../test/smoke/README.md): SPA rule, Cache-Control, integrity, 404s, SDK-validated runtime files) |
| `browser` | In Playwright's digest-pinned image for the exact `@playwright/test` version (`mcr.microsoft.com/playwright:v1.64.1-noble`: browsers, their system libraries and Node 26 preinstalled, so nothing comes from apt; a step fails if the image lacks this version's browsers), `npm ci`, `npm run build`, `npm run test-browser` ([test/browser](../../test/browser/README.md)): Chromium, Firefox and WebKit under the production CSP. The report is uploaded on failure. Gates `push` |
| `dashboard-contract` | Same container. Checks out `BCBP-SOLUTIONS-FZC-LLC/mfe-dashboard` into `.remote/`, `npm ci` both, builds the dashboard (`BUILD_VERSION=contract-<sha>`), Playwright browsers, `npm run build`, then `REMOTE_DIST=.remote/mfe-dashboard/dist npm run test-contract` ([`dashboard.spec.ts`](../../test/browser/dashboard.spec.ts)). Informational |
| `pr-summary` | [`.github/scripts/pr-summary.js`](../../.github/scripts/pr-summary.js) posts one comment. The coverage cell uses the `pct` output of `validate-test` |
| `push` | Push events on `main` or `master` only. Publishes `ghcr.io/bcbp-solutions-fzc-llc/web-shell` with the branch tag and `sha-<short>`, `provenance` and `sbom` on the build, then Cosign keyless sign and verify. The verify identity is `refs/heads/main` or `refs/heads/master` |

Concurrency group `ci-<workflow>-<ref>` cancels an older run on the same ref.

## Release

```mermaid
flowchart LR
    test["validate-test"]
    quality["validate-quality"]
    build["build\ntag matches HEAD\nchangelog section\ndist tarball"]
    docker["docker\npush by digest, Trivy, SBOM,\nprovenance, Cosign, then tags"]
    publish["publish\nGitHub Release"]

    test --> build
    quality --> build
    build --> docker
    build --> publish
    docker --> publish
```

Source: [`mermaid/release-flow.mmd`](mermaid/release-flow.mmd).

`publish` needs both `build` and `docker`. A failed scan does not open the GitHub Release. Nothing in this workflow deploys a cluster.

The Git tag keeps the `v`. Image tags from `docker/metadata-action` are `X.Y.Z`, `X.Y`, and `X`. `latest` is added when the tag has no `-`. A pre-release tag publishes `X.Y.Z-rc.N` only.

Release Trivy fails on unfixed **CRITICAL** and **HIGH**. It does not include the CI job's **UNKNOWN** severity. Both jobs honor `.trivyignore`.

The GitHub Release attaches `web-shell_<tag>_dist.tar.gz`, `checksums.txt`, `sbom.cyclonedx.json`, and `provenance.slsa.json`. The build's source maps stay a workflow artifact (`sourcemaps-<tag>`, 90 days), for reading production stack traces. Notes come from the matching `## [X.Y.Z]` section. Steps when a tag fails are in [the release runbook](../runbook-release.md). Maintainer order of work is in [VERSIONING.md](../../VERSIONING.md).

## Changelog check

`changelog-check.yml` is separate from `ci.yml`. It runs on pull requests whose paths include any of:

- `src/**`
- `package.json`, `package-lock.json`
- `Dockerfile`, `nginx/**`
- `rsbuild.config.ts`, `config/**`, `public/config/**`, `index.html`

The job fails when `CHANGELOG.md` is absent from that diff. A docs-only pull request does not run it. A release tag is checked again by `verify-changelog-entry.sh`, which looks for `## [X.Y.Z]` and does not require the date.

## Local equivalents

```bash
npm run hooks:install   # once per clone; again if .githooks/pre-commit changes
npm run lint
npm run typecheck
npm run test:ci
npm run build
```

`hooks:install` copies `.githooks/pre-commit` into `.git/hooks`. Each commit then checks staged env files, workflow hygiene, the Dockerfile digest pin, and `tsc --noEmit`. `npm run lint` and `npm run typecheck` are the first half of `validate-quality`; `npm run test:ci` and `npm run build` are `validate-test`. They do not run Hadolint, Trivy, or the image smoke script. Image checks need Docker:

```bash
docker build --secret id=npm_token,env=NODE_AUTH_TOKEN -t web-shell:local .
# Hadolint and Trivy are the same tools CI runs; install them locally if you want the same gate before a tag.
```

## Adding a check

| You want | Change |
|---|---|
| A new test | A file under `test/unit` or `test/integration`. The coverage gate already includes `src/**/*.{ts,tsx}` |
| A new workflow file rule | A step in `validate-quality.yml`. Keep the script LF |
| A new image startup URL or nginx behaviour | `nginx/default.conf` and `test/smoke/deployment.test.ts` together (`smoke-tests.sh` only for a startup check) |
| A new build constant inside the image | A Dockerfile `ARG`, `rsbuild.config.ts` `source.define`, and the `build-args` blocks in `ci.yml` (`build-image`, `trivy`, `smoke`, `push`) and `release.yml` (`docker`). Runtime settings go in `/config/runtime.json` instead |
| A new release asset | `prepare-release-asset.sh` or `create-github-release.sh`, and the artifact upload/download pair in `release.yml` |
