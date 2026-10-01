# Document preview editing, PDF parity and remembered views — browser evidence

Run started 2026-10-01. This records the lead agent's observed browser QA of the candidate implementation, together with its source and documentation boundaries. It is not a production activation record or a final Client Essential acceptance verdict.

## Scope and method

The Owner requested editable document previews, saved changes that refresh the preview, reusable settings for subsequent invoices, downloaded PDFs that match their previews, and persistent filters/view selectors. The implementation plan is [preview-editing-and-pdf-parity-20261001.md](../plans/preview-editing-and-pdf-parity-20261001.md); the usage and source-field mapping are documented in [Document_Preview_Editing.md](../manuals/Document_Preview_Editing.md).

Functional QA used ordinary browser controls, navigation, native form submissions, reloads and downloads. The lead operated one browser instance/page at a time and switched accounts through the normal UI. Parallel agents investigated, implemented bounded source changes and independently reviewed them; they did not operate additional browsers. No API test scripts or SQL functional assertions establish the results below.

Mock records were created through the UI on an isolated production snapshot at loopback port 5182. The new Active QA project is `01a0f89b-1ea9-77ed-8d24-b172350f3d13`. These candidate writes did not create new QA projects, approve real operational entries, issue invoices or send customer documents in production. Test credentials remain in the private account manual and are not copied into this evidence file.

## Role and source-edit evidence

| Role / workflow | Observed result |
| --- | --- |
| Worker1, own daily report | Report `01a0f8a1-8d5a-73b8-a390-b4a2622d213e`: clicking Summary in the document preview and saving advanced the saved report to version 2. Editing Next day plan advanced it to version 3. The preview reflected acknowledged saves. |
| Scoped Project Manager | The PM edited Contact on that assigned-project daily report, advancing it to version 4. This verifies an authorized operational edit; it does not establish Finance or cross-project authority. |
| Worker1 submission / Owner approval | The same daily report was submitted at version 5 and approved by Owner at version 6. The approved source remained historical when a correction was created. |
| Owner, approved daily correction | The preview correction link opened the existing correction disclosure. Cancel preserved entered text/reason. Creating corrected draft `01a0f8c9-77a3-741e-b9e1-4f325ce8802a` produced a new audited record; the approved original remained unchanged. |
| Worker1, technical report | Technical report `01a0f8ac-abb7-75a0-96fd-acb39e608c83`: Validation result was edited from its preview, saved at version 2, and survived reload. The Worker submitted it; Owner returned it. It then appeared as Needs changes in the review queue with zero Approve controls pending author resubmission. |
| Worker1, own time | Double Save of the mock 75-minute entry produced one submitted row, subsequently approved by Owner. This is observed duplicate prevention for that attempt, not an exhaustive concurrency test. |
| Worker1, own expense | Double Save of the mock 9.50 expense produced one submitted row. Approval of this expense was not yet verified when this evidence was written. |
| Owner / Worker1 crew chief / Worker2 | Owner granted Worker1 delegation over an already assigned Worker2. Double Save of 30 minutes produced one Submitted 0.50-hour Worker2 row in the chief's refreshed register. Worker2's own Time register also showed exactly one matching row after navigation. Chief authority came from the delegation, not a change to the account's worker role. |
| Worker2 denial | The unrelated invoice and Worker1 daily report returned 404 when opened through the browser. |
| Auditor | Invoice preview exposed zero edit buttons. Daily report exposed zero form fields. Read-only inspection did not acquire editing authority. |

These results cover the named objects and transitions. Supplier/technician roles and every possible report lifecycle combination are not claimed verified by this run.

## Invoice edits and subsequent-draft defaults

The candidate copy of Junkers draft `01a0f855-365a-742b-a6b8-9771065b4558` supplied the starting invoice. Its source calculation remained 68 hours and USD 3,325.00 throughout the metadata edits.

| Action | Expected / observed browser result |
| --- | --- |
| Owner enters an invalid due date | Localized validation appeared and retained the entered fields. The invalid save did not become the invoice's saved date. |
| Owner saves valid metadata | Business invoice date October 2, payment terms 14 days, PO `QA-PREVIEW-20261001`, mock bank and division values saved at invoice version 2. The due date became October 16 and the preview refreshed. USD 3,325.00 remained unchanged. |
| Stale invoice-version save | Saving a stale expected version returned a useful 409 conflict and retained entered values. The newer saved invoice remained unchanged. |
| Finance edits payment terms | Terms changed to 21 days at version 3; the October 2 invoice's calculated due date became October 23. |
| Rebuild a subsequent draft | New draft `01a0f8b4-1149-76e8-bef6-795a71b78eb2` inherited the stream PO, bank, division and 21-day terms. It used its own October 1 business date and October 22 due date. The register contained one current draft at USD 3,325.00 / 68 hours. |

The future-draft result demonstrates saved billing-stream defaults through a later browser-generated draft. It also demonstrates that current-invoice business dates do not propagate as fixed dates to subsequent invoices. The stream-default checkbox and its source mapping are documented in the manual.

Invoice numbers remain assigned transactionally at issuance under the reviewed numbering policy. An editable business invoice date is distinct from the actual issuance event timestamp. Canonical issuer identity uses the reviewed issuing-authority workflow. Calculated hours, rates, expenses, tax, discount and payable totals require the owning source/correction/calculation workflow; the preview does not silently edit those values. Issued invoices require the correction or replacement lifecycle, and issued snapshots and stored historical PDFs remain immutable.

No invoice was issued or sent merely to test this feature. The browser evidence above does not substitute for a new end-to-end issued-invoice numbering, payment or tax test.

## PDF preview and downloaded artifacts

Invoice screen and PDF now use the canonical invoice document renderer. Daily, technical and period previews use their corresponding report document HTML and source normalization. The document font assets include Geist and Geist Mono; the lead inspected downloaded PDF font metadata and rendered page images. Ready historical artifacts use a native PDF viewer of the authorized stored bytes, matching the corresponding download without rewriting their history.

Private artifacts remain under `/home/kripta/ja-browser-round6-20261001`; they contain application/customer information and are not committed as public screenshots or PDF fixtures.

| Document | Browser/download evidence |
| --- | --- |
| Invoice | `canonical-invoice-final-preview.png`, `canonical-invoice-final-en.pdf`, `canonical-invoice-final-pdf-page1.png`. After the final CSS change, the subsequent draft was downloaded as `canonical-invoice-release-en.pdf`: the browser download reported no failure, and Geist fonts were present. Earlier downloaded invoice extraction showed the saved October 2 / October 16 dates, 14-day terms, mock PO/bank/division and unchanged USD 3,325.00 calculation across two pages. |
| Daily report | `canonical-daily-preview.png`, `canonical-daily-en.pdf`, `canonical-daily-pdf-page1.png`. |
| Technical report | `canonical-technical-en.pdf`, downloaded through the browser. |
| Customer period report | Record `01a0f8c7-7002-7403-bdd9-cafef6e1c8ca` contained the approved 75-minute source and daily-report source links. `canonical-period-en.pdf` was downloaded through the browser. |
| Worker statement | `canonical-worker-statement.pdf`, `worker-native-pdf-after.png`; the lead confirmed the actual worker PDF was visible after fixing native-viewer sandbox behavior. |
| Accounting pack | Pack `01a0f8b7-7073-75e2-b65e-632f11d2e721`; `canonical-accounting.pdf`, `accounting-native-pdf-after.png`. |

A candidate inline-listener CSP regression in report SSR previews was corrected; the final observed report console had zero errors. A candidate native PDF sandbox regression was also corrected and the actual Worker PDF was visible. These candidate regressions are remediation evidence, not additional UX/bug quota items.

The evidence demonstrates canonical layout/data/font sharing and the named browser downloads. It does not claim pixel equality between a responsive phone view and paginated A4 output, or complete long-content/localization coverage of every invoice template family.

## Remembered views and responsive checks

Owner Company finances currency USD survived refresh; changing it back to EUR also survived refresh. Preferences are scoped to user and role. The lead also observed retained Expense currency/status changes, Report Technical/project/Submitted selections, Billing Streams/Active/name selections and Projects Active status. Explicit URL filters retain precedence over remembered choices. With browser storage denied, the UI remained usable.

Spanish invoice preview and Auditor daily-report checks covered 360 × 800, 390 × 844, 768 × 1024 and 1440 × 900. The observed views had no horizontal page overflow and their zoom controls provided 44-pixel targets. This is representative coverage of those screens, not a complete accessibility or device certification.

At 390 pixels, Owner clicking INVOICE DATE opened the full labeled invoice editor with no page overflow. The desktop subsequent-draft check after final CSS changes also had no horizontal overflow.

Owner opening Finance with an unavailable project received the explicit 404 Project unavailable view. Clicking Choose available project navigated to `/app/finance?currency=USD&view=overview&lang=en`, rendered Finance Overview with an authorized Project selector and BBS as its first choice, and retained USD. This verifies useful recovery rather than a redirect back to the stale project filter.

Archived QA projects were also removed from the active-project dashboard predicate/count. They remain available through historical/archive views where their records require preservation.

## Review, classification and pending work

The independent release reviewer `/root/review_round6_release` returned SHIP for the reviewed candidate changes. GPT-6 Astra high classified remembered filters, invoice preview editing and report preview editing as one UX item each; archived projects appearing on the active board, preview/PDF divergence and stale Finance project 404 recovery as one bug each. Those classifications do not independently prove the older 10 UX + 10 bug completion target.

When this file was written, production archive/build, migration/backup activation, public-health checks, GitHub publication of this candidate and final Docker build-cache cleanup remained pending. The earlier deployed round-6 fixes are recorded separately in [browser-role-workflows-round6-20261001.md](browser-role-workflows-round6-20261001.md); they do not prove production activation of this new preview/persistence implementation.

Update this evidence with actual release commit/archive hash, backup location, migration/build/health outcomes and deployed browser checks after activation. Do not mark production or the aggregate improvement goal complete from candidate code or this document alone.

Final workspace `pnpm typecheck`, `pnpm lint` and `git diff --check` passed before packaging. The separate full Svelte diagnostic run retains the documented baseline errors; it is not claimed green.

Final Worker1 regression: Owner withdrew the isolated active correction through the normal reasoned UI. Worker1 then opened correction on the same approved original; Open project displayed Discard your unsaved changes. Cancelling retained both plan and reason. Saving produced correction `01a0f8dd-074f-76be-8e80-f227c375148d`, with retained plan, readable reason and Owner override No. Original approved report remains unchanged. The returned technical report author also edited Validation result at390px, saved and reloaded its matching preview with no page overflow; console after reload had zero errors.
