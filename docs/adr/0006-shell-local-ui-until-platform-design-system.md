# ADR 0006: Shell-local UI components until platform-design-system exists

**Status:** accepted (pending Architecture Review where it records an exception) · **Date:** 2026-11-06 · **Constitution:** Frontend Architecture Constitution 1.0

## Context

The constitution requires UI components from `platform-design-system`. There is no such repository in the organisation (checked 2026-11-06). The shell's screens use Tailwind 4 and daisyUI with a few local components (`BrandLogo`, `PageLinks`, the session dialogs' `Dialog` and `Button`), self-hosted fonts, and pass WCAG 2.1 AA checks (axe, three browsers).

## Decision

Keep the shell-local components, in `src/presentation/components/`, until `platform-design-system` is published. Add no new component library in the meantime.

## Consequences

A small, contained set of components to swap later; nothing domain-specific.

## Revisit

When `platform-design-system` publishes a first version: replace `Button`, `Dialog`, form inputs and typography with it.
