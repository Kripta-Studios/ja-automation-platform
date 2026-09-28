# Guided stream save and warning recovery

Candidate source: `bb999a9`. This rerun tests the reactive post-save fix after the earlier prerequisite evidence tied to `41ffab8` and `f699cb3`.

Playwright built the isolated candidate and used a fresh disposable SQLite fixture. The fixture prepared projects without streams; Finance and Owner then saved streams through the **actual Billing form**. Finance at 390 px in English first saved a stream for a different project. The selected project's warning remained visible after that save and data refresh, even though a prior “Billing stream saved.” result was present. Finance then saved a stream for the selected project; the warning disappeared without switching tabs. Owner at 1440 px in Spanish completed the direct guided save with the same result. The browser also reran the original Finance EN390, Owner ES1440 and Finance PT390 prerequisite matrix.

The saves returned HTTP 200. Each project had exactly one active stream afterward; invoice count did not change. The localized success toast was visible with `role="status"` and `aria-live="polite"`. Browser focus rested on the connected document body after success; the confirmation was announced by the live region. No page or console errors occurred. [Guided save results](guided-stream-save-results.json) and [prerequisite matrix results](post-save-fix-prerequisite-results.json) contain the redacted assertions. The `guided-stream-*` and `post-save-fix-prerequisite-*` PNGs show only isolated notices and success toasts, without account names, IDs or credentials.

Playwright shut down the preview server. Its disposable database, document root, lock, pointer, generated build and raw traces were removed after the run. No production invoice, payment or billing stream was changed.
