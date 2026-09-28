# Error, warning, and recovery policy

Every form action returns a stable problem code, localized message key and facts, field errors,
permitted remedies, and a correlation ID. A business rule is checked again by the server at
submission time. The client may explain the current state before submission, but that explanation
does not replace the server check. Successful actions identify the change that was saved.

## Automatic recovery

The client may apply only mechanical changes with a single safe interpretation:

- Trim surrounding whitespace from ordinary text fields where whitespace has no business meaning.
- Refresh an option list while keeping entered values and the selected record visible. A newly
  unavailable option remains visible with its current status and cannot be submitted.
- Retry a request only when the server recognizes the same idempotency key and payload, and the
  previous outcome can be determined. A changed payload needs a new key and an explicit submit.

The client must never silently reopen a project, approve or submit work, alter reimbursement or
tax treatment, issue or change an invoice, or overwrite a concurrent edit. Such operations require
an authorized user's deliberate action and a fresh server-side authorization check.

## Stale and uncertain outcomes

- For a changed record, return a conflict code and current safe facts. Keep the user's entries,
  show what changed, and offer **Review updated record**. Do not merge or overwrite automatically.
- For a network failure after submission, assume the write may have succeeded. Look up the outcome
  by idempotency key or a server-issued operation ID before offering another submit. If no reliable
  lookup exists, say the outcome is uncertain and direct the user to review the relevant record;
  do not encourage a blind retry.
- For a proven failed temporary request, say whether the save failed and offer a retry. If the
  outcome cannot be proven, say it is uncertain.
- Unexpected exceptions receive a generic localized message and a correlation ID. Technical
  details and stack traces remain in server logs. Unknown problem codes are logged and measured.

## Presentation and access

Field errors appear beside controls; multiple errors also appear in a linked summary. Business
blockers appear above the affected form with current state and a role-safe remedy. A consequence
that does not block submission is a warning before the submit control. Focus reaches a summary
or first invalid control without discarding entered values, the open tab, or scroll position.
Remedy links are generated from server-authorized IDs and client routes, never from raw error
messages. Restricted settings and private financial details are omitted for unauthorized roles.
English, Spanish, and Portuguese must carry the same facts and next step.

## Release checks

The action inventory is the denominator for coverage. Each action needs its known blocker codes,
role-safe remedies, translations, and a focused failure test. High-impact actions also need
browser evidence for success, invalid input, changed state, insufficient permission, and retry or
stale recovery at phone and desktop widths. Browser evidence checks visible wording, links,
retained values, focus, open tab, scroll, response payload, and console. A disposable database
must back browser runs. Production gets only read-only smoke checks after deployment and monitoring
for unknown codes.
