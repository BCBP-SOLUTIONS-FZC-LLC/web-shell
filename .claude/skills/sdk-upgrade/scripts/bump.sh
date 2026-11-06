#!/usr/bin/env bash
# Moves the three platform packages to one exact version, together (CLAUDE.md: SDK upgrades), then
# checks the pins. Usage: bump.sh <version>
set -euo pipefail
v=${1:?usage: bump.sh <version, e.g. 1.0.0-alpha.7>}
cd "$(git rev-parse --show-toplevel)"
[ -n "${NODE_AUTH_TOKEN:-}" ] || export NODE_AUTH_TOKEN=$(gh auth token)

s=@bcbp-solutions-fzc-llc
for p in frontend-sdk webpack-preset eslint-plugin; do
  npm view "$s/$p@$v" version >/dev/null || { echo "✗ $s/$p@$v is not published" >&2; exit 1; }
done
npm install --save-exact "$s/frontend-sdk@$v"
npm install --save-exact --save-dev "$s/webpack-preset@$v" "$s/eslint-plugin@$v"
node .claude/hooks/check-sdk-pins.mjs package.json
echo "✓ installed $v; next: lint, arch-lint, typecheck, metrics-check, test:ci, build, budget, test-browser, test-contract (SKILL.md step 4)"
