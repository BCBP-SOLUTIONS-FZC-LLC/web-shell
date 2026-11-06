#!/usr/bin/env bash
# After the PR below a stacked branch was squash-merged into main, bring the branch up to date without
# replaying the squashed commits as conflicts. Usage: sync.sh <branch> <old-base-branch-or-sha>
#  1. Refuses (exit 1) unless origin/main's tree equals the old base's tree: otherwise main has
#     changes the stack does not, and conflicts must be resolved by hand.
#  2. Merges origin/main, taking the branch side of any conflict (-X ours).
#  3. Proves the result: the branch's diff against main must equal the branch's own change (from the
#     point it was stacked on the old base). A moved block that git merged twice, or a base change
#     the branch never had, fails this check and the merge is undone.
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
fork=$(git merge-base "$branch" "$base")
own=$(git diff "$fork" "$branch" | git patch-id --stable | cut -d' ' -f1)
git merge -q --no-edit -X ours origin/main -m "Merge main after the squash merge of $base"
now=$(git diff origin/main HEAD | git patch-id --stable | cut -d' ' -f1)
if [ "$own" != "$now" ]; then
  echo "✗ after the merge, $branch's diff against main is not its own change. Files that differ:" >&2
  diff <(git diff --stat "$fork" "$branch@{1}" | sed '$d') <(git diff --stat origin/main HEAD | sed '$d') >&2 || true
  git reset -q --hard "$branch@{1}"
  echo "  The merge was undone. Merge origin/main by hand and fix the listed files." >&2
  exit 1
fi
echo "✓ $branch now contains origin/main, and its diff against main is exactly its own change. Push it, then retarget its PR to main."
