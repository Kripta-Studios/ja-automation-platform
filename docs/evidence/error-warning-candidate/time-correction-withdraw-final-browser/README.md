# Final time correction withdrawal browser QA

Product candidate: `cf62c90294023f3a627e7f3599d041be20e73716` (tree `8669ba759d54545997af7773ef01a0ca0790313f`). Independent Playwright runs used this exact commit in a separate worktree with a fresh disposable database. Project, assignment, approved time, correction draft, and related expense were created through the rendered application. Database access was read only and used to verify state and audit effects.

```sh
PATH=/opt/jaautomation/runtime/node-v24.19.0/bin:$PATH pnpm exec playwright test --config docs/evidence/error-warning-candidate/time-correction-withdraw-final-browser/playwright.config.ts --reporter=line
```

Result: two passed, two skipped by viewport selection. The tested combinations were Worker at 390 px in English and 1440 px in Spanish; an Owner also opened each correction and followed its authorized linked-expense remedy. `results-phone-390.json` and `results-desktop.json` contain the redacted response, focus, scroll, role, and no-write observations. The four PNGs crop only the notices; traces were disabled.

In both viewport runs:

- The withdrawal reason input had `maxlength="2000"`. A browser JSON action request with 2,001 characters returned `TIME_CORRECTION_WITHDRAW_REASON_TOO_LONG`, a `reason` field error, `enter_reason` remedy, and preserved attempted value. The browser control itself prevents typing beyond 2,000 characters.
- A browser JSON action request using an outdated correction version returned `TIME_CORRECTION_WITHDRAW_CHANGED` with a `review_time` remedy and preserved reason.
- When a second Worker tab created a linked expense, the refreshed tab showed the advance warning `TIME_CORRECTION_WITHDRAW_LINKED_EXPENSE`, hid withdrawal, and linked to the expense detail in the active locale. The Owner could follow the same link.
- The first, stale Worker tab received a typed 409 in both a SvelteKit JSON action request and a native form submission. The native response focused the inline notice, kept it visible, displayed the entered reason, and offered the authorized expense link. Neither response used the generic conflict key.
- The correction remained Draft, version 1, with no additional audit event; its expense link remained intact. No page exceptions or console errors occurred. The fixture's offline identity endpoint returned its expected 503.

The JSON requests use browser `fetch` with SvelteKit action headers. They verify the enhanced response contract; the withdrawal form itself is a native form. Reviewed-history mapping was not exercised because that state requires a separate review or financial mutation; the safe stale-version conflict was exercised directly.
