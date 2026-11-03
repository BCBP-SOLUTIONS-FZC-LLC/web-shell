#!/usr/bin/env bash
# Builds the production bundle and packs it as the GitHub Release asset.
# The container image is published separately by the docker job.
set -euo pipefail

: "${RELEASE_TAG:?RELEASE_TAG is required}"

echo "Building web-shell static bundle for ${RELEASE_TAG}"
npm ci --no-audit --no-fund
BUILD_VERSION="${RELEASE_TAG}" npm run build
# Hidden source maps are uploaded privately, never shipped with the bundle.
find dist -name '*.map' -delete

ASSET_NAME="web-shell_${RELEASE_TAG}_dist.tar.gz"
tar -C dist -czf "${ASSET_NAME}" .
sha256sum "${ASSET_NAME}" > "${ASSET_NAME}.sha256"
echo "${ASSET_NAME}" > release-asset.name
echo "  ✔  ${ASSET_NAME}"
