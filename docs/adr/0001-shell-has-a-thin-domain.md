# ADR 0001: The shell has a thin domain layer

**Status:** accepted (pending Architecture Review where it records an exception) · **Date:** 2026-11-06 · **Constitution:** Frontend Architecture Constitution 1.0

## Context

web-shell is the shell (constitution, Module Federation: navigation, layout, authentication bootstrap, runtime configuration, shared providers, MFE registration). It owns no business domain: tenders, contracts and the dashboard's screens belong to their microfrontends, and identity, sessions and workspaces are modelled by the platform SDK (`/auth` types `Workspace`, `SessionContext`, ports `WorkspaceResolver`, `SessionContextSource`).

## Decision

`src/domain/` holds only what is the shell's own and framework-free: the role map (`rules/permissions.ts`, IAM's closed role set → UI permissions), the identifier rule (`rules/identifier.ts`, what the sign-in box accepts and may remember) and the repository contracts the shell defines (`repositories/rememberedEmail.ts`). The SDK's ports are the other domain contracts; the shell does not redefine them. There are no shell entities or value objects; `application/` holds the few use cases the screens need.

*Note (2026-11-24): later rules — `rules/workspaceAccess.ts` (P-35 refusal → workspace state, A6/A8); `rules/workspaceBanners.ts` (which banner to whom, the read-only date, A5); `repositories/workspaceStatus.ts` (`WorkspaceStatusSource`, `UpgradeWelcomeRepository`, defined by the shell). `TenantStatus`, `SeatUsage` and `WorkspaceBanner` are plain data shapes for P-1/P-27, not entities. `errors.ts` (`WorkspaceNotFoundError`) also lives here.*

## Consequences

The constitution's layering applies (presentation → application → domain; infrastructure implements domain contracts) without inventing entities for a domain the shell does not have. A domain rule added later (for example a tenant plan rule) goes to `domain/rules/`.

## Revisit

If the shell takes on a real domain of its own (it should not; that would be a new microfrontend).
