# Incident response

1. Preserve evidence: timestamps, service logs, job/outbox rows, audit events, request IDs and the
   latest verified backup. Do not edit issued invoices or delete source records.
2. For suspected unauthorized access, disable the user/session, rotate the affected secret, preserve
   audit data and inspect document access and worker-privacy queries.
3. For billing duplication or tampering, stop the jobs timer, do not issue/send further invoices,
   inspect invoice sources/idempotency keys and reconcile the Master Invoice / Cost / Collection
   Ledger before resuming.
4. For database errors, stop writes, take an online backup if possible, run integrity/foreign-key
   checks and restore only into an isolated target first. Record the restore hash and verification.
5. For unsafe uploads, quarantine the document, retain its hash and audit trail, block delivery and
   run the configured malware scanner before any release.
6. Document root cause, affected records, mitigation, recovery evidence and follow-up migration/test
   work in the incident record. Never publish worker compensation, client rates or margin in external
   incident communications.
