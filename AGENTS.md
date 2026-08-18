# J&A Automation V3 repository rules

- `J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md` is the product authority.
- Use Node 24.19.0 and pnpm 11.22.0. Keep catalog versions exact.
- Keep the public site browser-safe. Browser packages must not import SQLite, files, auth secrets, financial repositories, or server templates.
- Represent money with bigint minor units internally and decimal strings at JSON boundaries.
- Represent time as integer minutes and percentages as integer basis points.
- Apply authorization by role, project membership, and ownership in every protected server query.
- Never accept business numbers or filesystem paths as authorization identifiers.
- Keep issued invoice snapshots immutable. Allocate invoice numbers inside issue transactions.
- Never create actual time from planned, expected, minimum, or guaranteed time.
- Keep labor and expense billing streams independent.
- Keep auto-issue and auto-send disabled.
- Keep portal service-worker scope at `/j-aautomation/app/`.
- Never commit secrets, databases, generated output, uploads, legacy hashes, or synthetic production records.
- Apply reviewed SQL migrations. Do not use production `drizzle-kit push`.
- Preserve original official assets and record SHA-256 provenance.
- Record commands, results, blockers, and deviations in `docs/V3_IMPLEMENTATION_PROGRESS.md`.
