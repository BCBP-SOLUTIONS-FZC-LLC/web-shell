# Versioning and releases

This repository is a **deployed micro-frontend shell**, not an npm library other apps install — `package.json` is `"private": true` and its `name` (`web-shell`) is only an identifier, not something another package can `npm install`. What gets versioned here is the **container image** (`ghcr.io/bcbp-solutions-fzc-llc/web-shell`) and the **static bundle** attached to the GitHub Release, plus the runtime contract hosts, the dashboard remote (`dashboard`), and operators depend on. Versions are published with **Git tags** and described in [CHANGELOG.md](./CHANGELOG.md).

This document follows the same SemVer / image-tag / maintainer-process layout as [`iam-org-membership/VERSIONING.md`](https://github.com/BCBP-SOLUTIONS-FZC-LLC/iam-org-membership/blob/main/VERSIONING.md). There is no Helm chart in this repo, so the deploy step of that service's release workflow is not part of this one.

## Semantic versioning (SemVer)

We use [SemVer 2.0.0](https://semver.org/): `MAJOR.MINOR.PATCH` (e.g. `v1.2.3`).

| Bump | When you change | Examples |
|------|-----------------|----------|
| **MAJOR** | Breaking change in the runtime contract (§ below) | Renaming the remote (`dashboard`) or its container global, removing or changing a field of the `PlatformProvider` shell value the remote reads (the shell passes remotes no props), moving to an SDK major (or an alpha `N`) that refuses remotes built against the current one, removing a route, changing the redirect path or the `/t/<slug>/` prefix, requiring a new runtime config key, removing `/healthz` or `/`, changing the image listen port |
| **MINOR** | New backward-compatible capability | An SDK minor bump within the same major (remotes built against the older minor still load), a new optional runtime config key, a new route that does not remove an existing one, a new remote |
| **PATCH** | Backward-compatible fix | Sign-in or routing bug fix, visual fix that does not change the federation contract, dependency bump with no observable behavior change, documentation-only correction |

### What counts as the runtime contract

This shell has no package for another app to import from npm. Its public contract is what a browser, a Module Federation host, the dashboard remote, and an operator can rely on after the image is deployed.

| In scope (SemVer applies) | Out of scope (may change without MAJOR) |
|---------------------------|------------------------------------------|
| The shell's SDK version (`@bcbp-solutions-fzc-llc/frontend-sdk`, shared as a strict singleton). A remote requires at least the SDK version it was built against | Internal file layout under `src/`, component names, CSS class names |
| `dashboard` `./App` gets no props: the remote reads the signed-in user (`useCurrentUser`) and sign-out (`useSignOut`) from the SDK this shell provides through `PlatformProvider` (`user`, `signOut`) | The dashboard's own UI. That remote is versioned in its own repository |
| Shared singletons from `@bcbp-solutions-fzc-llc/webpack-preset`: `react` and `react-dom` `^19.0.0`, `@opentelemetry/api` `~1.10.0`, every SDK subpath | Patch-level upgrades inside those ranges |
| Routes `/t/<slug>/dashboard/*` (remote dashboard), the catch-all redirect to `/dashboard`, and the callback path `/auth/callback` | Copy, theme class names, the login-page feature list, and the session screens' wording |
| `/config/runtime.json` keys the shell relies on (the SDK schema) and the `/remotes/manifest.json` format; the IAM endpoints it calls (PUB-1, P-35); build args `PLATFORM_ENVIRONMENT` and `BUILD_VERSION` | The default `public/config/runtime.json` the image ships. Each environment serves its own |
| Image listen port **8080**, `GET /healthz` (plain `ok`), `GET /` (shell document), `GET /config/runtime.json`, `GET /remotes/manifest.json` and `GET /version.json` (no-cache), hashed files under `/assets/` | nginx config comments, cache headers on files other than the ones named here |
| `package.json` `version` once a tag exists — it must match the Git tag without the `v` | The npm package name `web-shell`. It is not published |

`/config/runtime.json` is served to every browser. It is public. Do not put secrets in it.

### Guarantees

- **Pre-`v1.0.0` (current status):** per [SemVer §4](https://semver.org/#spec-item-4), anything may change at any time while the major version is `0`. Tags exist (`v0.1.0`, `v0.2.0`), but the major version is `0`, so the contract is not yet stable. The table above still indicates what is *more* disruptive than what within `v0.x`, but a host should not yet assume `v0.x` compatibility across a MINOR bump the way it could once `v1.0.0` ships.
- **MAJOR (once `v1` ships):** breaking changes to the runtime contract ship as `v2.0.0` with migration notes in the CHANGELOG.
- **MINOR:** safe to roll the image forward without rebuilding the dashboard remote or changing the environment's runtime config, unless you opt into a new capability.
- **PATCH:** drop-in image replacement. Upgrade recommended for security fixes. Every image is CVE-scanned (see below).

## Supported releases

| Version | Status | Image tag | Notes |
|---------|--------|-----------|-------|
| `v0.2.0` | **Current** (pre-1.0) | `0.2.0`, `0.2`, `0`, `latest` | Remote renamed `dashboard` (breaking): pairs with mfe-dashboard `v0.3.0`+. [CHANGELOG § 0.2.0](CHANGELOG.md). No support window: pre-1.0, so a minor may break compatibility (see below) |
| `v0.1.0` | Superseded | `0.1.0`, `0.1` | First release; SDK `1.0.0-alpha.5`; remote `app2`: pairs with mfe-dashboard `v0.1.1`–`v0.2.0` only. Release commit `861fdb5` |

This shell has no formal support-window policy yet, since nothing is running in production against a tagged release. Once a `v1.0.0` ships, this section will define how long a superseded major line receives security-only fixes.

## Consume a release

Do not add this repository as an npm dependency. Run the **shell image** (or serve the static bundle from the GitHub Release), serve the environment's `/config/runtime.json` and `/remotes/manifest.json` over the defaults, and let the SDK load `dashboard` from the manifest.

### Pull and verify the image

A tag publishes the image (`release.yml`; `v0.1.0` and `v0.2.0` are released):

```bash
# Git tag v0.1.0 publishes the image as 0.1.0 (the v prefix is not part of the image tag)
docker pull ghcr.io/bcbp-solutions-fzc-llc/web-shell:0.1.0
```

Images are published from a release tag (`release.yml`) and from every push to `main` (`ci.yml`, tagged by commit; see CI below). Every image pushed from `ci.yml` is signed keylessly via Sigstore/Cosign (no long-lived key). Verify before deploying:

```bash
# main-branch builds (signed by ci.yml's push job)
cosign verify \
  --certificate-identity-regexp "^https://github\.com/BCBP-SOLUTIONS-FZC-LLC/web-shell/.github/workflows/.*@refs/heads/(main|master)$" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/bcbp-solutions-fzc-llc/web-shell@<digest>
```

Tagged releases, published by `.github/workflows/release.yml`, use `@refs/tags/` in the identity regexp:

```bash
# tagged releases (signed by release.yml's docker job)
cosign verify \
  --certificate-identity-regexp "^https://github\.com/BCBP-SOLUTIONS-FZC-LLC/web-shell/.github/workflows/.*@refs/tags/.*$" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/bcbp-solutions-fzc-llc/web-shell@<digest>
```

The container listens on port **8080** as uid **101**. `GET /healthz` returns `ok`.

### Image tag scheme

The Git tag keeps the `v` (`v1.2.3`). `release.yml`'s `docker/metadata-action` step uses `{{version}}`, which strips that prefix, so the image tags are:

| Tag pattern | Produced for | Example (Git tag `v1.2.3`) |
|-------------|--------------|----------------------------|
| `MAJOR.MINOR.PATCH` | Every release | `1.2.3` |
| `MAJOR.MINOR` | Stable releases | `1.2` |
| `MAJOR` | Stable releases | `1` |
| `latest` | Stable releases only (no pre-release suffix) | `latest` |

A pre-release Git tag such as `v1.2.3-rc.1` publishes `1.2.3-rc.1` only. It does not move `1.2`, `1`, or `latest`.

Separately, `ci.yml` pushes the image on every push to `main` or `master` with the branch name (`main` or `master`) and `sha-<short>` tags. Pin production by a **release tag or digest**, not `latest` or an untagged `main` build.

| Pin style | Use when |
|-----------|----------|
| `MAJOR.MINOR.PATCH` (for example `1.2.3`) | Production; exact reproducibility (recommended) |
| `MAJOR.MINOR` | Accept PATCH updates automatically |
| `MAJOR` | Accept MINOR and PATCH updates automatically — not recommended before `v1.0.0` |
| `latest` / `main` | Local or dev experiments only; never production |

The image is the same for every environment: Keycloak origin, client id, API base and remotes are read from `/config/runtime.json` at run time. The environment itself is now read there too (`environment`, SDK alpha.6): one image is promoted through every environment. `PLATFORM_ENVIRONMENT` (default `prod`) is only the fallback for a `runtime.json` without the key, and goes away once every deployed file names its environment.

### Static bundle

The GitHub Release also attaches `web-shell_<tag>_dist.tar.gz` (the Rsbuild `dist/` tree, without source maps), `checksums.txt`, `sbom.cyclonedx.json`, and `provenance.slsa.json`. Use the image for deployment. The tarball is for hosts that serve the files themselves and must still provide the same nginx paths (`/healthz` is added by this repo's nginx config and is not inside the tarball).

## Maintainer release process

`.github/workflows/release.yml` implements validate → build (CHANGELOG gate) → docker (CVE scan, SBOM, sign) → publish. `ci.yml`'s push to `main` (image to GHCR, Cosign, branch and SHA tags) keeps running independently of tagging.

There is no cluster deploy gate. Publishing a tag does not deploy the shell. An operator rolls the new image tag after the GitHub Release exists.

When cutting a tagged release:

1. **Merge** all changes for the release to `main`.

2. **Update `CHANGELOG.md`:** move `[Unreleased]` entries into a new `## [X.Y.Z] - YYYY-MM-DD` section. `release.yml`'s `build` job runs `.github/scripts/verify-changelog-entry.sh`, which fails the release if `## [X.Y.Z]` is missing. Cut the section before tagging.

3. **Bump `package.json` `version`** to `X.Y.Z` (no `v` prefix). Nothing copies the Git tag into `package.json` automatically. Keep them the same so `/version.json` (built from `BUILD_VERSION`) and the image tag do not diverge.

4. **Run the local gate** before tagging:

   ```bash
   npm run lint      # ESLint with the platform rules
   npm run arch-lint # component boundaries (.dependency-cruiser.cjs)
   npm run typecheck # sources and tests
   npm run metrics-check # observability standard
   npm run test:ci   # unit, integration and e2e, then the 95% coverage gate
   npm run build     # tsc and the production bundle
   ```

   `npm run test:ci` runs `.github/scripts/coverage-gate.mjs`. The threshold is **95%** for statements, branches, functions, and lines. It is not lowered for this repo.

5. **Create and push an annotated tag.** This triggers `release.yml`:

   ```bash
   git tag -a v0.1.0 -m "v0.1.0"
   git push origin v0.1.0
   ```

   Or run the workflow manually (`workflow_dispatch`) with the existing tag name.

6. **The release workflow** (`.github/workflows/release.yml`) runs:
   - `validate-test` / `validate-quality` — the same reusable gates `ci.yml` uses, checked out at the tag. Test runs the suite and the 95% coverage gate, then `npm run build`. Quality runs ESLint, arch-lint, metrics-check and the typecheck, and checks workflow hygiene, digest-pinned `FROM` lines, and `npm audit` for production dependencies.
   - `build` — verifies the tag matches HEAD (`verify-release-tag.sh`), verifies the CHANGELOG section (`verify-changelog-entry.sh`), and packs `dist/` without source maps as `web-shell_<tag>_dist.tar.gz` (`prepare-release-asset.sh`).
   - `docker` — builds the `linux/amd64` image and pushes it **by digest only**, fails the release on unfixed CRITICAL/HIGH CVEs, writes a CycloneDX SBOM and SLSA provenance, signs with Cosign, verifies the signature, and only then adds the semver tags and `latest` (see the tag scheme above; `.github/scripts/tag-signed-image.sh` checks every tag resolves to the signed digest). A failure before that leaves an untagged digest: no version tag or `latest` moves.
   - `publish` — creates the GitHub Release from the CHANGELOG section and attaches the tarball, checksums, SBOM, and provenance. It runs only after `build` and `docker` succeed.

7. **Notify consumers** — whoever hosts the shell image, and the dashboard remote (`dashboard`) if the SDK version or the `PlatformProvider` shell value (`user`, `signOut`, `workspace`, `context`) changed. Call out any new required runtime config key.

### Pre-release tags (optional)

| Tag pattern | Meaning |
|-------------|---------|
| `v1.1.0-rc.1` | Release candidate. Image tag `1.1.0-rc.1`. Not for production unless approved |
| `v1.1.0-beta.1` | Early integration testing. Image tag `1.1.0-beta.1` |

Both match the `v[0-9]*.[0-9]*.[0-9]*-*` tag trigger and produce a signed, scanned image. They do not move `latest`, `MAJOR`, or `MAJOR.MINOR`.

## Compatibility matrix

| web-shell | Node | React | Platform SDK | Dashboard remote |
|-----------|------|-------|--------------|------------------|
| Unreleased (`main`) | 26 (image builder `node:26-bookworm`, CI `node-version: 26`) | `^19.0.0` (strict singleton, from the preset) | `@bcbp-solutions-fzc-llc/*` `1.0.0-alpha.6`, all three on one version | From `/remotes/manifest.json`. Must be built with `webpack-preset` `1.0.0-alpha.4`, `alpha.5` or `alpha.6` (container global `__platform_mfe_<name>`; a remote requires `^<its SDK>`, so never newer than this shell's); an alpha.3 build defines the old global, which this shell does not read. Not versioned in this repo |
| `0.2.0` | 26 | `^19.0.0` | `1.0.0-alpha.5`, all three | Remote `dashboard` (container `__platform_mfe_dashboard`): mfe-dashboard `v0.3.0` (alpha.5). A dashboard built on alpha.6 needs a shell on alpha.6 (`main`) |
| `0.1.0` | 26 | `^19.0.0` | `1.0.0-alpha.5`, all three | Remote `app2`: mfe-dashboard `v0.1.1`–`v0.2.0` |

Keycloak itself is not a library dependency of the image. The shell talks to the `auth.idpOrigin` and `auth.clientId` in `/config/runtime.json`, and to the realm PUB-1 resolves for the workspace. The runtime image is nginx and the static files.

## Related files

| File | Purpose |
|------|---------|
| [CHANGELOG.md](./CHANGELOG.md) | User-facing history per version: released sections `0.1.0` and `0.2.0`; `[Unreleased]` for `main` |
| [README.md](./README.md) | What the shell is |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Module layout, bootstrap, sign-in flow, storage, threat model |
| [docs/lld/web-shell-lld.md](./docs/lld/web-shell-lld.md) | Low-level design; §14 compatibility |
| [docs/pipeline/README.md](./docs/pipeline/README.md) | Job order for CI and release, and links to the runbooks |
| [.github/workflows/ci.yml](./.github/workflows/ci.yml) | Pull-request and `main` pipeline: test, image build, Trivy, smoke, Cosign on push |
| [.github/workflows/release.yml](./.github/workflows/release.yml) | Tag-triggered release: validate → build → docker → publish |
| [.github/workflows/validate-test.yml](./.github/workflows/validate-test.yml) | Unit, integration, e2e, 95% coverage gate, production build |
| [.github/scripts/coverage-gate.mjs](./.github/scripts/coverage-gate.mjs) | Fails the build when coverage is under 95% |
| [rsbuild.config.ts](./rsbuild.config.ts) | Platform plugin (shared singletons, chunk integrity), build constants |
| [public/config/runtime.json](./public/config/runtime.json) | Runtime config the image ships by default |
| [Dockerfile](./Dockerfile) | Digest-pinned Node builder and nginx runtime |
| [package.json](./package.json) | Package version. Must match the Git tag when one is cut |
