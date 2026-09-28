# Private document and report attachment download baseline

Observed on deployed portal, 2026-09-27. This is a read-only browser audit using isolated Chromium contexts. No private PDF bytes were saved, no records were changed, and no screenshot of a private document was taken. Role, route template, status, and response shape are recorded without document IDs or account identifiers.

## Actual response and UI observations

| Context | Route | Observed result |
| --- | --- | --- |
| Signed out, 390 px | `/app/api/documents/[id]` and `/app/api/reports/[id]/attachments/[documentId]` | HTTP 401, `{"error":"Unauthorized"}`. Direct browser navigation showed that raw JSON on a bare page; no remedy link or alert; focus was `BODY`. |
| Worker EN, 390 px | Unknown document and unknown report attachment IDs | HTTP 404, respectively `{"error":"Document not found"}` and `{"error":"Report attachment not found"}`. The response contains no stable code, remedy, or correlation ID. |
| Finance ES, 1440 px | Unknown document and unknown report attachment IDs | Same 404 statuses and English one-field JSON bodies; the request's locale did not change the error wording. |
| Finance and Worker | `HEAD` to the *same* existing private PDF link from Finance Documents | Finance received HTTP 200, `application/pdf`, `private, no-store`; Worker received HTTP 404, `application/json`, `private, no-store`. The HEAD method transferred no PDF body. This confirms concealment of that document across the tested roles. |
| Finance ES, 1440 px | Documents **View** link with browser-intercepted 409 | The link opened a new tab showing raw `{"error":"Document is unavailable"}`. It had no app alert or remedy; focus was `BODY`. The original Documents tab kept focus on the link. The intercepted response prevented the real PDF GET. |

Finance Documents displayed one row with View and Download links. Worker Documents displayed zero rows and the generic empty text “No matching records.” Neither of the two Worker expense details, first eight Finance expense details, or one Finance report detail inspected exposed a receipt or report attachment link. The Finance Reports list also exposed no period-report or attachment link. Those flows could not be tested through a real document link in this production data. No page exceptions or horizontal overflow occurred on the checked Documents pages.

The 409 was deliberately intercepted in the browser; it proves the current link presentation, not that an existing file naturally reached a 409. Authenticated 404 JSON was observed through browser requests, while a direct 404 page was not separately opened. No actual report attachment 409 was induced.

## Message and recovery gaps

- The direct download routes return only an `error` string for known 401, 404, and 409 cases. They need stable codes, role-safe remedies, and a correlation ID while retaining the indistinguishable 404 response for an unknown or unauthorized file.
- View and Download links navigate outside the portal's error presentation. A failed response can strand the user on a raw JSON page, with no translated explanation or way back. Show the error beside the originating record, move focus to it, and offer sign-in, review Documents/report, or retry guidance according to the typed cause.
- Do not treat every 409 alike when the server can distinguish processing/scanning from an integrity or storage failure. Only a safe read may be retried automatically; a missing or unsafe file needs review or support rather than repeated requests.
- The Worker Documents empty state gives no role-specific next step. It is an ordinary empty state, but a short explanation of which documents appear there would help distinguish no records from missing access.
