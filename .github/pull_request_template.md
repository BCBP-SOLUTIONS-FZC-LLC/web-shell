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
- [ ] `npm run lint` and `npm run typecheck` pass
- [ ] `npm run test:ci` passes (unit, integration, coverage ≥ 95%)
- [ ] `npm run build` passes (typecheck and production bundle)
- [ ] Manual testing performed (login, remote load, navigation)

---

## Checklist

### Code Quality
- [ ] No debug logs or commented-out code
- [ ] No secrets, tokens, or `.env` values committed
- [ ] `CHANGELOG.md` updated under `Unreleased` when this PR changes `src/`, dependencies, the Dockerfile, or nginx config

### Shell contract
- [ ] Remotes still load against the shell's SDK version (all three `@bcbp-solutions-fzc-llc/*` packages on one version)
- [ ] New runtime config keys added to `public/config/runtime.json` and `config/runtime.local.json`, and documented

### Security
- [ ] No tokens written to `localStorage` beyond the existing auth flow
- [ ] Remote URLs are not taken from untrusted input

---

## Related Issue
Closes #<issue-id>

---

## Deployment Notes
Mention anything operators need when upgrading (new runtime config keys, SDK version bumps, remote manifest changes, nginx path changes).
