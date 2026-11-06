# ADR 0008: Tests stay in test/ at the repository root

**Status:** accepted (pending Architecture Review where it records an exception) · **Date:** 2026-11-06 · **Constitution:** Frontend Architecture Constitution 1.0

## Context

The constitution's folder structure lists `src/tests/`. web-shell's tests are in `test/{unit,integration,e2e,browser,smoke,fixtures}`, like platform-reactcommon's, with separate configs (Vitest, the smoke config, Playwright).

## Decision

Keep `test/` at the root. The layers are explicit there, `src/` stays the shipped code only (coverage, bundle and lint scopes stay simple), and it matches the SDK's repositories.

## Consequences

Nothing to change in tooling. Test imports follow the `src/` restructure.

## Revisit

If platform governance requires `src/tests/` everywhere.
