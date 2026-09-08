# ASTRA_PLAN — J&A Automation business operations and ERP evolution

Date: 8 September 2026. Author: Codex / Astra analysis.

Status: research and implementation proposal, not a release certification or authorization to deploy.

## 1. Recommendation

J&A needs a project-based industrial-services operating system: one place to turn an agreed commercial engagement into assigned people, actual work, technical evidence, customer acceptance, correct invoices, worker payments, collections, and an explainable monthly accounting handoff.

The existing application is substantially closer to that goal than the owner's informal requirements might suggest. It already has time, expenses, project rates, worker compensation, signatures, invoices, collections, reporting, private documents, and background processing. Rebuilding these modules would consume effort without addressing the main weaknesses.

The next investment should connect the existing records into complete business workflows. The highest-value work is:

1. Resolve the meaning of hourly “all-in” agreements and expose commercial rules through an understandable setup and calculation preview.
2. Complete customer acceptance, billing-readiness, notification, and project-closeout workflows.
3. Make incoming and outgoing cash visible together, with source-backed expected dates and actual movements.
4. Add the missing operational context around assignments: employer/subcontractor, customer versus end customer, site contacts, travel arrangements, and eventually work packages and commercial changes.
5. Make the worker's daily task fast and the Finance user's exceptions obvious.
6. Finish the business handoff: approved accounting examples, accessible employee manuals, consistent website claims, and acceptance tied to the deployed revision.

This proposal distinguishes completion of the requested business loop from optional ERP expansion. A quotation system, supplier-payables module, advanced dispatch, or FAT/SAT subsystem should not silently become part of the original fixed-price delivery. The user has requested analysis of those possibilities here, not their implementation.

## 2. Evidence, scope, and confidence

### 2.1 What was inspected

The analysis used:

- The public homepage, About, Projects, Contact, and Aquarex pages, with current web retrieval.
- Public J&A LinkedIn company posts and the founder's publicly indexed project history.
- Primary industry and product references: CSIA's system-integrator business-practices manual, Actemium's service model, and official Odoo and Microsoft project-operations documentation.
- The complete supplied 20-page `Contrato de Desarrollo, Implantación y Soporte - J&A Automation.pdf`.
- `J_A_AUTOMATION_CLIENT_ESSENTIAL_SPEC_2026-08-22.md` and the requested checklist from `JA_CLIENT_READY_HANDBACK_2026-09-06_2058db2`.
- Repository instructions, the current checklist and evidence report, database schemas and migrations, key financial/domain implementations, portal routes/actions/components, website content and forms, and employee documentation.
- Two existing sanitized UI screenshots: worker mobile time and owner desktop Finance. These are historical captures, not a fresh authenticated browser session.
- The live deployment manifest and byte comparisons between selected local source files and their deployed counterparts.

The original Excel sheet mentioned by the owner was not identified from the supplied paths or examined. Its exact columns, formulas, date conventions, and required accounting layout remain an input to the implementation plan. No conclusion below claims compatibility with that unseen workbook.

### 2.2 Exact application baseline

| Item | Observed value |
| --- | --- |
| Working repository | `/home/kripta/ja-automation-platform-vps-hotfix` |
| Local HEAD | `6ec7b8a7ba5b9eca00b88bc7062d2c8626bdde7e` |
| Active deployment link | `/opt/jaautomation/current` |
| Active release directory | `/opt/jaautomation/releases/ja-automation-33a6a06ad271c63a9e335b2f594b4ec5dfcd2fbe156dff4831eb7b0f513f1c4d` |
| Deployed source commit | `6ec7b8a7ba5b9eca00b88bc7062d2c8626bdde7e`, from `RELEASE-BUILD.txt` |
| Manifest build timestamp | `2026-09-06T19:40:36Z` |
| Manifest runtime | Node `24.19.0`, pnpm `11.22.0` |
| Application architecture | Next.js public website; SvelteKit portal; Node; SQLite; private local artifacts; Caddy; Docker/systemd |
| Existing routing evidence | Portal on `127.0.0.1:5100`; public site on `127.0.0.1:5101` |

The main repository, V3 repository, conformity implementation, mail adapter, Finance overview, navigation, and website company configuration matched the deployed files byte-for-byte. This supports using those implementations as evidence about the live deployment. It does not prove that every path or every production configuration works.

The supplied handback checklist describes `2058db2`, an older candidate. The checked-in run report contains another intermediate addendum naming `719cbc7` and describing changes as not deployed. The active manifest is newer. These statements must be interpreted chronologically, not combined into one supposedly current release verdict.

### 2.3 Evidence labels used here

| Label | Meaning |
| --- | --- |
| Present | Reachable implementation or a concrete artifact was identified. This is not a new test-pass claim. |
| Partial | Some foundations exist, but an identifiable business workflow or integration is incomplete. |
| Confirmed defect | Directly observable source or public-page behavior contradicts the intended operation. |
| Not found | Targeted schema, service, route, and action inspection did not identify the capability. This is a bounded finding, not proof about every possible external tool J&A uses. |
| Needs validation | Configuration, real business examples, approval, or fresh runtime evidence is required. |
| Proposed | A design recommendation inferred from J&A's work and priorities. |

No live customer invoice was issued, payment recorded, signature created, account modified, or form submitted during this analysis. No application test suite was rerun. Historical test counts in the checklist are historical evidence, not newly reproduced results. Production financial data was not mined to infer real margins, cash balances, staffing, or customer relationships.

The apparent API secret in the request was not used or copied into this document. Revocation and replacement belong with its owner; an API key is not needed for this plan.

## 3. What kind of business J&A appears to operate

### 3.1 Publicly supported observations

J&A markets industrial controls engineering, robotics, electrical work, installation, commissioning, and field/remote support. Its homepage already places industries before the detailed capabilities section. It also displays the requested capability counts: 30 PLC specialists, 30 robotics specialists, five electrical designers, five mechanical designers, and 100 installation team members. Those figures describe published capacity; they are not a verified payroll census. [J&A homepage](https://j-aautomation.com/j-aautomation/en)

The company describes serving manufacturers, OEMs, and engineering teams, with US/Brazil operations and international delivery. That combination supports distinguishing the contracting customer from the factory where work happens. It does not establish which legal entity signs each engagement. [J&A About](https://j-aautomation.com/j-aautomation/en/about)

The live project archive exposes 58 entries and industry, client, technology, capability, geography, and year filters. It includes recent logistics/installations as well as older controls projects. The repository's provenance text still describes an older, smaller archive and only three recent additions, whereas `website/content/projects.ts` contains nine `new-ja-data` entries. The provenance record needs reconciliation with the actual content. [J&A Projects](https://j-aautomation.com/j-aautomation/en/projects)

J&A's company-authored FRUKI post describes installation and subsequent capacity expansion; another describes on-site KUKA programming/integration in Mexico. These support a work model involving mobilisation, multi-discipline execution, and changes over time. Neither proves the commercial terms of those projects. [FRUKI post](https://www.linkedin.com/posts/ja-automation-and-industrial-maintenance_industrialautomation-beverageindustry-productionline-activity-7387850452756893696-dAoY), [Mexico project post](https://www.linkedin.com/posts/ja-automation-and-industrial-maintenance_teamwork-industrialautomation-kuka-activity-7438245125463523328-hH8V)

The founder's public project history includes controls leadership, robot-team management, commissioning, and design work for recent automotive, packaging, and logistics projects. Individual professional experience should be reviewed before being published as a J&A corporate reference. A brand appearing in someone's career is not automatically J&A's direct debtor or a current customer. [Public project history](https://www.linkedin.com/in/antonny-nascimento-32b87127/en)

### 3.2 Industry research and its limits

CSIA's manual connects system-integrator operations with cash forecasting, disciplined billing, documented scope changes, subcontractor management, and controlled technical handover. These are useful reference practices, not evidence that J&A follows them or a claim of CSIA certification. Sections 4.2.4, 4.3, 5.2.6, 5.10, and 7.6 are particularly relevant. [CSIA manual, revision 6.1](https://controlsys.org/wp-content/uploads/2024/05/BPB-V6.1-Release.pdf)

Actemium illustrates a comparable operating pattern at a much larger scale: engineering, construction/commissioning, skilled personnel, maintenance, and handover form a connected service offering. J&A should borrow the lifecycle distinctions, not the organisational weight of that company. [Actemium services](https://www.actemium.com/solutionsandservices/segments/oil-and-gas/)

Odoo's project model distinguishes expected, delivered/to-invoice, and invoiced amounts and connects project costs to several sources. Its expense workflow separately links recoverable expenses to the relevant sale. These are useful comparisons for record linkage and status clarity; installing Odoo is not a recommendation of this plan. [Odoo project profitability](https://www.odoo.com/documentation/19.0/applications/services/project/project_management/project_profitability.html), [Odoo expense reinvoicing](https://www.odoo.com/documentation/19.0/applications/finance/expenses/reinvoice_expenses.html)

Microsoft's project-operations documentation treats subcontractor invoices as their own cost source, with lines attributable to projects and categories of work. That supports considering a vendor-payables workflow if J&A buys engineering or installation labour from external companies. It does not establish that J&A currently does so. [Microsoft vendor invoices](https://learn.microsoft.com/en-us/dynamics365/project-operations/pro/subcontracting/vendor-invoice-overview), [Microsoft subcontract management](https://learn.microsoft.com/en-us/dynamics365/project-operations/pro/subcontracting/managing-subcontracts-overview)

### 3.3 Operating-model inference

The likely operating sequence is:

```text
Customer request / OEM subcontract
  → agree scope, location, dates, hourly rules, expense responsibility, PO
  → assign suitable engineers and installation personnel
  → arrange travel, accommodation, access, and local coordination
  → record actual work, travel, waiting, activities, and receipts
  → review operational truth and technical changes
  → obtain customer acceptance of the relevant work
  → prepare separate labour and expense invoice drafts
  → Finance reviews and issues
  → receive customer payments and pay workers / reimburse expenses
  → reconcile the month with Accounting
  → deliver technical closeout and support subsequent interventions
```

The risk is concentrated at handoffs. Missing a receipt is inconvenient; missing the customer's approval can hold an entire labour period unbilled. A late customer collection is manageable in a profitable project only if J&A can fund worker obligations before it arrives. A PLC backup is useful only if a future engineer can identify which machine and approved intervention it belongs to.

The owner's comments make four priorities stronger than generic ERP completeness:

- Accurate actual hours and commercial calculations are more important than elaborate planned-hours management.
- Worker compensation and customer revenue are different amounts with different dates and permissions.
- Customer acceptance is a billing prerequisite where agreed, not merely a PDF decoration.
- Expenses are a separate commercial and payment workflow, not an extra column in a timesheet.

### 3.4 Engagement patterns to support explicitly

| Pattern | How it works | Product implication |
| --- | --- | --- |
| Hourly deployment; customer pays hotel/car directly | J&A invoices labour; the customer settles selected suppliers | Keep customer-direct spend informational unless J&A actually incurs a liability; no worker reimbursement or customer rebill for the same purchase |
| Hourly deployment; J&A/worker advances recoverable expenses | Hours plus a separate approved expense stream | Track payer, receipt, reimbursement, recovery, independent tax and invoice periods |
| Hourly rate includes selected expenses | Customer still pays by hour; J&A absorbs agreed travel/living costs | Hourly pricing plus included-expense rules; actual hotel cost reduces contribution |
| Hourly engagement with minimum or cap | A minimum protects mobilisation/day economics; a PO limits recoverable revenue | Separate actual time, minimum adjustment, overtime and remaining authorised cap |
| Genuine fixed/milestone engagement | A specifically agreed amount is earned under a different arrangement | Preserve existing support, but require deliberate selection; do not infer it from “all-in” |
| Support/rework intervention | Returning to a previous machine may be new paid work or J&A responsibility | Link to the original project and record commercial disposition instead of automatically billing every return visit |

These are proposed templates, not assumptions about existing project configuration.

## 4. Resolve the owner's terminology before changing money

### 4.1 “Siempre por hora” and “all-in”

The best working interpretation of the latest comments is **hourly labour, with expenses either paid separately, recovered separately, or included in the hourly price**. It is not safe to equate all-in with a fixed total.

There is a concrete naming hazard in the existing code. `packages/database/src/repository.ts:4289` selects a fixed labour amount for `billing_model === 'all_in'` when a fixed price exists, and then skips ordinary hourly labour lines. This is valid for a genuinely fixed project but may misrepresent the owner's intended hourly package.

Expose independent choices:

- Labour pricing: hourly / capped hourly / explicitly fixed / milestone / hybrid.
- Expense responsibility: customer-direct / reimbursable / included in hourly rate / nonbillable / other approved treatment.
- Overtime: off / configured threshold with separate sale and compensation rules.
- Travel: recorded actual time with separate client-billing and worker-payment rules.

Start with terminology, presets, and previews over existing semantics. Add a new persisted model only if the current T&M plus expense classifications cannot express a real agreement. Never reinterpret historical `all_in` rows by renaming them en masse.

### 4.2 “Quincenal”

Every 14 days and twice monthly are both already supported and are not interchangeable. The former needs an anchor date; the latter needs explicit windows such as 1–15 and 16–month-end. Label them distinctly in all three languages and preview the next periods before saving. Labour and expenses may use different choices.

### 4.3 “Invoice del trabajador”

There are at least three possible documents:

1. J&A's labour invoice sent to its customer.
2. A worker's private statement of earned/expected/paid compensation.
3. A subcontractor's invoice sent to J&A.

The first two have substantial implementation. The third is not a complete workflow found in the audited schema/routes. Confirm whether the owner actually requires it before calling it an unfinished original feature. A worker statement must not be labelled a supplier tax invoice merely because it contains money owed.

### 4.4 “Beneficio neto”

The existing documents correctly distinguish direct project contribution from company net profit. The project view should show approved or otherwise explicitly defined revenue less direct project costs. It cannot produce statutory net profit without the broader accounting inputs that the contract excludes.

Keep three clearly named perspectives:

- Operational/project economics: approved revenue candidate, unbilled work, direct costs, contribution.
- Billing and receivables: invoices, credits, collections, outstanding balances.
- Cash: actual money received and paid, plus separately labelled future obligations.

The revenue basis and cutoff must be visible. “Approved revenue candidate” is not automatically recognised accounting revenue. Accounting should approve the month-pack treatment.

### 4.5 Signature, payment, and tax

Customer sign-off approves the time/activity document; it does not prove collection. Approval of worker time does not prove worker payment. A customer's late payment must not automatically postpone worker compensation unless the actual compensation agreement explicitly uses a collection-based basis.

Labour and expense tax profiles are configurable independently. Do not infer a tax rate from “US”, “Brazil”, the VPS location, or the existence of a receipt. Where a profile has a zero amount, retain the configured reason/category rather than treating every zero as the same tax treatment. Jurisdiction-specific determination stays with J&A's accountant.

### 4.6 Percentage compensation creates an inference limit

Server-side privacy can prevent direct disclosure of customer rates and other workers' pay. It cannot make arithmetic unknowable: if a worker knows their exact percentage and exact eligible pay basis, they may derive the corresponding customer labour amount. This limitation should be acknowledged in the business policy; it is not a reason to hide or falsify the worker's compensation. Avoid a promise of absolute rate secrecy that percentage-based pay cannot fulfil.

## 5. Map the owner's requests to the current product

“Present” below means source/artifact evidence, not a fresh end-to-end certification.

| Owner request | Current evidence / status | What remains valuable |
| --- | --- | --- |
| Client number, acronym, project number, cost centre | Present in client/project schema and invoice specification | Validate one actual naming convention and display it consistently |
| Different pay and sell rates per worker/project/activity | Present in compensation, internal-cost, client-rate and override implementations | Guided setup and source-level calculation explanations |
| Real hours, optional activities and PLC reports | Present in time/report routes and technical domains | Reduce repeated entry; make technical detail conditional |
| Admin adds/reduces worker time | Present correction lifecycle; historical regression evidence | Test corrections after signature, billing and month close together |
| No universal ten-hour day | Configurable policy and actual-minute model present | Remove remaining rigid assumptions from reminders and examples |
| Minimum billable hours | Present in billing engine/policies | Explain applicability, eligible categories, cap interaction, and adjustment lines |
| Optional overtime at 1.6× / 2× | Present thresholds and separate commercial rates | Show worked examples and tier limitations; confirm cross-midnight/weekend rules |
| Travel independently billable and payable | Present commercial policy | Make the agreement understandable without asking workers to choose billability |
| Customer-paid hotel/car versus all-in | Expense classifications present; all-in wording ambiguous | Separate hourly pricing from expense responsibility |
| Percentage of eligible labour | Present, including explicit basis concepts | Confirm inclusion of minimum top-ups/overtime and settlement trigger |
| Worker sees expected own pay and payment dates | Present My Pay/statement/settlement paths | Explain estimate versus approved versus scheduled versus actually paid |
| Expense photo/PDF receipts | Present private upload and expense linkage | Mobile preview, draft recovery, duplicate review and multi-receipt cases |
| Separate labour and expense invoices | Present billing streams | Provide side-by-side readiness and independent periods/taxes |
| Weekly / fortnightly / monthly periods | Present; every-14-days and semi-monthly both exist | Clear labels and upcoming-period preview |
| Automatic reports and invoice generation | Durable jobs and draft-generation foundations present | Verify scheduling and missing-input notification paths; manual review stays required |
| Invoice templates and identifiers | Five controlled layout families present | Approve actual issuer/remittance examples, language and template defaults |
| Optional different taxes for hours/expenses | Present configurable profiles | Obtain accountant-approved configurations and preserve evidence |
| Customer report has no monetary values | Explicit zero-money snapshot allowlist present | Protect free-text content as well as fields; preview exactly what leaves J&A |
| Customer signature before final billing | Version/PDF-bound conformity and issue gate present | Operational collection/follow-up, missing-signature queue and partial-period decisions |
| Worker report with only own hours and pay | Present durable Worker Statement and My Pay | Download discoverability and realistic employee walkthrough |
| Admin report with pay, revenue, activity and dates | Present economic/Finance views and report families | A unified obligation/receipt timeline and complete drill-down |
| Invoice/cost/payment table and monthly Accounting | Present ledger and frozen accounting-pack architecture | Reconcile with the unseen Excel and accountant's accepted monthly pack |
| Paid/received/partial states | Present invoice payments, settlements, reimbursement states | Avoid one “paid” badge for two unrelated payment directions |
| Active/inactive workers and projects | Present lifecycle and effective memberships | Historical access/offboarding walkthrough and reactivation checks |
| EN/ES/PT document generation | Localized artifact infrastructure present | Real template/content parity, not only translated headings |
| Modern mobile and desktop interface | Shared components, role navigation and historical captures present | Task-focused language, density and usability tests with actual roles |
| Industries prominent at the beginning | Present on live homepage | Maintain this hierarchy; verify actual mobile fold in next UI campaign |
| Remove nonexistent telephone numbers | No configured public company phone found; source scan found contact-input handling | Keep contact method approved; do not confuse a visitor's phone input with a published number |
| LinkedIn projects on website | Recent entries exist but provenance is coarse/stale | Source register, corporate-reference approval, individual-experience distinction |
| Requested team counts | Present in public company configuration and homepage | Confirm they describe capacity accurately; do not sum overlapping roles as headcount |
| Employee PDF manual | Five PDFs present, including EN/ES/PT-BR field guides and detailed English Worker/Owner guides | In-app access, current revision, role-specific examples and human acceptance |

## 6. Contract, checklist, and acceptance must be reconciled

This is a product-scope comparison, not a legal conclusion about whether the supplied contract was executed. The PDF includes blank party details and signature/date fields; the file alone does not prove a signed agreement.

The PDF's clause 3 states that internal engineering documents do not modify contractual scope unless expressly incorporated. Therefore an internal “deferred” label is not evidence of an agreed contractual reduction. Conversely, an older PDF statement must not erase a later explicit owner decision recorded in the repository.

| Topic | Documents / implementation | Plan treatment |
| --- | --- | --- |
| Project closeout | Anexo A.21 specifies a consolidated closeout package; Essential defers a builder; backend functions exist without found portal callers | High-priority workflow gap; finish a bounded package using existing reports/artifacts |
| Notifications | Anexo A.18 lists internal and email notices for approvals, periods, overdue invoices, receipts and budget | Inspect each trigger-to-recipient path; current missing-time email infrastructure does not prove the full list |
| Accounting formats | Contract explicitly mentions PDF and XLSX plus CSV registers; reduced spec sometimes says XLSX or CSV | Acceptance should include the actual PDF, XLSX and specified registers |
| Offline | Anexo A describes capture; Anexo D makes go-live conditional; checklist records a 1 September decision to defer | Preserve the decision; reconsider only if field connectivity creates real loss |
| MFA | Older PDF/spec require it; current AGENTS/checklist record the 6 September decision for optional MFA and no step-up | Do not reintroduce mandatory MFA or step-up through this plan; align paperwork/history |
| Separate-host continuity | Contract describes it; checklist records a 4 September owner waiver for initial release | Keep waiver explicit; retain a future continuity improvement without falsely claiming it exists |
| Tax identity / DPA / retention / human UAT | Supplied evidence states outstanding approvals | Treat as unverified acceptance dependencies; ask for the current signed decisions, not assume they remain or were resolved |
| Current release evidence | Handback says `2058db2`; live manifest says `6ec7b8a` | Produce one revision-specific acceptance index and identify which evidence applies |

No existing checklist should be silently rewritten to green as part of producing this plan.

## 7. Prioritised findings

Priority definitions: P0 = wrong-money risk, a broken promised interaction, or acceptance evidence needed before relying on the affected flow; P1 = major operational bottleneck or a bounded core completion; P2 = valuable ERP expansion; P3 = conditional/later capability. A P0 planning item is not automatically proof of a production incident.

### F01 — Commercial setup can confuse hourly packages with fixed projects

Status: confirmed semantic mismatch risk; P0 validation, P1 guided configuration.

Evidence: the owner's latest “always hourly” statement versus the fixed-amount `all_in` branch in `packages/database/src/repository.ts:4289`. Existing T&M and expense classifications may already represent the intended agreement.

Deliver a plain-language agreement summary: “Customer pays actual approved hours at the agreed rate; hotel/car are included; meals are recovered separately; travel is payable to the worker but not billed; overtime starts after eight eligible hours.” Add a deterministic sample day showing actual hours, client amount, worker amount and direct cost for Finance only.

Acceptance: the same eight-hour day can be previewed as hourly-plus-expenses, hourly-including-expenses, or an explicitly fixed engagement; the labels and resulting lines cannot be confused. Existing issued records remain byte-stable.

### F02 — Project closeout is an orphaned backend capability

Status: partial; P1 contractual completion candidate.

Evidence: `createProjectCloseout`, `finalizeProjectCloseout`, and `reopenProjectCloseout` exist at `packages/database/src/repository.ts:6604`. Targeted searches found a demo-seed invocation but no application route/action invoking them. A project status of “closed” does not substitute for a delivered closeout package.

Add a Closeout tab with readiness checks, draft generation, audience preview, finalisation and authorized reopening. Reuse existing reports, invoice registers, collection data and document hashes. Preserve a new immutable revision for every final issue rather than overwriting a previous handover.

Produce two audiences: an internal package containing finance, and a client-safe technical handover containing only approved operational material. Include report index, system/backup register, open issues, validation summaries, accepted period reports and a manifest. Do not expose pay or private internal documents through a customer ZIP.

Acceptance: a normal authorized user completes and downloads closeout from the portal, verifies included files, and can identify the final technical baseline. Later payment or technical events do not silently change the historical package.

### F03 — Business notifications are incomplete and reminders hard-code a calendar assumption

Status: partial with a concrete rigid rule; P1.

Evidence: `createMissingTimeReminders` in `packages/database/src/v3-repository.ts:10258` skips every Sunday, selects active memberships without consulting effective project schedules, and tests existence of any time row. The inspected overdue handler changes invoice state but does not itself enqueue a recipient notification. The mail adapter provides generic English notification copy; a functioning delivery adapter is not coverage of every contract event.

Implement the named business events over the existing durable outbox: approval requested/returned, period ready/blocked, signature outstanding, invoice overdue, missing receipt, budget/cap exception, and worker payment status changes where useful. Define recipient, project scope, language, deep link, cadence and deduplication key for each. Internal reminders should not require a broad notification-platform rebuild.

Reminder eligibility must use actual assignment dates, project status, configured workdays and explicit leave/unavailability where available. A draft time row must not be treated as successful submission. Multiple projects on one day should not generate contradictory “full day missing” demands.

Acceptance: no Sunday warning for a Monday–Saturday assignment, a warning for a configured Sunday assignment when relevant, no new warning for a closed project, one notice per defined event/cycle, and visible failure/retry without duplicate sends. Test email with an isolated sink; production messages require explicit operational authorization.

### F04 — Aquarex datasheet request is not wired

Status: confirmed source defect; P0 affected website interaction.

Evidence: `website/app/[locale]/solutions/aquarex/page.tsx:374` renders a plain form with no action, method, submit handler, or server action. Its input elements have IDs but no `name` attributes. The page is a server component. The source supplies no path to create a request or deliver a datasheet. By contrast, the normal Contact page posts to public-inquiry endpoints.

Use the existing public-intake architecture to capture an Aquarex request with language and source-page context. Decide whether the promise is “request a datasheet from our team” or immediate access to an approved document. Only advertise automatic delivery when there is a real approved artifact and a delivery workflow.

Acceptance: a synthetic browser submission in an isolated environment creates one durable request; invalid fields preserve input; duplicate retry is safe; success reflects queued versus delivered truth. No unreviewed bulk email capability is required.

### F05 — Marketing claims lack a consistent approval/provenance record

Status: confirmed inconsistency; P1.

Evidence: the Aquarex page contains a quantified commissioning-time claim, RO/UF positioning, and an alarm-standard assertion, while `website/docs/content-provenance.md` says such technical/performance claims were not invented and describes a more limited approved scope. This does not prove the claims false; it proves the inspected evidence does not reconcile them. [Aquarex page](https://j-aautomation.com/j-aautomation/en/solutions/aquarex)

The public About page also displays a project-total claim; source approval should be attached before treating it as verified. Recent portfolio records use a coarse `new-ja-data` source tag, and an exhibition appears among delivery projects. Keep Events/News distinct from completed customer work.

Create a lightweight claim register: statement, source URL/document, corporate versus individual experience, project role, approved wording, image rights, approving person/date and EN/ES/PT variants. Confirm each material claim with J&A; replace unsupported precision with approved wording. Existing industries-first layout and company contact configuration can remain.

### F06 — Payment dates exist, but a unified cash-obligation view was not found

Status: partial; P1.

Evidence: Finance and ledger components display incoming collections, expected worker payments, settlements and reimbursements. Inspection did not identify a complete time-bucketed view combining these obligations across projects with an opening cash balance and explicit forecast assumptions.

Add a Cash calendar with receipts and outflows in the same weekly/monthly view, preserving legal entity and currency. Start with actual outstanding invoices and approved unpaid worker/reimbursement obligations. Keep expected dates, contractual due dates, promise-to-pay dates and actual dates separate.

Show “obligations and expected movements” if no verified opening cash balance is supplied. Do not label the result “bank balance”. An optional eight- or thirteen-week forecast can add known supplier commitments and approved manual forecast rows later.

Acceptance: delaying a receipt changes projected liquidity but not earned compensation or already collected cash. Moving a worker payment date changes scheduling, not paid status. The same expense is not counted once as a worker reimbursement and again as an unrelated payable.

### F07 — Signature foundations need a complete collection workflow

Status: present core, partial operational experience; P1.

Evidence: `packages/database/src/domains/reports/customer-conformity-repository.ts` binds conformity to an immutable report/PDF version, validates evidence, and uses a closed customer projection. This is valuable infrastructure and must be retained.

Add a visible workflow: report prepared → shared/exported → awaiting named signatory → returned/disputed → accepted → eligible for final labour issue. Keep dispatch evidence separate from signature evidence. A client contact's name alone is not proof they can approve time on behalf of the contractual buyer.

The first version can continue the external signed-PDF upload process. A customer self-service signing link is a separate optional expansion. Support partial acceptance only through explicit source coverage, report splits, or approved exclusions; never mark an entire period accepted because one worker's sheet was signed.

Acceptance: Finance sees exactly which entries are blocked and why; correcting an approved source invalidates the applicable acceptance/billing readiness; client-visible files and free-text content contain no confidential money. The file hash proves evidence integrity, not cryptographic identity of the human signer.

### F08 — Customer, end customer, worksite, and purchase-order scope are too loosely separated

Status: partial; P1/P2 depending on actual agreements.

Evidence: clients and client contacts exist; projects contain a client ID, site text, country, PO and cost-centre fields. A separate structured end-customer/site relationship and versioned multi-PO/work-package model were not found in the audited schema.

Add only the relationships needed by actual engagements: bill-to legal customer, end customer/operator, site, operational supervisor, customer time approver, invoice recipient and PO reference. Preserve existing project/client identities. Never turn a LinkedIn brand or plant name into the billing customer automatically.

For a single-PO project, retain a simple form. Add PO lines and revisions when actual orders require different caps, disciplines, or dates. A technical activity category should not double as a financial cost centre.

Acceptance: an engineer works at a factory for an OEM subcontract; the customer report identifies the site correctly, and the invoice goes to the OEM with the agreed reference and no substituted debtor.

### F09 — Supplier/subcontractor payables are not a complete found module

Status: not found as an end-to-end module; P2 unless the worker-invoice requirement confirms it is core.

An expense record and worker settlement do not fully represent a subcontractor business invoice. Add a minimal supplier, subcontract/engagement reference, received bill, source matching, approval, due date and recorded payment allocation when real examples establish the need.

Avoid counting both a contractor's approved time cost and their invoice as two expenses. Time can accrue or estimate the cost; the supplier invoice reconciles or adjusts that same economic source. Separate the operational worker identity from the legal payee. One supplier may provide several workers; one worker may change engagement without rewriting history.

Acceptance: a contractor invoice for several workers matches approved project time, identifies discrepancies, supports partial settlement, and contributes cost only once. Payroll, withholding calculation, bank execution and a general ledger stay outside this bounded module.

### F10 — Travel arrangements and advances are missing before the receipt stage

Status: expenses present; mobilisation/commitment/advance workflows not found; P2.

The owner specifically distinguishes customer-paid accommodation/car from all-in arrangements. Add an assignment-linked travel plan: dates, destination, booking responsibility, payer, accommodation, transport and operational contact. Store cost commitments only for obligations borne by J&A.

If workers receive advances, track advance issued → expense allocations → remaining balance → return/additional reimbursement. An advance is a cash movement, not immediate expense recognition. Include cancellation/refund events and shared accommodation allocations only after concrete examples establish the policy.

Acceptance: a company-paid booking creates no employee receivable; a customer-paid booking creates no J&A cash outflow; an advance reconciles to approved receipts without creating a second reimbursement.

### F11 — Technical change logs do not replace commercial change orders

Status: technical-change domain present; commercial change-order lifecycle not found; P2.

Build a small variation workflow: requested → estimated → internally reviewed → customer authorized/rejected → implemented → billed/closed. Link it to reports, affected project/PO, additional hours/cost, approval evidence and effective commercial revision.

Technical approval answers whether a change is technically acceptable. Commercial approval answers whether additional work is authorized and recoverable. They need distinct permissions and states. Work performed in an emergency can remain factual while its billability stays explicitly pending.

Acceptance: additional onsite days are captured even when the original PO is exhausted; they are visible as unapproved exposure, cannot silently increase the cap, and become billable only through the agreed authority path.

### F12 — Workforce planning has foundations but lacks mobilisation readiness

Status: partial; P2.

Evidence: `workforce-planning.ts` defines skills, worker skills, planning assignments and availability. `planning-repository.ts` checks overlaps and unavailability. Therefore “there is no planning” would be inaccurate. Structured certification expiry, employer/payee linkage and a full deployment-readiness workflow were not found.

Build on current assignments with discipline, platform familiarity, languages, availability, site onboarding and required-document status. If needed, store certification type, issuer and expiry with appropriate private access. Do not calculate employment-law eligibility or promote a checkbox into a safety certification.

Support practical team operations—select a crew, preview effective dates, flag conflicts, assign, and inspect individual outcomes—without filling in actual hours automatically. A crew-lead entry workflow requires an explicit delegation policy; ordinary workers must not acquire authority over colleagues' records.

### F13 — Technical work lacks a structured issue-to-resolution handoff

Status: daily/PLC reports and immutable attachments present; issue/punch-list/FAT-SAT workflow not found; P2/P3.

A report records what happened on a date. An issue has an owner, status, next action and resolution across dates. Add a lightweight issue linked to project, system and reports before attempting a full industrial asset hierarchy.

Recommended initial fields: system reference, symptom, severity, safety flag, responsible person, due date, blocked-by, validation evidence, resolution, and handover disposition. A later FAT/SAT checklist can reference these issues if J&A requests it.

For PLC artifacts, distinguish “uploaded”, “reviewed” and “identified as the handed-over baseline”. The ERP must not imply that a uploaded file is deployed to a PLC, and should not introduce direct controller writes.

### F14 — Manuals exist, but distribution and task-focused onboarding are incomplete

Status: present artifacts; in-app manual entry not found; P1.

Evidence: `docs/manuals/Employee_Field_Guide_EN.pdf`, `_ES.pdf`, `_PT-BR.pdf`, `Worker_User_Guide.pdf`, and `Owner_User_Guide.pdf` exist. Targeted route/navigation searches did not identify links to these guides. The detailed English Worker manual is much longer than the field quick guides.

Add Help in the account menu, with language, role, document revision and a clear download. Provide a two-page quick start plus task chapters: login, correct project, actual work/travel, receipt upload, correction, Daily/PLC report, My Pay, and payment-status explanation. Retain the detailed guide as a reference.

Rewrite guide passages about audit campaigns, synthetic evidence and developer verification into employee instructions. Use synthetic examples that demonstrate the task rather than mostly redacted screenshots. Confirm login guidance matches mailbox-linked users and invited users. Make clear that the private pay estimate is not a payslip.

Acceptance: a new worker can complete a representative day using the guide without developer help, and Finance can explain one unpaid statement and one rejected receipt. EN/ES/PT-BR quick-start content must stay synchronized with the release.

### F15 — UX exposes engineering language and distributes one task across many screens

Status: observed in code and historical sanitized screenshot; P1 design improvement, fresh browser validation needed.

The Finance capture contains labels such as “Canonical projection loaded” and explanations about authorized sources. These describe implementation mechanics more than business actions. Replace them with meaningful status: “Figures updated”, “Missing internal cost”, “3 items need review”, or “Awaiting customer approval”, as appropriate to actual data.

Keep the visual foundation and shared components. Restructure around role tasks and project context rather than add another framework or blanket redesign. Preserve visible labels, keyboard access, full navigation names, readable money, and mobile-specific table layouts.

Acceptance should measure task completion and understanding, not only absence of horizontal overflow. Proposed targets are in section 12.

### F16 — Operational acceptance and release evidence are fragmented

Status: confirmed documentary fragmentation; P0 validation, P1 handoff.

Publish a small acceptance index containing deployed commit, exact migrations, configuration decisions, applicable test/browser/artifact evidence, unresolved human approvals, manual versions and rollback/restore evidence. Keep old reports as history, with explicit superseded labels.

The plan must not call a capability absent solely because an old audit marked it red. Equally, thousands of historical passing assertions cannot prove that an accountant accepts the current invoice or that employees understand it.

Acceptance: J&A and the implementation team can identify one current candidate and one owner for every unresolved decision. The original owner comments are demonstrated against a realistic agreed project, with no production mutation performed merely to obtain evidence.

## 8. Target operating workflows

The following workflows are proposed designs built around the existing implementation. They are not descriptions of capabilities newly delivered by this document.

### 8.1 Agree and configure a project

The project should have a concise commercial agreement sheet, with a version and effective dates. Its purpose is to make configuration reviewable before anyone records billable work.

Suggested setup sequence:

1. Identify the issuing J&A entity, contracting customer, worksite, project/cost-centre numbers, currency, dates and customer PO.
2. Select an hourly commercial preset and expense responsibility. Advanced fixed/hybrid modes require an explicit choice.
3. Set rates by worker or role/category, keeping compensation, loaded cost and customer sale separate.
4. Configure minimum applicability, overtime threshold/rates, travel, standby and eligible days.
5. Set labour and expense periods, invoice template/language, tax profiles and payment terms independently.
6. Identify who reviews operational records and who provides customer acceptance.
7. Preview sample calculations and the next billing periods; resolve missing values.
8. Activate and assign people with effective dates.

Offer a reusable template, but clone it into an explicit project revision. Editing a global template must not change old projects or invoices. Avoid making low-value planning fields mandatory; the owner expressly deprioritised expected hours.

### 8.2 Worker daily capture

The worker starts with today's assigned project and four visible actions: hours, expense, report, own pay.

For time, request actual duration and activity. Separate travel and waiting where needed; derive commercial overtime from the agreed rules rather than asking the worker to select a profitable category. If explicit clock intervals are supported, a cross-midnight helper should split dates transparently and retain a linked shift reference. Until then, explain the required separate-day entries.

A Daily summary and a technical report should not require retyping the same activity. Let a time entry reference a report, while allowing a short independent description. The relationship must survive report correction and be captured in the signed version.

Expenses request only factual input: project, date, category, amount/currency, vendor, payer and receipt. Finance owns recovery, markup, tax, FX and reimbursement interpretation. A successful file selection is not proof of a committed upload; show actual upload state and keep entered data on failure.

Submission shows what is still missing and allows finishing later without duplicate records. Estimates in My Pay identify pending versus approved sources. Inactive assignments prevent new incompatible entries but retain the relevant historical statements according to the existing access policy.

### 8.3 PM review

PMs need one operational queue by project and period: time, expenses, Daily reports, technical reports and exceptions. Show the actual facts and supporting evidence, not sale rates or private pay.

Review should answer: did the person work these hours, was travel/standby recorded correctly, is the receipt legible, does the activity explain the work, and does a safety-related technical change require the appropriate review? Finance then applies commercial rules independently.

Allow safe batch review only after the individual decisions are understandable. A batch should return an outcome per item and leave blocked items unapproved. No bulk action should bypass version checks, assignment scope or correction reasons.

### 8.4 Finance review and customer sign-off

Finance works from a project-period page containing:

- Actual and approved hours by worker/date/category.
- Client billable hours and minimum/overtime adjustments.
- Worker compensation, loaded cost and recoverable expenses.
- Signature status and exact source coverage.
- Missing rate, receipt, approval, tax, identifier or PO/cap issues.
- Planned invoice/receipt dates and worker payment obligations.
- A client-safe report preview and the two invoice-draft previews.

The page should answer “What prevents issuing this period?” with a direct link to every blocking item. Group missing configuration at project level instead of making Finance discover it through repeated failed generation attempts.

An authorized user exports/shares the customer report and records the returned acceptance evidence. If there is a dispute, preserve the submitted version, track the excluded work explicitly, and regenerate only the affected coverage. Do not amend approved actual time merely to make an invoice match a customer concession.

### 8.5 Invoicing, collections, worker settlement

Automatically prepare draft invoices from eligible sources. Finance reviews the calculation and issuing identity, then explicitly issues. Dispatch is its own authorized action and should not be confused with PDF generation or an invoice status changed to “sent”.

Record incoming payments with date, amount, currency, reference and allocation. Where one payment covers multiple invoices, create one receipt event and allocations rather than duplicate the receipt. Reversals preserve the original event.

Record worker pay and reimbursements independently. A labor invoice paid by the customer must not automatically mark an employee paid. If one actual worker transfer settles both compensation and expenses, preserve the component allocations and display one transfer with two purposes.

Collection follow-up can begin simply: responsible person, last contact, next follow-up, promised date, disputed amount and note. Do not require bank integration to gain this visibility.

### 8.6 Monthly Accounting handoff

Accounting selects issuing entity, reporting currency policy, month/cutoff and pack revision. The review shows open exceptions before finalisation. The package contains the agreed PDF summary, XLSX workbook, invoice/expense registers, collections and worker/direct-cost detail, with links or identifiers that reconcile to sources.

Distinguish these period concepts explicitly:

- Work/expense service date.
- Operational approval date.
- Invoice issue date and invoice service period.
- Actual receipt/payment date.
- Accounting export cutoff and revision date.

A late receipt or corrected timesheet may affect a later adjustment, an open-period recut, or a new revision under the accountant's policy. It must not silently rewrite a pack already sent.

The first accountant-approved pack should be compared with the owner's Excel at column and total level. Store the agreed mapping, example and acceptance. File generation alone is not accounting integration.

### 8.7 Closeout and return visits

Operational completion, financial completion and customer handover are separate statuses. A project may be technically complete while invoices remain unpaid. Closing site work should not erase collection follow-up or prevent an authorized historical reimbursement.

The final client handover identifies accepted reports, known open issues, relevant system references, approved backup versions and validation evidence. The internal version adds financial reconciliation. If the team returns months later, open a linked intervention with its own scope and commercial disposition. Do not append new billable work invisibly to the already closed and signed period.

## 9. Financial semantics and worked examples

All rates, amounts, dates and tax percentages below are synthetic acceptance examples, not J&A's real prices or tax advice. They define desired behaviour to compare with the current calculation engine. They must not be copied into production configuration.

### 9.1 Quantities and totals that must remain separate

| Concept | Meaning | Must not be confused with |
| --- | --- | --- |
| Actual minutes | Time the worker reports actually occurred | Daily reference, minimum invoice quantity, planned availability |
| Approved minutes | Actual minutes accepted operationally | Customer acceptance or collected cash |
| Billable quantity | Commercially eligible actual quantity plus clearly identified adjustments | Fabricated worked hours |
| Worker compensation | Amount determined by the worker agreement and source basis | Client rate or company loaded cost |
| Loaded labour cost | Defined direct labour cost, with explicit inclusion/exclusion of compensation | A second copy of worker compensation |
| Expense cost | Approved cost borne by J&A under the configured cost policy | Customer-direct spend or employee advances |
| Revenue candidate | Eligible project amount under the configured commercial rules | Issued invoice, recognised revenue or cash received |
| WIP | Approved eligible work not yet invoiced under the chosen source/cutoff policy | Another revenue amount to add to its own source total |
| Receivable | Issued debt remaining after relevant credits and net collections | Future unsigned work |
| Payable/obligation | Amount owed, separated from its planned settlement date | Actual payment |

For the usual loaded-cost convention:

```text
Direct project cost = loaded labour cost + J&A-borne expense cost + other direct cost
Project contribution = explicitly labelled revenue basis − direct project cost
Outstanding receivable = invoice total − applied credits − net allocated collections
Unpaid worker obligation = approved obligation − net settlement allocations
```

If loaded labour cost already includes compensation, do not add worker compensation a second time. If it represents only an additional burden, name it accordingly and document the formula. Similarly, show indirect overhead allocation as a separate optional management measure rather than silently modifying historical direct contribution.

### 9.2 Example A — Minimum billing without fabricated work

Configuration: daily reference 12 hours; billable minimum eight eligible hours per attended worker/day; client rate USD 100/hour; worker pay USD 50/hour; loaded labour cost USD 60/hour inclusive of worker pay; no overtime or taxes in this example. Actual work: four hours.

| Result | Correct value |
| --- | --- |
| Actual and approved work | 4 hours |
| Client billable quantity | 8 hours, with a 4-hour minimum adjustment |
| Client labour amount | USD 800 |
| Worker compensation | USD 200 |
| Loaded labour cost | USD 240 |
| Direct contribution before other cost | USD 560 |
| Customer time/activity report | 4 actual hours, no monetary fields |

The customer invoice may explain the contractual minimum adjustment. The signed time report must not say the worker performed eight or twelve hours. A no-work day must not receive this minimum merely because it appears on a schedule; the triggering service/attendance/standby agreement must be defined.

### 9.3 Example B — Independent overtime and travel

Configuration: 12 actual work hours plus two actual travel hours; overtime after eight work hours; travel does not consume the work threshold in this example. Client rate USD 100/hour, overtime 1.6×; worker rate USD 50/hour, overtime 2×; travel not billed, but paid at USD 25/hour. Loaded cost is separately configured as USD 60 regular, USD 110 overtime and USD 30 travel per hour.

```text
Customer labour = 8 × 100 + 4 × 160 = USD 1,440
Worker compensation = 8 × 50 + 4 × 100 + 2 × 25 = USD 850
Loaded labour cost = 8 × 60 + 4 × 110 + 2 × 30 = USD 980
Direct contribution before expenses = USD 460
Actual time = 14 hours, of which 2 are travel
```

If worker compensation is instead 55% of the eligible customer labour basis, eligible compensation is USD 792 on USD 1,440. Add the USD 50 travel component only if the explicit worker agreement makes it additional; it must not be silently included or discarded. Expenses and taxes are excluded from this example's percentage basis.

An overtime multiplier of 1.6 means a total rate of 160%, not a base rate plus an additional 160%. UI explanations and test names should remove this ambiguity.

### 9.4 Example C — Hourly all-in versus expense recovery

Configuration: eight hours; sell rate USD 120/hour; worker pay USD 55/hour; loaded cost USD 65/hour; hotel USD 150 and meals USD 40.

| Treatment | Revenue excluding tax | J&A direct cost | Contribution | Worker reimbursement if worker advanced both |
| --- | --- | --- | --- | --- |
| Hotel/meals included in hourly price | USD 960 | USD 710 | USD 250 | USD 190, independently tracked |
| Hotel/meals recovered at cost | USD 1,150: labour 960 + expenses 190 | USD 710 | USD 440 | USD 190, independently tracked |
| Customer directly paid both suppliers | USD 960 | USD 520 | USD 440 | USD 0 |

“Included in the customer rate” does not mean “the worker personally absorbs it”. Payer and reimbursement policy determine who must be repaid. Recovering a receipt from the customer does not prove that J&A has reimbursed the worker.

### 9.5 Example D — Separate tax streams and partial collection

Synthetic labour subtotal USD 1,000 with tax profile at 0%; expense subtotal USD 200 with an illustrative 10% tax profile. Labour invoice total is USD 1,000; expense invoice total is USD 220. If USD 600 is collected against labour and USD 220 against expenses, outstanding receivables are USD 400 and USD 0 respectively.

Do not use the 10% figure as a real tax setting. It exists only to prove that independent profiles are applied to the correct monetary stream. Percentage-based labour compensation must not take USD 1,220 as its basis.

For a per-invoice margin register, allocate direct cost once to the appropriate labour/expense sources. Repeating the entire project cost on both invoices would understate total contribution. If cost has not been allocated to invoices, show it at project level and label invoice margin unavailable rather than inventing an allocation.

### 9.6 Example E — Profitable project, short-term cash shortage

Opening verified cash USD 2,000. Approved worker payment USD 3,000 planned for 15 September. Reimbursements USD 500 planned for 16 September. Customer receipt USD 6,000 expected on 30 September.

| Date | Expected movement | Projected cash |
| --- | --- | --- |
| Opening | USD 2,000 | USD 2,000 |
| 15 September | −USD 3,000 | −USD 1,000 |
| 16 September | −USD 500 | −USD 1,500 |
| 30 September | +USD 6,000 | USD 4,500 |

The business needs to see the USD 1,500 interim funding gap even if the project has a positive contribution. These planned events remain a forecast until actual settlement records exist. If the opening cash is not verified, show cumulative net obligations instead of projected cash.

### 9.7 Example F — Cadence, rates, cap, corrections

For a semi-monthly September agreement, periods are 1–15 and 16–30. An every-14-days agreement anchored on 1 September instead gives 1–14 and 15–28. A weekly period spanning a month boundary must not be forced to equal an accounting month.

If a rate changes on 16 September, entries dated before that boundary retain the earlier applicable rule. An invoice issued later cannot retroactively select today's rate for all historical work.

For a cap of USD 5,000, USD 4,800 already consumed and a new USD 600 candidate, the system must expose the USD 400 over-cap amount. The agreed policy determines whether the draft is held or USD 200 is allocated and the balance remains blocked. Actual work and worker obligations remain intact. Do not silently discard the excess or raise the cap.

If a signed, invoiced entry is corrected from eight hours to seven, preserve the original time/version, signed report and invoice. Record the approved correction and required credit/replacement lifecycle. A frozen monthly pack receives an explicit later revision or adjustment under Accounting's policy.

### 9.8 Edge policies to decide explicitly

- Minimum per worker/day, callout, service visit, or project/day; eligible days and categories; whether travel or standby qualifies.
- Minimum adjustment pricing when workers/categories have different rates.
- Whether the minimum top-up is part of a percentage worker's eligible basis.
- Overtime measured per project/day, worker/day across projects, shift, or week; the existing slicing implementation groups by project/worker/date and uses a project threshold.
- Separate customer and worker overtime thresholds, if actual contracts require them; current independent multipliers do not alone prove independent threshold support.
- Weekend/holiday treatment and precedence when overtime also applies; do not stack premiums accidentally.
- Multiple overtime tiers, if required; a configurable single threshold/multiplier is not proof of a multi-tier engine.
- Cross-midnight work, site timezone and daylight-saving transitions; never infer a duration from ambiguous local clocks.
- Percentage settlement based on approved work, invoiced work or collected eligible labour; deductions/credits and partial collection allocation.
- PO-cap scope across labour, expenses, fixed amounts and taxes; credits may or may not reopen commercial capacity according to the agreement.
- Expense receipt gross/net amounts, recoverable taxes, FX date/source and rounding. Preserve original and converted amounts without mixing currencies in one unexplained total.

These are targeted verification/design questions. They are not claims that the existing engine fails every case.

## 10. Proposed data and architecture evolution

### 10.1 Preserve the working platform

Retain the modular monolith, SQLite, current portal/public-site separation, exact-money engine, durable jobs, artifact storage and deployment structure. No demonstrated requirement from this audit calls for microservices, Redis, a second frontend, or a database replacement.

Use a transactionally consistent source for time, rates, invoices and allocations. Calculation previews and final generation must call the same domain rules. The browser should format money and explain results, not independently recalculate pay or invoice totals.

Migrate only where an accepted workflow needs new state. Reuse existing client contacts, legal-entity revisions, commercial policies, settlements, conformity, jobs, audit and report artifacts before creating parallel records.

### 10.2 Relationship map

```text
Contracting customer ── customer contacts / invoice recipient
        │
        └── Project / cost centre ── optional end customer + worksite
                    │
                    ├── Agreement revision ── rates, expense rules, PO, cadence, tax
                    ├── Worker assignment ── dates, role, optional legal payee
                    │          └── time + reports + expense evidence
                    ├── Period report version ── exact sources ── acceptance evidence
                    ├── Labour / expense invoice snapshots ── collection allocations
                    ├── Worker obligations / reimbursement ── payment allocations
                    └── Closeout revision ── audience-safe artifact manifest

Optional extensions:
  supplier engagement → vendor invoice → reconciled project cost / payable
  travel commitment → actual expense / refund / advance reconciliation
  commercial change → approved PO/agreement revision → eligible sources
  technical issue → intervention reports → validated handover baseline
```

### 10.3 Minimum additions by accepted work package

These are logical records, not a mandate to create tables with these exact names.

| Logical record / extension | Key information | Reuse / invariant |
| --- | --- | --- |
| Agreement summary/revision | Pricing basis, expense responsibility, policy references, effective dates, approved attachment | Reference existing commercial/rate revisions; avoid a competing rate authority |
| Customer/worksite relationship | Bill-to, end customer, site, contacts and approval roles | Preserve existing client/project IDs and historical invoice snapshots |
| Notification policy/event | Event, recipient role, language, deadline, dedupe identity, delivery outcome | Extend current outbox and notification records |
| Closeout revision/artifacts | Project, source cutoff, audience, manifest, finalisation and supersession | Reuse current report renderer/private storage; final revisions immutable |
| Planned cash movement | Source obligation, expected date, currency, amount, scenario and revision | Derive from source where possible; never duplicate actual payment authority |
| Supplier and engagement | Legal payee, workers supplied, project scope, agreement reference | Optional extension; separate user account from payee |
| Vendor invoice and source allocations | Supplier number, dates, currency, amounts, project/time/expense references | Reconcile estimated/accrued sources; count cost once |
| Travel commitment / advance | Assignment, payer, dates, amount, cancellation and settlement allocations | Commitments distinct from actual expenses and paid cash |
| Commercial change request | Scope, reason, estimate, affected PO/rules, approvals and effective date | Technical approval and customer commercial authorization separate |
| Technical issue / baseline reference | System, responsible person, reports, validation, selected backup and status | Never imply that ERP approval physically deployed a PLC program |
| Manual/content approval record | Artifact version, locale, audience, source, approving person/date | Publication is deliberate; private business records are not public content |

### 10.4 Source identity and temporal integrity

All financially material new records need stable IDs, effective dates where applicable, creation/audit timestamps and version checks. Preserve the difference between when an event happened and when the system learned about it.

Use integer minor units/exact decimal-rational calculations according to the existing currency rules. Money totals must retain currency and avoid conversion to unsafe floating point. Multi-currency reports should initially group by currency; consolidated views need an explicit approved FX convention.

Maintain source-level allocation for:

- One time/expense source to eligible draft/issued lines under the correction model.
- One receipt event to multiple invoice allocations if enabled.
- One worker transfer to compensation and reimbursement components if enabled.
- One contractor bill to pre-existing time/accrual sources.
- One shared hotel receipt to several approved cost allocations if supported.

An expense's document hash can warn of reuse, but it cannot alone decide that two legitimate allocations are fraud or that a record should be deleted.

### 10.5 Role and audience boundaries

| Audience | Operational scope | Money scope | Typical actions |
| --- | --- | --- | --- |
| Worker | Own records, assigned projects | Own compensation and reimbursement only | Draft/submit/correct under existing lifecycle; view own status |
| PM | Assigned projects and authorized review | No sale rates, margins or private worker pay by default | Operational review and technical coordination |
| Finance | Authorized project financial sources | Pay, loaded cost, revenue, invoices, collections | Classify, review, issue, record settlements, export |
| Owner | Authorized company oversight | Full authorized business finance | Configure, assign, resolve exceptions and approve policy |
| Customer report recipient | Precisely approved project/period evidence | No monetary values in time/activity report | External conformity under the chosen process |
| Accounting recipient | Approved export package | Agreed accounting fields | Receive/read/export; not an implied right to administer the app |

Perform projection on the server. Reuse existing object authorization and private-file checks. Adding a crew view or customer-signing link must not broaden the underlying role by accident. Supplier bills, bank references and worker medical/identity documents need their own justified access; do not add sensitive personal-data collection merely because an ERP could store it.

### 10.6 Migration and operational safety

For implementation, develop and test against isolated fixtures. Do not seed production with synthetic customers to demonstrate features. Preserve concurrent user changes and the deployed release until there is an explicitly approved rollout.

Migrations should be additive, retain original meanings and test both fresh and populated upgrades. In particular, classify legacy all-in configurations through review rather than a blanket transformation. Validate rollback/restore of the database and private artifacts together.

Define idempotency and transaction boundaries for every operation creating financial lines, allocations, invoices, final reports or scheduled outputs. Readers must distinguish queued, running, ready and failed. One PDF failure must not destroy an independently completed XLSX/CSV.

### 10.7 Capacity and maintainability

The published team counts are not a verified load profile. Measure active users, peak submissions, document sizes, invoice lines and simultaneous month-pack jobs before setting targets.

A useful initial load scenario is a synthetic crew submitting at shift end while Finance reviews periods and reports render. Watch database write latency/lock waits, job backlog, PDF memory use, disk growth and backup duration. Paginate operational tables and batch expensive reads where measurement identifies a bottleneck. Large source files are a maintenance concern, but split them only at cohesive domain boundaries needed for the accepted changes.

## 11. ERP expansion choices

The extension priority should follow actual operational loss, not the length of a standard ERP feature list.

| Capability | Business case | Recommendation |
| --- | --- | --- |
| Lightweight inquiry follow-up | Website lead otherwise lives only in email | Add responsible person/status/next action and conversion reference if lead loss is real; no full CRM initially |
| Quote/order-to-project | Repeated manual setup or disagreement over agreed rates | Small versioned quotation/accepted-order record after collecting real examples |
| Commercial changes and PO revisions | Additional site work is delivered but not authorized/billed | High-value first ERP extension |
| Supplier/subcontractor payables | External companies supply engineering or crews | High-value if confirmed; otherwise defer |
| Travel commitments and advances | J&A funds mobilisation before invoices or receipts | High-value if observed; reuse existing expenses for actuals |
| Resource readiness | Wrong skills, conflicts or missing site onboarding delay work | Extend existing planning; keep planned hours optional |
| Lightweight technical issues | Open problems disappear between reports | Add before a full asset/commissioning platform |
| FAT/SAT and punch-list management | Customer contracts require structured test packages | Later scoped industrial extension |
| Equipment/tools tracking | Shared rented tools or test devices materially affect cost | Small custody/calibration register only after need is shown; no warehouse ERP by default |
| Retainers/support agreements | Repeated remote-support contracts need allowance tracking | Add when a real agreement defines hours, rollover and billing |
| Bank import/reconciliation | Manual payment matching becomes the bottleneck | Later read/import workflow with accountant-approved matching; not bank execution |
| Accounting connector | Accountant specifies an actual software/interface | Adapter after stable CSV/XLSX mapping; no speculative connectors |
| Offline capture | Verified connectivity loss prevents daily work | Revisit the documented deferral with a narrow worker scope |
| OCR / assisted report writing | Measured receipt-entry or drafting time is excessive | Optional assistive drafts only; human checks amounts and technical facts |

Keep full payroll, employment-tax calculation, tax filings, a statutory general ledger, inventory/manufacturing planning, native mobile apps and autonomous AI approvals outside this plan's initial implementation. They are excluded or materially beyond the supplied core scope. Do not use AI to invent PLC activities, signed acceptance, receipts, or accounting facts.

## 12. UX and employee manual specification

### 12.1 Worker phone experience

Preserve a compact primary navigation: Today, Time, Expenses, Reports; My Pay, Help and Profile remain clearly discoverable. Display the assigned project and recent period without exposing a confidential budget.

Keep frequent forms short, with advanced fields behind meaningful optional sections. Use duration controls with explicit units and validation. Receipt capture needs thumbnail/filename, upload progress, failure recovery and a readable confirmation. Offer repeat-last-day only as an explicit editable draft; never submit copied hours automatically.

A proposed usability target is entering a normal day's hours/activity in under 60 seconds after project selection and a straightforward expense in under 90 seconds excluding slow upload. These are goals to measure with employees, not existing performance claims. The more important criterion is that users understand what was saved, submitted, returned or paid.

### 12.2 Owner/Finance desktop experience

Organize navigation into Projects, Review, Billing, Cash/Collections, Accounting and Administration while keeping the existing permission boundaries. Preserve project and period context across links. Avoid duplicate “Finance Overview” headings and implementation-status badges.

The project page should offer Overview, Team, Work & Expenses, Customer Sign-off, Finance, Billing, and Closeout as role-appropriate destinations. Each financial total should open the exact source rows with consistent filters.

Useful exception cards include “Hours awaiting review”, “Missing customer acceptance”, “Expenses missing receipts”, “PO cap reached”, “Worker payments due”, and “Customer receipts overdue”. Their counts need a defined date/scope and must link to the matching records.

Use real semantic tables on desktop; on phones use summary cards with expandable source details, deliberate scrolling for genuinely tabular comparisons, and an obvious primary action. Do not compress a 20-column ledger into unreadable tiny text.

### 12.3 Multilingual behaviour

Keep UI locale, document locale and data values independent. A Finance user can operate the UI in Spanish and issue an English customer report. Changing locale must not alter currency, decimal value, work date, numbering or signed source identity.

Translations should include labels, errors, statuses, notification subjects, template headings, help and manual instructions. Activity text entered by an employee is original evidence; a translation should be labelled as such and must not replace the original technical meaning without review.

### 12.4 Employee PDF deliverable

Build on the existing manuals. The requested implementation deliverable should include:

1. A short EN/ES/PT-BR worker quick start with real screen names.
2. Task chapters using consistent synthetic project/worker examples.
3. Clear explanations of minimum billing versus actual hours, travel, optional overtime and own pay.
4. How to fix a returned item and who can correct approved records.
5. Receipt examples, upload failures and duplicate-submission avoidance.
6. Daily versus PLC report examples and the rule against signing for the customer.
7. Estimated/approved/scheduled/paid meanings with expected and actual dates.
8. A verified support route, document date/version, and in-app download.

Keep the long Owner reference separate from worker onboarding. Validate text extraction, embedded fonts, links, screenshots, page breaks and print legibility. Have a worker complete the tasks and a PM/Finance user review the language. A technically generated PDF is not proof of a usable manual.

## 13. Implementation work packages and dependencies

Estimates below are rough planning effort for an engineer familiar with the repository, including targeted review/testing. They are not a quote, delivery promise, or a claim that the original contract budget covers expansion. Discovery can change the ranges materially, and external approvals have separate elapsed time.

### Phase A — Establish the exact business baseline

WP-A1: acceptance and configuration workbook; approximately 2–4 engineering days plus owner/accountant review.

Inputs: current deployed manifest, supplied contract/checklist, three anonymised commercial agreements, one hourly included-expense example, one recoverable-expense example, one cap/minimum/overtime example, the original Excel, invoice/report samples, and current acceptance decisions.

Outputs: request-to-evidence register, configuration dictionary, terminology decisions, accountant's monthly export mapping, current unresolved approvals and a synthetic UAT dataset. Confirm worker versus subcontractor-invoice meaning.

Completion criterion: every money-related assumption has a sample calculation or a clearly named unresolved decision. No production setup is guessed.

### Phase B — Finish bounded core and website defects

WP-B1: commercial setup summary and preview; approximately 4–8 days. Extend `FinanceConfigurationSection.svelte`, project actions and existing commercial policies. Preserve pricing semantics and tests. Depends on WP-A1's billing definitions.

WP-B2: Aquarex request and public claim review; approximately 2–4 days plus content approval. Extend the existing public form path, validate localized content, and reconcile the claim/source register. It can proceed independently of financial design once the intended form promise is defined.

WP-B3: notification triggers and calendar correctness; approximately 3–6 days. Extend existing jobs/outbox, add scoped localized notices, and replace the hard-coded reminder assumption with effective configured eligibility.

WP-B4: closeout workflow and artifacts; approximately 5–9 days. Wire the existing backend through safe actions and add immutable audience-specific package generation. Review transactionality and source filtering before exposing finalisation.

WP-B5: manual access and task copy; approximately 2–4 days. Add Help/download entry, revise employee guidance, keep locales/version identity aligned, and test PDF usability.

Completion criterion: the affected core workflows are reachable and demonstrated by role; the public datasheet request persists correctly; contractual closeout/notification gaps have evidence-backed dispositions.

### Phase C — Make billing and cash manageable together

WP-C1: project-period review and sign-off follow-up; approximately 4–8 days. Connect existing sources, blockers, acceptance evidence and invoice drafts. Begin with the existing signed-PDF process; do not add a customer portal by default.

WP-C2: obligation/cash calendar and monthly pack mapping; approximately 6–10 days. Derive unpaid obligations/receivables, preserve currencies and actual-versus-planned dates, add drill-down, and reconcile accountant-approved outputs. No bank integration is necessary for this phase.

Completion criterion: Finance completes a representative period without rebuilding a private spreadsheet of signatures, invoice dates, worker obligations and collections. Accounting accepts a generated month pack.

### Phase D — Add only validated ERP extensions

WP-D1: customer/site/PO relationships and change orders; approximately 8–15 days for a bounded implementation, after real document examples settle the model.

WP-D2: supplier/subcontractor bills and allocations; approximately 8–15 days if required, with especially careful double-cost and historical-rate tests.

WP-D3: mobilisation, advances and resource readiness; approximately 6–12 days for the agreed subset. Do not bundle every travel, HR and certification feature into one delivery.

Completion criterion: each extension eliminates an identified external reconciliation or recurrent operational failure. Its scope and price are separately agreed if outside the original deliverable.

### Phase E — Industrial handover and measured optimization

WP-E1: lightweight issue tracking and approved technical baselines; approximately 6–12 days, with a separate estimate for FAT/SAT or asset hierarchy if requested.

WP-E2: performance, narrow imports/integrations, offline or OCR; estimate only after measurement and a named user need. These do not block the earlier phases.

### Dependency outline

```text
A1 business definitions
  ├─ B1 commercial setup ── C1 review/sign-off ── C2 accounting/cash acceptance
  ├─ B2 website request/content
  ├─ B3 notifications ───── C1 follow-up
  ├─ B4 closeout ────────── E1 technical handover extension
  └─ B5 manuals ─────────── refresh after each accepted UI change

D1/D2/D3 require A1 plus stable core source/allocation semantics.
E2 requires measured operational need, not merely a roadmap checkbox.
```

These effort ranges should not simply be summed into a calendar promise. Work dependencies, review, existing code quality and human approvals determine the delivery sequence. Useful parallel work exists between public-content repair, manual work and finance discovery, but any future implementation must assign non-overlapping ownership and follow repository review requirements.

## 14. Acceptance and verification plan

### 14.1 Fresh evidence policy

Run current tests relevant to a change before broadening to the release gates. Use disposable databases and isolated mail/storage. Reuse and extend the existing suites rather than create a competing acceptance harness. Record exact commit, configuration fixture, command, outcome and artifact reference.

Useful existing anchors include:

- `tests/integration/client-essential-commercial-policy-consumption.test.ts`
- `tests/integration/worker-compensation-essential.test.ts`
- `tests/integration/customer-conformity-billing-gate.test.ts`
- `tests/integration/expense-commercial-classification.test.ts`
- `tests/integration/finance-truth-reversal.test.ts`
- `tests/integration/client-essential-identifiers-dates.test.ts`
- `tests/integration/period-report-automatic-jobs.test.ts`
- `tests/security/essential-http-boundaries.test.ts`
- `tests/unit/time-commercial-slices.test.ts`
- `tests/e2e/client-essential-32-step.spec.ts`

These files were identified, not executed during this document audit.

### 14.2 Business scenarios to demonstrate

| ID | Scenario | Required outcome |
| --- | --- | --- |
| U01 | Four actual hours, 12-hour reference, eight-hour minimum | Actual remains four; invoice adjustment/pay/cost are independent |
| U02 | Two workers with different pay and sell rates on one project | Correct separate sources and totals; no average-rate substitution |
| U03 | Twelve work hours plus travel, 1.6× customer and 2× worker overtime | Matches the agreed calculation and threshold-category policy |
| U04 | Hourly price includes hotel | Hotel reduces project contribution; no automatic fixed labour invoice |
| U05 | Customer pays hotel/car directly | No J&A payable, worker reimbursement or duplicate customer rebill |
| U06 | Worker advances recoverable flight | Receipt, worker reimbursement and customer recovery have separate states |
| U07 | Percentage worker with overtime and separate expenses/tax | Uses eligible labour only and the selected settlement basis |
| U08 | Every-14-days versus semi-monthly | Distinct anchored boundaries, including month end and leap-year fixtures |
| U09 | Rate/assignment changes mid-period | Applies source-date configuration and preserves historical lines |
| U10 | PO cap reached or partly remaining | No silent cap increase, lost actuals or hidden unbilled exposure |
| U11 | Customer signature missing | Draft allowed as designed; final labour issue explicitly blocked |
| U12 | Only some workers/dates accepted | Coverage remains precise; unsigned work cannot ride on another signature |
| U13 | Time correction after sign-off/issue | Prior values/docs remain; appropriate acceptance/credit lifecycle applies |
| U14 | Labour/expense invoices with different taxes/templates | Independent profiles, correct identifiers and exact totals |
| U15 | Partial payment then reversal | Exact outstanding balance and causal audit; no fake cash |
| U16 | Worker payment scheduled but not executed | Worker sees expected date, not paid status |
| U17 | Combined worker pay plus reimbursement transfer | Component allocations reconcile to one actual transfer if enabled |
| U18 | Split labour/expense invoices in ledger | Project/direct cost not duplicated across invoice margin totals |
| U19 | Late receipt after frozen month | Explicit revision/adjustment; original export unchanged |
| U20 | EN/ES/PT versions of one report | Same financial/source truth, correct language and distinct artifact identity |
| U21 | PM/Worker probes finance APIs or others' private files | Server-side denial/allowlists, not merely hidden UI |
| U22 | Free-text activity contains confidential price | Customer preview/publication control prevents accidental disclosure under an explicit content policy |
| U23 | New notification on configured Sunday/closed project | Effective calendar/state used; no rigid Monday–Saturday assumption |
| U24 | PDF job fails but CSV/XLSX succeeds | Independent truthful states and safe retry |
| U25 | Aquarex form submit/retry | One durable request, clear queued/failed state, no false delivery promise |
| U26 | Final project closeout then late financial event | Frozen handover unchanged; financial follow-up remains possible |
| U27 | Supplier bill matches already-costed contractor time | Cost recognised once with explainable variance if module enabled |
| U28 | Worker advance settled with expenses/refund | Advance and expense/payment are not double-counted if module enabled |
| U29 | Cross-midnight or cross-project overtime case | Agreed clock/date/threshold policy; no fabricated duration |
| U30 | New employee follows PDF on phone | Completes time, receipt, report and own-pay tasks without developer assistance |

Not all scenarios require new features: many should prove existing behaviour. Mark each as existing test, new test, manual acceptance, conditional extension or unresolved policy. Do not count a deferred-extension scenario against the original core release.

### 14.3 Browser and artifact verification

Use representative 360/390 phone, 768 tablet and 1440 desktop views with Worker, PM, Finance and Owner. Check form preservation, labels, focus, touch use, loading/failure states, role-specific payloads and actual navigation between the relevant tasks.

Render representative invoices, worker statements, client reports, monthly packs and closeout packages. Open PDFs and spreadsheets with actual readers, verify totals and dates, and inspect all pages of the small acceptance set. Confirm customer documents contain no confidential fields or money embedded in free text. Verify attachment authorization at both final storage and download.

### 14.4 Production readiness for future changes

Before a later authorized deployment: review scoped diffs, confirm migrations and immutable-record invariants, complete relevant tests/builds, prepare database-plus-artifact recovery, and record the rollout/rollback instructions. Production smoke should use authorized safe reads where possible. Sending email, creating financial records or signing documents is not implied by a request to run a smoke test.

After rollout, verify the deployed identity, service health, automatic job operation, one representative safe artifact path and applicable UI changes. Do not recycle old screenshots as proof of a changed workflow.

## 15. Operational ownership and measures

Software will not remove spreadsheet dependence unless somebody owns each handoff.

| Responsibility | Suggested owner | Evidence of completion |
| --- | --- | --- |
| Commercial agreement/rates/expense policy | Owner with Finance | Approved example and effective configuration |
| Assignments and site readiness | PM / operations coordinator | Effective crew and operational contacts |
| Daily actuals and receipts | Worker | Submitted factual records with evidence |
| Operational and technical review | Assigned PM / technical reviewer | Reviewed records and reasons for returns |
| Customer acceptance follow-up | Named PM or coordinator | Version-bound accepted report or explicit dispute |
| Invoice issue and collection follow-up | Finance | Reviewed invoice and actual receipt allocations |
| Worker payments / expense reimbursement | Finance / designated administrator | Approved obligations, planned dates and actual allocations |
| Monthly pack acceptance | Accountant | Signed-off sample/mapping and final monthly revision |
| Public claims and manuals | Owner plus content/document owner | Approved source and current-language artifact |

Establish a baseline during the first operational month, then track:

- Time from work completion to submission, approval, acceptance and invoice issue.
- Unbilled approved work split by missing signature, missing configuration, cap and other blockers.
- Number/value of worker obligations due before expected client receipts, by currency.
- Receipt return rate and reimbursable expenses still unbilled.
- Overdue receivables by customer and next follow-up date.
- Contribution with a visible revenue basis and identified missing direct costs.
- Manual interventions needed to complete one month pack.
- Worker task completion and support requests after onboarding.

Do not invent targets for margin, utilisation or days-sales-outstanding without J&A's baseline and accounting definitions. Avoid turning operational visibility into employee surveillance; no GPS or screenshot tracking is needed for the stated requirements.

## 16. Decisions and missing inputs

These are implementation dependencies, not a reason to leave this analysis unwritten. Record who decides, the example used, decision date and effective scope.

| Decision/input | Why it matters | Working assumption until confirmed |
| --- | --- | --- |
| Original Excel workbook | Exact accounting columns, dates, formulas and month-close convention | Proposed ledger/pack structure only; no compatibility claim |
| Real hourly all-in agreement | Avoid confusing included expenses with fixed pricing | Hourly labour and independently included expenses, following latest owner wording |
| Meaning of worker invoice | Determines whether supplier-payables is necessary | Customer labour invoice + private worker statement; subcontractor bill remains optional |
| Compensation basis and trigger | Approved/invoiced/collected labour can produce different timing/amounts | No production default invented |
| Minimum/overtime examples | Determines categories, thresholds, day/service unit and stacking | Examples in section 9 are synthetic only |
| PO/cap semantics | Determine cap consumption, treatment of expenses/tax and over-cap work | Surface excess explicitly; no silent cap change |
| Issuing entity and validated tax/remittance details | Needed for real invoices and accounting | Use existing approved records only; pending identity not filled from marketing |
| Worker relationship/payee | Employee, individual contractor and supplier crew differ | Keep compensation separate from payroll; do not assume employment status |
| Customer signatory and method | Needed for valid business acceptance workflow | External signed evidence tied to report version; no new portal assumed |
| Dates/terms and late-event policy | Determines forecast and month-close truth | Planned and actual remain separate; accountant approves cutoff handling |
| Actual foreign-currency exposure | Determines need for FX and consolidation | Currency-grouped totals, no unapproved combined total |
| Website claims, project rights and technical datasheet | Controls accurate marketing and Aquarex promise | Public/company-authored evidence is a lead for approval, not proof of every claim |
| Manual walkthrough and preferred language | Determines practical onboarding quality | EN/ES/PT-BR quick guides plus detailed role reference |
| Current UAT/DPA/retention/continuity decisions | Existing evidence has pending and superseded statements | Verify latest approval; preserve documented MFA/offline/continuity decisions |

## 17. Evidence index and handoff

### 17.1 Local evidence anchors

All relative paths below are from `/home/kripta/ja-automation-platform-vps-hotfix`, except where explicitly absolute.

| Evidence | Location | Supports |
| --- | --- | --- |
| Owner-requested functional authority | [Essential specification](J_A_AUTOMATION_CLIENT_ESSENTIAL_SPEC_2026-08-22.md) | Core scope and deliberate ERP deferrals |
| Requested handback checklist | [Frozen handback checklist](/home/kripta/JA_CLIENT_READY_HANDBACK_2026-09-06_2058db2/J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md) | Historical evidence and outstanding acceptance |
| Supplied contract | [Development/implementation/support contract](<Contrato de Desarrollo, Implantación y Soporte - J&A Automation.pdf>) | Clauses 3/5/7 and Anexos A–D; scope comparisons |
| Current project instructions | [AGENTS.md](AGENTS.md) | Financial/privacy invariants; current MFA policy |
| Current deployed identity | [Live manifest](/opt/jaautomation/current/RELEASE-BUILD.txt) | Actual commit and build identity |
| Historical execution report | [RUN_REPORT.md](docs/evidence/client-ready-20260906/RUN_REPORT.md) | Candidate chronology and evidence limitations |
| Core billing and closeout | [repository.ts](packages/database/src/repository.ts) | All-in fixed path around 4289; closeout around 6604 |
| Compensation, finance and reminders | [v3-repository.ts](packages/database/src/v3-repository.ts) | Existing finance; reminders around 10258 |
| Customer-safe conformity | [customer-conformity-repository.ts](packages/database/src/domains/reports/customer-conformity-repository.ts) | Snapshot allowlist, evidence binding and version identity |
| Commercial slicing | [time-commercial-slices.ts](packages/database/src/domains/commercial/time-commercial-slices.ts) | Actual-minute grouping and overtime threshold projection |
| Client/project relationships | [clients.ts](packages/database/src/schema/clients.ts), [projects.ts](packages/database/src/schema/projects.ts) | Existing contacts/identifiers/site/PO fields |
| Workforce foundations | [workforce-planning.ts](packages/database/src/schema/workforce-planning.ts), [planning-repository.ts](packages/database/src/domains/planning/planning-repository.ts) | Skills, assignments, availability and overlap checks |
| Portal reachability | [portal-navigation.ts](apps/portal/src/lib/portal-navigation.ts), [section-load.ts](apps/portal/src/routes/app/[section]/section-load.ts) | Role navigation and reachable domain views |
| Existing Finance UI | [FinanceOverviewSection.svelte](apps/portal/src/lib/portal/sections/FinanceOverviewSection.svelte), [CollectionsLedgerSection.svelte](apps/portal/src/lib/portal/sections/CollectionsLedgerSection.svelte) | Present metrics/dates; next workflow improvements |
| Email delivery | [outbox-mail-delivery.ts](apps/portal/src/lib/server/outbox-mail-delivery.ts) | Notification topic, recipient restriction and copy |
| Aquarex request form | [Aquarex page](website/app/[locale]/solutions/aquarex/page.tsx) | Form wiring defect and public content |
| Working public-inquiry pattern | [Contact page](website/app/[locale]/contact/page.tsx) | Existing submission architecture to reuse |
| Website content/provenance | [company.ts](website/content/company.ts), [projects.ts](website/content/projects.ts), [content-provenance.md](website/docs/content-provenance.md) | Team counts, contacts, archive and approval inconsistencies |
| Existing guides | [Employee ES PDF](docs/manuals/Employee_Field_Guide_ES.pdf), [Worker PDF](docs/manuals/Worker_User_Guide.pdf), [Owner PDF](docs/manuals/Owner_User_Guide.pdf) | Manuals already exist |
| Historical sanitized UI | [Worker mobile capture](docs/manuals/screenshots/worker/live-time-phone.png), [Owner Finance capture](docs/manuals/screenshots/owner/live-finance.png) | Limited layout/copy review, not current browser certification |

### 17.2 External evidence use

Primary external sources are linked adjacent to the observations in sections 3 and 7. Retrieved on 8 September 2026. LinkedIn entries are public self-reports and indexed material; relative dates and activity counts are not treated as authoritative project dates or headcount. The CSIA manual is used as an industry benchmark, and product documentation as a comparison of workflows, not as a purchasing recommendation.

The designs, examples, priorities and effort ranges in this document are analysis and proposals. They are not quotations from those sources or assertions about undocumented J&A procedures.

### 17.3 Definition of a successful next delivery

An authorized next delivery should let J&A take an agreed hourly project from worker entry through customer acceptance, correct independent invoices, worker obligations/payments, collection, accepted monthly reporting and usable closeout—with each amount, status and date explainable from its source. The employee should be able to follow the PDF and the UI; the owner should be able to find what is waiting, who is responsible, what is owed and what can be invoiced.

Start by accepting the terminology and sample calculations in Phase A, then complete the bounded defects and workflow gaps in Phase B. Add the ERP extensions only when a real J&A agreement or recurring operational problem demonstrates their value.

### 17.4 Verification of this planning artifact

The completed document's local file links were checked for existence. All sixteen finding IDs and thirty acceptance-scenario IDs were counted. Nine exact-integer arithmetic checks confirmed the principal worked-example totals. A structural check of the deployed-matching Aquarex source confirmed four inputs, zero input names, and no form action/method/submit handler. Additional byte comparisons confirmed the Aquarex/Contact pages, project-content source, client/project schemas and planning repository match the active release.

These are document, source and example checks. They do not constitute a fresh authenticated application test, legal acceptance, full security audit, performance benchmark or accountant approval. The only authored change in this task is this plan.
