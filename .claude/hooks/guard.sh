#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit|NotebookEdit): block edits to the sibling repositories this one
# reads but never modifies, to installed or generated output, and to the developer's local env files
# (.claude/CLAUDE.md, "Critical Rules"). Exit 2 blocks the tool call and shows the reason to Claude.
set -euo pipefail

f=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
[ -n "$f" ] || exit 0
root="${CLAUDE_PROJECT_DIR:-$PWD}"

block() {
  echo "Blocked: $1" >&2
  exit 2
}

case "$f" in
  */mfe-dashboard/*)
    block "$f is in mfe-dashboard, which another team/session owns. Change it in that repository's own PR." ;;
  */platform-reactcommon/*)
    block "$f is in platform-reactcommon (the SDK). Change it there in its own PR, release it, then upgrade all three packages here (.claude/operations.md, SDK upgrade checklist)." ;;
esac

case "$f" in "$root"/*) ;; *) exit 0 ;; esac
rel=${f#"$root"/}
case "$rel" in
  node_modules/*) block "$rel is an installed package. Change the source repository, or the version in package.json." ;;
  dist/* | coverage/*) block "$rel is build or test output. Change the source and rebuild." ;;
  .env | docker.local.env) block "$rel is the developer's local, untracked config. Ask the user to edit it." ;;
esac
exit 0
