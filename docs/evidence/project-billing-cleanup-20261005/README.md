# Production QA cleanup, calendars and billing setup — 5 October 2026

This is scoped evidence for the owner's cleanup, calendar, billing setup and quick-guide requests. It does not resume or change the previous 100/100 audit counts or certify whole-app acceptance.

## Data cleanup

An online database snapshot and private-file recovery copy were made before cleanup. All application mutations used the owner's normal browser controls.

- Fourteen QA projects and seven QA clients are archived.
- Two QA suppliers are inactive; three QA technicians are suspended.
- Twenty-one additional test accounts are offboarded. Real-project assignments were excluded from that manifest.
- BBS Mexico and Junkers OHIO remain active. Comparing the pre-cleanup snapshot with production found identical protected rows across all 44 project-linked tables checked.
- The QA-only EUR issuer archive action passed in the isolated verification copy; the live retirement follows deployment of the new action.
- The Junkers-linked issuer is retained despite its existing test-labelled name.

Approved records, reports, documents, immutable revisions and append-only audit history are retained. Normal operational views exclude archived projects; explicit archive history remains authorized and accessible. Authoritative invoice, payment and cash history remains intact.

## Implemented behavior

Expense calendar has an Owner Worker selector beside Month. Calendar browsing is independent of unsaved weekly drafts. Time uses matching calendar structure with blue selection, focus and the Log time button; Expense retains red.

New billing stream defaults:

| Field         | Saved source                                                                    |
| ------------- | ------------------------------------------------------------------------------- |
| PO            | Project PO, otherwise client PO reference                                       |
| Currency      | Project currency                                                                |
| Payment terms | Valid client terms, including zero; otherwise a disclosed 30-day starting value |
| Recipient     | Client billing email, otherwise the chosen billing contact email                |
| Contact       | Unique primary billing contact, otherwise sole billing contact for that client  |

Issuer, tax, effective/anchor dates, cadence, stream, template, automation and monetary rates remain explicit choices. Changing projects clears incompatible selections. Failed submissions retain entered defaults; successful creation resets the form coherently.

Issuer settings and tax directories use tables with mobile cards and management actions. Clearing settings empties their fields through the existing version check; tax and issuer removal archives records. Tax editing renames only; changed rates require a new profile. Dirty tax edits are protected when switching rows, setup actions or workspaces.

## Verification

- Final focused run: **43/43 tests across eight files passed**, covering defaults, management visibility, scoped records, calendar helpers, worker interfaces, operational dashboard/portfolio hiding, mixed weekly snapshot atomicity and archived invoice/cash retention.
- Finance-project DTO / project billing setup tests passed; PM projection tests passed in an earlier targeted run.
- Portal typecheck, scoped ESLint, formatting and diff checks passed.
- Independent GPT-6.1 Sol source review: **APPROVE**, including the final native GET history-mode correction.
- One Chromium session was used sequentially for every role and browser check.
- Owner: both real-project defaults; stream save/reset; duplicate-date rejection with retained manual PO/email/terms; tax creation, rename and archive; settings save and confirmed clearing; QA-only issuer archive in the isolated copy.
- Worker and PM: calendar Worker selector absent; own operational entry scope. Finance: settings actions available. Auditor: no mutation forms/actions.
- Owner calendar and billing layout checks at **360, 390, 768 and 1440 CSS px** found no page overflow. Time CTA computed blue; Expense calendar remained red. Outside-month and cleared-month controls passed.
- A fresh isolated production snapshot passed integrity/FK checks. Ordinary Projects, Time, Expenses, Reports, Planning, Approvals, Documents and Management contained no QA entries. Only BBS and Junkers appeared in normal project options.
- Browser history flow: include archives, select an archived project, Apply filters retains history, all six expense-export links retain history, Hide archives clears the stale project and restores the clean normal view.

Broader legacy checks are qualified, not silently repaired: `repository-privacy` has two fixture failures before the changed finance projection; worker operational scope has missing-fixture-table and stale PM expectation failures; `billing-section-ui` has a pre-existing source-string expectation missing the draft-preview ternary. No production guard was weakened and none of these failures is counted as passed.

## Quick guide

[Project to invoice quick guide](../../manuals/Project_to_Invoice_Quick_Guide_EN.pdf): eight A4 pages, eight actual sanitized app screenshots, English. It explains project/people terms, time and expense approval, billing streams, invoice creation, editing and PDF download. Captures come from the isolated verification copy. PDF text, image embedding and representative rendered pages were checked; no credentials, personal names or bank account values are exposed.

Production build, deployment and final live verification are recorded with the release commit/archive and private runtime evidence after cutover.
