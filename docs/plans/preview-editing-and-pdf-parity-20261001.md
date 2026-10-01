# Preview editing and PDF parity — implementation plan

User authorization: Owner requested editable document previews, immediate saved refresh, reusable source settings, matching downloaded PDFs, and a swarm implementation with browser role QA. One browser instance/page remains the QA constraint. Production financial history remains authoritative.

## Source findings

Invoice detail screen and invoicePdf use separate DOM/CSS, including different fonts, headings, metadata grids and service sections. Field/period report detail screens likewise differ from their PDF HTML. Changing only PDF margins cannot establish parity.

Draft invoice customizations currently mutate snapshot JSON without version advancement or audit and present discount without recalculating totals. Invoice numbering is assigned transactionally by reviewed policy at issuance. Actual issuance timestamp differs from an editable business document date. Issued documents must use frozen customer/project/tax/issuer facts.

## Dependency order and ownership

1. Parent finishes viewer persistence and truthful active project dashboard, with independent review and browser evidence.
2. Invoice presentation worker shares escaped canonical HTML/CSS between preview and PDF, ports the polished existing screen design, preserves all invoice template families, and adds role-authorized keyboard/click editing affordances.
3. Invoice backend worker supplies authoritative draft date/due/terms edits, version conflicts, live-session/object checks, append-only audit, cache invalidation and reusable billing stream settings in an additive migration. No arbitrary invoice numbering or direct edits of calculated money.
4. Report worker shares daily/technical/period renderer HTML and normalization between authenticated previews and PDFs. Draft/returned report fields use existing versioned form/autosave. Approved reports use corrections; period totals navigate to source records and regenerate a new snapshot.
5. Parent integrates exports/template versions, checks failure/error states and dirty guards, runs static/build gates, obtains independent financial/security/browser review, and executes sequential role browser QA.
6. Deploy a pinned archive with backup and health checks; push reviewed code/evidence to GitHub and prune build cache after the last successful release.

Workers have bounded files/function ownership, share the checkout, and must not revert concurrent edits. Only parent operates the browser. Agents provide role-specific acceptance cases for parent to execute.

## Browser acceptance

- Owner: currency USD/EUR persistence; draft editable metadata save/preview refresh/reload; stream PO/terms/default propagation into a subsequent draft; invalid dates and stale-version useful errors; numbered/issued invoice immutable.
- Finance: eligible draft fields and commercial configuration; no Owner-only numbering authority bypass.
- Crew chief/worker: own draft/returned daily and technical source edits through preview; save acknowledgements advance version and invalidate stale PDFs; no cross-worker or commercial authority.
- Scoped PM: allowed operational edits only within projects; no compensation/private Finance fields or widening from previews.
- Auditor: read-only preview/download; no editable affordances or mutations.
- Document QA: browser preview versus downloaded PDF same HTML/CSS/fonts/data at supported locales; multiple pages, long text, all invoice families and field/period reports; no leaked screen edit controls in print.
- Failure QA: blocked storage, expired authorization, validation retains inputs, version conflict, pending/failed PDF generation, corrections and historical artifacts.
- Responsive QA: 360/390 phones, 768 tablet, 1440 desktop; readable labels, usable preview scaling and editor controls.

Test records are created through ordinary UI in an isolated production snapshot. Production QA projects stay archived/deleted according to record history safeguards. No API or SQL functional assertions and no external invoice sending/issuance merely for QA.

## Completion evidence

Code presence is not PASS. Record actual URLs, roles, actions, expected/observed results, downloaded artifact comparisons, reviewer verdict, release SHA/backup/health and limitations. The older 10 UX + 10 bug goal requires affected-role after-verification and remains separately tracked.
