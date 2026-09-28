# Portal / Frontend Instructions

These instructions apply to `apps/portal/**`.

## Client Essential role and data boundaries

Validated against the Client Essential authority, local
`J_A_Automation_Contrato_Proyecto_EVOCON_ES.html` (`ANEXO A`/`ANEXO D`), and `UI_PLAN.md` on
2026-08-24:

- **Configuration is not data entry.** Workers record operational truth (actual time, activity,
  travel, expenses, receipts, and reports). Project/Finance configuration determines its commercial
  interpretation; the Worker must not be asked to choose client billability, tax, markup, or rate
  treatment as an ordinary field entry.
- **Role-safe server projections are mandatory.** Customer-facing projections contain operational
  activity and references but no money. Worker and PM projections omit Finance-only rates, internal
  cost, margin, client treatment, tax/FX, other-worker pay, and commercial fields at the server DTO
  boundary; hiding a field in the browser is not sufficient. A Worker projection retains only that
  Worker's own reimbursement/payment state, amount, reference, and dates. PM projections omit those
  Worker-private reimbursement fields by default.
- **PM expense authority is operational-only by default.** A PM may review/approve/reject the
  scoped operational expense record and request a correction, but may not configure or decide
  commercial expense treatment, client billability, markup, tax, reimbursement amount/state, or
  ledger/collection effects. Finance/Admin owns those commercial decisions, with the required
  authorization and audit trail.

## Design system first

Prefer reusable primitives over route-specific ad-hoc CSS. Establish and reuse concepts such as:

- `PageHeader`
- `SectionCard`
- `FormCard`
- `FormSection`
- `Field` / `FieldGroup`
- `ResponsiveGrid`
- `DataTable`
- `StatusBadge`
- `EmptyState`
- `DangerZone`
- `JobStatus`
- `ArtifactStatus`
- `DetailHeader`
- `StickyActionBar`

Do not create another parallel family of near-identical form/card classes when an existing primitive can be extended cleanly.

## Responsive requirements

- Phone navigation is an off-canvas drawer with full readable labels; never intentionally show only the first letter.
- Dense configuration forms stack to one column on phone.
- Use container-aware/auto-fit layouts only with sensible minimum control widths.
- No labels touching card borders. Maintain consistent padding and hierarchy.
- `Modify report` and all edit forms must have visually explicit section titles, labels, helper/error text, borders/backgrounds as appropriate, and obvious save/cancel actions.
- Respect safe touch target sizes and keyboard navigation.

## Forms

- Labels are persistent and visible; placeholders do not replace labels.
- Validation is field-local plus a useful summary for multi-error submissions.
- Preserve entered values after validation errors.
- Warn about unsaved changes on long/important forms.
- Long reports should autosave drafts where appropriate and support draft recovery.
- Destructive actions use a consistent, explicit danger-zone pattern.

## State integrity

Never show a download action as ready unless the corresponding artifact is ready. Render queued/running/failed/retry states explicitly.

## Browser verification

Use the `$playwright-qa` and `$responsive-regression` skills for material UI work. Verify the affected role, not only a worker/demo role. Client Essential evidence uses representative 360/390 phone, 768 tablet, and 1440 desktop coverage; add widths when a real defect/risk warrants it. Finance and owner/admin screens must be tested on phone too.
