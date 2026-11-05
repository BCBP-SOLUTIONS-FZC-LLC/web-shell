# Smoke tests

The shell as a browser meets it, modelled on platform-reactcommon's `test/smoke`:
- the shell document (no inline script, the entry script's integrity);
- the SPA rule: only extension-less paths get `index.html`;
- Cache-Control per location;
- 404 for missing API, config, remote and asset paths;
- `/config/runtime.json` and `/remotes/manifest.json` validated by the SDK;
- `/version.json`.

GET only. The suite is not part of `npm test`.

**Against the image** (what CI's `smoke` job runs through `.github/scripts/smoke-tests.sh`):

```sh
docker build --secret id=npm_token,env=NODE_AUTH_TOKEN -t web-shell:local .
docker run -d --rm -p 127.0.0.1:18080:8080 web-shell:local
SMOKE_BASE_URL=http://127.0.0.1:18080 npm run test-smoke
```

This mode also checks what only nginx decides: exact 404s, `/healthz`, and no-cache on unhashed public files.

**Against a deployment** (behind CloudFront):

```sh
SMOKE_BASE_URL=https://app.dev.bcbpsolutions.com ENVIRONMENT=dev npm run test-smoke
```

A non-localhost URL selects `SMOKE_MODE=live`; set `SMOKE_MODE` to override. Live mode also checks the platform's security headers: CSP, HSTS and nosniff. The gateway answers `/api` there, so the suite only asserts that it never returns `index.html`. `ENVIRONMENT` is the environment the SDK validates the runtime config for (default `prod` for the image, `dev` live). **In live mode it is also the deploy check** (SDK alpha.6, one build for every environment): set it to the environment being deployed, and the suite fails unless that deployment's `runtime.json` names exactly that `environment`. In image mode the suite checks the image's own file names none, so each deployment writes its own.
