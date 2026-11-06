#!/usr/bin/env bash
# After the PR below a stacked branch was squash-merged into main, bring the branch up to date without
# replaying the squashed commits as conflicts: verify main's tree equals the tree the branch was
# stacked on, then merge main taking the branch side. Usage: sync.sh <branch> <old-base-branch-or-sha>
# Refuses (exit 1) when main differs from the old base: then the conflicts are real; resolve by hand.
set -euo pipefail
branch=${1:?usage: sync.sh <branch> <old base branch or sha>}
base=${2:?usage: sync.sh <branch> <old base branch or sha>}
cd "$(git rev-parse --show-toplevel)"
[ -z "$(git status --porcelain)" ] || { echo "✗ working tree not clean" >&2; exit 1; }

git fetch -q origin
oldtree=$(git rev-parse "$base^{tree}" 2>/dev/null || git rev-parse "origin/$base^{tree}")
maintree=$(git rev-parse "origin/main^{tree}")
if [ "$oldtree" != "$maintree" ]; then
  echo "✗ origin/main ($maintree) is not the tree of $base ($oldtree):" >&2
  git diff --stat "$base" origin/main >&2 || true
  echo "  main has changes the stack does not; merge origin/main into $branch and resolve by hand." >&2
  exit 1
fi
git checkout -q "$branch"
git merge -q --no-edit -X ours origin/main -m "Merge main after the squash merge of $base"
[ "$(git rev-parse HEAD^{tree})" = "$(git rev-parse "$branch@{1}^{tree}")" ] \
  || { echo "✗ the merge changed $branch's tree; inspect before pushing" >&2; exit 1; }
echo "✓ $branch now contains origin/main; its tree is unchanged. Push it, then retarget its PR to main."
