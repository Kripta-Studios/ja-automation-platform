# UI/UX repair — 17 October 2026

Scope: user-requested browser swarm review and repair of the existing VPS portal,
starting from deployed source `c88a3d2c`. This is scoped CORE-10 / CORE-14 evidence,
not a claim of complete Client Essential acceptance.

## Reproduced problems and changes

- Dashboard creation actions appeared below the financial dashboard. They now
  precede it. Creating an invoice opens the global composer directly, retaining
  the current language and role guards instead of opening an arbitrary project's
  billing tab.
- Navigation search stopped at top-level sections. It now searches authorized
  subsections and offers frequent settings. Compensation and internal-cost links
  reach uniquely identified, visible forms with keyboard focus.
- Whole-period invoice creation required twelve steps, several informational.
  Three main decisions now cover project/stream, period and review/save. Detailed
  information remains available. Readiness checks, source eligibility and the
  explicit draft/approval/issue lifecycle are unchanged.
  The subsequent user-requested [visibility correction](invoice-detail-visibility-20261017.md)
  replaces the collapsed detail navigation with visible shortcuts and shows all
  detail sections automatically within those three stages.
- Long invoice identities pushed status, totals and actions out of the desktop
  register. Deliberate column widths and text wrapping keep the register usable,
  while monetary amounts, statuses and action labels remain readable. Existing
  mobile cards are retained.
- Invoice stream selection now occupies the full form width. Duplicate project
  context is removed only where the enclosing creation surface already provides it.
- Project edit sheets rendered outside the page that defined their CSS tokens.
  Their inputs consequently lost borders and the sticky action footer became
  transparent. The page and its sheets now share the same tokens.
- Canonical EN/ES/PT navigation translations include Digital workers.

## Verification and review

Three implementation agents used independent Chromium sessions against the
authorized live application and the disposable preview. Screenshots were opened
and visually inspected. A separate read-only reviewer checked the accumulated
diff and browser behavior. Its findings about fragmented table labels, an empty
anchor and a duplicate ID were corrected and rechecked. Final review: **SHIP**
for this scope, including a real dashboard-click-to-composer journey.

Representative widths: 360, 390, 768 and 1440 px. Roles checked include Owner,
Finance, Project Manager, Worker and Auditor. Production inspection does not
create invoices or other business records; mutation tests use a separate fixture.

Integrator evidence is retained in
`/home/kripta/ja-ux-swarm-evidence-20261017/`; navigation captures are in
`/home/kripta/ja-ux-swarm-20261017-side/navigation/`. These private host directories
also contain isolated test data or sessions and must not be published wholesale.

The integrator's focused unit/integration run passes **64 tests**, including
invoice-composer API checks. Portal compilation, TypeScript, scoped ESLint and
format checks pass. Responsive regression checks cover visible borders, opaque
footer, focus, hit targets, Escape and scroll containment. Browser logs record
the final scope/mode, role and creation journeys and any subsequent deployment.

Final browser results: **48 billing cases**, **24 navigation/responsive cases**
and **one Owner/Finance/Worker creation-and-project-access journey** pass across
the applicable viewports. The first navigation run exposed the indirect dashboard
CTA; its four affected cases passed after repair. The billing runner stopped
after 40 successful cases without an assertion failure or final summary; the
remaining eight desktop cases were run separately and passed. The final
navigation unit rerun passes 42/42. The deployment smoke rehearsal passes all
four widths with zero page errors and zero business mutation requests.

Two unrelated historical checks were identified by the agents: missing canonical
Digital workers translation (fixed here), and a project-detail source assertion
for a sentence already absent from the base revision (not used as evidence of a
passing full suite). The build retains existing application warnings; no blanket
claim of a warning-free or fully accepted application is made.

No database migrations, financial calculations, permissions, authentication
policy, jobs or issue/send behavior are changed. Release receipts record the
verified database/document backup, previous image/release, runtime content hashes
and post-deployment read-only browser checks.
