# Finance assignment expense policy: independent Chromium QA

- Candidate baseline commit: `86031e6`
- Tracked product diff SHA256: `8d056f82141d18eabd22850260150c48583d7495299a51c4284ece3cfe618780`
- Run date: 2026-09-27. Local preview and fresh disposable database only; no production access.

## Result

**PASS, 1/1 final Chromium run.** Owner created an Active project and open-ended worker assignment through the rendered Projects form. Finance opened **Person expense policies** at 390 px English, selected that person and a reimbursement/customer-recovery combination, and saw the assignment-window warning before submission. Owner changed the assignment end to 2026-10-15 at 1440 px Portuguese. Finance's stale 2026-10-20 start then returned native HTTP 409 `FINANCE_POLICY_OUTSIDE_ASSIGNMENT`; the enhanced action probe returned HTTP 200 with SvelteKit action status 409 and the same code. The inline notice stated the current Active status and assignment start/end. The selected person, category, payer, reimbursement, recovery, dates, reason, Commercial view, and policy task remained in place. The notice received focus and was fully visible below the sticky header before any screenshot operation. **Review assignments** hard loaded the Projects assignment history, focused it, and showed the current end date.

With the bounded assignment, leaving policy end blank produced native HTTP 400 `FINANCE_POLICY_END_REQUIRED`; the enhanced action probe returned action status 400 with the same code. The inline notice showed the current end date and was focused within the viewport. Owner also submitted this invalid policy at 1440 px Portuguese and received the translated, focused notice.

Finally, Finance held a filled policy while Owner removed the assignment through the rendered Projects form. The stale submission returned native HTTP 409 `FINANCE_POLICY_ASSIGNMENT_UNAVAILABLE`, showed the current Inactive status and 2026-09-26 end, retained the attempted values and a disabled unavailable-person option, and offered the assignment-history remedy. No policy was saved and none of the failed submissions added an audit event. Both browser sessions had no page or console errors.

## Evidence

- [Redacted result record](results.json): response codes/statuses, visible wording, retained values, current bounds/status, focus/scroll geometry, remedy target, policy and audit checks, console diagnostics.
- [Browser spec](postfix.spec.ts) and [config](playwright.config.ts).
- Cropped notice screenshots: [stale Finance 390 EN](outside-finance-phone-390-en.png), [bounded Finance 390 EN](end-required-finance-phone-390-en.png), [bounded Owner 1440 PT](end-required-owner-desktop-pt.png), [removed assignment Finance 390 EN](removed-finance-phone-390-en.png).

The result JSON replaces record identifiers. Screenshots include only notices and a synthetic fixture worker name. Raw browser traces were not retained because they may contain session cookies and full form payloads. The final run supersedes two earlier evidence-script setup attempts: one used an explicit submit-button type that this form does not declare, and the other chose a future date for an immediate assignment removal. Neither reached the intended stale-policy observation.

## Scope

The Finance policy form uses native submission. Enhanced parity was checked with read-only browser `fetch` requests using invalid values; the enhanced UI itself was not clicked. The removed-assignment case was tested natively. This fixture covered Finance and Owner in English/Portuguese; Spanish and other commercial policy forms were outside this browser run.

Port 4174 and the fixture pointer/lock were clear after Playwright exited.
