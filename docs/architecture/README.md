# Architecture diagrams

Standalone Mermaid source. [ARCHITECTURE.md](../../ARCHITECTURE.md) embeds each `.mmd` file as a fenced code block under a `Source:` line. Keep the embedded block identical to the file when either changes; `node .claude/hooks/check-diagrams.mjs` reports any difference (Claude Code runs it after each edit).

| File | Diagram | Section |
|---|---|---|
| [`layer-model.mmd`](mermaid/layer-model.mmd) | The constitution's layers: `app/`, `presentation/`, `application/`, `domain/`, `infrastructure/`, `shared/`, the SDK and the remote | ARCHITECTURE.md § Layer model |
| [`package-dependencies.mmd`](mermaid/package-dependencies.mmd) | TypeScript import direction | ARCHITECTURE.md § Module dependency graph |
| [`bootstrap-flow.mmd`](mermaid/bootstrap-flow.mmd) | The SDK start-up sequence and the session branches | ARCHITECTURE.md § Bootstrap flow |
| [`sign-in-flow.mmd`](mermaid/sign-in-flow.mmd) | Email → PUB-1 → Keycloak realm, PKCE through the SDK | ARCHITECTURE.md § Sign-in flow |
| [`dashboard-load.mmd`](mermaid/dashboard-load.mmd) | `RemoteBoundary`, `loadRemote` from the manifest, and the boundary error | ARCHITECTURE.md § Dashboard load |
| [`api-request-flow.mmd`](mermaid/api-request-flow.mmd) | A call through the SDK `ApiClient` to `/api`: token, correlation, timeout, retries, problems | ARCHITECTURE.md § API request flow |
| [`pub1-resolution-flow.mmd`](mermaid/pub1-resolution-flow.mmd) | Workspace from the URL, the cache or PUB-1 before sign-in | ARCHITECTURE.md § Pre-login workspace resolution (PUB-1) |
| [`session-events.mmd`](mermaid/session-events.mmd) | Expiry, cross-tab sign-out and new-deployment events after render | ARCHITECTURE.md § Session events and cross-tab sync |
| [`data-model.mmd`](mermaid/data-model.mmd) | `Workspace`, `SessionContext`, the shell value, the role map, the sign-in use cases | ARCHITECTURE.md § Data model |
| [`cache-strategy.mmd`](mermaid/cache-strategy.mmd) | HTTP caching and what the browser keeps | ARCHITECTURE.md § Cache strategy |
| [`observability-stack.mmd`](mermaid/observability-stack.mmd) | Telemetry from the bootstrap, the SDK and the boundaries to `/otel` | ARCHITECTURE.md § Observability stack |

Open a `.mmd` file in a Mermaid preview, or paste it into [mermaid.live](https://mermaid.live).

Pipeline diagrams live under [../pipeline/](../pipeline/README.md). They are not part of the browser architecture.
