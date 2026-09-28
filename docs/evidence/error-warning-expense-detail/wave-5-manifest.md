# Wave 5 expense linked-hours browser regression

- Frozen portal build: HEAD `dbe849956c150c76dbea0898de1605e3daaf1006`; built tree SHA-256 `e10ac8df03f0032de53d8b9e5d404dd238ee444d48343c43456ed129f8d4af88`.
- Result: 2/2 passed, 390 px English and 1440 px Portuguese, with disposable database and preview-only Playwright. QA spec SHA-256 `e7b73a2f1b03553c7c8af962e82eb5201e1ee5490053268ac3150b5ec1775f5c`.
- Native invalid amount returned `EXPENSE_CORRECTION_AMOUNT_INVALID` with retained fields and focus. Enhanced valid correction saved. After changing the date, the posted `spentOn` matched the newly entered date and the selected linked hours remained visible; native POST returned HTTP 409 `EXPENSE_CORRECTION_TIME_LINK_INVALID` with retained date/link/vendor/reason, focused summary, and preserved scroll. A competing correction returned `EXPENSE_CORRECTION_ALREADY_EXISTS`; worker role denial returned `EXPENSE_CORRECTION_ACCESS_REQUIRED`. No unexpected console or page errors.
- The old `linked-hours-phone-390-diagnostic.json` records the wave-4 date-reversion defect and is historical; it is not a wave-5 failure.
- Screenshots are notice-region captures. JSON includes only steps and HTTP status/path; those paths contain disposable synthetic expense UUIDs. It contains no production identifiers, credentials, query strings, or raw traces.

| Viewport | Screenshot SHA-256 | Trace SHA-256 | Network SHA-256 |
| --- | --- | --- | --- |
| 390 px | `5d7a9f71db77d1929475c3fdf26b7a8a68de088ab8c8c9183dab5b591db42ed8` | `8dcbc5a30eac0d75ee92b04ab2a0249b968e825474e5bb677ddf8bdbbd5c9714` | `c7f0a722894731a04a440864b43ef712d24fd217ecf46b09c40e2dbb1255c7e0` |
| 1440 px | `c75d15f1d3eec7ee61c686d27229d0e4460d629cfc50a6168a45989b51ae6353` | `4e958a9f2c53b8298a78665e7d41be317848254286e02f71eaab32f6bd34c217` | `8fa66a929f54d733f697a11041c3963206f47ea9a8ec85ba6e691ff1f751c811` |

Evidence files are `phone-390-en.*` and `desktop-pt.*` in this directory.
