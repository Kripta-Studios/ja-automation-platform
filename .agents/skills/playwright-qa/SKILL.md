---
name: playwright-qa
description: Verify J&A portal behavior through real browser flows with Playwright/browser tools. Use for UI, forms, exports, auth, workflow and regression validation; not for code-only review when runtime behavior is irrelevant.
---

# Playwright QA

- Use deterministic seeded/test data where available.
- Test the actual role that owns the flow: worker, manager, finance, owner/admin, client when applicable.
- Verify user-visible state transitions, not only HTTP success.
- For async jobs wait on explicit product readiness/status, not arbitrary sleeps.
- Capture route, role, viewport, steps, expected/actual and console/network errors for failures.
- Exercise negative/failure behavior for export generation and permissions.
- Pair with `$responsive-regression` for mobile/tablet flows.
