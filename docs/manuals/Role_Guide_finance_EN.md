# Finance administrator guide

## Finance scope and source truth

Use your own account and the permitted **Finance Overview**, **Billing**, **Expenses**, **Accounting**, **Reports**, **Projects** and **Profile** views. Financial summaries are derived from effective-dated configuration and approved source records. A forecast, expected collection or scheduled settlement is not a bank balance or payment proof. This guide describes Finance work; Owner-only user administration, supplier appointment and Audit are separate permissions.

## Project context and workforce availability

Open **Projects** to confirm the client, project and effective dates before financial work. Its calendar and agenda expose authorized project dates; opening an event takes you to the source. In **Profile**, select your own or an authorized worker profile. The **Availability calendar** presents the latest 200 windows. A day opens a new UTC window; an existing agenda item opens its editor. Choose Available, Unavailable or Tentative, enter a factual note and save. Reload after an optimistic-version conflict. Availability supports coordination; it is not actual work or a compensation rule. Finance does not publish operational shifts just because it can inspect a calendar.

## Commercial configuration and billing

In **Commercial Configuration**, select the project and inspect the legal entity, billing stream, tax profile, rates and effective dates. Change only the approved rule and period; later configuration must not silently rewrite older records. In **Billing**, resolve readiness messages against approved sources and customer signoff before creating or issuing an invoice. Check entity, currency, numbering and tax. Once issued, use controlled void, credit or replacement actions with a reason; never edit an issued snapshot in place.

## Economic review, cash and settlements

In **Economic Review**, open **Source records** to reconcile revenue, labor, expenses and margin. In **Cash calendar**, filter project and dates and open the source entry; expected collection and scheduled payments remain forecasts. Review worker compensation and reimbursement separately from customer billing. **Finalize compensation** closes the calculation after source review; **Register actual payment** records a real transfer with date, amount, currency and reference. A partial payment leaves a balance; **Reverse payment** appends an audited correction instead of erasing history.

## Exceptions and records

If a figure is surprising, inspect source rows and effective dates before acting. Pending jobs, quarantined documents and unconfirmed bank events cannot be treated as complete. A stale workforce edit requires reload. Escalate mismatched entity, tax or customer acceptance evidence to the Owner through the verified support route; do not use an Owner-only action or backdate data to clear a warning.
