# Project on-site contact details — 9 October 2026

CORE-03 follow-up: the project Overview now displays the selected on-site contact's
existing name, role, company, location, telephone, email, notes and primary/billing
flags when present. Optional empty fields remain absent. Telephone and email use
`tel:` and `mailto:` links.

The contact name links to its exact authorized Clients record using client and
contact identifiers. Owner/Finance additionally receive a link to its exact edit
form. The shared workspace navigation opens the client disclosure, resolves the
contact across directory pagination and centers the record or editor. Saved
contact changes are reflected on returning to the project.

No server projection, permission, business action or schema is changed. The UI
uses the existing authorized `siteContacts` projection. PM and Auditor receive
their existing read access; Worker continues to receive no CRM contact fields.
All browser mutations use isolated disposable fixtures.

Runtime deployment results are recorded separately in
`site-contact-deployment.json`.

Validation: portal typecheck and production build pass, as do scoped ESLint and
Prettier checks. Two scoped integration suites pass all 10 cases for contact
actions and project site/currency invariants. Independent read-only review: CLEAR.

The final production build passes four browser cases at 360×800, 390×844, 768×1024
and 1440×900. Each case exercises Owner, Finance, PM and Auditor detail/navigation
flows, exact contact centering, authorized editor opening, telephone/email targets,
underlined links, touch-sized main actions and readable field geometry. A real
Owner contact save updates the phone displayed on returning to the project. Worker
checks verify that the existing restricted CRM projection is absent from both SSR
response and visible UI. All mutations are in disposable fixtures. One browser
instance at a time; private screenshots are retained in
`/tmp/ja-site-contact-browser-publish`.

Production activated `4a10ea023dcbf1953125dc5a6369981999764eb1` on 9 October 2026. Portal Docker health
and readiness pass; jobs run the same new image. The public project JavaScript and
CSS assets return HTTP 200 and match the final build hashes; login returns 200.
SQLite integrity is `ok`, foreign-key violations are zero, migration 76 is
unchanged, and all five maintenance timers are active. No production business
record was edited by the deployment or browser tests.
