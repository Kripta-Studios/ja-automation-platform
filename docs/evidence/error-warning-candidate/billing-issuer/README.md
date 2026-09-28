# Owner invoice issuer validation browser evidence

The exact candidate browser run passed **2/2 cases** on 2026-09-26 at 390 px
and 1440 px (two cross-project cases intentionally skipped). A repeat capture
run also passed 2/2. The tests used Playwright's disposable database and local
preview under pinned Node 24.

A separate `tablet-768` run checked the layout just above the 760 px issuer
card breakpoint: **1/1 active case passed**, two cross-project cases skipped.
The strengthened rerun also asserted that the notice stays fully inside the
horizontal viewport and passed 1/1.
Its reduced result is in `billing-issuer-tablet-768.json`; the phone and
desktop notice crops remain the visual evidence.

The Owner edited a synthetic invoice issuer with an identifier over 1,000
characters. The form returned typed 400
`BILLING_ISSUER_IDENTIFIER_TOO_LONG`, kept the entered values visible, focused
and revealed the invalid identifier, showed a readable notice with a field
correction remedy, and did not show an unrelated invoice issue blocker. The
database retained the prior identifier. The strengthened browser test also
requires the notice to be at least 240 px wide and clear of visible toasts.

The two PNGs are cropped notice-only images (290 px wide at phone size, 315 px
at desktop). The three JSON files contain reduced assertion outcomes. The
temporary capture code was removed from the staged spec after the passing
run. The crops were visually inspected and contain no issuer identifiers,
entered 1,001-character value, credentials, raw responses, or browser traces.
