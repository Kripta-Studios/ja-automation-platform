# Wave 7 Finance review browser evidence

- Frozen production build: HEAD `dbe849956c150c76dbea0898de1605e3daaf1006`; built tree SHA-256 `be840f5f6d060f2e7d3a89bdf74a5b4022b6bc295002b194b5b2a4d379082b56`. QA spec SHA-256 `cd21adb38d34343702644663749095b1b6a9d950851a0064b4b15237fabb31a5`.
- **2/2 passed** at 390 px English and 1440 px Portuguese on fresh disposable databases. Native missing time treatment returned `FINANCE_REVIEW_TREATMENT_REQUIRED` with field summary focus and exact scroll retention; enhanced non-billable review saved. After another Finance reviewer set the open time entry to `non_billable`, native submission returned 409 `FINANCE_REVIEW_UNAVAILABLE` without overwriting it. Notice showed the current translated treatment and a visible retained attempted Billable/Faturável value, focused notice, and kept exact scroll. Native invalid operational reason retained text and focused the linked summary. Manager enhanced request returned HTTP 200 transport with typed 403 `FINANCE_ROLE_REQUIRED`. No unexpected page or console errors.
- Screenshots cover only the stale problem notice. Sanitized JSON records step names, codes, status wording and scroll positions or HTTP status/path. IDs, credentials, request bodies, query strings, and raw traces are excluded.

| Viewport | Screenshot SHA-256 | Trace SHA-256 | Network SHA-256 |
| --- | --- | --- | --- |
| 390 px | `d41ce76d8fb67478d3026e0cfcb51be732761e2b1bebce24bcb71d0fba468e8d` | `f8e5545dacaf4e2e323ec1baff3b4420500308f21c6cd2473b778a6a26f4a3e0` | `18f3f9ac9f13e62dc50095af5759d5db02967cb7edc4e0f361029e6aabf4bc38` |
| 1440 px | `176fccccb6bf82fecc92e57681961970126a41d4b6967d01849d6e32bbb9ab44` | `e27479d78516f3ab1d375c514392ff2e935579a9fd5a52e55ca10545d37639b5` | `18f3f9ac9f13e62dc50095af5759d5db02967cb7edc4e0f361029e6aabf4bc38` |

Files are `finance-treatment-phone-390-en.*` and `finance-treatment-desktop-pt.*` in this directory. The wave-6 diagnostic remains historical.
