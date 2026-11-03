# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✅ Active |

Older major versions are not patched. Deploy the latest 1.x image.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Email: vijay@bcbpsolutions.com
Subject: `[web-shell] Security vulnerability`

Include in your report:
- Description of the vulnerability and the affected component (shell bootstrap, sign-in screens, IAM ports, Module Federation remote loading, static hosting)
- Steps to reproduce
- Potential impact (token leakage, XSS, open redirect, untrusted remote load, privilege escalation)
- Suggested fix or patch (if any)

### Response timeline

| Step | Target |
|------|--------|
| Initial acknowledgement | 48 hours |
| Severity assessment | 5 business days |
| Patch release (critical/high) | 14 days |
| Public disclosure | After patch ships |

We follow responsible disclosure. Reporters will be credited in release notes unless anonymity is requested.

## Scope

Areas of particular sensitivity in this shell:

- **Authentication** — the sign-in and session screens and how the shell drives the platform SDK's Keycloak session. Token handling itself is in `platform-reactcommon`.
- **Module Federation remotes** — the shell loads remote entry points; a compromised or substituted remote executes in the shell origin.
- **Runtime configuration** — `/config/runtime.json` and `/remotes/manifest.json` are served to every browser and are public.
