## Description
Provide a clear description of the changes.

---

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Documentation
- [ ] Test
- [ ] Breaking change
- [ ] Dependency update

---

## Testing
- [ ] `npm run lint`, `npm run arch-lint`, `npm run metrics-check` and `npm run typecheck` pass
- [ ] `npm run test:ci` passes (unit, integration, e2e, coverage at least 95%)
- [ ] `npm run build` passes (typecheck and production bundle)
- [ ] Manual check when the change is visible: login, remote load, navigation
- [ ] For `src/`, `nginx/`, `Dockerfile`, `rsbuild.config.ts`, `config/` or `index.html`: `npm run test-browser` after a build when the change touches what a real engine checks (CSP, fonts, sign-out POST, contrast), and `npm run test-contract` when it touches the remote contract

---

## Checklist

### Code Quality
- [ ] No debug logs, commented-out code, secrets, or `.env` values
- [ ] No hard-coded user-facing text; no fix that widens a lint or arch-lint rule
- [ ] `CHANGELOG.md` `[Unreleased]` updated when the pull request touches `src/`, `package.json`, `package-lock.json`, `Dockerfile`, `nginx/`, `rsbuild.config.ts`, `config/**`, `public/config/**`, or `index.html` (`.github/workflows/changelog-check.yml` fails the pull request otherwise)
- [ ] Documentation checklist in CONTRIBUTING reviewed; diagrams equal their sources (`node .claude/hooks/check-diagrams.mjs`)

### Shell contract
- [ ] Remotes still load against the shell's SDK version (all three `@bcbp-solutions-fzc-llc/*` packages on one exact version)
- [ ] New runtime config keys (in `public/config/runtime.json` and `config/runtime.local.json`) or build constants documented

### Security
- [ ] No token written to storage (`bcbp.rememberEmail` / `bcbp.loginEmail` are the only raw `localStorage` keys)
- [ ] Remote URLs are not taken from untrusted input

---

## Related Issue
Closes #<issue-id>

---

## Deployment Notes
Mention anything operators need when upgrading (new runtime config keys, SDK version bumps, remote manifest changes, nginx path changes).
