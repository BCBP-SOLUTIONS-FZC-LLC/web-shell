#!/usr/bin/env bash
# After the PR below a stacked branch was squash-merged into main, bring the branch up to date without
# replaying the squashed commits as conflicts. Usage: sync.sh <branch> <old-base-branch-or-sha>
#  1. Refuses (exit 1) unless origin/main's tree equals the old base's tree: otherwise main has
#     changes the stack does not, and conflicts must be resolved by hand.
#  2. Merges without a 3-way content merge: records origin/main as merged (-s ours), then applies only
#     what main has that the branch lacks, the diff from where the branch was cut to origin/main.
#     The branch's own changes are never re-merged, so renames and moved code cannot confuse git
#     (a plain merge against the pre-squash ancestor duplicated a moved block on PR 48 and failed on
#     PR 50's folder moves).
#  3. Proves the result: the branch's diff against main must equal the branch's own change. If not,
#     or if the delta does not apply, the branch is reset to where it was.
set -euo pipefail
branch=${1:?usage: sync.sh <branch> <old base branch or sha>}
base=${2:?usage: sync.sh <branch> <old base branch or sha>}
cd "$(git rev-parse --show-toplevel)"
# Both arguments must name existing commits; a value starting with "-" would reach git as an option.
for ref in "$branch" "$base"; do
  case "$ref" in -*) echo "✗ \"$ref\" is not a branch or commit" >&2; exit 1 ;; esac
done
git rev-parse --verify --quiet "$branch^{commit}" >/dev/null || { echo "✗ no branch or commit \"$branch\"" >&2; exit 1; }
git rev-parse --verify --quiet "$base^{commit}" >/dev/null || git rev-parse --verify --quiet "origin/$base^{commit}" >/dev/null \
  || { echo "✗ no branch or commit \"$base\" (locally or on origin)" >&2; exit 1; }
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
before=$(git rev-parse HEAD)
undo() { git merge --abort 2>/dev/null || true; git reset -q --hard "$before"; echo "  $1 The branch is back where it was; merge origin/main by hand." >&2; exit 1; }
fork=$(git merge-base "$branch" "$base")
own=$(git diff "$fork" "$branch" | git patch-id --stable | cut -d' ' -f1)
git merge -q -s ours --no-edit origin/main -m "Merge main after the squash merge of $base"
err=$(mktemp)
# Nothing to apply when main gained nothing since the branch was cut (the base was merged as it was).
if [ -n "$(git diff --name-only "$fork" origin/main)" ] && ! git diff --binary "$fork" origin/main | git apply -3 --index 2>"$err"; then
  cat "$err" >&2; rm -f "$err"
  undo "✗ main's changes since $branch was cut do not apply cleanly on it."
fi
rm -f "$err"
git diff --cached --quiet || git commit -q --amend --no-edit
now=$(git diff origin/main HEAD | git patch-id --stable | cut -d' ' -f1)
if [ "$own" != "$now" ]; then
  echo "✗ after the merge, $branch's diff against main is not its own change. Files that differ:" >&2
  diff <(git diff --stat "$fork" "$before" | sed '$d') <(git diff --stat origin/main HEAD | sed '$d') >&2 || true
  undo ""
fi
echo "✓ $branch now contains origin/main, and its diff against main is exactly its own change. Push it, then retarget its PR to main."
