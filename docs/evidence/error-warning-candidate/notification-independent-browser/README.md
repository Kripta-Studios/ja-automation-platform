# Independent stale-notification browser QA

Product candidate: `620ff90` (2026-09-27). An independent, disposable SQLite fixture and actual headless Chromium exercised the rendered login, notification detail, recovery link, and inbox forms. No production account, database, or deployment was changed.

The spec signs in through the browser for each role. It inserts two synthetic notifications into the disposable fixture because arbitrary notifications cannot be created through a dedicated user form. After the detail page loads, it deletes the first row to simulate another operation removing the record while the form is open. It submits the visible **Mark as read** form, follows the displayed remedy, and marks the second row read from the inbox. The deletion is fixture setup only; all submission and recovery checks use Chromium.

| Role / language / viewport | Stale detail                                                     | Recovery                                                        | Valid inbox action                                                            |
| -------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Worker / EN / 390×844      | POST 404; focused “Notification unavailable” and precise cause   | Activity inbox link hit-testable and opens with `lang=en`       | POST 200; row read and removed from unread list; focused English confirmation |
| Manager / ES / 1440×900    | POST 404; focused “Notificación no disponible” and precise cause | Bandeja de actividad link hit-testable and opens with `lang=es` | POST 200; row read and removed; focused Spanish confirmation                  |
| Owner / PT / 390×844       | POST 404; focused “Notificação indisponível” and precise cause   | Caixa de atividades link hit-testable and opens with `lang=pt`  | POST 200; row read and removed; focused Portuguese confirmation               |

All three stale screens excluded the synthetic source record and notification UUID, retained the selected document language, and had no horizontal overflow. The remedy was visible, was the element at its click point, and opened the role's own inbox. No browser page exceptions or unexpected console errors occurred. The only unrelated failed requests were HTTP 503 from `/app/api/offline/identity`, expected because this fixture sets `JA_OFFLINE_ENABLED=false`.

`*-results.json` contains redacted DOM, focus, response, viewport, and network evidence. `*-stale.png` contains the rendered error region with no credentials, IDs, or private record details. Playwright traces were disabled. The fixture and synthetic rows were removed after the run.

Run from the isolated worktree with Node 24 and installed Chromium:

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH \
JA_PLAYWRIGHT_EXECUTABLE_PATH=/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome \
./node_modules/.bin/playwright test \
  --config docs/evidence/error-warning-candidate/notification-independent-browser/playwright.config.ts \
  --reporter=line
```

Result: **3 passed, 6 project-matrix skips**. This check covers the native detail form and inbox action. It does not test every notification kind, an enhanced detail submit, or a cross-user direct link.
