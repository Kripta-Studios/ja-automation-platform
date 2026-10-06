# BBS assignments, crews and expected-hours verification · 6 October 2026

This supplement records the user-requested multi-agent browser exercise and additions to all eight English role PDFs. It supplements, rather than replaces, the [original role-manual evidence](../bbs-role-manuals-20261006/README.md). It certifies the scenarios below, not every platform workflow.

## Environment and privacy

Independent Playwright Chromium sessions used the built application, genuine role sessions and native forms in a new isolated copy of the fictional BBS training database. All synthetic assignments, schedules, hours, report goals, approvals and coverage fixtures were created there. No production business records were created by this exercise. Credentials, cookies, private database copies and raw page dumps are outside Git.

The guides preserve role boundaries. Worker and Chief see their operational work; PM sees authorized crew operations; External Technician sees own supplier work; Supplier Coordinator sees its authorized supplier team. New operational screenshots exclude client rates, costs, margin and other workers' compensation. Finance and Auditor have their own reconciliation chapters. Live links are labelled as live navigation; practicing consequential actions requires a separately supplied training environment.

## Connected browser exercise

| Scenario                                             | Observed outcome                                                                                                                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner publishes October 20 to three fictional people | Three separate eight-hour published plans; zero actual time at publication.                                                                                                                                                           |
| Each internal person opens its agenda                | Each sees its own eight-hour plan.                                                                                                                                                                                                    |
| Worker and Chief record real operational sources     | Technician 1 personally records six hours; Chief records Technician 2's seven hours under delegation and its own eight hours. Three sources, 21 actual hours.                                                                         |
| PM reviews the three internal sources                | All three become Approved. Timesheets show 6/8/−2 and 7/8/−1 as Needs note, and 8/8/0 as Approved. A comparison label does not reverse source approval.                                                                               |
| Expected Working Schedule                            | Native dated schedule save: effective October 19, weekdays eight hours, weekends zero. The existing project timezone is retained; the form also controls that timezone.                                                               |
| PM edits and cancels plans                           | October 21 plan changes from two to three hours without changing the eight-hour expectation. A separate October 22 plan is cancelled with its history retained and disappears from the agenda. Neither operation creates actual time. |
| Missing and expired coverage                         | Before membership, Expected/Difference are unknown. After supplier membership expiry, personnel cannot be selected for publication/entry.                                                                                             |
| External and supplier actual work                    | External personally submits two hours; Coordinator submits two separate one-hour supplier sources. Owner approves supplier time; PM approves the authorized Daily report, but has no supplier-time approval authority.                |
| Supplier visibility                                  | External report contains only its own source; Coordinator report contains the authorized team. Internal Today/Planning routes are denied for these restricted profiles.                                                               |
| Goals/progress                                       | Native Daily report Tasks completed, Open items and Next-day plan are submitted/reviewed. There is no generic Accept/Reject/Mark completed goal module. Project milestones are a separate capability.                                 |
| Finance/Auditor reconciliation                       | Both filter the October 20 actual source register to three approved rows totaling 21 hours, distinct from 24 planned hours. No additional invoice or payment is generated.                                                            |

The final native Worker check adds a second fictional project membership covering October 23 only. Expected and Difference become unknown (—) for that date; October 20 remains 6/8/−2 and Approved at source level. The current project selector still contains only BBS, and the future project's name is absent. This is a later checkpoint than the original single-project weekly screenshots. See the Owner/PM final manifests for the exact fixture scope and screenshot.

## Defects and regression coverage

The native publish form erased Site and Required expertise when a worker checkbox changed after typing. Reactive form state now retains both fields. Owner desktop and PM phone retests cover check/uncheck/recheck, invalid end-before-start validation, recovery and persisted publication. A dedicated four-case E2E suite covers both roles at desktop and phone widths.

The final nine-file scoped suite passed 115 cases, covering planning, agenda, weekly comparison, loader privacy, supplier-route, catalog and lifecycle behavior. Initial stale fixture calls/session/schema setup were repaired without weakening assertions. Portal typecheck, the configured production build and scoped lint passed. Supplier final-build smoke passed 12 checks. [Code verification](code-verification.json) records the bounded coverage.

The expected-hours loader previously omitted an internal worker's own future-only second assignment from ambiguity detection. It now counts own dated membership identities internally, while schedule values remain limited to currently visible projects. Hidden project identities are never serialized; actual-time, project and pay access remain unchanged. Both restricted supplier profiles retain their prior dated operational scope. Loader regressions cover overlapping/hidden-only dates, unrelated workers, inactive memberships, archived projects and supplier profiles.

During an intermediate local retest, an E2E rebuild replaced compiled server chunks beneath the running isolated server. Agents paused; the server was stopped and restarted after the build. Final browser checks passed. This was a test-harness interruption, not a production failure.

## Artifacts and evidence

- [Owner](owner/README.md) and [PM](manager/README.md): publication, dated schedules, edits/cancellation, validation recovery and ambiguity.
- [Worker](worker/README.md) and [Chief](chief/README.md): own/delegated actual work and approved comparisons.
- [External Technician](external-technician/README.md) and [Supplier Coordinator](supplier-coordinator/README.md): supplier entry, reporting, expired coverage and access denials.
- [Financial preservation](financial-preservation.json): original training financial rows preserved; explicitly scoped synthetic rule additions are enumerated.
- [Help verification](help/verification.json): genuine role libraries, allowed/denied downloads, canonical PDF hashes and 1440/768/390/360 layouts.
- [PDF verification](../bbs-role-manuals-20261006/pdf-verification.json) and [build manifest](../../manuals/bbs-role-manuals-build.json): final pages, screenshot hashes, instructions and layout checks.

Screenshots are actual browser captures, with operational crops where needed for privacy. They are not fabricated application mockups. The Owner's existing 203-page course, six attachments and final invoice annex are preserved. English editions remain explicitly labelled; no new Spanish/Portuguese translation is claimed.

## Publication and production verification

Independent final review: [SHIP](independent-review.json). The final eight PDFs contain 608 pages and 213 figure placements. Source `969aae1454a0fbb3f67f7d3493cdfcffd89079b7` was pushed to GitHub `main` and deployed through the canonical ZIP entrypoint, with a verified pre-replacement backup and retained rollback images.

The [deployment receipt](production-deployment.json) records the archive, active release and matching deployed source/PDF bytes. Local readiness, public health, jobs/service-actor preflight and backup/deploy/job timers passed. All [45 protected production business tables](production-postdeploy-business-hashes.json) retain their exact pre-deployment counts/hashes; SQLite quick check is `ok` and foreign-key errors are zero.

The genuine existing Owner's [eight native live Help downloads](production-help-verification.json) match the final canonical PDF hashes at desktop/tablet/phone layouts; anonymous downloads remain denied. Eight separate role contexts and the full role download matrix were verified in the isolated final build. Production verification was read-only; synthetic workflow records remain confined to the training clone.
