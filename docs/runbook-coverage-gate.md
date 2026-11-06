# Runbook — validate-test

## The contract

`.github/workflows/validate-test.yml` is the reusable test job for pull requests, pushes to `main`, and release tags.

1. `npm ci`
2. `npm run test:coverage` (Vitest unit, integration and e2e)
3. `.github/scripts/coverage-gate.mjs`
4. Upload the `coverage/` directory as an artifact
5. `npm run build` (`tsc`, then the production bundle)
6. `npm run budget` (bundle size budget over `dist/`)

The gate reads `coverage/coverage-summary.json`. It fails when statements, branches, functions, or lines are below **95%**. `COVERAGE_THRESHOLD` overrides that number. The workflow does not set it. Leave it unset in CI.

Trivy and smoke in `ci.yml` wait on this job. A red test run does not scan or smoke the image.

## What you see

The log group `Coverage report summary` prints the four percentages. The error annotation names the metric that missed, for example `branches 94.2%`. The job log before that is a Vitest failure, or `tsc` after the gate has already passed.

The pull-request comment from `pr-summary` shows the statement percentage only when this job succeeds and writes the `pct` output.

## Reproduce locally

```bash
npm ci
npm run test:ci
npm run build
```

`npm run test:coverage` prints uncovered line numbers. The gate is the next command inside `test:ci`.

## What to change

- Cover the lines the report names. A new bootstrap branch goes in `test/integration/bootstrap.test.tsx`, where every SDK subpath is a `vi.mock` fake that records its call; set the fake's return (for example `initResult`, `loadContext`) for the branch you need.
- Components that use SDK hooks are tested with `@bcbp-solutions-fzc-llc/frontend-sdk/react` mocked (`test/integration/app.test.tsx`). `RemoteBoundary` is replaced there, so the suite does not fetch port 5002.
- `npm ci` needs `NODE_AUTH_TOKEN` with `read:packages` before any of this runs locally.

## What to leave alone

- Do not lower `COVERAGE_THRESHOLD` in `validate-test.yml` to make a pull request green.
- Do not move the threshold into `vitest.config.ts` only. CI runs the script so a bare `vitest run` and the gate stay the same command (`npm run test:ci`).
