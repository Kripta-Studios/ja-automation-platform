# WP-B4 implementation contract

Requirement: ASTRA F02/U26, contract Anexo A.21, CORE-13/15. Implement in the current branch; do not deploy or send documents. Preserve legacy `project_closeout` rows and existing public method signatures.

## Observable workflow

Authorized Finance/Owner opens a project's Closeout destination, sees readiness and existing revisions, prepares a draft, previews the two audiences, explicitly approves customer publication, finalizes and downloads each completed package. Owner may reopen with a reason; another finalization creates a new immutable revision. Later payments/source edits cannot change a previous package. PM/Worker must not receive internal snapshots or artifacts. A customer package is an export for authorized staff to hand over, not a new unauthenticated customer portal.

## Persistence and lifecycle

- Reserve additive migration `0040_astra_project_closeout_revisions.sql` and matching schema definitions. No other active packet owns migrations.
- Keep a series/current draft pointer and append-only final revision records, including audience snapshot/manifest, content hashes, creator/finalizer/time and artifact identity. Audit reopening without changing previous revision content.
- Preserve existing legacy snapshots exactly, including final rows. Migration must never fabricate a client-safe artifact from an unreviewed legacy internal snapshot. Show legacy evidence explicitly when no new package exists.
- Integrate existing `PortalRepository.createProjectCloseout`, `finalizeProjectCloseout`, `reopenProjectCloseout` through a cohesive module or narrow wrappers; do not retain a path that can overwrite historical final content. Keep API compatibility for existing callers/tests.
- Multi-write transitions are transactional, verify active real role and live session, prevent stale draft finalization and make retry of the same finalization return the same revision/artifact identity. Reopen is Owner-only and reason-required.

## Audience and source contract

- Internal: approved project/time/report summary, expense summary, invoice register, payment/collection status and document index. Exact money is string minor units with currency. Never call project contribution statutory profit.
- Client: strict closed operational allowlist, accepted customer period PDFs only when integrity/source identity remains valid; approved technical/system/backup references and deliberately selected authorized documents. No rate, compensation, margin, expenses, financial DTO, private worker file or arbitrary document inclusion.
- Customer export selection must be explicit and previewable. Names/descriptions/free text may contain sensitive content: require staff confirmation of the exact snapshot for publication; fail closed for recognized monetary patterns and explain which item needs review instead of silently redacting source truth. No claim that pattern matching proves confidentiality. Operational review alone does not authorize every private attachment for customer release.
- Include report index, system/backup register, validation/open-risk summaries, accepted period references and a manifest with file hashes. Existing open-risk text is not a new issue-tracking module. An uploaded backup is not proof it was deployed.
- Verify authorization before reading/copying every included private source and verify normalized path, size and hash. Retain source filenames only after archive-safe normalization; use unique deterministic archive names to prevent collisions or traversal.

## Artifacts

Use existing archive/rendering patterns. Bounded package assembly may be synchronous if it returns only after files are fully written and is explicitly size/count-limited; never show queued as ready. Prefer existing durable artifact infrastructure if integration is straightforward. If asynchronous, use supervised existing jobs with independent audience statuses and safe retry. No manual job-processing control.

Artifacts live in private storage with immutable storage keys, hash/length metadata and semantic filenames. Successful finalization must bind to fully available package bytes. Partial file failure must not finalize a project or lose prior artifact bytes; retries cannot overwrite finalized history. Downloads reauthorize active role/session before opening storage, verify integrity and set private/no-store/nosniff headers. Backup of the existing database + document root must include them naturally.

## Ownership for the next implementer

Own new closeout domain/service/components/routes/tests, migration 0040, schema technical.ts/schema exports, closeout wrapper methods in repository.ts, and project detail page's new Closeout link/tab. Other agents own notification list methods, v3 notification jobs, PortalChrome/Help, public form and website. Do not alter their paths or shared global translation/navigation files without coordination. Localized new closeout copy may use a cohesive scoped catalog. Parent integrates global evidence docs.

## Verification

Disposable SQLite and storage only. Prove role/session denial, migration fresh/legacy-final preservation, draft/stale-finalize/retry, owner reopen/new revision, historical bytes unchanged after payment/source changes, client content/attachment allowlist, bad hash/missing file/traversal denial and no partial project closure on artifact failure. Open representative ZIP contents and JSON/CSV/PDF; browser test Finance at phone/desktop and denied Worker. Run database/portal types and relevant closeout/security tests. Report exact evidence and unresolved requirements; no completion by code presence.
