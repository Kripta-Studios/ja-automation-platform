# Crew day GET filters: deployed production baseline

- Actual Chromium against the currently deployed public portal on 2026-09-27. This was read-only browser navigation and filter GET traffic; there were no Crew form actions or business writes. Authentication created only normal sessions.
- Owner at 390 px English, Project Manager at 1440 px Spanish, Worker 1 at 390 px Portuguese, Worker 2 at 390 px English, and Worker 3 at 1440 px Spanish. Worker 2 had a selectable Crew project; Manager, Worker 1, and Worker 3 had no Crew project available. Owner also had project options.
- Replay: set private `JA_QA_OWNER_EMAIL` and `JA_QA_OWNER_PASSWORD` environment variables, then run `PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH node docs/evidence/error-warning-candidate/crew-day-production-baseline/production-readonly.mjs`. Other test accounts are read from the private test-account file at runtime. The script never writes credentials to evidence.

For Owner and the scoped Worker 2 account, `date=not-a-date` and `date=2026-02-30` returned a generic 400 error page. The selected project and date form disappeared, keyboard focus stayed on the body, and the wording did not identify the bad date or a correction path. A duplicate date used its first value and returned 200 without a warning. A duplicate project likewise used the first project and returned 200. An inaccessible project returned a generic 403 page without preserving the selection. The Manager account returned 403 before any Crew filters; this is appropriate for an account without Crew access.

The redacted JSON contains page state, response status/resource type, focus, and console error counts without account names, credentials, project identifiers, or request bodies. No JavaScript page exceptions were recorded. Console errors corresponded to the failed GET resource responses; the script records counts only. The PNG files isolate the generic error main region and contain no Crew records.

This is the deployed baseline. Candidate verification is recorded separately after the Crew filter changes.
