# Cleaned-copy portal browser rehearsal

Date: 2026-09-24. Scope: authenticated **read-only** browser checks against an isolated copy of the business database. This does not constitute production clean-slate cutover or post-cutover acceptance.

The portal was launched from the locally built `apps/portal/build` artifact at `127.0.0.1:4180`, with `JA_DATABASE_PATH` set to `/home/kripta/ja-migration60-rehearsal-20260924/copy.rehearsal.sqlite` and `JA_DOCUMENT_ROOT` set to its copied artifact tree. Jobs were not started. Mail authentication, SMTP URL, outbox webhook URL, malware-scanner URL and remote backup were disabled for this process. A self-signed HTTPS proxy on `127.0.0.1:8443` enabled the existing owner browser session's domain cookie to reach the copy; Chromium's resolver mapped only this browser's `j-aautomation.com` requests to localhost. The browser context blocked service workers because the self-signed proxy certificate otherwise makes service-worker registration fail. No production database, artifacts, portal process or mail service was changed by this rehearsal.

The owner session reached `/j-aautomation/app/projects` without a login redirect. Browser checks waited for network idle, required HTTP 200, and observed no page errors or HTTP error responses on these routes:

| Route | Browser-visible result |
|---|---|
| Projects | Both retained example projects, `BBS Mexico` and `Junkers DFW`, visible. |
| Projects → Clients | Retained `IMPC Gmbh` client visible. |
| Time | `0 Records`. |
| Expenses | `0 Records`; `No expenses recorded.` |
| Reports | `0 Records`; `No daily reports recorded.` |
| Finance Overview | Page loaded with `Finance records loaded`; no route error. |
| Billing | `No invoices match this view.` |

Read-only SQLite checks after the browser run: `client=1`, `project=2`, `invoice=0`, `daily_report=0`, `expense=0`, `time_entry=0`, `payment=0`, `supplier=0`, `user=118`; `PRAGMA integrity_check=ok`, foreign-key violations `0`. These checks establish that the staged clean-slate copy starts in the intended state and the portal can render it with owner authentication. They do not test writes, generated artifacts, jobs, native Safari, or the public production origin after cutover. The locally built artifact was used here; the separately deployed `zip-b0276b4dbd5583c3315794d91cbca213` release requires its own public-origin acceptance.
