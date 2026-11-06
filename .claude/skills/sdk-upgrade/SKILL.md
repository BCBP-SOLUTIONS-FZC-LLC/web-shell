---
name: sdk-upgrade
description: Upgrade web-shell's platform packages (frontend-sdk, webpack-preset, eslint-plugin) together to one exact version, shell before remotes, with the contract check against mfe-dashboard and every doc that names the version. Use when a new platform-reactcommon release is out.
disable-model-invocation: true
argument-hint: <version, e.g. 1.0.0-alpha.7>
---

# Upgrade the platform SDK to $ARGUMENTS

The rules are CLAUDE.md's: all three packages, exact pins, one version; the shell moves **before** any remote (a remote must not be built against a newer SDK than the shell's), unless the release changes the shell–remote contract, when they deploy together. `platform-reactcommon` and `mfe-dashboard` are read-only from here.

1. **Read the release.** In `../../../XPertSharedLib/react/platform-reactcommon`: `CHANGELOG.md` for $ARGUMENTS and `git diff <current tag> v$ARGUMENTS -- packages/`. List for the user: breaking changes, new required config keys (`runtime.json`), changed exports the shell uses (`src/` imports), anything that changes the shell–remote contract (container global, shared map, `PlatformProvider` shell value). If the release notes include an order for consumers, follow it.
2. **Branch** `chore/sdk-$ARGUMENTS` from `main`.
3. **Install:** `bash .claude/skills/sdk-upgrade/scripts/bump.sh $ARGUMENTS`. It refuses an unpublished version and checks the pins (`.claude/hooks/check-sdk-pins.mjs`).
4. **Adapt and verify**, fixing what each step reports:
   - `npm run lint`, `npm run arch-lint`, `npm run typecheck`, `npm run metrics-check`, `npm run test:ci` (95% gate);
   - `test/unit/no-sdk-duplicates.test.ts`: if the SDK now exports something the shell copied (LLD §1.2), delete the copy and import it;
   - `npm run build && npm run budget`; confirm the bundle carries the version: `grep -o '1\.0\.0-alpha\.[0-9]*' dist/assets/*.js | sort | uniq -c`;
   - `npm run test-browser` (production CSP, three engines);
   - `REMOTE_DIST=../mfe-dashboard/dist npm run test-contract` against the dashboard's current build. If the contract changed, say so: shell and dashboard must then deploy together.
5. **Docs**, all in this PR: the version in README, ARCHITECTURE, VERSIONING, the LLD header and history, `.claude/CLAUDE.md`; a CHANGELOG `[Unreleased]` entry that says shell-before-remotes (or deploy-together) and lists what changed for the shell; new `runtime.json` keys in README, LLD §9.1, `public/config/runtime.json`, `config/runtime.local.json` and `test/smoke` when the smoke suite checks them.
6. **Review:** write the diff to the scratchpad and run the `invariant-reviewer` and `doc-sync-reviewer` subagents on it; fix their findings.
7. **PR** into `main`. Tell the user what the dashboard team must do (their upgrade comes after this merges), and draft that note for them rather than editing `../mfe-dashboard`.
