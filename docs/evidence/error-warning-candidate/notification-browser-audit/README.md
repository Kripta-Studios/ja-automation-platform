# Notification detail recovery: browser evidence

Actual headless Chromium used a fresh disposable SQLite database and real rendered login, notification detail, and inbox forms. The baseline product commit was `79c6cd2`. The fixed product was catalog commit `ccc6b31` plus notification error-page commit `389e5fb` (the isolated test branch has equivalent catalog cherry-pick `b7618b7`). No production account or record was changed.

Run the fixed cases from this worktree with:

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH \
JA_PLAYWRIGHT_EXECUTABLE_PATH=/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome \
./node_modules/.bin/playwright test \
  --config docs/evidence/error-warning-candidate/notification-browser-audit/playwright.config.ts \
  --reporter=line
```

The suite seeds two notifications for each role. It opens one detail page, removes that disposable row from the database to simulate a change after the page opened, and submits the visible **Mark as read** form. It then uses the permitted remedy link and marks the second notification read from the unread inbox. The browser checks the resulting HTTP statuses, displayed cause and link, keyboard focus, translated page language, row state, phone width, and console/page errors.

| Role, language, width | Baseline stale detail                                              | Fixed stale detail                                                                          | Inbox success                                                                         |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Worker, EN, 390 px    | Generic “No results”; workspace link only; heading unfocused       | “Notification unavailable”; cause shown; focused heading; Activity inbox opens              | POST 200; selected row marked read and removed from unread list; confirmation focused |
| Manager, ES, 1440 px  | Generic “Sin resultados”; workspace link only; heading unfocused   | “Notificación no disponible”; translated cause; focused heading; Bandeja de actividad opens | POST 200; selected row marked read and removed from unread list; confirmation focused |
| Owner, PT, 390 px     | Generic “Nenhum resultado”; workspace link only; heading unfocused | “Notificação indisponível”; translated cause; focused heading; Caixa de atividades opens    | POST 200; selected row marked read and removed from unread list; confirmation focused |

All three stale submissions returned HTTP 404, and all three fixed pages linked to the role's own inbox with the language retained. The 390 px pages had no horizontal overflow. Every case had zero browser page exceptions and unexpected console errors. The disposable preview also returned HTTP 503 from `/app/api/offline/identity` because this fixture disables offline mode; it was unrelated to these notification actions.

The paired `baseline-*` and `postfix-*` result JSON files contain redacted URLs, DOM text, focus, network, and viewport measurements. The paired PNGs crop to the error page's main region; they contain no names, credentials, sessions, or record IDs. Raw Playwright traces were disabled. The suite and its global setup delete the synthetic notifications and disposable database on exit.

This focused check does not cover every notification kind, a cross-user direct detail link, or the enhanced action envelope. Earlier inbox and detail tests cover invalid IDs and a stale inbox row; this evidence covers the missing stale **detail** page remedy.
