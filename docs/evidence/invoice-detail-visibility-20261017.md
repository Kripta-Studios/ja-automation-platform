# Invoice detail visibility correction — 17 October 2026

The user rejected the discoverability cost of hiding nine invoice detail sections
behind a collapsed disclosure. This follow-up corrects that scoped CORE-10 / CORE-14
behavior introduced by `f67d3c7b`, without reducing invoice customization.

The three main stages now display their complete detail sections automatically:

- Project: project/stream selection, stream settings, labor/expense source and grouping.
- Period: dates and readiness, included records, excluded/pending records.
- Review: taxes, invoice data and PO, payment terms, commercial-adjustment guidance,
  preview and draft saving.

All nine detail shortcuts are visible in a labeled overview. They move keyboard
focus and scroll to the requested section. Fresh whole-period entry starts at the
first stage; explicit readiness recovery continues to return to the period.
The interface explains saved configuration versus later draft adjustments in
English, Spanish and Portuguese. Individual record selection remains available.

This changes presentation and stage navigation only. Server authorization, source
eligibility, exact-money calculations, readiness requirements and the explicit
draft/approval/issue lifecycle retain their existing implementation.

## Verification

Before-change production screenshots at 390 and 1440 px confirm the collapsed
detail list and abbreviated final review. The focused invoice-composer API and
readiness-problem suite passes 18 tests. The new browser suite passes 12 cases:
English, Spanish and Portuguese at 360/390/768/1440 px, using Owner and Finance.
It covers automatic detail rendering, visible touch-sized shortcuts, keyboard
focus, preserved stream/dates, unready-save blocking and absence of submissions.

Independent browser review covers all four widths, manually opened screenshots,
the complete normal journey, individual detail shortcuts and returning to record
selection. No JavaScript errors or business mutations were observed. It found an
inaccurate new instruction about managing a stream: the final wording now correctly
describes opening the list, finding the selected project's stream and opening its
editor. All source/readiness/API checks retain their existing semantics.

Portal TypeScript and production compilation pass. Existing build warnings remain.
The deployment-smoke rehearsal passes all four widths with zero JavaScript errors
and zero mutation requests. The initial billing regression run was stopped after
three new assertions used a nonexistent test selector; they now use the real
visible end-date label. Final billing results cover 48 passing cases: twelve at
360 px, then 36 at 390/768/1440 px. The first final runner lost its browser channel
after the twelve successful 360 px cases; the isolated preview and remaining
tests were restarted, and all 36 passed. No application assertion failure was
reported in that interrupted run. The targeted browser-Back / late-readiness
regression also passes. Scoped ESLint, formatting and diff checks pass.

The independent reviewer returned **SHIP** for this scope, including the corrected
instructions on the final compiled application. Release receipts retain the exact
commit, verified database/document backup, previous release, runtime hash checks,
history comparison and post-deployment read-only browser results.

Private operational evidence is retained in
`/home/kripta/ja-invoice-visibility-evidence-20261017/`.
It contains private browser sessions and must not be published wholesale.
This is scoped correction evidence, not whole-product Client Essential acceptance.
