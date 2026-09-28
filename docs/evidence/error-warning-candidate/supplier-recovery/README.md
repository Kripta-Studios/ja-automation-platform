# Supplier form recovery browser evidence

The exact candidate browser run passed **4/4 cases** on 2026-09-26 at 390 px
and 1440 px: Owner technician assignment conflict and Supplier Coordinator
daily-cap time batch conflict. A targeted Coordinator evidence recheck passed
**2/2**. All runs used Playwright's disposable database and local preview
under pinned Node 24.

The tests assert typed `SUPPLIER_ASSIGNMENT_EXISTS` and
`SUPPLIER_BATCH_TECHNICIAN_DAILY_LIMIT` responses, focused in-form notices,
retained selections and inputs, and visible daily-cap guidance. The
Coordinator case specifically retains Actual hours, category, summary,
request ID, and selected technician after the rejected save. No time entry
was saved by the rejected request.

The four PNGs are cropped notices; the four JSON files contain only reduced
assertion outcomes. For the Coordinator screenshots, a synthetic technician
name was replaced with `[technician]` in the browser DOM **after** all product
assertions and before capture. The temporary capture code was removed from
the staged spec. All four final crops were visually inspected; no names,
credentials, IDs, raw responses, or browser traces are included.
