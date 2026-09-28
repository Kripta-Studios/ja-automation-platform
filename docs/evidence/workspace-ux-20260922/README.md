# Workspace navigation and date filtering — 2026-09-22

## Visual assessment and references

The deployed source baseline is `6bd441b` (evidence-only successor to production `1d730f3`).
Chromium inspected the same application build on isolated synthetic Owner, Worker, Finance and
Project Manager accounts: dashboard, projects, approvals, planning, time, expenses and reports.
Baseline desktop screenshots are in `before/`; no production customer operations were created.

Observed opportunities: Owner navigation requires scrolling through a long list; the weekly
sheet required opening a date picker for adjacent weeks; period filtering required typing two
dates; active criteria could only be cleared together. The existing typography, restrained
palette and role-specific workspaces remain the visual basis.

References consulted on 2026-09-22:

- [Kimai timesheets](https://www.kimai.org/documentation/timesheet.html) and
  [calendar](https://www.kimai.org/documentation/calendar.html): quick movement through time and
  visible date ranges informed the weekly controls and period presets.
- [Harvest navigation](https://support.getharvest.com/hc/en-us/articles/44165229587469-Navigating-Harvest):
  its organization around operational destinations informed a searchable section switcher.
  This is our design inference, not a claim that Harvest provides this exact component.
- [Odoo search and filtering](https://www.odoo.com/documentation/18.0/applications/essentials/search.html):
  composable criteria informed individually removable filter chips.

No external code, branding or visual assets were copied. No database migration, monetary
calculation, historical artifact mutation or permission change is part of this release.

## Implemented behavior

- Header section switcher with Ctrl/⌘ K, accent-insensitive localized search, arrow/Enter navigation,
  Escape, focus restoration, native modal containment and no-results feedback. Destinations derive
  from the existing visible role/profile navigation; server authorization remains authoritative.
- Today, this week, this month and last month filters in Time, Expenses and Reports. Dates use the
  browser's local calendar, with Monday–Sunday weeks and calendar arithmetic across DST/leap years.
- Previous/current/next week changes both the sheet and register period while retaining non-date
  criteria. These controls only navigate; they do not copy or create time.
- Individual criterion removal, preserving remaining criteria and language. Explicit empty search
  parameters prevent stale session storage from reviving a removed query.

## Verification and delivery

The dependency order is implementation → browser/unit/accessibility checks and independent review
→ fresh manual screenshots and all nine manuals → synthetic export examples → production deployment
→ preservation/health verification and builder-cache cleanup → GitHub evidence receipt.

Initial browser runs found and corrected the hidden mobile drawer being treated as an open modal,
and Escape being consumed by the search input. Initial immediate URL assertions were replaced with
awaited SvelteKit navigation assertions. Lint required the repository's reactive Set convention.
These preliminary runs are not counted as passing evidence.

Final gate totals, independent review, manual identity, archive identity and production checks
are recorded below once executed. This UX release does not claim a new full contractual acceptance
or resolve previously documented external acceptance and historical backup-coverage items.

## Expanded EN / ES / PT-BR review

The user additionally requested a complete text/translation review. Static scanning covers Svelte
literal prose and accessibility labels; catalog checks cover 2,739 keys per language, action
messages, controlled values and interpolation placeholders. The public website has 754 string
leaves in each language, no missing keys or mismatched placeholders; unchanged strings are proper
names/technical standards. Browser coverage adds visible placeholders, titles, accessible names
and select options to the seven-persona, three-language route matrix.

Corrections include registered time/filter copy, a missing transient time-save error translation,
localized supplier language options, all 17 billing-readiness reasons in ES/PT (nine had inherited
English), Brazilian Portuguese notification wording and clearer report dispatch/signatory terms.
Revenue cap now means an income/revenue limit, distinct from a project budget. Hour entries and
hour-related financial data use natural terminology. Existing financial calculations and historical
notifications/artifacts are not rewritten.

A recursive regression checks nested report-review outcomes; previous shallow checks could miss
conditional messages absent from the happy-path fixtures. A pre-existing contrast assertion tied
to an old fallback hex was replaced with checking the control-border token and actual ≥3:1 contrast.
The keyboard shortcut legend is explicitly recognized as language-independent notation.

Visual inspection of the newly generated Spanish Worker form exposed two unregistered dynamic
category labels (`Work`, `Standby`) that the literal-call extraction and happy-path route scan did
not cover. Both were translated with the existing controlled vocabulary, and a regression now
extracts all nine operational category labels and requires catalog coverage. The manual capture
flow independently asserts the rendered Work/Standby options in EN/ES/PT before taking screenshots.
The source was fixed and screenshots were regenerated; the preliminary capture is not final evidence.

The final bounded dynamic-label review additionally caught a case-mismatched technical-report
heading and the travel-detail field label. Section/view titles now use canonical catalog keys;
the capture flow verifies the technical-report heading and travel field in all three languages.
The 23-test follow-up selection passes. Final runtime source is `767d1f9`.

## Final documentation and artifacts

- Final runtime source: `767d1f9`; 142 authenticated screenshots / 239 capture checks, including
  Worker ES and seven personas in EN/PT-BR. Nine PDF manuals (14–17 pages) pass font/image/text/hash
  checks; the Spanish quick guide uses Spanish screenshots. The PDF contents no longer duplicate
  numbering already present in Markdown headings. EN/ES/PT pages were visually inspected.
- Native generators recreated 54 examples and two real-lifecycle closeout archives. The browser
  generated 30 print-layout PDFs. The portable collection contains 86 artifacts: 64 PDF, six XLSX,
  13 CSV, one JSON and two ZIP. PDF extraction, spreadsheet/CSV structure, ZIP paths and SHA-256
  checks pass; gallery search/combined filters and bounds pass at 390/1440 px.
- Full evidence is in `verification.json`, `verification.txt`, `review.md`, `gallery-check.json`,
  `../../manuals/validation/pdf-quality.json` and `../../manuals/examples/validation.json`.

Authenticated manual downloads pass for the persisted role/persona, legacy links, transient
retry, localized persistent failure and session expiry (three desktop cases). The 390 px Help
layout passes its separate phone-only case. Historical evidence screenshots were preserved;
new Help images are stored in this release directory.

## Production receipt

Deployed commit **`d7fbd72d746b05bf8d99a294ca843b3e1bbfda0a`** on **2026-09-22 at 17:49:09 Europe/Madrid**.
The archive SHA-256 is `f65e3d9aa8b0014bf1735533f0027c0747495fb509810e0823e65f6bd4f2b31a` (262,926,299 bytes). The deployed
release matches all 2,538 archived files; 604 runtime source files match the working tree.
Nine installed PDFs match the regenerated manual hashes.

SQLite integrity is OK with zero foreign-key violations. The eight historical financial tables
and all 59 existing private files retain their baseline hashes. The latest backup
was verified through an isolated SQLite copy plus registered-artifact checks. Its historical
coverage remains 14/30 days; this pre-existing history limitation is not claimed resolved.

Public-browser checks pass on 12 EN/ES/PT website/login combinations at 390/1440 px,
with loaded fonts, no horizontal overflow and no console/network errors. Site and portal are
healthy. Four automatic job executions in two distinct minute cycles succeeded; new-container
logs contain no matched errors. Caddy and Stalwart retained their PIDs, backup/jobs timers are
active, and unrelated running containers retained their identities.

`docker builder prune -af` reclaimed **6.88GB**. Build cache is **0 B**; images, volumes and
application data were preserved. The final GitHub receipt commit only adds verification evidence
and this checklist update; production runtime remains the commit above.

The initial explicit deployment attempt met the active ZIP scanner lock and exited without
deploying. After that scan completed, the explicit archive deployment succeeded. No permission
or manual product-job action was needed.
