# ADR 0003: The SDK's PlatformProvider is the TelemetryProvider

**Status:** accepted (pending Architecture Review where it records an exception) · **Date:** 2026-11-06 · **Constitution:** Frontend Architecture Constitution 1.0

## Context

The constitution requires OpenTelemetry, correlation ids, structured logging, error boundaries and distributed tracing, with a `TelemetryProvider` wrapped at bootstrap.

## Decision

The bootstrap initialises the SDK's telemetry before rendering (`initializeTracing`, `initializeLogging`, `initializeMetrics`, `installGlobalErrorHandlers`, `startWebVitals`) and renders inside the SDK's `PlatformProvider` (`app/providers/ShellRoot`), which gives every component and remote the tracer, logger, correlation context and route templates. Error boundaries are the SDK's `RemoteBoundary` / `MFEErrorBoundary`. There is no separate `TelemetryProvider` component.

## Consequences

One telemetry set-up for the shell and every remote, owned by the SDK, consent-gated (essential only in v1), following the Enterprise Platform Observability Standard (`docs/observability.md`).

## Revisit

If the platform publishes a `TelemetryProvider` component: wrap with it.
