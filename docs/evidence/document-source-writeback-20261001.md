# Document source writeback and older PDF refresh — October 1, 2026

Owner instruction: invoice edits must update the actual owning project, billing stream or issuer settings, rather than a separate future-invoice default cache. Implementation and candidate browser verification passed. Production release verification remains pending.

## Production older-PDF refresh

One browser/page, ordinary Owner UI. The report register contained five daily and two technical reports. Four daily reports had existing PDFs; three other records had never generated a PDF. Existing PDFs were English.

| Report | Before | Browser action and result |
| --- | --- | --- |
| `01a0f7a1-37b4-74e7-889b-b809dc611e53` | Already current `2026.10.01.1` | No regeneration needed; earlier layout retained in history. |
| `01a0f7d0-fb54-7288-bb0d-53609744f56a` | `2026.09.22.1`, source outdated | Generate report → Ready, artifact `01a0f911-7377-77a5-aca2-9f8fb200a8e1`; current PDF downloaded. |
| `01a0f6ae-74ed-76bb-9d17-64ed6e2c73cf` | Earlier layout | Generate current layout → Ready, artifact `01a0f911-8ac5-7629-82ae-3fb4b95acc01`; current PDF downloaded. |
| `01a0eec2-c58e-70da-ab74-a8e6ca9f96c5` | Earlier layout | Generate current layout → Ready, artifact `01a0f911-a1d0-762b-b5dc-3dedc1de9b27`; current PDF downloaded. |

Downloads used each Ready panel's current **Download** link. The refreshed ROUND6 PDF contains embedded Geist fonts. Generation preserved report records, approval state and previous PDF history. No new PDFs were generated for records that had no existing output.

The Owner Accounting register contained zero packs in any state; the generated period-report register contained zero records. The invoice register contained one unissued Junkers draft and no issued PDF artifacts; its draft download uses the current renderer. Worker1 and Worker2 My Pay had no existing statement artifacts for the displayed September 1–October 1 period. That check does **not** establish that no private worker statements exist for other exact periods or workers; the current UI lists statements for the selected exact period.

## Source ownership and acceptance

- Invoice and explicit due date: current unissued invoice only.
- Purchase reference: existing stream override, otherwise actual project PO; never silently update customer-wide defaults.
- Payment terms and past-due notice: actual billing stream.
- Bank instructions and supplemental issuer contact: actual versioned issuer document/payment settings, shared by the same deployment, issuer and currency.
- Issuer legal identity: reviewed canonical revision and project assignment lifecycle.
- Customer contacts, hours, expenses, rates and tax: existing owning-record workflows and recalculation where required.

Only changed fields may write back. A date-only save must not promote old snapshot or cache values into current settings. Source and invoice changes require optimistic versions, live authorization, a transaction and audit. Issued/approved financial snapshots remain immutable.

## Candidate browser verification

Functional checks used one browser/page at `http://127.0.0.1:5182/j-aautomation/app`, an isolated production snapshot and the documented test roles. No API/SQL functional assertions, external delivery or production mock source writes were used.

| Role / workflow | Observed result |
| --- | --- |
| Owner date-only save on `01a0f8b4-1149-76e8-bef6-795a71b78eb2` | Invoice date changed to October 3, due date recalculated, invoice version 1→2. Existing legacy snapshot bank/division stayed on the invoice; actual issuer settings remained version 0, Wells Fargo Bank and empty supplemental contact. |
| Owner multi-field invoice save | Version 2→3; actual stream terms became 28 days, PO override `QA-SOURCE-STREAM-20261001` and multiline payment notice. Actual issuer settings became version 1 with the entered mock bank/division/phone/email/website. The owning settings forms showed those values after navigation/reload; invoice preview refreshed with the same $3,325.00 total and 68 hours. |
| Clear stream PO override | Initially silently retained the old override. Bounded fix distinguishes absent input from a submitted blank; repeated clear/save/reload showed an empty override, with unrelated stream settings unchanged. A temporary implementation placement error was caught before release, fixed and rechecked. |
| Actual project PO writeback | Rebuilt draft `01a0f92d-1e07-753a-b094-972788fb4b1c` used source settings. Editing its PO changed actual project PO to `QA-ACTUAL-PROJECT-PO`, advanced project version 2→3 and appeared under the project's **PO / Reference** after navigation. |
| Finance actual settings and invoice edit | Real issuer editor saved `QA Finance Actual Bank`, version 1→2; Owner-only legacy identity editor absent. Invoice phone edit saved `+1 555 010 4321` to actual issuer version 3 without copying its older bank snapshot into the issuer. |
| Atomic invoice conflict | A previously observed issuer version 2 was placed in the ordinary browser form while the actual version was 3. A bank/terms/PO save showed a specific issuer conflict and retained all entered values. Invoice version stayed 4. Reload showed the prior saved PO and 28-day terms; actual issuer remained version 3. This is a stale-form simulation through the browser, not a second browser/session. |
| Date-only save after issuer change | Invoice date October 4/version 5 saved while its bank snapshot remained old. Actual issuer stayed version 3 with `QA Finance Actual Bank` and Finance's phone. The visible source-change notice directed the user to rebuild. |
| Actual issuer editor conflict / Cancel | Stale version showed a specific conflict and retained mock input. Cancel initially blanked fields because native reset did not restore dynamic values; repaired Cancel restored actual saved bank/email/version 3 after both ordinary edits and a failed save. Navigation then produced no dirty dialog and no save. |
| Auditor | Authorized invoice preview visible, zero invoice editors/save buttons and zero actual issuer settings forms. |
| Worker1 | Direct invoice navigation returned the ordinary scoped 404/No results; no commercial total, editor or issuer form exposed. |
| Override precedence and restored inheritance | New override `QA-STREAM-PRECEDENCE` persisted after reload and rebuilt draft `01a0f935-07bc-7389-a858-6895d37b5de8` printed it. Clearing again and rebuilding `01a0f935-979a-726b-8eb6-0af3238ea791` printed actual project PO. Both read the authoritative Finance bank, phone, 28-day terms and multiline notice; no stale-source warning. |
| Current draft / PDF | Register showed All invoices 1, Drafts 1 and $3,325.00 after repeated rebuilds; old drafts were superseded. Final current draft retained 68 hours. Its ordinary PDF download succeeded and contained the actual source fields plus embedded Geist and Geist Mono. |
| Responsive invoice/issuer editors | At 360, 390, 768 and 1440 widths, document width equaled viewport width, labeled fields remained usable and save controls were 44px high. Private 390px screenshots retained with the QA artifacts. |

Independent read-only reviewer returned **SHIP**, including historical-source isolation, transaction/savepoint rollback, live authorization, version fences, canonical successor-series resolution, exact-money boundaries, draft invalidation and the two focused fixes. GPT‑6 Astra High accepted the source-writeback UX boundaries, classified PO clearing as a real bug, and classified Cancel as an introduced regression with no quota credit. Both were browser-verified fixed in the candidate; the earlier 10+10 totals remain unchanged.

Fresh migration 70 passed the ordinary engineering CLI with WAL, foreign keys enabled and integrity `ok`. Representative pre-migration snapshot upgrade succeeded during normal application startup and the above UI journeys. Old preview cache data remains retained without active use or automatic consolidation. No issued document was mutated or issued for this QA; successor issuance/history guarantees received code review, not a new browser issuance claim.

Pending release evidence: final workspace gates, pinned archive, production backup/build/deploy/health receipts, GitHub push and live source-settings smoke checks.
