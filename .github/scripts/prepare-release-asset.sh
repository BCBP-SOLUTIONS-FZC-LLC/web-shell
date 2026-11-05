#!/usr/bin/env bash
# Builds the production bundle and packs it as the GitHub Release asset.
# The container image is published separately by the docker job.
set -euo pipefail

: "${RELEASE_TAG:?RELEASE_TAG is required}"

echo "Building web-shell static bundle for ${RELEASE_TAG}"
npm ci --no-audit --no-fund
# The version without the `v` (0.1.0), as the image and mfe-dashboard report it (service.version).
BUILD_VERSION="${RELEASE_TAG#v}" npm run build
# Source maps never ship with the bundle or the image. They are kept as a workflow artifact
# (release.yml "Upload source maps") to read production stack traces against this exact build.
MAPS_NAME="sourcemaps_web-shell_${RELEASE_TAG}.tar.gz"
(cd dist && find . -name '*.map' -print0 | tar --null -czf "../${MAPS_NAME}" -T -)
find dist -name '*.map' -delete
echo "  ✔  ${MAPS_NAME} (workflow artifact only)"

ASSET_NAME="web-shell_${RELEASE_TAG}_dist.tar.gz"
tar -C dist -czf "${ASSET_NAME}" .
sha256sum "${ASSET_NAME}" > "${ASSET_NAME}.sha256"
echo "${ASSET_NAME}" > release-asset.name
echo "  ✔  ${ASSET_NAME}"
