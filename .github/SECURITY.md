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
- Description of the vulnerability and the affected component (shell, auth redirect, module-federation remote, static hosting)
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

- **Authentication** — Keycloak login, token storage, and session handling in the browser.
- **Module Federation remotes** — the shell loads remote entry points; a compromised or substituted remote executes in the shell origin.
- **Build-time configuration** — `VITE_*` values are compiled into the static bundle and are public in the browser.
