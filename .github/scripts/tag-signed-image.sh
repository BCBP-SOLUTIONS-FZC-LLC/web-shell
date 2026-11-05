#!/usr/bin/env bash
# Adds the release tags (docker/metadata-action's list) to an image pushed by digest,
# after it was scanned, its provenance exported and it was signed. Fails unless every
# tag then resolves to that same digest, so the Cosign signature covers each tag.
set -euo pipefail

: "${IMAGE_NAME:?IMAGE_NAME is required}"
: "${IMAGE_DIGEST:?IMAGE_DIGEST is required}"
: "${DOCKER_METADATA_OUTPUT_JSON:?DOCKER_METADATA_OUTPUT_JSON is required}"

TAGS=()
while IFS= read -r tag; do TAGS+=("${tag}"); done < <(jq -r '.tags | unique | .[]' <<<"${DOCKER_METADATA_OUTPUT_JSON}")
if [ "${#TAGS[@]}" -eq 0 ] || [ -z "${TAGS[0]}" ]; then
  echo "::error title=Tag image::docker/metadata-action produced no tags"
  exit 1
fi

ARGS=()
for tag in "${TAGS[@]}"; do ARGS+=(--tag "${tag}"); done
docker buildx imagetools create "${ARGS[@]}" "${IMAGE_NAME}@${IMAGE_DIGEST}"

for tag in "${TAGS[@]}"; do
  got=$(docker buildx imagetools inspect "${tag}" --format '{{ json .Manifest }}' | jq -r '.digest')
  if [ "${got}" != "${IMAGE_DIGEST}" ]; then
    echo "::error title=Tag image::${tag} resolves to ${got}, not the signed ${IMAGE_DIGEST}"
    exit 1
  fi
  echo "  ✔  ${tag} → ${IMAGE_DIGEST}"
done
