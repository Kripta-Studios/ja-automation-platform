# Public website deployment

The production website runs as a Next.js standalone container behind Caddy:

- Public URL: `https://gex-dashboard.hopto.org/j-aautomation/en`
- Container origin: `127.0.0.1:5101`
- Source: `website/`
- Image definition: `deployment/Dockerfile.site`
- Required tools: Node 24.19.0 and pnpm 11.22.0

## Release contents

A public-site release ZIP contains:

- `source/website/` with the full browser-safe Next.js source and public assets.
- Exact root workspace manifests required by the Docker build.
- `source/deployment/Dockerfile.site`.
- `compiled/` with release-specific Linux image and container smoke-test evidence when the release
  is built on an authorized Linux/Docker host.
- `SHA256SUMS` and `RELEASE.md`.

The VPS must build the production image from `source/`. The local compiled directory proves the
release build but may contain platform-specific optional dependencies from the Windows build host.
The Dockerfile runs `pnpm deploy --prod --legacy` and copies that production dependency tree into
the final image; `@swc/helpers@0.5.23` is a direct site dependency so it is present at runtime.

The repository build gate verifies the Next.js standalone output and the Dockerfile copies `public`
and `.next/static` into the runtime image. A real Linux image smoke test remains a release-host
operation; this Windows workspace session did not modify Docker or a production host.

The full website-plus-portal production release archive is assembled from the repository root, not
from a site-only release. It includes the portal source, reviewed migrations, Docker Compose and
Caddy/systemd definitions, but never includes a database, private uploads, fixture credentials,
secrets or generated build output. See `../../docs/SHOWCASE_ACCESS.md` for the production access
runbook and `../../deployment/README_VPS.md` for the first-owner/start sequence.

## Site-only VPS deployment

The deployment must preserve the portal, `/var/lib/jaautomation`, `/etc/jaautomation`, Caddy and
the current release symlink. Build a new image tag, retain the active image under a rollback tag and
recreate only the Compose `site` service.

Do not run the fixture seed, database migrations, the full VPS installer or `docker compose down`
for a public-site-only release.

After replacement, verify:

```bash
curl -fsS http://127.0.0.1:5101/j-aautomation/en >/dev/null
curl -fsS https://gex-dashboard.hopto.org/j-aautomation/en >/dev/null
curl -fsS https://gex-dashboard.hopto.org/j-aautomation/app/login >/dev/null
```

Keep the rollback image until these checks pass. Record the release tag, ZIP SHA-256, image ID,
commands and HTTP results in `docs/V3_IMPLEMENTATION_PROGRESS.md` on the VPS release copy.
