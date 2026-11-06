# ADR 0002: No TanStack Query or Zustand in the shell

**Status:** accepted (pending Architecture Review where it records an exception) · **Date:** 2026-11-06 · **Constitution:** Frontend Architecture Constitution 1.0

## Context

The constitution mandates TanStack Query for server state and Zustand for client state. The shell makes two API calls, both at start-up: PUB-1 (resolve a workspace) and P-35 (session context). It has no lists, searches or detail pages. Its client state is one form (email, remember) and a carousel index. Its shared cross-MFE state (user, workspace, session context, locale, sign-out) is, as the constitution requires, owned by the shell, and is exposed through the SDK's `PlatformProvider` and hooks (`useCurrentUser`, `useWorkspace`, `useSessionContext`).

## Decision

The shell adds neither library. Server state: the two calls go through the SDK `ApiClient` (retries, Problem Details) behind the SDK ports. Client state: React state in the component. Shared state: the SDK provider; the session context's late arrival uses a small external store read with `useSyncExternalStore` (`createStore`, the SDK reference shell's pattern). Domain microfrontends (the dashboard) follow the constitution's TanStack Query and Zustand rule; this decision is the shell's only.

## Consequences

No extra runtime dependency shared through Module Federation for two calls; nothing for remotes to version against. An exception to record in Architecture Review.

## Revisit

When the shell gains a server-state screen (a list, a search) or client state shared between its own screens: adopt TanStack Query / Zustand then.
