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
