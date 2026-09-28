---
name: security-rbac-audit
description: Audit J&A application security and RBAC for sensitive reads/writes, private artifacts, finance, destructive actions and uploads. Use after auth, permissions, API routes, artifact storage, admin or bulk-action changes.
---

# Security / RBAC Audit

Check:

- authentication/session enforcement;
- server-side role/permission checks;
- object-level authorization / IDOR;
- CSRF expectations for writes;
- step-up auth where specified;
- private artifact path traversal and storage-key validation;
- secure download headers/filenames;
- upload validation and malware-scanner integration boundaries;
- audit log redaction and integrity;
- secret/PII leakage in logs/errors;
- bulk action privilege and eligibility checks;
- destructive action confirmation and invariants;
- client portal internal-financial-data isolation.

Every finding needs concrete code-path evidence and a regression-test recommendation.
