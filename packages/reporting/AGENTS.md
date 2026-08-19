# Reporting / Artifact Instructions

These instructions apply to `packages/reporting/**` and should also guide `packages/invoice-templates/**`.

## Artifact independence

PDF, XLSX, CSV and JSON artifacts have independent generation/status. A failure in one format must not prevent unrelated formats from being generated and registered.

Do not construct an eager array that renders the PDF before later artifacts if a PDF failure can abort everything.

## Lifecycle

Each format should be able to represent:

- queued
- generating/running
- ready
- failed
- retrying/retryable where applicable

The UI and HTTP endpoint must distinguish “not ready yet” from “server crashed”. Pending/absent artifacts should map to an intentional response and product state rather than an accidental HTTP 500.

## PDF renderer

Treat logo loading and Chromium availability as fallible dependencies. Their failure must produce a scoped PDF failure with diagnostics, not break CSV/XLSX/JSON.

## Templates

Implement a real versioned template registry. The required baseline invoice families are:

1. Labor Detailed
2. Labor Summary
3. Expenses Detailed
4. Fixed/Milestone
5. Credit/Adjustment

A template is more than changing the title string. It defines data blocks/columns, grouping, totals/presentation rules and version identity. User-facing selectors must use registered template IDs, not arbitrary free-text IDs.

## Filenames

Use deterministic semantic names containing the business period/entity/type where required. Do not expose internal pack UUIDs as the only filename semantics.

## XLSX/CSV safety

Audit handcrafted spreadsheet logic for column references, wide sheets, Unicode, cell escaping and formula/CSV injection. Prefer a mature library if it reduces custom format risk without violating architecture/dependency constraints. Add round-trip/openability tests.
