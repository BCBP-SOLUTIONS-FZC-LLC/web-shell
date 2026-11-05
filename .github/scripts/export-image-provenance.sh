#!/usr/bin/env bash
# Writes the image's SLSA provenance to provenance.slsa.json.
# build-push-action (`provenance: mode=max`) stores provenance as a BuildKit attestation manifest
# inside the image index, not as a Cosign attestation, so read it with
# `docker buildx imagetools inspect`. Needs the registry login from the same job.
# (mfe-dashboard's v0.1.0 release failed here with the old Cosign lookup; fixed there in 0be083c.)
set -euo pipefail

: "${IMAGE_NAME:?IMAGE_NAME is required}"
: "${IMAGE_DIGEST:?IMAGE_DIGEST is required}"

IMAGE_REF="${IMAGE_NAME}@${IMAGE_DIGEST}"

# .Provenance is {"SLSA": {...}} for one platform and keyed by platform for several.
if ! docker buildx imagetools inspect "${IMAGE_REF}" --format '{{ json .Provenance }}' \
  | jq -e 'if has("SLSA") then .SLSA else (to_entries | first | .value.SLSA) end | select(type == "object" and length > 0)' \
  > provenance.slsa.json; then
  rm -f provenance.slsa.json
  echo "::error title=Provenance export::SLSA provenance attestation not found on ${IMAGE_REF}"
  exit 1
fi

echo "  ✔  exported SLSA provenance to provenance.slsa.json"
