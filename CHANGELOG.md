# Changelog

All notable changes to web-shell are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning aligned with SemVer.

Pull requests that change the shell, its build, or its image must add an entry under `[Unreleased]`. The release workflow rejects a tag that has no matching `## [x.y.z]` section.

## [Unreleased]

### Added

- Unit, integration, and end-to-end tests for Keycloak PKCE sign-in, the login page, and shell routing, with a 95% coverage gate.
- GitHub Actions pipeline: typecheck and production build, dependency audit, digest-pinned image build, Trivy scan, smoke tests, Cosign-signed publish to GHCR, and tag releases.
