#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): keep an edited file in the shape CI expects.
#   *.ts / *.tsx / *.mts / *.mjs / *.js   ESLint (the platform rules, as validate-quality runs them);
#                                          problems are shown to Claude (exit 2) to fix now
#                                          src/**: also arch-lint on the file and its imports
#                                          (.dependency-cruiser.cjs), so an undeclared dependency shows now
#   docs/architecture/mermaid/*.mmd,      every ```mermaid block in ARCHITECTURE.md must equal the
#   ARCHITECTURE.md                       .mmd named on its `> Source:` line (check-diagrams.mjs)
#   package.json                          the three platform packages pinned exactly, on one version
#                                          (check-sdk-pins.mjs)
set -uo pipefail

f=$(jq -r '.tool_input.file_path // empty')
[ -n "$f" ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"
case "$f" in "$root"/*) ;; *) exit 0 ;; esac
rel=${f#"$root"/}
[ -f "$f" ] || exit 0

case "$rel" in
  node_modules/* | dist/* | coverage/* | keycloak/*) exit 0 ;;
  docs/architecture/mermaid/*.mmd | ARCHITECTURE.md)
    if ! out=$(cd "$root" && node .claude/hooks/check-diagrams.mjs 2>&1); then
      echo "$out" >&2
      exit 2
    fi
    exit 0 ;;
  package.json)
    if ! out=$(cd "$root" && node .claude/hooks/check-sdk-pins.mjs package.json 2>&1); then
      echo "$out" >&2
      exit 2
    fi
    exit 0 ;;
  *.ts | *.tsx | *.mts | *.mjs | *.js)
    if ! out=$(cd "$root" && npx --no-install eslint --max-warnings 0 --no-warn-ignored "$rel" 2>&1); then
      echo "ESLint problems in $rel:" >&2
      echo "$out" >&2
      exit 2
    fi
    case "$rel" in
      src/*.d.ts) ;;
      src/*)
        if [ -f "$root/.dependency-cruiser.cjs" ] &&
          ! out=$(cd "$root" && npx --no-install depcruise "$rel" --config .dependency-cruiser.cjs --output-type err 2>&1); then
          echo "Architecture lint (npm run arch-lint) problems from $rel:" >&2
          echo "$out" >&2
          exit 2
        fi ;;
    esac
    exit 0 ;;
esac
exit 0
