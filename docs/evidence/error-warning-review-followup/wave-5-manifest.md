# Wave 5 direct review follow-up browser evidence

- Frozen portal build: HEAD `dbe849956c150c76dbea0898de1605e3daaf1006`; built tree SHA-256 `e10ac8df03f0032de53d8b9e5d404dd238ee444d48343c43456ed129f8d4af88`.
- Result: 2/2 Playwright cases passed at 390 px English and 1440 px Spanish, each on a fresh disposable database. QA spec SHA-256: `4a1fcfc7593fa190912207b04b7371cd3bb2538207b9ccde8b5054a96633f338`. Static preview only; no rebuild.
- Native invalid method length returned HTTP 400 `PERIOD_FOLLOWUP_FIELDS_INVALID`, kept the entered reason, focused the single invalid method field, and restored exact scroll. Enhanced valid return saved one follow-up event with HTTP 200. A concurrent out-of-band event then made the open form stale; native POST returned HTTP 409 `PERIOD_FOLLOWUP_HISTORY_CHANGED`, kept the entered reason, focused the notice, restored exact scroll, and offered the report follow-up review link. Worker could not access the form. No page exceptions or unexpected console errors.
- Screenshots show only the problem notice. Sanitized JSON contains step names, codes, booleans, scroll positions, HTTP statuses, and URL paths; no user/report IDs, credentials, query values, or raw traces.

| Viewport | Notice screenshot SHA-256 | Sanitized trace SHA-256 | Sanitized network SHA-256 |
| --- | --- | --- | --- |
| 390 px | `de27a90392ccb58d0105b595cd65995c7bd20b2a263c16780af999a87a47e448` | `3c1e1c5e5df86ea32095620baad6f085816563543c1b0546d05ffe5ea2321294` | `46cdea688f58cf08ac4da84b63fb96e4095615d44596dac17599a354b4c06097` |
| 1440 px | `90725f5cfc67a8a03f50d3a45b6bcc82d3a83600f3e5698c72e9d25dccf0fe94` | `0bf59b8b198b24c3a6360eba96065b8e2f5b7b38f61dbb08b452f1720cb7e120` | `46cdea688f58cf08ac4da84b63fb96e4095615d44596dac17599a354b4c06097` |

Evidence files are `review-phone-390-en.*` and `review-desktop-es.*` in this directory.
