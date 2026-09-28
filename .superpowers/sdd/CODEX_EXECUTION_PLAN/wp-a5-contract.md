# WP-A5 responsive/design-system implementation contract

## Status

**READY**, subject to the parent confirming that WP-A1 and WP-T0 ownership is released and that no
other writer owns a path listed below at dispatch time. The contract is an A-class implementation:
the required behavior, role policy, viewport matrix, selectors, and existing RED browser oracles are
stable. Route actions, repository behavior, finance semantics, and template/report rendering semantics
are outside this packet.

Accepted starting evidence:

- WP-A1 preserved route/action/data contracts and split the portal styles into ordered modules. It
  also reproduced the first-letter/clipped drawer, hidden administration links, and 768 px overflow.
- WP-T0 provides authenticated intentional-RED coverage at 360×800, 390×844, 430×932, 768×1024,
  1024×768, 1280×800, 1440×900, and 1920×1080. Its current oracles cover Worker/Owner/Finance
  navigation, phone finance stacking and target size, the worker timesheet, and the invoice preview.
- The authoritative gaps are `SPEC-RESP-001`, `SPEC-A11Y-001`, `AUDIT-UI-001` through
  `AUDIT-UI-004`, and `V31-011` through `V31-014`. `V31-016` supplies the test matrix but does not
  pass the product behavior by itself.

## Outcome and non-goals

Deliver a role-correct portal whose full permitted navigation remains readable; whose affected
interactive targets are at least 44×44 CSS pixels; whose finance, report-edit, and comparable dense
forms stack and retain obvious labels on phones; whose validation is visible, field-local, and
keyboard reachable; and whose worker timesheet and invoice preview have deliberate mobile
representations. Establish and adopt one reusable component family rather than adding route-specific
card/form class variants. Preserve the desktop information architecture, URLs, form method/action/name
contracts, server response shapes, offline behavior, finance state, and RBAC.

This packet does **not** change server actions, load functions, repositories, schema/migrations,
artifact readiness, billing calculations, invoice-template selection/rendering, report catalog
semantics, or localization content. It must not make a pending artifact look ready or expose a link
the current role was not already permitted to see.

## Dependency and ownership DAG

```text
WP-A1 accepted + WP-T0 accepted/paths released
                    |
              A5-T characterization RED
                 /                 \
       A5-N navigation          A5-P primitives
                 \                 /
                  A5-S portal surfaces ---- A5-D detail/preview surfaces
                              \              /
                               A5-T final evidence
                                      |
                        independent mobile + desktop review
```

`A5-N` and `A5-P` may write concurrently because their exact paths do not overlap. `A5-S` starts
after both have handed off. `A5-D` starts after `A5-P` and may run beside `A5-S`. Only `A5-T` may
edit the named tests. Browser servers and full Playwright runs are serialized by the parent even when
file ownership is disjoint.

The active WP-A2 lane owns `apps/portal/src/routes/app/[section]/+page.server.ts` and new server
action/loader modules. Every A5 leaf is forbidden from those paths and from every `+page.server.ts`.
Future WP-B3/WP-B4 artifact/template/report UI leaves may not take `PortalShell.svelte`, the report
detail page, or the invoice preview page until A5-S/A5-D are reviewed and released. Conversely, A5
may not touch `packages/reporting/**`, `packages/invoice-templates/**`, Accounting Pack endpoints,
invoice PDF endpoints, billing actions, or template-selector semantics.

## Leaf A5-T — characterization and evidence harness

**Classification / owner:** A → independent `test_worker` at Luna Max.

**Exclusive owned paths:**

- `tests/e2e/portal-responsive.spec.ts`
- new `tests/e2e/portal-keyboard.spec.ts`
- new `apps/portal/src/lib/portal/ui/form-validation.test.ts`
- new `apps/portal/src/lib/portal/ui/primitives.test.ts`

**Forbidden:** all application implementation, shared `playwright.config.ts`, shared E2E auth/global
setup/environment fixtures, route-server files, and RTM/docs.

**Work:** preserve the accepted WP-T0 RED assertions and add selectors only where this contract makes
them stable. Before implementation, demonstrate failures for the full-label drawer, finance target
size/stacking, deliberate table/preview modes, invalid-form focus/error association, and drawer
keyboard behavior. After implementation, change no acceptance threshold merely to turn a RED green.

The test contract must use real authentication and the existing `signIn` helper. At all eight named
Playwright projects it verifies:

1. Worker, Manager, Finance, and Owner see full text for every permitted primary, secondary, and
   administration/security item; Worker sees no admin group, Manager sees no finance-only items,
   Finance sees no Audit item, and Owner sees Audit. RBAC expectations are derived from the existing
   navigation contract, not duplicated into production code.
2. At 360/390/430, the menu is closed and unfocusable initially; Enter/Space opens it, focus enters
   the drawer, Tab/Shift+Tab stay within the open modal drawer, Escape closes it and returns focus to
   the toggle, the backdrop closes it, and following a link closes it. At 768 and wider, full labels
   remain rendered and keyboard reachable without the first-letter hack.
3. Finance and Owner `/finance` forms are one column at 360/390/430, labels remain visible, controls
   are at least 44 px high and at least 240 px usable width, and no label/control touches a card edge.
4. An actual editable report form rejects an intentionally invalid submission, renders a linked error
   summary plus a field-local error, sets `aria-invalid`, focuses the first invalid control, and keeps
   previously entered valid values. A corrected submit follows the unchanged server action.
5. Worker `/time` exposes a named deliberate mobile mode with readable headers/labels and at least
   12 px table/card text. Owner invoice preview exposes its named deliberate mobile mode, retains real
   `<thead><th>` semantics, remains within the viewport, and keeps cell text at least 12 px.
6. Every affected page has `document.documentElement.scrollWidth <= innerWidth + 1`, while an
   intentionally scrollable inner table region is allowed and must be keyboard focusable, named, and
   visually signposted. This metric is supplementary, never the sole usability assertion.
7. Tab order reaches skip link, shell controls, navigation, fields, errors, and actions with a visible
   focus indicator (non-zero outline or box shadow with at least 2 px effective thickness). No console
   error, unhandled page error, or failed same-origin application request is ignored.

The final suite captures deterministic screenshots named by role/route/project, at minimum:
`navigation-open`, `finance-form`, `report-invalid`, `worker-timesheet`, and `invoice-preview`.
References to the generated Playwright artifact paths go in the handoff; screenshots are evidence,
not committed source files.

## Leaf A5-N — shell navigation and target remediation

**Classification / owner:** A → `responsive_worker` at Luna Max.

**Exclusive owned paths:**

- `apps/portal/src/lib/PortalChrome.svelte`
- `apps/portal/src/lib/portal-navigation.ts`
- `apps/portal/src/styles/portal/legacy.css`
- `apps/portal/src/styles/portal/shell.css`
- `apps/portal/src/styles/portal/responsive.css`

**Forbidden:** `PortalShell.svelte`, `portal.css`, all route files, tests, production data contracts,
and all B3/B4 paths.

**Required implementation contract:**

- `PortalChrome` remains a presentation component consuming the already-filtered `navigation`,
  `secondaryNavigation`, `visibleAdmin`, and `securityAdmin` arrays. It must not recompute or widen
  role permissions.
- The drawer is `#portal-navigation`; the toggle keeps the accessible name `Toggle navigation`, adds
  `aria-controls="portal-navigation"`, and accurately updates `aria-expanded`. Each visible label uses
  `.nav-label`; the active link has `aria-current="page"`. Administration and Security headings remain
  visible when their permitted group is non-empty.
- At 360/390/430, the aside behaves as a modal off-canvas drawer with a labelled backdrop
  `.nav-backdrop`, locked background scrolling, a focus trap, Escape/backdrop close, and focus return.
  A closed drawer and its links are absent from sequential focus. No `font-size: 0`, `::first-letter`,
  single-character surrogate, or `display:none` rule may hide permitted labels/groups.
- At 768/1024/1280/1440/1920, labels remain full text. If a later compact tablet mode is desired it is
  a separate packet requiring explicit icons/tooltips/accessibility evidence; this packet does not
  preserve the legacy 5 rem first-letter rail.
- Add one shell token `--ja-target-min: 2.75rem` and use it for visible shell links, buttons, locale
  selector, account-menu items, and sign-out targets. A checkbox/radio may retain its conventional
  glyph size only when its associated clickable label supplies the 44 px target.
- Delete or consolidate the contradictory legacy breakpoint declarations; `responsive.css` becomes
  the single authoritative responsive layout layer and `shell.css` the base shell layer. Do not solve
  cascade conflicts with `!important` or a later exception block.
- Preserve every existing href, logout behavior, online/queue/status display, locale selector,
  account action, desktop ordering, and permitted-item ordering. The bottom navigation remains a
  convenience subset; it does not substitute for the complete drawer.

## Leaf A5-P — reusable UI primitives and validation behavior

**Classification / owner:** A → `frontend_leaf` at Luna Max.

**Exclusive owned paths:**

- `apps/portal/src/portal.css`
- new `apps/portal/src/styles/portal/primitives.css`
- new `apps/portal/src/lib/portal/ui/SectionCard.svelte`
- new `apps/portal/src/lib/portal/ui/FormCard.svelte`
- new `apps/portal/src/lib/portal/ui/FormSection.svelte`
- new `apps/portal/src/lib/portal/ui/Field.svelte`
- new `apps/portal/src/lib/portal/ui/FieldGroup.svelte`
- new `apps/portal/src/lib/portal/ui/ActionBar.svelte`
- new `apps/portal/src/lib/portal/ui/StatusBadge.svelte`
- new `apps/portal/src/lib/portal/ui/TableRegion.svelte`
- new `apps/portal/src/lib/portal/ui/form-validation.ts`
- new `apps/portal/src/lib/portal/ui/index.ts`

**Forbidden:** tests (owned by A5-T), `PortalShell`, `PortalChrome`, route pages/servers, existing style
modules, packages, docs, and RTM.

**Stable primitive contracts:**

- Every primitive forwards `class`, safe `data-*` attributes, and its child snippet without changing
  form field names or values. It emits stable selectors `data-ui="section-card|form-card|form-section|
field|field-group|action-bar|status-badge|table-region"`.
- `SectionCard` and `FormCard` require a visible title or an explicit accessible label and connect it
  with `aria-labelledby`. `FormSection` supplies a visible section heading and optional helper copy;
  it does not create a nested `<form>`.
- `Field` accepts an explicit control id, persistent label, optional helper, optional error, and
  required state. It produces deterministic `${id}-help`/`${id}-error` ids and the values needed for
  the caller's `aria-describedby`/`aria-invalid`; placeholders never replace labels.
- `FieldGroup` is one-column by default and may use auto-fit only above a declared minimum of 18 rem;
  phone media queries force one column. It supports `columns="1|2|3|auto"` without route-specific
  grid classes.
- `ActionBar` provides clearly separated primary/secondary actions, wraps rather than compresses, and
  ensures 44 px targets. `StatusBadge` has text plus semantic variants; color is not its only cue.
- `TableRegion` requires an accessible name and `mobileMode="cards|scroll"`. Scroll mode receives
  `tabindex="0"`, an instruction referenced by `aria-describedby`, visible edge/scroll affordance,
  and `overscroll-behavior-inline: contain`; cards mode exposes row and cell labels in reading order.
- `form-validation.ts` is a progressive-enhancement action/helper. On invalid submit it creates or
  updates one `[data-validation-summary]` with `role="alert"`, one
  `[data-field-error-for="<control-id>"]` per invalid control, `aria-invalid="true"`, and merged
  `aria-describedby`, then focuses the first invalid control after announcing the summary. On input it
  clears only the corrected field error. It must preserve values, method/action, native constraint
  validation, SvelteKit submission behavior, and any server `form.message`; it never converts a server
  failure to success or intercepts a valid request.
- `primitives.css` contains the shared card padding/border/title hierarchy, field/help/error/focus
  states, grid, actions, status, and table-region behavior. `portal.css` imports it once immediately
  after `foundation.css`. No primitive may introduce a parallel `entry-panel-v2`/`form-card-new`
  family or depend on a route-specific selector.

## Leaf A5-S — portal worker/finance/form adoption and extraction

**Classification / owner:** A → one `crud_ui_worker` at Luna Max. This leaf is the sole owner of the
remaining frontend hot façade for its entire turn.

**Exclusive owned paths:**

- `apps/portal/src/lib/PortalShell.svelte`
- `apps/portal/src/styles/portal/surfaces.css`
- `apps/portal/src/styles/portal/forms-management.css`
- new `apps/portal/src/lib/portal/sections/TimesheetPanel.svelte`
- new `apps/portal/src/lib/portal/sections/FinanceConfigurationSection.svelte`

**Forbidden:** every route-server file, `PortalChrome`, `portal-navigation`, `portal.css`, all other
style modules, tests, billing/template selector and artifact-status semantics, packages, docs, RTM.

**Required adoption:**

- Extract the existing weekly timesheet markup/data presentation into `TimesheetPanel.svelte` and the
  existing finance configuration forms/register presentation into `FinanceConfigurationSection.svelte`.
  Props/callbacks are typed projections of the current data; form action/name/value contracts and
  money formatting remain unchanged. `PortalShell.svelte` must have a net line-count reduction from
  its pre-A5 value and may not gain new ad-hoc card/form/table CSS classes.
- Use `SectionCard`/`FormCard`/`FormSection`/`FieldGroup`/`ActionBar`/`StatusBadge`/`TableRegion` on the
  extracted worker and finance surfaces. Adopt the same field/action primitives on at least one
  comparable non-finance form already in `PortalShell` (private document upload or profile
  availability) so the design system is demonstrably shared.
- Finance configuration is a single column at 360/390/430; at larger widths `FieldGroup` may auto-fit
  only when every control keeps an 18 rem minimum. Heading/help/action content spans the full grid.
  Labels remain above controls with card-edge padding of at least 16 px.
- The weekly worker surface declares `data-mobile-representation="cards"` or
  `data-mobile-representation="scroll"`. Cards mode repeats each column label per value and preserves
  status/category/pay visibility permitted to that role. Scroll mode must satisfy the named,
  focusable, signposted `TableRegion` contract. Accidental compressed columns are forbidden.
- Apply the validation helper to affected finance and comparable forms without altering a valid POST.
  Required text/select/textarea/button targets are 44 px high; checkbox/radio labels provide the hit
  area. Server action messages remain a page-level status and are not mislabeled as field errors.
- Do not change finance calculations, visibility, role gates, run-jobs behavior, Accounting Pack
  links/states, billing-template fields, offline draft/sync behavior, or navigation.

## Leaf A5-D — Modify Report and invoice-preview representation

**Classification / owner:** A → one `crud_ui_worker` at Luna Max, distinct from A5-S if they run in
parallel.

**Exclusive owned paths:**

- `apps/portal/src/routes/app/reports/[id]/+page.svelte`
- `apps/portal/src/routes/app/billing/invoices/[id]/+page.svelte`
- `apps/portal/src/styles/portal/details-invoices.css`

**Forbidden:** both sibling `+page.server.ts` files, invoice PDF/API/template renderer/registry,
report catalog/export semantics, `PortalShell`, shared primitive files, tests, packages, docs, RTM.

**Required adoption:**

- Recompose Modify Report with the shared `SectionCard`, visible `FormSection` headings, `Field`,
  `FieldGroup`, `ActionBar`, and validation helper. Group daily fields into Shift, Work performed,
  Issues/decisions, and Next steps; group technical fields into Equipment, Change, Validation/risk,
  and Safety. Keep all existing input names, hidden concurrency/version fields, current values,
  required constraints, update URL, authorization-driven visibility, history, and delete-draft rules.
  Save/cancel/navigation actions remain obvious and keyboard reachable; no placeholder substitutes for
  a label.
- Add stable `data-field`/error association selectors and a useful multi-error summary. A failed
  native validation preserves every entered value. A server concurrency/authorization message stays
  truthful and does not get converted to a field success.
- On the invoice preview, keep the semantic table and all print/PDF desktop rules. Add explicit cell
  labels (for example `data-label`) and `data-mobile-representation="cards"` to transform line items
  into readable cards at 360/390/430 while retaining the real `<thead><th>` for semantics. At 768 and
  wider the current desktop table layout remains. Mobile text is at least 12 px, monetary alignment
  and description/source/quantity/rate/amount meaning remain unambiguous, and the paper never clips.
  The print media rule must restore the canonical invoice table and must not print mobile pseudo-labels.
- This leaf changes presentation only. It cannot change invoice values, rounding, tax iteration,
  issuer/client content, billing treatment text, print action, back link, or any template choice.

When A5-D is accepted, the parent explicitly releases both route-page paths before assigning a future
template/report UI worker. The future worker must integrate on top of these accessibility selectors,
not replace them silently.

## CSS and selector acceptance

- There is exactly one base definition and one responsive override per shell/design-system concept.
  Remove the legacy `font-size: 0`, `::first-letter`, 5 rem rail, hidden admin/signout, and conflicting
  `admin-form-grid` breakpoint declarations instead of counteracting them later.
- No new `!important`, viewport-specific pixel nudges for individual routes, hidden labels, sub-12 px
  mobile data, negative-margin error placement, or horizontal page clipping.
- Stable browser selectors are:
  `#portal-navigation`, `.nav-label`, `.nav-backdrop`, `[aria-current="page"]`,
  `[data-ui]`, `[data-validation-summary]`, `[data-field-error-for]`,
  `[data-mobile-representation]`, and `[data-table-region]`. Existing public heading/link names used by
  WP-T0 remain unchanged.
- At 1440 and 1920 the sidebar, header, title, card widths, table columns, invoice print preview, and
  role-specific item order match the pre-A5 information hierarchy. Responsive fixes may change
  spacing/visual polish but not remove desktop information or actions.

## Verification sequence

Use Node `24.19.0` and pnpm `11.22.0` with the pinned Node binary directory prepended to `PATH` before
recording evidence. Do not run multiple Playwright web-server invocations concurrently.

Narrow gates, per owning leaf:

```powershell
pnpm exec prettier --check <exact-owned-source-and-test-paths>
pnpm exec eslint <exact-owned-ts-and-svelte-paths>
pnpm --dir apps/portal exec vitest run src/lib/portal/ui/form-validation.test.ts src/lib/portal/ui/primitives.test.ts --config vite.config.ts
pnpm --filter @ja/portal typecheck
pnpm --filter @ja/portal build
pnpm exec playwright test --config=playwright.config.ts --project=phone-360 tests/e2e/portal-responsive.spec.ts tests/e2e/portal-keyboard.spec.ts
pnpm exec playwright test --config=playwright.config.ts --project=tablet-768 tests/e2e/portal-responsive.spec.ts tests/e2e/portal-keyboard.spec.ts
pnpm exec playwright test --config=playwright.config.ts --project=desktop tests/e2e/portal-responsive.spec.ts tests/e2e/portal-keyboard.spec.ts
```

Integrated A5 gate after every writer has stopped:

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm exec playwright test --config=playwright.config.ts tests/e2e/portal-responsive.spec.ts tests/e2e/portal-keyboard.spec.ts
pnpm test:e2e
git diff --check -- apps/portal/src tests/e2e/portal-responsive.spec.ts tests/e2e/portal-keyboard.spec.ts
```

The parent must distinguish a known repository-wide formatting baseline from new owned-file failures;
every A5-owned file must pass its scoped format/lint check even if the broader baseline remains red.
No mandatory browser case may be skipped or softened.

## Independent review gates

1. A fresh `mobile_qa` (Luna Max, read-only/procedural read-only) reviews real authenticated
   Worker/Manager/Finance/Owner flows at 360×800, 390×844, 430×932, and 768×1024. It manually checks
   labels/items, drawer keyboard behavior, targets, finance/report forms, errors/focus, worker table,
   invoice preview, and screenshots; `scrollWidth` alone is not acceptance.
2. A separate `desktop_qa` reviews 1024×768, 1280×800, 1440×900, and 1920×1080 for preserved
   desktop information/actions, keyboard order/focus, invoice print preview, and regressions.
3. Any concrete failure returns to the leaf that owns the failing path, followed by its narrow tests,
   the reviewer reproduction, and the integrated responsive suite. Implementers do not self-certify.
4. After both reviewers approve, a `spec_auditor` reconciles only the cited responsive/design-system
   rows. PASS requires code plus green browser evidence; screenshots or a lack of overflow alone are
   insufficient.

## Acceptance and rollback

WP-A5 is accepted only when all eight viewport projects pass the authenticated role, focus/keyboard,
target, stacking, error, table, preview, and no-page-clipping assertions; owned format/lint/typecheck/
build gates pass; desktop and RBAC behavior is preserved; and independent mobile and desktop reviewers
approve after fixes. `PortalShell.svelte` must be smaller than at A5 start and the new primitives must
be used on multiple real surfaces, not merely exist unused.

There are no migrations or data writes. Each leaf is mechanically rollback-safe within its exclusive
paths. Roll back dependants in reverse DAG order: A5-D/A5-S, then A5-P/A5-N, then A5-T assertions only
if the requirement itself is withdrawn (never to hide a product failure). Removing A5-P requires first
removing all primitive imports; removing A5-N restores the previous shell but also knowingly restores
the P0 first-letter defect and therefore cannot be an accepted release state. Never roll back with a
destructive whole-worktree command.

## Handoff format

Every implementation leaf reports: status `READY` or `BLOCKED`; starting and ending HEAD; exact
changed paths; confirmation of forbidden paths untouched; before/after `PortalShell` line count where
applicable; selectors/contracts introduced; role/RBAC behavior checked; exact commands and result
counts; intentional RED then GREEN evidence; browser role/route/viewport steps; screenshot/trace paths;
console/network findings; remaining risks; and whether a downstream path/interface must be released.

## Key risks requiring parent attention

- `legacy.css` and later style modules currently contain overlapping breakpoint rules. Partial fixes
  can appear green at one width while reintroducing the defect at another; consolidation and all-eight
  evidence are mandatory.
- `PortalShell.svelte` is still a hot compatibility façade. A5-S must be exclusive and should extract,
  not add another embedded surface. B3/B4 UI work waits for its release.
- The invoice preview is also a print artifact surface. Mobile card rules must be scoped outside print
  media and independently checked in print preview so production invoices are not altered.
- Visible field-local server errors cannot be fabricated from a page-level message. This packet may
  enhance native constraint errors; any future structured domain-error mapping requires an explicit
  server contract owned outside A5.
- The current role predicates are broad but authoritative for this packet. A5 preserves them; an
  ambiguous change to Manager/Finance/Owner visibility is an RBAC decision and must be escalated to
  the backend/security owner rather than guessed in CSS or UI.
