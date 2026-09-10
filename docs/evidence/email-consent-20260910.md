# Application email consent — 2026-09-10

Owner instruction: operational notices remain in-app only. Every other application email
requires an explicit yes/no choice by the person performing the action.

Implemented: no notification or invoice-issue email producer; explicit invitation and
invoice PDF decisions; contact, support, career and Aquarex intake consent; persisted
consent checked by the SMTP resolver and unconfirmed historical work quarantined before
worker claims. History and ambiguous SMTP acceptance are preserved. Reconfirming a
legacy invoice email creates one separately identifiable request, deduplicated on retry.

Verification: workspace typecheck passed; changed TypeScript/Svelte/TSX lint passed.
Invoice yes/no flow passed browser tests at 360, 390, 768 and 1440 pixels. Invitation
no/yes and Aquarex initial empty selection/retry flow passed the same four viewports
(12 browser cases total, including EN/ES/PT public form checks). Independent read-only
review found no blocking defects; requested legacy invoice reconfirmation coverage was
added and passed. The final focused integration/security/localization run and deployment
results are appended after completion.

Pre-deploy read-only production check: 243 in-app notifications, zero pending outbox
messages. Production activation uses the installed release deployer, online backup,
retained rollback images, service-actor preflight and local/public health checks.

Final focused run: **13 suites / 70 tests passed** (notifications, invoice lifecycle, SMTP delivery, legacy cutover, intake, Finance, authorization, audit and localization). Formatting and diff whitespace checks passed.

Production deployment completed at **2026-09-10 18:39:34 CEST** using the reviewed
working-tree archive SHA-256
`1691fc64a27e48ef507f49d2d50c48c5bfc9fc8a6844ea42050b8f6b3552c83b`.
The deployed release is `/opt/jaautomation/releases/ja-automation-1691fc64a27e48ef507f49d2d50c48c5bfc9fc8a6844ea42050b8f6b3552c83b`.
Pre-deploy online backup:
`/var/backups/jaautomation/2026-09-10T163915603Z-4f940f90-3d2d-4dd1-8e02-6ac21b5e187d`
(41 private documents). Previous images remain available for rollback.

Post-deploy: portal and site containers healthy; public URLs pass; systemd job preflight
succeeded (exit 0); deployment timer/path restored active. All 243 existing notifications
remain present, zero pending outbox rows, zero automatic notification/invoice-issue email
rows since activation. No real email was sent as part of verification.
