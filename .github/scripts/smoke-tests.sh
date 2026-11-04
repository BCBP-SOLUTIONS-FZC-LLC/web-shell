#!/usr/bin/env bash
# Image size + HTTP startup gate for the CI-built web-shell image.
set -euo pipefail

IMAGE="${IMAGE:-web-shell-ci-test}"
MAX_MB="${MAX_MB:-200}"
PORT="${PORT:-18080}"
CID=""

cleanup() {
  if [ -n "${CID}" ]; then
    docker rm -f "${CID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "::group::Image size check (linux/amd64)"
size=$(docker image inspect "${IMAGE}" --format='{{.Size}}')
mb=$((size / 1024 / 1024))
echo "Image size: ${mb} MB (limit: ${MAX_MB} MB)"
if [ "${mb}" -gt "${MAX_MB}" ]; then
  echo "::error file=Dockerfile,title=Image size::Image is ${mb} MB, exceeds ${MAX_MB} MB limit — check COPY instructions for accidental inclusions (node_modules, .git)"
  exit 1
fi
echo "::endgroup::"

echo "::group::Startup gate"
CID=$(docker run -d --rm -p "127.0.0.1:${PORT}:8080" "${IMAGE}")
ready=0
for _ in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${PORT}/healthz" | grep -q 'ok'; then
    ready=1
    break
  fi
  sleep 1
done
if [ "${ready}" -ne 1 ]; then
  echo "::error file=nginx/default.conf,title=Startup gate::Container did not serve /healthz within 30s"
  docker logs "${CID}" || true
  exit 1
fi

index_code=$(curl -s -o /tmp/web-shell-index.html -w '%{http_code}' "http://127.0.0.1:${PORT}/")
config_code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/config/runtime.json")
version_code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/version.json")
map_count=$(docker exec "${CID}" sh -c 'find /usr/share/nginx/html -name "*.map" | wc -l')
echo "GET / -> ${index_code}"
echo "GET /config/runtime.json -> ${config_code}"
echo "GET /version.json -> ${version_code}"
echo "Source maps in image: ${map_count}"

if [ "${index_code}" != "200" ] || ! grep -q 'id="app"' /tmp/web-shell-index.html; then
  echo "::error file=index.html,title=Startup gate::Shell document was not served"
  exit 1
fi
if [ "${config_code}" != "200" ] || [ "${version_code}" != "200" ]; then
  echo "::error file=nginx/default.conf,title=Startup gate::runtime.json (${config_code}) or version.json (${version_code}) was not served"
  exit 1
fi
if [ "${map_count}" -ne 0 ]; then
  echo "::error file=Dockerfile,title=Startup gate::${map_count} source maps were shipped in the image"
  exit 1
fi
echo "::endgroup::"

echo "::group::Smoke suite (test/smoke)"
if ! SMOKE_BASE_URL="http://127.0.0.1:${PORT}" SMOKE_MODE=image npm run -s test-smoke; then
  echo "::error file=test/smoke/deployment.test.ts,title=Smoke suite::The served image failed the smoke suite (see the log above)"
  exit 1
fi
echo "::endgroup::"

{
  echo "### Smoke test results"
  echo "- ✅ Startup gate: \`/healthz\`, \`/\`, \`/config/runtime.json\` and \`/version.json\` returned 200; no source maps in the image"
  echo "- ✅ Smoke suite (\`test/smoke\`): SPA rule, Cache-Control, script integrity, 404s, and the runtime files validated by the SDK"
  echo "- 📦 Image size (linux/amd64): **${mb} MB** (limit: ${MAX_MB} MB)"
  echo "- 🔍 [Security (Trivy SARIF results)](https://github.com/${GITHUB_REPOSITORY}/security/code-scanning)"
} >> "$GITHUB_STEP_SUMMARY"
