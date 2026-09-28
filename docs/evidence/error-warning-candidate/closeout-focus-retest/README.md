# Closeout reopen focus retest

Actual Chromium browser run on 27 September 2026 against the disposable candidate Portal preview. Candidate parent commit: `92c5de1`; six reviewed tracked closeout/i18n/test changes applied, `git diff HEAD --binary` SHA-256: `81f82598f13f7b9c001166629e29147a74b222c3907a2aa56916f0486e1ae908`. No production data or product source files were changed by this QA run.

Owner used the rendered interface to prepare, confirm, and finalize a seeded lifecycle project at each width. In the Reopen form, a single whitespace character passed native `required` validation and reached the server. We measured the browser state 1.1 seconds after the enhanced failure, using a read-only database comparison before and after submission.

| Check                      | 390 px, English                                                                            | 1440 px, Spanish                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Enhanced network result    | HTTP 200 envelope, failure `status: 400`, `CLOSEOUT_REOPEN_REASON_REQUIRED`                | Same                                                                 |
| Visible cause              | “Enter a reason of 1 to 2000 characters before reopening.”                                 | “Introduce un motivo de entre 1 y 2000 caracteres antes de reabrir.” |
| Remedy                     | “Enter a reason”, link to the field                                                        | “Introducir un motivo”, link to the field                            |
| Keyboard focus after 1.1 s | Validation summary; top 741, bottom 832 px                                                 | Validation summary; top 791, bottom 839 px                           |
| Sticky header and viewport | Header bottom 70, viewport bottom 844 px                                                   | Header bottom 72, viewport bottom 900 px                             |
| Scroll                     | Window Y 292 → 327 px; no ancestor scroll container                                        | Window Y remained 212 px; no ancestor scroll container               |
| Form and state             | Whitespace retained, Reopen form and route retained, closed/final database state unchanged | Same                                                                 |
| Diagnostics                | No JavaScript page error, console error, failed request, or stack trace in action response | Same                                                                 |

**Focus retest: PASS.** The complete focused summary is inside the viewport at both widths, below the sticky header, with at least 12 px below it on phone and 61 px on desktop. The English and Spanish cause and field remedy are present and readable. On phone, the separate problem notice starts at 69 px, so its top border overlaps the sticky header bottom by 1 px; its message and remedy remain visible. This small border overlap does not affect the focused summary or keyboard navigation.

The page has no tab selection in this flow. The project remained closed in the disposable fixture after each blocked submission. The run did not submit a valid reopen reason, so it does not revalidate successful reopening.

Artifacts: [redacted observations](results.json), [390 px notice](reopen-reason-phone-390-notice.png), [1440 px notice](reopen-reason-desktop-1440-notice.png). Screenshots contain only the notice; the JSON contains no fixture IDs, credentials, account addresses, or client data.
