---
name: stack-sync
description: After a PR in a stack of pull requests is squash-merged into main, update the next branch in the stack and retarget its PR to main, without fake conflicts. Use when the user says a stacked PR was merged, or asks to resolve conflicts on a PR whose base was just merged.
disable-model-invocation: true
argument-hint: <PR number or branch of the next PR in the stack>
---

# Sync the stacked PR $ARGUMENTS

`main`'s branch rules require linear history (CONTRIBUTING § Pull request checklist), so PRs land as squash (or rebase) merges; this repository squashes. The next PR in a stack still carries the original commits, and GitHub shows conflicts against the squash commit even though the content is the same. The fix is a merge of `main` that keeps the branch's content, but only after proving `main` holds nothing the branch lacks.

1. **Identify** the PR (`gh pr view $ARGUMENTS --json number,headRefName,baseRefName,state`), its current base branch (the one just merged), and confirm with `gh pr view <base PR>` that the base PR is merged. If it is not merged, stop and say so.
2. **Sync:** `bash .claude/skills/stack-sync/scripts/sync.sh <head branch> <old base branch>`.
   - It refuses when `origin/main`'s tree differs from the old base's: something else landed on `main`. Then merge `origin/main` into the branch by hand and resolve each conflict on its merits; never take a side blindly.
   - It then proves the result: the branch's diff against `main` must equal the branch's own change. When git merges a moved block twice, or the base gained a commit the branch never had (a merge made on the base's PR), the check fails, names the files, and undoes the merge: merge by hand and fix those files.
   - On success the branch contains `main` and its diff against `main` is exactly its own change.
3. **Verify** quickly: `npm run lint`, `npm run arch-lint`, `npm run typecheck`, `npx vitest run` (the content did not change, so these confirm the environment, not the merge).
4. **Push** with `git -c credential.helper='!gh auth git-credential' push origin <branch>` and **retarget** the PR: `gh pr edit <number> --base main`.
5. **Next in the stack:** list open PRs whose base is this branch (`gh pr list --base <branch>`). Report them; they sync the same way after this one merges. Do not merge any PR: merging is the user's.
