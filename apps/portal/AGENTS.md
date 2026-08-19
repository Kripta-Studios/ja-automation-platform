# Portal / Frontend Instructions

These instructions apply to `apps/portal/**`.

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

Use the `$playwright-qa` and `$responsive-regression` skills for material UI work. Verify the affected role, not only a worker/demo role. Finance and owner/admin screens must be tested on phone too.
