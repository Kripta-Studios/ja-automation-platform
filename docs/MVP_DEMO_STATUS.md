# Disposable fixture status

This historical filename is retained so existing references remain stable. It is not a product
access guide, and it does not describe a demo or MVP release. The product authority remains
`J_A_AUTOMATION_UNIFIED_SPEC_V3_LIGHTWEIGHT_2026-08-18.md`; production access is documented in
[SHOWCASE_ACCESS.md](SHOWCASE_ACCESS.md).

`packages/database/src/demo-seed.ts` is disposable fixture tooling for local repository checks and
isolated automated tests only. It creates synthetic records and must never run against production or
be promoted as a database, upload, invoice or financial artifact. It does not create portal access,
shared credentials or passwordless sessions.

Browser tests add temporary Better Auth password hashes to their isolated database and exercise the
same credential/session endpoint used by invited production accounts. Fixture identities are never
production credentials.
