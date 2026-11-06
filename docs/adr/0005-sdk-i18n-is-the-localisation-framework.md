# ADR 0005: The SDK's /i18n is the localisation framework

**Status:** accepted (pending Architecture Review where it records an exception) · **Date:** 2026-11-06 · **Constitution:** Frontend Architecture Constitution 1.0

## Context

The constitution requires i18next 'or approved platform localization framework'. The SDK provides `/i18n` (`initializeI18n`, `registerNamespace`, `t`, `setLocale`, `formatDate`, `formatMoney`, `problemMessage`) and `/react` `useT`, with locale negotiation (`detect` from P-35's locale), RTL, and namespaces per microfrontend; the shell already initialises it.

## Decision

Localise the shell's text with the SDK's `/i18n`: a `shell` namespace, an English catalogue (`src/shared/i18n/en.json`), `useT('shell')` in components and `t('shell', …)` outside React. No i18next.

## Consequences

One localisation runtime for the shell and its remotes (the locale set once by the shell reaches every remote); no second library in the shared scope.

## Revisit

If platform governance mandates i18next instead.
