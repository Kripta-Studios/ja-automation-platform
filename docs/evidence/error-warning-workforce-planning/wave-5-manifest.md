# Wave 5 planning browser regression

- Frozen portal build: HEAD `dbe849956c150c76dbea0898de1605e3daaf1006`; built tree SHA-256 `e10ac8df03f0032de53d8b9e5d404dd238ee444d48343c43456ed129f8d4af88`.
- Result: 2/2 passed, 390 px English and 1440 px Portuguese, on a fresh disposable database with the preview-only Playwright config. QA spec SHA-256 `799a02ed4b429c91b48411c886a194bf9d5472b86885705341cb60c34cb78195`.
- Native invalid fields returned HTTP 400 `ACTION_VALIDATION_PLANNING_FIELDS`; hours was marked invalid beside its message, with linked summary focus and retained values. Enhanced valid publish succeeded. A concurrent overlap returned HTTP 409 `PLANNING_WORKER_OVERLAP`, retained worker/site and exact scroll, and focused the linked summary. Worker role denial returned `PLANNING_ACCESS_REQUIRED`. No unexpected console or page errors.
- Historical wave-4 failures remain documented in `wave-4-manifest.md`. Shared planning screenshot and trace filenames were overwritten by the wave-5 run, so the current files below show wave-5 results rather than wave-4 captures.
- Screenshots are notice or validation-region captures. JSON records steps and HTTP status/path only, without IDs, credentials, query strings, or raw browser traces.

| Viewport | Screenshot SHA-256 | Trace SHA-256 | Network SHA-256 |
| --- | --- | --- | --- |
| 390 px | `fa1253334d4337c734a78a908e4b88c16e7337e02ae0947ad94190933f172452` | `1201fe1e94f113aafdb42f9ee37bdc1d0072cc6a113e559043c06c6cf25025db` | `7c36683da54b7e8043c1a6b8f71b93775fecff8031a27fffe9296a359e3b369d` |
| 1440 px | `eaee5a39762a813e02a1807b80a7a07cb94176d2bc3dffd91011e10564400c64` | `990b7055f8a1946196da8fa0d060fe0baa1ddf37ce1c62ee63` | `7c36683da54b7e8043c1a6b8f71b93775fecff8031a27fffe9296a359e3b369d` |

Evidence files are `planning-phone-390-en.*` and `planning-desktop-pt.*` in this directory.
