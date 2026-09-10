# Owner training data and landing order — 2026-09-10

The operational `Field operations overview` now precedes the Owner financial dashboard. Financial cards/charts retain their currency/date/status drill-through links. The preceding Manage button/layout improvements remain included in this release.

The Owner explicitly requested production demonstration data and then authorized issued invoices and simulated payments. Batch `owner-training-20260910-v1` adds content only to the four existing explicitly named USD Demo projects, using the existing manager, worker, supplier coordinator and external technician test identities. Finance and Auditor use their existing authorized scopes. No credentials are changed or committed.

## Applied content

- 87 time entries, 38 daily reports, 10 technical reports and 38 expenses, with draft, submitted, approved and invoiced states.
- 20 future planning assignments, 12 editable milestones, 12 project memberships and 4 supplier grants.
- 12 compensation and 12 internal-cost rules, one clearly fictional canonical issuing authority and zero-tax demo profile. Existing commercial rates and all-in fixed-price configuration are preserved.
- 11 invoices: 3 paid, 3 partially paid, 3 issued/unpaid and 2 editable drafts; 6 simulated customer receipts and 12 simulated reimbursements.
- 8 compensation settlements awaiting confirmation; these are not represented as paid.

Service dates cover August through September 10. Invoice issuance, customer receipts and reimbursements use actual creation timestamps: September cash appears in the September bars. No historical payment dates or bank transactions are fabricated. The DEMO issuing identity, project names, line descriptions, PO references and payment references identify fictional training content.

Issued financial history remains immutable. Owners can edit/delete eligible drafts and use the existing correction, void or reversal workflows for finalized records. Re-running the batch never recreates data later removed or renamed by the Owner.

## Operational command

`scripts/run-owner-training.ts` defaults to a read-only plan. Applying requires an existing canonical absolute database path, `--apply`, a private JSON file containing authenticated `{userId, sessionId}` entries for Owner and report subjects, and a new private result path. `--financial-history` explicitly enables issuance/receipts/reimbursements. It validates live persisted identities and the database deployment identity. No credential/session contents belong in git.

All domain changes run through normal audited repository commands inside one immediate transaction. Invoice and settlement source allowlists reject pre-existing operational sources. The durable audit correlation prevents duplicate batches. The destructive disposable demo seed is not used. Invoice-issued outbox events are quarantined in the same transaction (`DEMO_TRAINING_NO_EXTERNAL_DELIVERY`), so this batch sends no invoice emails. Demo-source notification emails are also quarantined while their in-app notices remain available; normal-project notification delivery remains covered by regression tests. PDF jobs run normally.

## Validation

- Isolated production-copy rehearsal passed: SQLite integrity `ok`, no foreign-key violations, exact preservation of all 189 pre-existing rows across users, clients, projects, time, expenses, reports, invoices, payments and settlements.
- Three isolated integration tests passed: financial lifecycle/source scope/outbox quarantine/idempotence, complete rollback after a late payment failure, and live Owner/subject-session requirements.
- Sixty notification/mail-delivery, supplier-route and jobs-deployment regression tests passed. Demo notices are retained in-app while normal-project emails remain deliverable.
- Eight browser tests passed at 360/390/768/1440 widths, including operational-first layout, chart/card drill-through and Worker financial isolation.
- Twelve Manage browser tests passed at 360/390/768/1440, including area navigation, visible buttons and milestone/technical-change creation, editing and deletion.
- Workspace typecheck and explicit strict typecheck of both new operational scripts passed. Focused ESLint and formatting checks passed.
- Pre-load online backup of database and 29 private documents: `/var/backups/jaautomation/2026-09-10T135005324Z-dcb51d44-937e-4a57-be94-27220173c556`.
- Production batch applied successfully; original 189 rows remain identical and integrity/FKs pass. Operational evidence and private row-ID inventory are under `/var/lib/jaautomation-zip-deploy/manual/training-20260910/`.

Deployment, final authenticated checks and cache cleanup are recorded below after activation.

## Runtime issues found during authenticated checks

- Supplier profiles could not fetch the shared service-worker script (403). The positive route allowlist now includes only the four public app assets: service worker, manifest and two icons. Restricted finance/offline-sync routes remain denied; regression coverage includes the asset paths.
- Production Chromium failed before rendering (`chrome_crashpad_handler: --database is required`) because its default configuration directory was on the read-only container filesystem. Portal and jobs now use XDG configuration/cache directories under their existing `/tmp` tmpfs. A runtime Chromium launch inside the same production image succeeds with this configuration; no read-only or security boundary was removed.
- Automatic business notifications discovered the new Demo records and attempted email delivery, receiving HTTP 502. Pending Demo-source emails were quarantined; the notification repository now applies that protection atomically for both existing Demo projects and audited training sources. No invoice-issued events were delivered.
