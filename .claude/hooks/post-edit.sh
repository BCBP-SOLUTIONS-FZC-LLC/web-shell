#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): keep an edited file in the shape CI expects.
#   *.ts / *.tsx / *.mts / *.mjs / *.js   ESLint (the platform rules, as validate-quality runs them);
#                                          problems are shown to Claude (exit 2) to fix now
#   docs/architecture/mermaid/*.mmd,      every ```mermaid block in ARCHITECTURE.md must equal the
#   ARCHITECTURE.md                       .mmd named on its `> Source:` line (check-diagrams.mjs)
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
  *.ts | *.tsx | *.mts | *.mjs | *.js)
    if ! out=$(cd "$root" && npx --no-install eslint --max-warnings 0 --no-warn-ignored "$rel" 2>&1); then
      echo "ESLint problems in $rel:" >&2
      echo "$out" >&2
      exit 2
    fi
    exit 0 ;;
esac
exit 0
