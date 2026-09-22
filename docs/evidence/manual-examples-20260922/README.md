# Export examples and reporting improvements — 2026-09-22

The user requested a complete example collection in the manuals folder and a review of the
appearance and information in generated exports. The deliverable is
[`docs/manuals/examples`](../../manuals/examples/README.md), generated exclusively from isolated,
synthetic fixtures through real application renderers and repository lifecycles.

## Coverage and independent readers

- 54 native examples: 34 PDFs, six XLSX workbooks, 13 CSV files, one JSON export.
- Two authentic project-closeout ZIPs, internal/client, with immutable snapshots, document index,
  manifest and paginated PDF summary. The client package includes a selected synthetic technical PDF.
- 30 browser-print PDFs: ten real application views in EN/ES/PT-BR, distinct from native downloads.
- Total: 86 artifacts; the documentation ZIP additionally contains the gallery, manifests, validation
  results and previews. It is not an extra application export format.
- Poppler opens/extracts all PDFs; openpyxl 3.1.5 independently reads all workbook sheets, types and
  formats; Python reads every CSV/JSON and checks ZIP CRCs and the closeout manifest hashes.
- The portable gallery was exercised in Chromium at 390/1440 px, including combined filters,
  Portuguese native/browser exports and Spanish search. See `gallery-check.json` and screenshots.

`examples/manifest.json` records individual hashes/sizes; `examples/validation.json` records the
independent reader results. Previews are explicitly first-page / first-15-row samples.

## Changes and findings resolved

Worker statement PDFs use readable landscape columns and compact summary cards. Period reports
use explicit column widths and compact summaries. Daily/technical report fields wrap long contact
values. Expense PDFs retain every field while placing narrative/context in full-width rows.
Spreadsheet headers, money/date types, filters and printing improve readability; values beyond
Excel's 15 significant digits remain literal text rather than being rounded.

Closeout summaries no longer truncate records at 105 characters or 34 lines. They paginate, retain
punctuation and render EN/ES/PT text with WinAnsi. Characters outside that font are visibly escaped
as `[U+XXXX]`, with an explanatory note; original Unicode remains available in PDF copy/search and
in the complete JSON snapshot.

Independent visual review caught an existing Accounting Pack PDF bug: explicit `450` approved
minutes were treated as 450 hours by a magnitude/divisibility heuristic. Rendering now uses the
source field's unit: 450 + 480 minutes produces 7.50 + 8.00 = 15.50 hours. Invoice/expense table
widths and localized credit labels were also corrected.

Browser capture exposed an internal period-detail 404: the loader called the customer-only
follow-up repository for an internal report. Conformity/follow-up loading is now limited to customer
reports. Snapshot access checks remain unchanged. Both populated report audiences are checked by
HTTP status, lifecycle/header content and presence/absence of the customer sign-off panel.

One initial capture selected an older queued customer draft without a canonical snapshot. The
service correctly rejected it. The fixture selection now chooses the populated, bound snapshot;
no validation was weakened.

## Artifact identity and history

Invoice and Accounting Pack CSV/JSON versions remain `2026.09.02.2`. Redesigned/fixed Accounting
Pack, period, field and worker PDFs and XLSX outputs use `2026.09.22.1`, with family-specific
localized identities and storage keys. Every relevant enqueue/retry path stamps versions.
Missing/stale payloads fail before refreshing snapshots or writing bytes. Existing ready/finalized
artifacts are preserved; retry and new-request paths maintain independent format states.

Focused tests cover exact amounts and spreadsheet injection/precision, page bounds and content,
closeout authorization and immutable ZIPs, version guards, period/accounting enqueue/retry,
localized API permissions, worker high-volume recovery and independent-format failures.
No schema migration or historical financial-data rewrite was introduced.

## Release verification

Production baseline hashes and post-release results are recorded alongside this file. Mail checks
use protocol/TLS negotiation only, without mailbox authentication or sending messages. Docker
cleanup is limited to builder cache; application data, volumes, mail and music storage are retained.
The deployment receipt will record the exact Git/archive identity and final verification outcome.

## Final source and capture gate

Runtime source commit `5b65dfdfad3946bbb5092efecece5c7a69856160` was pushed. Runtime digest:
`bf05cb01bf58db1ff92da81b61efc4cb4c0b4c1b8d3561a67bc68bee9064b169`.
A fresh portal build and clean-fixture browser run passed both tests (3.9 minutes): 116 manual
screenshots, 202 checks, and all 30 print PDFs. Nine active manuals were regenerated and passed
PDF hash/source-binding, embedded-font, image, page and extracted-text checks. See the
[manual quality manifest](../../manuals/validation/pdf-quality.json). The independent review
[SHIP verdict](review.md) is followed by these successful final gates.

## Production receipt

Commit **`1d730f342cc294729ee0b4e96cbf1258f0e6adc8`** was pushed and deployed successfully at
**2026-09-22 16:28:05 Europe/Madrid**. Archive SHA-256:
`c1285f14e4a94148bbfc36a8df403b7a1c7ffc4eb0fb9c51edd36cb84829c251`. The active release is
`/opt/jaautomation/releases/ja-automation-c1285f14e4a94148bbfc36a8df403b7a1c7ffc4eb0fb9c51edd36cb84829c251`.

- All **2,441 archive files** and **601 runtime source files** match;
  all nine installed manuals match their validated hashes.
- SQLite integrity is `ok`, FK violations are zero, the eight financial table hashes are unchanged,
  and all **59 private artifacts** retain their bytes.
- Public EN/PT website and portal login checks at 390/1440 px passed with HTTP 200, expected fonts,
  no overflow and no browser/network errors. Authenticated behavior was checked on isolated fixtures.
- Two automatic jobs cycles and production health/readiness passed. Four historical dead-letter
  jobs and two historical failed localized-PDF records remain; these were not silently repaired.
- The pre-deployment backup passes database/FK and **59-document** validation.
  Historical backup coverage remains **14/30 days**.
- SMTP, STARTTLS, SMTPS and IMAPS TLS checks passed; both webmails returned 200. The Stalwart
  service PID/start time is unchanged. No mailbox authentication, reading or sending was performed.
- All required services/timers/watchers and the music bind mount are active; containers are running
  and those with health checks are healthy. New site/portal/jobs log scans found no structured
  errors or unhandled exceptions in the recorded observation window.
- Docker **builder cache only** was pruned: **6.854GB reclaimed**, **0 B remaining**. Images,
  volumes and application/mail/user data were retained. Free disk: **24.7 GiB
  on sda1**, **58.35 GiB on sdb**.

Transient readiness timeouts are explicitly recorded in `build-health-observation.json`: three
5-second checks timed out on the old portal during compilation, and the first new-container check
also timed out. Both recovered healthy; a public login check during the old-container recovery
returned 200 in 0.25 seconds. Build contention is a possible cause, not a confirmed root cause.
This receipt does not claim permanent absence of load-related readiness latency or resolve the
previous mail threat-feed/DNSSEC-DANE warnings.

The final evidence-only commit does not change deployed application or manual files.
