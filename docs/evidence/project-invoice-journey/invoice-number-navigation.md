# Draft invoice number and configuration links — 9 October 2026

CORE-10 follow-up: mutable draft/approved invoice previews show the number that
issuance would allocate today, in both header and invoice metadata. The browser
and downloadable PDF explicitly label it as expected and not reserved. Issuance
still assigns the definitive number atomically; another issuance or a later date
can change the forecast. Missing effective approved policy leaves the preview
unnumbered and the numbering summary explains what the Owner must configure.

The projection reads the same approved/effective policy, issuer/year scope and
format used by issuance. It performs SELECTs only and does not reserve numbers,
advance sequences, edit invoice rows or mutate issued snapshots. Historical
issue markers suppress the projection. Existing issuance and artifact lifecycles
are unchanged. No migration or production business-data correction is required.

Clicking either displayed number opens the exact numbering form for Owner, with
the authorized invoice issuer selected and the destination centered. Finance and
Auditor can open a local read-only summary with number, prefix, digit count and
effective date, plus an explicit Owner-only configuration explanation. Approved
previews retain this number interaction without exposing the draft editor.
PM and Worker retain their existing denial of invoice detail access.

Draft client and issuer fields now open their exact authorized Clients card and
project issuing-authority configuration. Staying after the unsaved-change warning
preserves values and handles the expected navigation cancellation. These links
do not clear existing draft overrides or change source configuration themselves.
Number buttons have minimum 44 px touch geometry; PDF output has no controls.
User-facing additions are localized in English, Spanish and Portuguese.

Validation: 43 scoped unit, integration, invariant and artifact-security cases
pass across seven suites. The final touch-target change also passes a 16-case
subset rerun. Portal/database TypeScript, scoped ESLint, formatting and the
production portal build pass. Independent read-only final review: CLEAR.

Four browser cases cover 360×800, 390×844, 768×1024 and 1440×900, each with real
Owner, Finance, Auditor, PM and Worker sessions against a disposable fixture.
They verify draft/approved number display and role access, exact destinations,
issuer preselection, centering, touch geometry, cancellation of three navigation
links while retaining edits, Spanish PDF text and unchanged invoice counters.
The UI browser closes before Chromium renders the PDF: one browser instance at
a time. Screenshots are retained privately under
`/tmp/ja-invoice-number-browser-final`. No production business records were edited
by these tests. Deployment results are recorded in
`invoice-number-navigation-deployment.json` after rollout.
