# Project actions and containing invoice drafts — 9 October 2026

User-requested follow-up: project Work shortcuts must bring the selected task into
view; reserved records must expose the actual draft/invoice and legitimate draft
editing/discarding instead of only saying that the records were billed.

The three inline destinations have stable fragment IDs and keyboard focus.
Centering runs after SvelteKit's queued fragment focus reset, then the next layout,
with destination URL/navigation-generation guards. Tall forms center their heading
and correct native legend/scroll-margin alignment. Hours/expenses open the existing
scoped ResponsiveSheet form. Native Back preserves the previous scroll position.

Authorized composer inventory includes containing invoice ID, state, number and
version from the existing same-project reservation query. It preserves billing
state precedence, legacy pointers, cap residuals and terminal-invoice exclusions.
The UI lists distinct containing documents and links each reserved record directly
to its document. Draft editing opens the canonical dates/payment/details editor.
Owner discard requires a reason and current version, uses the existing canonical
action and reloads inventory. Issued/history/document/payment/source-lock guards
and audit remain in that action. No automatic deletion or schema migration.

Validation: 27/27 unfiltered integration/invariant tests pass; portal/database
TypeScript and scoped ESLint/Prettier pass. Five real browser cases pass using one
worker: the five shortcuts, focus, pure SPA reuse and native Back at 360/390/768/1440;
containing draft view/editor and issued protection at all four widths; explicit
canonical discard with persisted audit and released reservation. All mutations
occur in the disposable browser fixture. Independent final read-only review is clear.

Production rollout and final artifact checks are recorded separately in
`action-navigation-deployment.json` after cutover.
