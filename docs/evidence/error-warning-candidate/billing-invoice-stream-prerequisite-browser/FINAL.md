# Final Billing prerequisite browser rerun

Candidate source: `f699cb3`. This adds the manual-navigation warning reset to the prerequisite and fixed-header visibility behavior documented in [README.md](README.md) for earlier candidate `41ffab8`.

The same isolated Playwright spec was run after a fresh candidate build and disposable SQLite seed. It passed for Finance at 390 px in English and Portuguese, and Owner at 1440 px in Spanish. For every case, the actual interface showed the exact localized warning, retained the selected no-stream project, focused the warning, exposed an unobscured New billing stream remedy, then focused the Project field when the remedy was used. The title and remedy hit tests were unobscured by fixed navigation, page width matched the viewport, no Billing POST occurred, browser console and page errors were empty, and invoice and billing-rule row counts were unchanged.

The added transition check leaves the prerequisite through Billing tabs, visits an unrelated Tax profile action, returns to New billing stream, and confirms the old warning is gone. It then chooses a different project with an active stream and confirms the invoice wizard opens without stale wording. These checks passed in all three role/locale/viewport cases. [Final results](final-results.json) and the three `final-*.png` files are redacted evidence; raw traces were discarded because they include credentials and fixture IDs.

Playwright shut down the preview server and the disposable fixture pointer/lock. The test creates no live invoice or payment.
