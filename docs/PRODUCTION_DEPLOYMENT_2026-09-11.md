# Production deployment — 2026-09-11

- Git commit: `a87a7d1f10691c8f2f9f8537bc57415559c8f686`
- Branch: `codex/v3-production-completion-orchestrated-20260819`
- Release: `/opt/jaautomation/releases/ja-automation-13e21a1f0924c4f5eb3c0038b410525928725eeb08c925f6de062f5b15ddd5d5`
- Archive SHA-256: `13e21a1f0924c4f5eb3c0038b410525928725eeb08c925f6de062f5b15ddd5d5`
- Source snapshot: `a87a7d1f10691c8f2f9f8537bc57415559c8f686`
- Runtime: Node `v24.19.0`, pnpm `11.22.0`

## Verification

- `pnpm typecheck` — passed across all workspace packages.
- Focused Vitest checks — 4 files, 20 tests passed.
- Portal UX Playwright checks — 10 tests passed on desktop and phone-360.
- Authenticated manual capture — passed.
- Site, portal, and jobs production builds — passed.
- Public site and portal login health checks — passed.
- `deployment-portal-1`, `deployment-site-1`, and `deployment-jobs-1` — running; portal and site healthy.
- Docker builder cache cleaned with `docker builder prune -af`; remaining build cache: `0B`.

The full unit command was stopped after becoming idle without producing test output; the focused suites above cover the changed workflow, access, i18n, and manual catalog paths.
