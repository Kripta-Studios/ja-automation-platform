# Invoice payment reversal: browser baseline

Actual headless Chromium against isolated candidate commit `81e3b75706610441baa747870af5459e2a57ddbc` on 27 September 2026. Playwright created a fresh disposable database with a synthetic issued invoice. Finance signed in through the rendered login form and recorded a 10.00 payment through the rendered Billing form. No production account, record, or deployment was touched.

The reproducible [browser case](baseline.spec.ts) passed **1/1** at **390 × 844, English**. The native reversal submissions deliberately used `HTMLFormElement.submit()` to bypass the browser's amount minimum and maximum, testing the server rule with the actual form and authenticated session. See the [sanitized trace](results.json), [over-remaining notice](finance-phone-390-en-over-remaining.png), and [zero-amount notice](finance-phone-390-en-zero.png). The screenshots crop to the problem notice. The trace omits account identity, invoice and payment IDs, the payment reference, reversal reasons, sessions, and raw response bodies. The browser had zero page exceptions and unexpected console errors.

| Entry                         | Actual server rule                               | Native response | Visible result                                                      |
| ----------------------------- | ------------------------------------------------ | --------------- | ------------------------------------------------------------------- |
| 99.00 against 10.00 remaining | Reversal exceeds the remaining unreversed amount | HTTP 400 HTML   | `BILLING_PAYMENT_AMOUNT_INVALID`; broad positive-or-balance wording |
| 0.00 against 10.00 remaining  | Reversal must be positive                        | HTTP 400 HTML   | The same code and wording                                           |

Both failures retained the entered amount and reason, focused the amount field, and created **zero** reversal events. Window scroll stayed at 1392 px and drawer scroll at 548 px. The focused amount field was visible at 695–739 px in the 844 px phone viewport, but the problem notice itself was above the viewport at −419 to −247 px. The **Review invoice ledger** link pointed to `#invoice-collections` and stayed in the same document; it scrolled within the drawer. After a native failed POST, the URL was `?/reversePayment`, so the original `view=invoices&stage=outstanding&lang=en` query context was absent.

The two different causes need separate stable codes and wording. The zero case needs a positive amount instruction; the over-remaining case needs the current reversible balance and a way to review refreshed payment history while retaining the draft. The current notice combines payment recording and reversal rules in one sentence.

An optional two-role race was prepared but did not yield a completed baseline: the Owner form click produced no `?/reversePayment` request before its separate test attempt timed out. Its result is **not** included in the passing trace. Both open reversal forms had the same rendered idempotency key, so the expected stale-form response, if one role first reverses part of the payment, is `BILLING_IDEMPOTENCY_REUSED` before the remaining-balance check. That behavior remains to be checked in a dedicated browser run.

The disposable fixture pointer and lock and port 4174 were released after the passing run. This baseline establishes the two known amount rules on Finance phone; it does not claim desktop or translated reversal coverage.
