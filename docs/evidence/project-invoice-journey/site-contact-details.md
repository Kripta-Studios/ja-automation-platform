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
