# Git publication and production release — 2026-09-22

The working runtime already matches all 594 files in the active portal-density release. The nine manuals also match their verified hashes. This publication records the complete UI refresh, progressive disclosure, EN/PT-BR manuals and browser evidence in Git, then packages the committed tree for deployment.

No new business logic or schema change is introduced. Existing source-bound evidence includes 64 responsive cases, 187 focused unit tests, 4 private-manual security tests, final visual/capture checks and independent review. The runtime source digest remains `acb208a0418e0129ed413d71c9ecba7b9a97235c6802eac431046a7de53022f0`.

Fresh preflight checks: public website EN/PT and portal login at 390/1440 passed without browser errors; SMTP EHLO, submission STARTTLS, SMTPS and IMAPS certificate validation passed. Both webmail entry points return HTTP 200. No mailbox access or email delivery was performed.

Mail log limits: earlier today an optional PhishTank feed returned HTTP 404, and startup warned that the configured resolver could not validate DNSSEC, so Stalwart disabled DANE. These predate this release; successful protocol checks do not establish that these warnings are resolved. Mail configuration and mailbox storage are outside this UI release and are preserved.

The complete UI/manual tree was committed and pushed as `eb80da46db921d42893eeeb0b91f828357f5c5fd`, then deployed from a Git archive with SHA-256 `370f46e5a798f59ab437bede05b2eb833c27c4bf545214637688773b6ce30940`. All 2,140 extracted files matched that archive. Production SQLite passed integrity and foreign-key checks; eight historical financial table hashes and 59 private artifact hashes were preserved. Nine installed PDFs matched their generated hashes. Two automatic jobs cycles passed; the latest backup verified. Historical backup coverage remains 14/30 days, with four pre-existing dead-letter jobs and two failed localized PDF records.

The initial postflight browser run reproduced a portal 502 while synchronous readiness ran. It is recorded explicitly, with the bounded mitigation and independent review, in [proxy-mitigation.md](proxy-mitigation.md). Subsequent publication includes that mitigation and freshly bound manual captures/PDFs. Final deployment and cache cleanup outcomes are appended after execution.


## Final outcome

Commit `ef1e6a0ccad0fdef1df7fbc132caf88ba2c5674c` was pushed and deployed from Git archive SHA-256 `079e1eebe07dcac9e8ffc5fd06fe4e20b6f6d23cf7a10d3c5776dc44befbd12c`. The immutable production directory and installed nine PDFs match the verified release. `final-tree-match.json` records exact archive comparison; `production-after.json` records unchanged historical table and private-file hashes. Source digest: `89b84e99ba4817e04bcb267836fa829df7456864b480f90fdea478ae5cbcff93`.

Final public-browser checks passed on EN/PT websites and portal login at 390/1440 pixels. Two automatic jobs cycles passed. The latest backup passed SQLite integrity, foreign-key and 59-document verification; the history still covers 14/30 days. SMTP, STARTTLS, SMTPS, IMAPS and both webmail endpoints passed again. Stalwart PID remains 979; no mailbox data or mail configuration was changed. These protocol checks do not test actual message delivery.

Docker build-cache cleanup reclaimed **9.57GB** and leaves **0 B** build cache. Images and volumes were not pruned. Available disk: **32.62 GiB** on sda1 and **58.36 GiB** on sdb. All inspected running containers are running/healthy; required timers, Caddy, mail and the music bind mount are active.

Residual limits and the initial failed browser check are retained rather than reported as a clean history. Evidence-only updates after the runtime commit do not change deployed application files.
