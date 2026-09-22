# Git publication and production release — 2026-09-22

The working runtime already matches all 594 files in the active portal-density release. The nine manuals also match their verified hashes. This publication records the complete UI refresh, progressive disclosure, EN/PT-BR manuals and browser evidence in Git, then packages the committed tree for deployment.

No new business logic or schema change is introduced. Existing source-bound evidence includes 64 responsive cases, 187 focused unit tests, 4 private-manual security tests, final visual/capture checks and independent review. The runtime source digest remains `acb208a0418e0129ed413d71c9ecba7b9a97235c6802eac431046a7de53022f0`.

Fresh preflight checks: public website EN/PT and portal login at 390/1440 passed without browser errors; SMTP EHLO, submission STARTTLS, SMTPS and IMAPS certificate validation passed. Both webmail entry points return HTTP 200. No mailbox access or email delivery was performed.

Mail log limits: earlier today an optional PhishTank feed returned HTTP 404, and startup warned that the configured resolver could not validate DNSSEC, so Stalwart disabled DANE. These predate this release; successful protocol checks do not establish that these warnings are resolved. Mail configuration and mailbox storage are outside this UI release and are preserved.

The complete UI/manual tree was committed and pushed as `eb80da46db921d42893eeeb0b91f828357f5c5fd`, then deployed from a Git archive with SHA-256 `370f46e5a798f59ab437bede05b2eb833c27c4bf545214637688773b6ce30940`. All 2,140 extracted files matched that archive. Production SQLite passed integrity and foreign-key checks; eight historical financial table hashes and 59 private artifact hashes were preserved. Nine installed PDFs matched their generated hashes. Two automatic jobs cycles passed; the latest backup verified. Historical backup coverage remains 14/30 days, with four pre-existing dead-letter jobs and two failed localized PDF records.

The initial postflight browser run reproduced a portal 502 while synchronous readiness ran. It is recorded explicitly, with the bounded mitigation and independent review, in [proxy-mitigation.md](proxy-mitigation.md). Subsequent publication includes that mitigation and freshly bound manual captures/PDFs. Final deployment and cache cleanup outcomes are appended after execution.
