# ADR 0004: The runtime config schema is the platform SDK's

**Status:** accepted (pending Architecture Review where it records an exception) · **Date:** 2026-11-06 · **Constitution:** Frontend Architecture Constitution 1.0

## Context

The constitution's example `runtime.json` has `environment`, `apiBaseUrl`, `keycloakUrl`, `appUrl`, `telemetryEnabled`. The SDK validates `/config/runtime.json` strictly (unknown keys refused) with its own schema: `environment` (alpha.6), `api.baseUrl`, `auth.idpOrigin` / `clientId` / realm settings, `auth.signInUrl` (alpha.5), `telemetry.*`, `remotes.*`, `i18n.*`, `flags`, `appUpdate`.

## Decision

web-shell uses the SDK's schema as is. The constitution's example keys map to it: `environment` → `environment`; `apiBaseUrl` → `api.baseUrl`; `keycloakUrl` → `auth.idpOrigin`; `appUrl` → `auth.signInUrl` (for standalone remotes); `telemetryEnabled` → `telemetry.enabled`. Remote entries are in `/remotes/manifest.json` (the constitution allows runtime.json or a federation manifest).

## Consequences

One schema for the shell and every remote, validated before anything runs; no shell-specific keys. Build once, deploy everywhere: since alpha.6 the environment is in the file too.

## Revisit

If the platform changes the schema (it does, additively, per SDK release).
