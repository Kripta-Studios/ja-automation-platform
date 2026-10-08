# Project, client and guided form recovery — 8 October 2026

Scope: the requested project/client, invoice usability, operational filters, modal stacking and shared form recovery changes. This is a scoped release record, not certification of every pre-existing application journey.

The GPT 6.1 Sol swarm inventoried role menus and forms across management, finance and operations. The catalogs distinguish source attachment from exercised browser behavior. Read-only final integration review confirmed no outstanding material finance, security, migration or guided-recovery findings after the reported fixes.

Projects retain optional onsite manager, location and client-linked onsite contact, including inline contact creation. Client contact CRM details are optional. Project currency defaults from the client and can be changed. Client calendars use actual time records with worker/project grouping, dated PM scope and correction-aware totals. Time forms restrict worker choices to the selected project's dated assignments. Operational registers, published assignments and provider/technician directories expose the requested authorized filters. The task launcher yields to panels and modal dialogs.

The shared dialog handles native and structured server failures, asks editable invalid fields individually, stages answers, supports Cancel/Escape, and invokes the original action/submitter only after final confirmation. Enhanced weekly/crew forms and finance/auth/direct-fetch notices have explicit adapters. Hidden, disabled, read-only and secret/upload fields remain in their original authorized flow; the dialog names their visible controls and validation messages without copying secret values. Permission, lifecycle and service failures provide explanations and allowed next steps. Unknown save outcomes never trigger an automatic retry.

Invoice period recovery explains and aligns incompatible dates to the configured cadence. Effective billing dates are inclusive, including the 15th. Readiness distinguishes operational approval, Finance approval, nonbillable hours, prior reservations/invoices and dates outside the period. Missing customer sale rates identify source dates and link to authorized configuration. Explicit consent prepares a sale rate as a separately reviewed internal cost; saving follows the ordinary audited action. Corrected time requires a new Finance review and cannot silently inherit billability.

Evidence:

- Portal production build and jobs bundle: successful with canonical Node 24.19.0/pnpm 11.22.0. Portal/database typechecks successful. Whole-workspace typecheck retains 42 unchanged website static-image import errors; no whole-workspace green result is claimed.
- ESLint and Prettier: all 95 changed/new TypeScript/Svelte files pass after fixes.
- Final targeted units: 36 passed across 10 files, including role/action metadata, weekly field mappings, period/rate recovery and authorized filters.
- Security/integrity/localization: 39 passed across 5 files, including issued invoice immutability, append-only audit and authorization ordering.
- Earlier integrated focused run: 58 non-localization tests passed; the subsequently corrected localization suite passed all 16. Relevant project/contact/calendar/MAG integration tests passed. Known unrelated historical assignment/session fixtures remain documented as baseline failures rather than silently weakened.
- Browser evidence includes real Owner/Finance/Worker forms, server rejection correction, explicit confirmation/cancellation, secret instructions, contacts/project currency/calendar, filters and mobile layering at 360/390/768/1440. Final run outcome recorded below. The earlier 48-case matrix had 45 passes and three filter-test URL assertion failures; corrected filter assertions and worker assignment checks are rerun in the final matrix. Eight finance date/rate browser cases passed in the interrupted follow-up run; interruption occurred after case 27, with no reported failures.
- Migration 74→75 was rehearsed against a production SQLite copy: all original business-column values in 180 tables preserved, integrity_check=ok and zero foreign-key violations. No production hours, approvals or financial history were rewritten by the rehearsal or tests.

Deployment requires a fresh verified database/private-file backup, quiescent writers, maintenance routing during migration/health checks and retention of the previous image/source. The final rollout receipt is stored outside the committed source release.

Final browser run: **32/32 passed** (3.3 minutes), all eight journeys at 360, 390, 768 and 1440 pixels.
