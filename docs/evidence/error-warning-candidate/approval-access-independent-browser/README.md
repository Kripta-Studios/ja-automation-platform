# Independent approval access and locale browser QA

Tested exact candidate `0b450ae` in Chromium against a disposable SQLite Portal preview on port 4177. The Auditor and Project Manager signed in through the web interface. No production data was changed.

| Check | Result |
| --- | --- |
| Auditor, 390 px | Direct `/approvals?lang=en` returned HTTP 403. The focused heading said “Access restricted”; the alert explained which roles can approve, instructed the user to contact an owner, and offered only “Open my workspace.” Its link led to the auditor’s authorized workspace. Document width was 390 px. |
| Manager, 390 px | An empty required change reason produced an inline error and a validation summary beside the form without an approval POST. Actual focus moved to the invalid reason input. |
| EN→ES→PT | The summary and inline error translated to the selected language, including Portuguese “Alteração obrigatória.” The same summary DOM node stayed mounted. The Review actions disclosure stayed open, an unrelated disclosure stayed closed, an unsent rejection note and the active Time tab remained, and scrollY stayed at 2032. Document width stayed 390 px. |
| Network and console | No approval action POST, page exception, or unexpected console error occurred. The Auditor’s expected 403 navigation produced one browser resource-log entry. |

Evidence: [auditor results](auditor-results.json), [manager results](manager-results.json), [auditor screenshot](auditor-403-390-en.png), and manager summary screenshots for [EN](manager-validation-390-en.png), [ES](manager-validation-390-es.png), and [PT](manager-validation-390-pt.png). The independent [Playwright spec](candidate.spec.ts) and [config](playwright.config.ts) reproduce the checks. Screenshots contain only disposable fixture content; the JSON is redacted.

This focused pass covers the Auditor denial and Manager invalid-field locale behavior. It does not claim every approval decision path is browser-verified.
