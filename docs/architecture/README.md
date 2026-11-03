# Architecture diagrams

Standalone Mermaid source. [ARCHITECTURE.md](../../ARCHITECTURE.md) embeds each `.mmd` file as a fenced code block under a `Source:` line. Keep the embedded block identical to the file when either changes.

| File | Diagram | Section |
|---|---|---|
| [`layer-model.mmd`](mermaid/layer-model.mmd) | Entry, UI, auth, remote, build, and image | ARCHITECTURE.md § Layer model |
| [`package-dependencies.mmd`](mermaid/package-dependencies.mmd) | TypeScript import direction | ARCHITECTURE.md § Module dependency graph |
| [`bootstrap-flow.mmd`](mermaid/bootstrap-flow.mmd) | Callback capture and the `runId` bootstrap | ARCHITECTURE.md § Bootstrap flow |
| [`sign-in-flow.mmd`](mermaid/sign-in-flow.mmd) | PKCE redirect and token exchange | ARCHITECTURE.md § Sign-in flow |
| [`dashboard-load.mmd`](mermaid/dashboard-load.mmd) | Lazy `app2/App` and the error boundary | ARCHITECTURE.md § Dashboard load |

Open a `.mmd` file in a Mermaid preview, or paste it into [mermaid.live](https://mermaid.live).

Pipeline diagrams live under [../pipeline/](../pipeline/README.md). They are not part of the browser architecture.
