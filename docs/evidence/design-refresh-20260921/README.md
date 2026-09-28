# Interface refresh — 2026-09-21

User-authorized scope: redesign the public website and portal using the local trace-it application as a visual reference, regenerate EN/PT-BR manuals with current screenshots, deploy production and clear Docker build cache.

The interface uses locally hosted, licensed Geist and Geist Mono, warm neutral surfaces, graphite primary controls, J&A red accents, a light sidebar, more compact operational summaries and an editorial public homepage. Existing shared primitives and scoped screen styles are updated together; financial rules, role projections and persisted records are unchanged. Phone forms, full navigation labels, keyboard focus, semantic statuses and print layouts remain release requirements.

Dependency order: shared palette/fonts → shell and screen styling → public website → browser/role validation → final screenshots → PDFs → backed-up release activation → runtime and asset verification → Docker build-cache cleanup.

Browser evidence uses isolated synthetic fixtures. No production customer data appears in screenshots or manuals. Manual captures bind to the final runtime source digest and validate embedded PNG hashes.

Validation and deployment outcomes are appended after execution. This visual release does not change historical external acceptance decisions.

## Validation

- Final responsive/role matrix: 30 passed, 6 pre-existing desktop-only exclusions across 360/390/768/1440. All five core roles exercise their own authorized surfaces, axe, focus, visible navigation and touch targets. Initial run identified muted text below AA and 41px calendar cells; both corrected, then the entire matrix rerun.
- Focused unit/i18n/form validation: 187/187, 24 files. The existing exact-color assertion was updated to the intentional new focus token. Catalog revision updated to 2026-09-21.
- All package typechecks pass; ESLint passes for changed TS/TSX/Svelte files. Both applications compiled for the browser matrix.
- The broad default unit command was interrupted because it starts additional development servers and exhausted available memory alongside browser work. It is not reported as passed. Focused checks ran with one worker; production services were not stopped for testing.
- Independent read-only review: initial four actionable findings corrected, follow-up reports no remaining material findings (`review.json`).
- Final manual capture rebuilds both applications after source formatting and the image-caption readability adjustment. Screenshot hashes and runtime digest are checked before PDF generation.
- Final worker-home refinement: assignment and connection status share an intentional desktop row, stack on narrower screens and use a light secondary connection card. Four worker viewport cases plus complete refreshed capture pass (5 passed, 3 capture-project exclusions). The change was independently reviewed again.
- Manual/browser pass: 104 final screenshots / 182 capture checks. Six desktop design/capture/help-download cases passed; the phone-only Help case was executed separately and passed. Manual download authorization: 4/4.
- Nine final PDFs generated and verified: 6 shared EN/PT-BR references plus 3 quick guides, 10–13 pages each. Embedded fonts (including Geist), screenshots, text extraction, capture/source hashes and selected rendered EN/PT-BR pages inspected. `docs/manuals/validation/pdf-quality.json` records all nine output hashes.

## Production — 2026-09-22 00:05:21 Europe/Madrid

- Active release archive: `/home/kripta/jaautomation-interface-20260921.zip`, SHA-256 `f693b66f52e5e0700ac02a7f9ea1415178fb4626a412c7a5389cc3f9a2601f34`. `/opt/jaautomation/current` points to the matching immutable release. Image tag: `zip-f693b66f52e5e0700ac02a7f9ea14151`.
- Both Docker builds passed; the standard deploy helper created a database/private-artifact backup before activation. 592 runtime/configuration source files match the working tree byte for byte; all 9 installed PDFs match the verified output hashes (`production-after.json`).
- Database integrity `ok`, zero FK violations. Eight checked financial/history tables retain their complete pre-deploy row hashes; all 59 private artifacts retain their hashes.
- The new backup was verified through an isolated SQLite copy and registered-artifact checks: 59 documents, integrity `ok`, zero FK violations (`backup-verification.json`). Existing 30-day retention coverage remains partial: 27 snapshots across 13 observed days. This redesign does not claim to resolve that historical requirement.
- Public EN/PT/ES, portal login and both local portal font files return HTTP 200. Chromium verifies EN/PT public pages and login at 390/1440 with loaded Geist fonts, no overflow and no response/runtime errors on the final full run (`production-browser.json`). One initial desktop login navigation received Caddy upstream EOF/502 shortly after activation; retained in `production-browser-first-attempt.txt`. Containers stayed healthy, the application showed no exception, and the complete fresh browser run passed. No assertion was weakened or retry added to the script.
- `verify-vps.sh --wait-two-automatic-runs` passed: isolated jobs configuration, mail-secret permissions, signed endpoint rejecting unauthorized requests, healthy services and two subsequent automatic cycles with zero failures (`verify-vps.txt`). Historical failed/dead-letter entries remain visible and are not represented as newly resolved.
- Docker build cache cleared: **6.812 GB reclaimed**, **0 B remaining**. Application images, rollback images, containers and persistent volumes retained (`docker-prune.txt`, `docker-space-after.txt`). Deploy timer/path, jobs timer and backup timer are active (`services-after.txt`).

This is a verified visual/manual deployment. The broad unit suite and complete 32-step business acceptance journey were not rerun for this visual change; earlier acceptance records and external approvals keep their existing scope. Post-deploy receipts live in the working repository; the deployed release remains immutable.
