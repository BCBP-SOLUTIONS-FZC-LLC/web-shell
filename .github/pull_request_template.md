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
- [ ] `npm run test:ci` passes (unit, integration, e2e, coverage ≥ 95%)
- [ ] `npm run build` passes (typecheck and production bundle)
- [ ] Manual testing performed (login, remote load, navigation)

---

## Checklist

### Code Quality
- [ ] No debug logs or commented-out code
- [ ] No secrets, tokens, or `.env` values committed
- [ ] `CHANGELOG.md` updated under `Unreleased` when this PR changes `src/`, dependencies, the Dockerfile, or nginx config

### Shell contract
- [ ] Module Federation exposes and shared dependency versions still match consumers (`module-federation.config.ts`)
- [ ] New `VITE_*` variables documented and given a Dockerfile `ARG` default when the image build needs them

### Security
- [ ] No tokens written to `localStorage` beyond the existing auth flow
- [ ] Remote URLs are not taken from untrusted input

---

## Related Issue
Closes #<issue-id>

---

## Deployment Notes
Mention anything operators need when upgrading (new `VITE_*` build args, remote URL changes, nginx path changes).
