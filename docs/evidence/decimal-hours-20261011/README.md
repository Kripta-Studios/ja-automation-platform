# Decimal hours in forms and human-readable exports · 11 October 2026

User-requested scope: duration entry and display in decimal hours, including newly generated PDF, XLSX and CSV artifacts. Examples: 450 stored minutes display as 7.5 hours; 480 as 8 hours. Four decimal places preserve a one-minute duration as 0.0167 hours when necessary. Hours accept a decimal point or comma. Timeouts and clock minutes retain their own meaning.

The shared duration input submits the existing integral-minute field. Existing records, legacy digital-capture drafts, exact-money calculations, object authorization and financial history keep their original meaning. There is no schema migration. The digital-capture, daily-report/create/edit/autosave/correction, planning, expected schedule, commercial overtime and daily-guarantee controls use hour labels and bounds. The generic planning administration editor and minute-sensitive project/supplier edit fields are included.

New daily and period PDFs, Accounting Pack PDFs/XLSX, project-finance XLSX, worker statements and supplier CSV present hours. Raw duplicate minute columns are removed from the affected human-readable spreadsheets/CSVs. Spreadsheet hour cells remain numeric; monetary precision and formula-injection protection remain unchanged. Canonical machine/audit snapshots retain minute fields. Changed renderer versions are advanced to `2026.10.11.1`; invoice renderer and machine-data versions remain unchanged. Previously issued/finalized artifacts are not rewritten.

## Verification and limits

- Export/input suite: 72 passed; four invoice layout/title expectations failed identically on the previous main commit `c9f308b3f8e162272db8b1f9be0f4c9c575d9534`. Assertions were not weakened or skipped.
- Invoice composition/invariants, project-budget conversions, correction fields and finance readiness: 27 passed.
- Additional focused domain/security/capture suite: 55 passed; four report-immutability fixtures failed with access-denied errors, also reproduced unchanged on the previous main commit. No repository permission logic changed.
- Changed-source ESLint/Prettier, portal and reporting typechecks and job builds passed. Final production build and browser receipts accompany the release evidence.
- New PDF tests extract actual rendered PDF text for EN/ES/PT downtime and one-minute period detail/totals. Workbook tests inspect real OOXML numeric cells and retain exact monetary values. Supplier conversions round-trip every whole-minute duration from 0 through 1440.

This is a scoped duration presentation release, not a new whole-product Client Essential certification. Private authentication state, business screenshots and raw production audit contents remain outside Git in `/home/kripta/ja-hours-evidence-20261011`. No production business record is submitted by the release probe.

- Final compiled-build browser checks: capture and report create/reload/autosave/inline-PDF-edit/correction passed on phone 390 and desktop (4 passed; 2 opposite-viewport cases skipped by design). An additional desktop supplier workflow passed with the actual CSV response and printed PDF retained in private evidence. It confirms a 0.25-hour break and 1.25 actual hours after editing the interval.
- Nine isolated form checks passed at 360/390/768/1440 with labels, touch size, focus, conversion/bounds and overflow checks. Parent visually inspected full viewport phone schedule and desktop guarantee screenshots.
- All eight role manuals passed strict PDF and screenshot-hash checks; the combined Owner manual remains 276 pages. The 4-page Digital Workers guide was also regenerated. No historical archive, screenshot pixels, video, invoice attachment or original annex was rewritten.
