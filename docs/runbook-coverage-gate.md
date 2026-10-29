# Runbook — validate-test

## The contract

`.github/workflows/validate-test.yml` is the reusable test job for pull requests, pushes to `main`, and release tags.

1. `npm ci`
2. `npm run test:coverage` (Vitest unit, integration, and end-to-end)
3. `.github/scripts/coverage-gate.mjs`
4. Upload the `coverage/` directory as an artifact
5. `npm run build` (`tsc`, then the production bundle)

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

- Cover the lines the report names. Auth modules read `import.meta.env` at load time. Stub the env, then import through `test/helpers/load-auth.ts` (`vi.resetModules()`). A static import keeps the first snapshot.
- An unconfigured Keycloak case uses a whitespace env value such as `' '`. `env()` trims that to empty. An empty-string stub is unreliable.
- `app2/App` is aliased to `test/fixtures/DashboardApp.tsx`. Set `globalThis.__DASHBOARD_THROW__` to exercise the error boundary. The suite does not fetch port 5002.

## What to leave alone

- Do not lower `COVERAGE_THRESHOLD` in `validate-test.yml` to make a pull request green.
- Do not move the threshold into `vitest.config.ts` only. CI runs the script so a bare `vitest run` and the gate stay the same command (`npm run test:ci`).
