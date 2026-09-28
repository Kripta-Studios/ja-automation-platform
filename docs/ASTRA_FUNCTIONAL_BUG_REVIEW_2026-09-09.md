# Functional bug review — 2026-09-09

Tests use real authenticated browser sessions against disposable SQLite and private-document
fixtures. Production checks in this review are read-only. This record does not declare complete
application acceptance or human UAT.

## General regression

The full Vitest run completed 1,314 cases: 1,303 passed and 11 failed. All failures were exact
schema/metadata expectations left at version39 after migrations40–41. The five initially corrected
files passed 51 cases; four additional corrected files passed 12 cases, and the unchanged B5
migration contract passed 13. Historical-data, integrity, foreign-key and immutable-history
assertions were retained. The full-run result predates the behavioral fixes below.

## Reproduced behavior defects

1. **Open-ended Worker assignment:** the Owner form submits an empty end date. Creation stored
   `''`, whereas membership SQL requires `NULL` for no expiry. The assignment appeared saved but
   did not grant effective Worker scope. Normalize the blank date to `NULL`, matching assignment
   updates. The regression failed before the fix and 20 assignment/privacy cases passed after it.
   A read-only production count found zero affected assignments; no historical repair was made.
2. **Hourly/Daily compensation form:** the form always submitted a hidden percentage, even for
   non-percentage rules, and the domain correctly rejected the request. Render percentage fields
   only for the percentage model; retain the server rejection of inconsistent inputs. The real
   two-worker browser journey reproduced HTTP400 before this correction.
3. **Invalidated customer conformity:** the report detail loader discarded the invalidated record,
   causing the UI to display `ready_for_signature` instead of `invalid`. Preserve the invalidated
   current-version evidence in the DTO; acceptance still requires active, verified conformity.
   The existing browser journey reproduced the wrong state; 15 related integration/regression
   cases passed after the correction.
4. **Optional financial fields:** compensation/internal-cost creation and assignment overrides
   preserved blank expiry dates instead of SQL `NULL`; optional global project scope and unused
   override references also retained blank foreign keys. Normalize only exact empty strings,
   preserving validation of nonempty malformed input. Four new regressions exercise stored values,
   real Worker Pay/internal-cost selection, bounded expiry and invalid dates; 17 related cases pass.
   Read-only production checks found zero blank expiry dates in compensation/client/internal-cost
   tables. No stored financial history was rewritten.

Independent review of the assignment, compensation form and invalidated-conformity corrections
found no permission/acceptance regression. The parent reviewed the separately implemented
financial normalization and its exact-money/expiry tests. Full workspace TypeScript passes.

The next browser run advanced past both initial failures and exposed two stale test assumptions:
the localized success text differs from the action fallback, and a new unapproved report snapshot
must show `needs_report`, not inherit the old version's invalidated conformity. Corrected those
expectations while preserving the original same-version `invalid` assertion and immutable old
conformity evidence.

## Browser evidence and remaining checks

The first broader run passed 22 cases, failed the two browser defects above, and intentionally
skipped six viewport-specific cases. Passed flows include Worker time/Travel/Standby, receipt
expense, reports and own pay; PM financial-field exclusion; Finance expense classification and
payment reversal; queued/ready/failed accounting formats and actual downloads; Owner reversible
client/project/account lifecycle; and private immutable Worker statements.

The corrected cross-role rerun passed every selected cross-role case (11 passed including the
manual capture, six deliberate viewport skips); its remaining failure was an ambiguous locator
in the new multiworker test. After scoping that locator to the pay summary, the isolated
multiworker rerun passed in 24.1 seconds: both assignments and rates were created through the UI,
both six-hour entries submitted/approved, project estimates were exactly 15000/18000 minor units,
and each Worker received HTTP200 for their own time versus HTTP404 for the other's.
The optional financial-date investigation and 17-case verification are complete.
Independent review found no code correction necessary and requested this evidence-status update.

Follow-up inspection found assignment edit controls do not clear optional values correctly;
that correction now passes action-level regressions and the real two-worker journey at 360, 390, 768 and 1440px. See [the production audit](PRODUCTION_AUDIT_2026-09-09.md) for the subsequent security, restore and full-suite evidence. No unexecuted case is counted as passed.
Logs: `/tmp/astra-multiworker-final.log`, `/tmp/astra-full-functional-vitest.log`,
`/tmp/astra-assignment-red.log`, `/tmp/astra-assignment-fixed.log`,
`/tmp/astra-functional-browser.log`, `/tmp/astra-functional-browser-fixed.log`,
`/tmp/astra-signoff-fixed.log`.
