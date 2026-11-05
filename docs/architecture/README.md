# Architecture diagrams

Standalone Mermaid source. [ARCHITECTURE.md](../../ARCHITECTURE.md) embeds each `.mmd` file as a fenced code block under a `Source:` line. Keep the embedded block identical to the file when either changes; `node .claude/hooks/check-diagrams.mjs` reports any difference (Claude Code runs it after each edit).

| File | Diagram | Section |
|---|---|---|
| [`layer-model.mmd`](mermaid/layer-model.mmd) | Entry, UI, platform ports, SDK, remote, build, and image | ARCHITECTURE.md § Layer model |
| [`package-dependencies.mmd`](mermaid/package-dependencies.mmd) | TypeScript import direction | ARCHITECTURE.md § Module dependency graph |
| [`bootstrap-flow.mmd`](mermaid/bootstrap-flow.mmd) | The SDK start-up sequence and the session branches | ARCHITECTURE.md § Bootstrap flow |
| [`sign-in-flow.mmd`](mermaid/sign-in-flow.mmd) | Email → PUB-1 → Keycloak realm, PKCE through the SDK | ARCHITECTURE.md § Sign-in flow |
| [`dashboard-load.mmd`](mermaid/dashboard-load.mmd) | `RemoteBoundary`, `loadRemote` from the manifest, and the boundary error | ARCHITECTURE.md § Dashboard load |

Open a `.mmd` file in a Mermaid preview, or paste it into [mermaid.live](https://mermaid.live).

Pipeline diagrams live under [../pipeline/](../pipeline/README.md). They are not part of the browser architecture.
