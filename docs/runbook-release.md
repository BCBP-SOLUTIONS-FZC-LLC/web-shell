# Runbook — tagged release

## The contract

`.github/workflows/release.yml` runs when a tag matching `vX.Y.Z` or `vX.Y.Z-*` is pushed, or when someone starts the workflow and types that tag.

Order:

1. `validate-test` and `validate-quality` check out that tag.
2. `build` checks the tag is exactly `HEAD` (`verify-release-tag.sh`), checks `CHANGELOG.md` contains `## [X.Y.Z]` (`verify-changelog-entry.sh`), and packs `web-shell_<tag>_dist.tar.gz`.
3. `docker` pushes `ghcr.io/bcbp-solutions-fzc-llc/web-shell`, scans it, writes the CycloneDX SBOM and SLSA provenance, and Cosign-signs the digest.
4. `publish` creates the GitHub Release only after `build` and `docker` succeed. Notes are the changelog section (`extract-release-notes.sh`). Assets are the tarball, `checksums.txt`, `sbom.cyclonedx.json`, and `provenance.slsa.json`.

The image tag drops the `v`. Git tag `v1.2.3` publishes `1.2.3`, `1.2`, `1`, and `latest`. Git tag `v1.2.3-rc.1` publishes `1.2.3-rc.1` and does not move `latest`.

Cosign verify for a tag uses the workflow identity at `refs/tags/…`. A `main` build from `ci.yml` uses `refs/heads/main` or `refs/heads/master`. The commands are in [VERSIONING.md](../VERSIONING.md).

Tagging does not roll a cluster.

## What you see

| Log line | Cause |
|---|---|
| `RELEASE_TAG=… does not match git describe --tags --exact-match` | The workflow ref is not the tagged commit. A manual run must pass the tag that points at the commit you checked out |
| `Missing entry for X.Y.Z` | `CHANGELOG.md` has no `## [X.Y.Z]` heading. The date suffix is optional. The version must not include `v` |
| `Missing entry for X.Y.Z` from `extract-release-notes.sh` | The heading exists but the section body is empty |
| Trivy `exit-code: 1` on the `docker` job | Unfixed CRITICAL or HIGH in the tagged image. The release is not created. See [the image runbook](runbook-image-scan.md) |
| Cosign verify failure | The signature identity does not match `refs/tags/`. A digest signed only by the `main` push uses the `refs/heads` expression |

## Before the tag

```bash
npm run test:ci
npm run build
```

Move `[Unreleased]` notes into `## [X.Y.Z] - YYYY-MM-DD`. Set `package.json` `version` to `X.Y.Z` with no `v`. Commit both, then:

```bash
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

## Build args on the tagged image

`release.yml` passes `BUILD_VERSION` (the tag) and `SOURCE_DATE_EPOCH`, and the registry token as the BuildKit secret `npm_token`. `PLATFORM_ENVIRONMENT` keeps its default, `prod`.

The tagged image is the same for every environment. It ships `public/config/runtime.json` (SDK defaults) and an empty `/remotes/manifest.json`. Each environment serves its own `/config/runtime.json` and `/remotes/manifest.json` over those paths; nothing about Keycloak, the API or the remotes is baked in at build time.

## What to leave alone

- Do not point `publish` at `build` alone. The release assets include the SBOM and provenance produced by `docker`.
- Do not retag `latest` from a pre-release. The `enable` expression is `!contains(env.RELEASE_TAG, '-')`.
- A failed tag can be deleted and pushed again after the changelog or the image fix is on that same commit. Moving the tag to a new commit is a new release only when the changelog section matches the new version.
