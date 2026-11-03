# Runbook — image build, Trivy, and smoke

## The contract

`ci.yml` builds one `linux/amd64` image and then scans it and starts it.

| Step | Fails when |
|---|---|
| Hadolint (`build-image`) | `Dockerfile` violates a Hadolint rule. `USER` must be numeric. This image uses uid **101** |
| Digest pin (`validate-quality`) | A `FROM` line is `image:tag` with no `@sha256:` |
| `.dockerignore` | The file is missing |
| `npm audit` (`validate-quality`) | A **high** or **critical** advisory in production dependencies (`npm audit --omit=dev --audit-level=high`) |
| Trivy (`trivy` on pull requests and `main`) | An unfixed **CRITICAL**, **HIGH**, or **UNKNOWN** finding in `web-shell-ci-test` |
| Trivy (`release.yml` `docker`) | An unfixed **CRITICAL** or **HIGH** finding on the tagged image. UNKNOWN is not in this severity list |
| Smoke | The image is over **200 MB**, `/healthz` does not return `ok` within 30s, `/` is not 200 or lacks `id="app"`, or `/remoteEntry.js` is not 200 |

`.trivyignore` is the allowlist both Trivy steps pass as `trivyignores`. Entries need a reason and an expiry comment. An empty ignore file means every finding in scope fails the job.

SARIF upload uses `exit-code: 0` and `continue-on-error` on the upload step. A green Security-tab upload does not mean the table scan passed. The table scan is the one with `exit-code: 1`.

## What you see

- Hadolint prints the rule id on the `Dockerfile` line. DL3066 is the named-user rule. Keep `USER 101` and `--chown=101:101`.
- `validate-quality` prints `Unpinned base image` when `grep` finds a floating `FROM`.
- Trivy prints the CVE table in the job log and writes SARIF for GitHub code scanning.
- Smoke prints `Image size: N MB` and the HTTP status of `/` and `/remoteEntry.js`.

## Reproduce locally

```bash
docker build -t web-shell:local .
docker image inspect web-shell:local --format "{{.Size}}"
docker run -d --name web-shell-smoke -p 18080:8080 web-shell:local
curl -sf http://127.0.0.1:18080/healthz
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18080/
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18080/remoteEntry.js
docker rm -f web-shell-smoke
```

Host port 18080 avoids the local Keycloak process on 8080. Hadolint and Trivy are the same CLIs the workflows invoke. Point Trivy at `web-shell:local` with `--severity CRITICAL,HIGH,UNKNOWN --ignore-unfixed` and `--ignorefile .trivyignore` to match CI.

## What to change

- A new base image needs a digest (`image:tag@sha256:…`) in the same pull request as the tag bump.
- A finding that cannot be patched yet goes in `.trivyignore` with the id, why it cannot be fixed, and when to delete the line. Prefer a base-image bump when the fix is in a newer digest.
- A new URL the orchestrator depends on belongs in `nginx/default.conf` and in `.github/scripts/smoke-tests.sh`.
- Production advisories are fixed with a lockfile bump. `npm audit fix --force` can downgrade `@module-federation/vite`. Read the proposed diff before using `--force`.

## What to leave alone

- Dev-only advisories under `@module-federation/dts-plugin` (the `undici` chain) are outside `npm audit --omit=dev`. They are not a reason to drop `--omit=dev` or to fail every pull request on a toolchain package that is not in the image.
- Do not drop `UNKNOWN` from the CI Trivy severity list to clear a single finding. Use `.trivyignore` for that id, or move the base image.
- The release scan's severity list is `CRITICAL,HIGH` on purpose. Widening it belongs in `release.yml` and this runbook together, not as a one-line edit during a tag.
