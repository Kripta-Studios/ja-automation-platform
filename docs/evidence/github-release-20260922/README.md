# Git publication and production release — 2026-09-22

The working runtime already matches all 594 files in the active portal-density release. The nine manuals also match their verified hashes. This publication records the complete UI refresh, progressive disclosure, EN/PT-BR manuals and browser evidence in Git, then packages the committed tree for deployment.

No new business logic or schema change is introduced. Existing source-bound evidence includes 64 responsive cases, 187 focused unit tests, 4 private-manual security tests, final visual/capture checks and independent review. The runtime source digest remains `acb208a0418e0129ed413d71c9ecba7b9a97235c6802eac431046a7de53022f0`.

Fresh preflight checks: public website EN/PT and portal login at 390/1440 passed without browser errors; SMTP EHLO, submission STARTTLS, SMTPS and IMAPS certificate validation passed. Both webmail entry points return HTTP 200. No mailbox access or email delivery was performed.

Mail log limits: earlier today an optional PhishTank feed returned HTTP 404, and startup warned that the configured resolver could not validate DNSSEC, so Stalwart disabled DANE. These predate this release; successful protocol checks do not establish that these warnings are resolved. Mail configuration and mailbox storage are outside this UI release and are preserved.

Deployment, Git publication and postflight outcomes are recorded after execution.
