# Manuals and deployment comparison · 11 October 2026

## Scope and starting identity

The live portal redirects `https://app.j-aautomation.com/` to `https://j-aautomation.com/j-aautomation/app`. Before changes, GitHub main was `22475a2b53fbea4b68a5dae5dd643ce5c99f88cc`; production application source was `2d7b76a250f6e5dc4adf8db4205fe8de5e4fb4c9`. The intervening commit contains the deployment receipt only. All **806** tracked application/package/migration/deployment/site source files matched the active release. The running portal's **23,325** file/symlink manifest entries verified. [Initial comparison](initial-parity.json). The local origin/main tracking ref initially lagged; an explicit refspec fetch corrected it after checking the remote ref directly.

This is a **documentation and Help metadata release**, not a new digital-workers implementation or whole-product Client Essential certification. No migration, financial algorithm, access policy, job behavior or business workflow is changed.

## Updated artifacts

- Eight current role courses: Owner, Finance, Project Manager, Auditor, Worker, Crew chief, Supplier Coordinator and External Technician, each rebuilt as Markdown, HTML and PDF.
- Full Owner project-to-invoice course, current quick guide, Digital workers reference (including new HTML/PDF) and role workflow map.
- All 25 earlier top-level PDF editions receive a localized historical-edition cover, a current Help link and unchanged original content-page streams/attachments. Older Markdown entry points are marked historical. The current role courses remain English; no current Spanish/Portuguese translation is claimed.
- Help advertises 11 October for current guides and explicitly labels older grouped references historical. Existing persona restrictions and English fallback are retained.

Current procedures cover navigation/task finding, retained form recovery, project context and optional creation sections, source review, combined Owner financial acceptance, selected versus whole-period invoice preparation, existing draft reservations, provisional numbers, digital capture and local drafts, local OCR/dictation, role-specific follow-ups, finance snapshots and manual policy proposals.

The eight source JSON files and shared common chapters are authoritative for current role courses. Current Owner chapters are reused by the extended Owner course; imported duplicate chapters are excluded from the combined Owner PDF. Existing BBS screenshots retain their historical context. New current chapters are source-checked procedures; they do not claim new live business submissions or new screenshot capture of every action.

## Validation and limits

[PDF verification](pdf-verification.json) checks all eight role PDFs: required instructions, bookmarks and their target pages, nonblank pages, screenshot hashes, layout bounds, privacy text and attachment rules. Owner keeps six original attachments and six unchanged final invoice annex pages. [Archive verification](archives.json) checks unchanged content streams and attachments in all 25 archived editions. The Owner renderer also reports zero missing images and zero layout overflows.

Seventeen existing catalog, download-retry and authenticated manual-download security tests pass. The persona matrix now checks the current revision rather than filtering an obsolete revision with no entries. Privacy regression tests and the production portal build are also run for this release. New portal code is limited to Help labels/descriptions/revision metadata.

Read-only production checks at 390 and 1440 pixels inspected Help and Digital workers, plus role-relevant project, billing, approval, capture or Accounting screens for Owner, Finance, Project Manager, External Technician and Auditor. Those completed routes returned 200 with no horizontal overflow or page errors. [Auditor browser record](auditor-browser.json). Earlier role records and private page text are retained outside Git in `/home/kripta/ja-manual-refresh-evidence-20261011`; private names/content and session cookies are not published. Existing documented internal Worker logins and Supplier Coordinator login returned 401, so no successful fresh production journey for those identities is claimed. No credentials were reset, and no production business form was submitted. Their instructions were checked against the current source, existing isolated release browser evidence, and role-download security tests. Crew chief remains a delegation of Worker, not a separate base role.

## Published result

Production now runs **manuals-848c07f20efc**, source **848c07f20efc08a0b07e2ea23bb393b7d25392f0**, published to GitHub main. [Deployment receipt](deployment.json), [source/manual comparison](published-parity.json), [image identity](image-build.json), and [live runtime verification](live-runtime-verification.json).

All eight current role PDFs were downloaded through authenticated live Help and matched the source hashes. Five available live personas passed Help checks at 390 and 1440 pixels; each non-Owner check denied the Owner PDF. [Live checks](live-downloads.json). The private internal-worker/coordinator credential limitation remains as stated above; Owner downloads of those manuals verify delivery, not a fabricated login as those personas.

A stopped-writer database/private-files backup was verified before activation. SQLite remains schema 77 with integrity `ok` and no foreign-key violations. Issued invoices, their lines and existing private files remain unchanged. Portal readiness passed, maintenance was removed, all five operational timers were restored and [jobs cycles](jobs-health.json) completed without failures. The public Help page was also opened after maintenance was removed.

The pinned-parent image replaces the portal build/generated metadata, matching portal source and 19 Help PDF assets. Dependencies, migrations, jobs bundles, OCR tools and public-site content are unchanged. This receipt is a later documentation-only commit; it does not require another runtime deployment.
