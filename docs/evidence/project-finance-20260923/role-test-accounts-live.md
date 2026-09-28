# Portal role test accounts after clean slate, 2026-09-24

Three new **portal-only** accounts were created through the owner browser UI on deployed release `zip-d215671b99323d6d8c4ce34b74b4f8e0`: Finance Administrator, Project Manager and Read-only Auditor. Their exact credentials and access instructions are in the private, mode-600, Git-ignored `docs/manuals/Portal_Test_Accounts.private.md`; passwords are intentionally absent here. The canonical real owner remains the only owner account.

**Release update, 2026-09-28:** The test-account manual remains local and Git-ignored. Account credentials and browser traces containing login requests are excluded from the public release history.

For each new role, the browser signed in and checked an allowed route (HTTP 200) and a forbidden owner/finance route (HTTP 403). A worker test login was also checked at 390 px. The manual now separates legacy demo accounts whose passwords use a different convention and explains that supplier-specific and crew-chief access requires new supplier/project grants after the clean slate.

Read-only database comparison after the account additions: `user=121`, `account=121`, `mail_identity=99` and `mailbox_external_command=8`. Both mail-related tables have exactly the same row digests as the cold pre-cutover database. No new test account has a mailbox identity, `outbox_event=0`, and Stalwart stayed active. Operational data remained `client=1`, `project=2`, `invoice=0`, `time_entry=0`, `expense=0`; SQLite quick check was `ok` with zero foreign-key violations.
