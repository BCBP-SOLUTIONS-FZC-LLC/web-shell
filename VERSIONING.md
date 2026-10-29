# Versioning and releases

This repository is a **deployed micro-frontend shell**, not an npm library other apps install — `package.json` is `"private": true` and its `name` (`app1`) exists so the Module Federation container has an identity, not so another package can `npm install` it. What gets versioned here is the **container image** (`ghcr.io/bcbp-solutions-fzc-llc/web-shell`) and the **static bundle** attached to the GitHub Release, plus the runtime contract hosts, the dashboard remote (`app2`), and operators depend on. Versions are published with **Git tags** and described in [CHANGELOG.md](./CHANGELOG.md).

This document follows the same SemVer / image-tag / maintainer-process layout as [`iam-org-membership/VERSIONING.md`](https://github.com/BCBP-SOLUTIONS-FZC-LLC/iam-org-membership/blob/main/VERSIONING.md). There is no Helm chart in this repo, so the deploy step of that service's release workflow is not part of this one.

## Semantic versioning (SemVer)

We use [SemVer 2.0.0](https://semver.org/): `MAJOR.MINOR.PATCH` (e.g. `v1.2.3`).

| Bump | When you change | Examples |
|------|-----------------|----------|
| **MAJOR** | Breaking change in the runtime contract (§ below) | Renaming the federation container or `remoteEntry.js`, removing `./App` or changing its props so a host cannot mount it, dropping a shared singleton or raising `requiredVersion` so a remote cannot load, removing `/healthz` or `/`, removing a required `VITE_*` build arg, changing the image listen port |
| **MINOR** | New backward-compatible capability | A new optional `VITE_*` build arg, a new exposed module, a new route that does not remove an existing one, a new shared dependency that stays optional for current remotes |
| **PATCH** | Backward-compatible fix | Sign-in or routing bug fix, visual fix that does not change the federation contract, dependency bump with no observable behavior change, documentation-only correction |

### What counts as the runtime contract

This shell has no package for another app to import from npm. Its public contract is what a browser, a Module Federation host, the dashboard remote, and an operator can rely on after the image is deployed.

| In scope (SemVer applies) | Out of scope (may change without MAJOR) |
|---------------------------|------------------------------------------|
| Federation container `name` (`app1`), `filename` (`remoteEntry.js`), and `exposes['./App']` in `module-federation.config.ts` | Internal file layout under `src/`, component names that are not the exposed `./App`, CSS class names |
| Props the shell passes into the `app2` dashboard remote: `userLabel` (string) and `onLogout` (function) | The dashboard's own UI. That remote is versioned in its own repository |
| Shared singletons and their `requiredVersion`: `react` `^19.3.0`, `react-dom` `^19.3.0`, `react-router-dom` `^7.18.4` | Patch-level upgrades inside those ranges |
| Routes `/` (login, or redirect to `/dashboard` when signed in), `/dashboard/*` (remote dashboard when signed in, otherwise login), and the catch-all redirect | Copy, theme class names, and the login-page feature list |
| Required build-time env **names and semantics**: `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID`. Optional: `VITE_KEYCLOAK_REDIRECT_URI` (default `{origin}/dashboard`), `VITE_APP2_URL` (dashboard `remoteEntry.js` origin) | The default values baked in when a GitHub Actions variable is unset (`http://localhost:8080`, `http://localhost:5002`). Those are dev defaults. A production image must set the variables |
| Image listen port **8080**, `GET /healthz` (plain `ok`), `GET /` (shell document), `GET /remoteEntry.js` and `GET /mf-manifest.json` (no-cache), hashed files under `/assets/` | nginx config comments, cache headers on files other than the ones named here |
| `package.json` `version` once a tag exists — it must match the Git tag without the `v` | The npm package name `app1`. It is not published |

`VITE_*` values are compiled into the browser bundle. They are public. Do not put secrets in them.

### Guarantees

- **Pre-`v1.0.0` (current status):** per [SemVer §4](https://semver.org/#spec-item-4), anything may change at any time while the major version is `0`. This shell has not yet committed to a stable contract via a Git tag. The table above still indicates what is *more* disruptive than what within `v0.x`, but a host should not yet assume `v0.x` compatibility across a MINOR bump the way it could once `v1.0.0` ships.
- **MAJOR (once `v1` ships):** breaking changes to the runtime contract ship as `v2.0.0` with migration notes in the CHANGELOG.
- **MINOR:** safe to roll the image forward without changing the host's import of `app1/App` or the dashboard's shared React versions, unless you opt into a new capability.
- **PATCH:** drop-in image replacement. Upgrade recommended for security fixes. Every image is CVE-scanned (see below).

## Supported releases

| Version | Status | Image tag | Notes |
|---------|--------|-----------|-------|
| *(none tagged)* | **Unreleased** | — | [CHANGELOG.md](CHANGELOG.md) lives entirely under `[Unreleased]`. `package.json` `version` is `0.0.0` and is not a published release. No support window has started |
| `< v0.1.0` | — | — | No tagged Git releases |

This shell has no formal support-window policy yet, since nothing is running in production against a tagged release. Once a `v1.0.0` ships, this section will define how long a superseded major line receives security-only fixes.

## Consume a release

Do not add this repository as an npm dependency. Load it as the **shell container** (or the static bundle from the GitHub Release) and let Module Federation load `app2` from `VITE_APP2_URL`.

### Pull and verify the image

Once a tag exists:

```bash
# Git tag v0.1.0 publishes the image as 0.1.0 (the v prefix is not part of the image tag)
docker pull ghcr.io/bcbp-solutions-fzc-llc/web-shell:0.1.0
```

**Today** only images from a push to `main` or `master` are published (see CI below). Every image pushed from `ci.yml` is signed keylessly via Sigstore/Cosign (no long-lived key). Verify before deploying:

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

`VITE_KEYCLOAK_URL` and `VITE_APP2_URL` are image **build args**. Set the GitHub Actions variables of the same name before a production build. If they are unset, the image is built with `http://localhost:8080` and `http://localhost:5002`.

### Static bundle

The GitHub Release also attaches `web-shell_<tag>_dist.tar.gz` (the Vite `dist/` tree), `checksums.txt`, `sbom.cyclonedx.json`, and `provenance.slsa.json`. Use the image for deployment. The tarball is for hosts that serve the files themselves and must still provide the same nginx paths (`/healthz` is added by this repo's nginx config and is not inside the tarball).

## Maintainer release process

`.github/workflows/release.yml` implements validate → build (CHANGELOG gate) → docker (CVE scan, SBOM, sign) → publish. `ci.yml`'s push to `main` (image to GHCR, Cosign, branch and SHA tags) keeps running independently of tagging.

There is no cluster deploy gate. Publishing a tag does not deploy the shell. An operator rolls the new image tag after the GitHub Release exists.

When cutting a tagged release:

1. **Merge** all changes for the release to `main`.

2. **Update `CHANGELOG.md`:** move `[Unreleased]` entries into a new `## [X.Y.Z] - YYYY-MM-DD` section. `release.yml`'s `build` job runs `.github/scripts/verify-changelog-entry.sh`, which fails the release if `## [X.Y.Z]` is missing. Cut the section before tagging.

3. **Bump `package.json` `version`** to `X.Y.Z` (no `v` prefix). Nothing copies the Git tag into `package.json` automatically. Keep them the same so the federation package version and the image tag do not diverge.

4. **Run the local gate** before tagging:

   ```bash
   npm run test:ci   # unit, integration, e2e, then the 95% coverage gate
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
   - `validate-test` / `validate-quality` — the same reusable gates `ci.yml` uses, checked out at the tag. Test runs the suite and the 95% coverage gate, then `npm run build`. Quality checks workflow hygiene, digest-pinned `FROM` lines, and `npm audit` for production dependencies.
   - `build` — verifies the tag matches HEAD (`verify-release-tag.sh`), verifies the CHANGELOG section (`verify-changelog-entry.sh`), and packs `dist/` as `web-shell_<tag>_dist.tar.gz` (`prepare-release-asset.sh`).
   - `docker` — builds and pushes the semver-tagged `linux/amd64` image (see the tag scheme above), fails the release on unfixed CRITICAL/HIGH CVEs, writes a CycloneDX SBOM and SLSA provenance, signs with Cosign, and verifies the signature.
   - `publish` — creates the GitHub Release from the CHANGELOG section and attaches the tarball, checksums, SBOM, and provenance. It runs only after `build` and `docker` succeed.

7. **Notify consumers** — whoever hosts the shell image, and the dashboard remote (`app2`) if shared React ranges or the `userLabel` / `onLogout` props changed. Call out any new required `VITE_*` build arg.

### Pre-release tags (optional)

| Tag pattern | Meaning |
|-------------|---------|
| `v1.1.0-rc.1` | Release candidate. Image tag `1.1.0-rc.1`. Not for production unless approved |
| `v1.1.0-beta.1` | Early integration testing. Image tag `1.1.0-beta.1` |

Both match the `v[0-9]*.[0-9]*.[0-9]*-*` tag trigger and produce a signed, scanned image. They do not move `latest`, `MAJOR`, or `MAJOR.MINOR`.

## Compatibility matrix

| web-shell | Node | React | react-router-dom | Dashboard remote |
|-----------|------|-------|------------------|------------------|
| Unreleased (`main`) | 22 (image builder `node:22-bookworm`, CI `node-version: 22`) | `^19.3.0` (singleton) | `^7.18.4` (singleton) | Loaded at runtime from `VITE_APP2_URL/remoteEntry.js`. Not versioned in this repo |

Keycloak itself is not a library dependency of the image. The shell talks to whatever `VITE_KEYCLOAK_URL` / `VITE_KEYCLOAK_REALM` / `VITE_KEYCLOAK_CLIENT_ID` were set to at **build** time. The runtime image is nginx and the static files.

## Related files

| File | Purpose |
|------|---------|
| [CHANGELOG.md](./CHANGELOG.md) | User-facing history per version. Currently entirely `[Unreleased]` |
| [README.md](./README.md) | What the shell is |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Module layout, sign-in flow, storage, threat model |
| [docs/pipeline/README.md](./docs/pipeline/README.md) | Job order for CI and release, and links to the runbooks |
| [.github/workflows/ci.yml](./.github/workflows/ci.yml) | Pull-request and `main` pipeline: test, image build, Trivy, smoke, Cosign on push |
| [.github/workflows/release.yml](./.github/workflows/release.yml) | Tag-triggered release: validate → build → docker → publish |
| [.github/workflows/validate-test.yml](./.github/workflows/validate-test.yml) | Unit, integration, e2e, 95% coverage gate, production build |
| [.github/scripts/coverage-gate.mjs](./.github/scripts/coverage-gate.mjs) | Fails the build when coverage is under 95% |
| [module-federation.config.ts](./module-federation.config.ts) | Container name, expose, and shared singleton versions |
| [Dockerfile](./Dockerfile) | Digest-pinned Node builder and nginx runtime |
| [package.json](./package.json) | Package version. Must match the Git tag when one is cut |
