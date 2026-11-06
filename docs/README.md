# Docs

Operator material for `web-shell`. Product setup stays in the repository [README](../README.md). Version rules stay in [VERSIONING.md](../VERSIONING.md).

| Area | What it is |
|---|---|
| [lld/web-shell-lld.md](lld/web-shell-lld.md) | Low-level design: the shell's contract, start-up order, flows, hosting, tests, open items |
| [architecture/](architecture/README.md) | Mermaid sources embedded in [ARCHITECTURE.md](../ARCHITECTURE.md) |
| [pipeline/](pipeline/README.md) | What `ci.yml` and `release.yml` run, and in which order |
| [runbook-coverage-gate.md](runbook-coverage-gate.md) | A red `validate-test` job |
| [runbook-image-scan.md](runbook-image-scan.md) | Hadolint, digest pin, Trivy, or the smoke job |
| [architecture/constitution-assessment.md](architecture/constitution-assessment.md) | web-shell against the Frontend Architecture Constitution 1.0: assessment, violations, target architecture, folder plan, dependency rules, roadmap |
| [adr/](adr/README.md) | Architecture decision records (constitution deviations and choices) |
| [observability.md](observability.md) | The observability standard for the shell: tiers, identity labels, metric inventory, adding a metric |
| [runbook-startup-failure.md](runbook-startup-failure.md) | `the app could not start` errors: the alert, and what to check |
| [hosting-without-cloudfront.md](hosting-without-cloudfront.md) | Deploying before CloudFront exists: ingress routing, mounted CSP and HSTS, what to undo later |
| [runbook-release.md](runbook-release.md) | A tag that does not publish |

This shell has no metrics registry, Helm chart, or schema registry. Those documents in `iam-org-membership` have no counterpart here.
