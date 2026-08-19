# Requirements Traceability Matrix

Update this file continuously. Evidence must point to concrete code/tests/browser flows. `OPEN` is the initial state, not a valid release state for mandatory requirements.

| ID | Requirement | Priority | Initial status | Evidence / tests to update |
|---|---|---:|---|---|
| SPEC-ARCH-001 | Modular monolith; decompose catch-all megafiles | P0 | PARTIAL | Portal/database refactor + architecture tests |
| SPEC-RESP-001 | Responsive usable at 360/390/430/768/desktop | P0 | FAIL | Playwright viewport suite |
| SPEC-REPORT-001 | Required report catalog | P0 | PARTIAL | report routes/services/export tests |
| SPEC-INVOICE-001 | Five real versioned invoice templates | P0 | FAIL | registry/template snapshot tests |
| SPEC-FIN-001 | Accounting Pack exports/reconciliation | P0 | PARTIAL | lifecycle + forced-failure tests |
| SPEC-HISTORY-001 | No destructive finalized financial history | P0 | PARTIAL | lifecycle/invariant/security tests |
| AUDIT-ART-001 | Per-format artifact independence | P0 | FAIL | PDF-fail/CSV-XLSX-success integration test |
| AUDIT-ART-002 | Truthful job/export status | P0 | FAIL | create→queued→ready E2E |
| AUDIT-ART-003 | Pending download not HTTP 500 | P0 | FAIL | endpoint negative lifecycle test |
| AUDIT-ART-004 | Normal operation auto-processes jobs | P0 | PARTIAL | deployment/job runner test |
| AUDIT-ART-005 | Accounting Pack refresh/version semantics | P0 | FAIL | snapshot/version test |
| AUDIT-ART-006 | Semantic filenames | P0 | FAIL | content-disposition tests |
| AUDIT-UI-001 | Mobile drawer full labels | P0 | FAIL | 360/390/430 E2E |
| AUDIT-UI-002 | Finance config stacks safely on phone | P0 | FAIL | finance mobile E2E |
| AUDIT-UI-003 | Form/card/Modify Report hierarchy | P0 | PARTIAL | browser + accessibility tests |
| AUDIT-LIFE-001 | Client/project edit/archive/restore | P0 | FAIL | lifecycle integration/E2E |
| AUDIT-LIFE-002 | Time/expense/report coherent draft lifecycle | P0 | PARTIAL | domain + E2E tests |
| AUDIT-TEST-001 | E2E covers owner/finance mobile and artifact failure | P0 | FAIL | updated Playwright config/specs |
| V32-IND-001 | Plant/Area/Line/Station hierarchy | P1 | OPEN | domain/migration/UI tests |
| V32-IND-002 | Automation Asset Registry | P1 | OPEN | asset CRUD/version/RBAC tests |
| V32-IND-003 | Versioned automation backups | P1 | OPEN | artifact/version tests |
| V32-IND-004 | Technical Change Management | P1 | OPEN | workflow/audit tests |
| V32-IND-005 | FAT/SAT + Punch List + Closeout | P1 | OPEN | workflow/E2E tests |
| V33-BIZ-001 | Presets/templates/report builder | P1 | OPEN | registry/version tests |
| V33-BIZ-002 | Change orders + budget baseline/forecast | P1 | OPEN | finance/domain tests |
| V33-BIZ-003 | Travel/assignments/timesheet calendar/planning | P1 | OPEN | domain + responsive E2E |
| V33-BIZ-004 | Skills/certifications/approval center | P1 | OPEN | workflow tests |
| V33-OPS-001 | Job Center + Artifact Center + Integrity Center | P1 | OPEN | E2E/forced failure tests |
| V33-OPS-002 | Import/export/data portability | P1 | OPEN | preview/validation/round-trip tests |
| V33-OPS-003 | Health/backup/restore/admin settings | P1 | OPEN | ops tests/runbooks |
| V34-DATA-001 | Point-in-time project snapshots | P1 | OPEN | leakage invariants |
| V34-DATA-002 | Immutable business event history | P1 | OPEN | append-only/invariant tests |
| V34-DATA-003 | Feature/training export versioning | P1 | OPEN | reproducibility tests |
| V34-DATA-004 | Model/prediction registry and shadow mode | P1 | OPEN | lifecycle tests |
| V34-DATA-005 | No future leakage in as-of datasets | P1 | OPEN | dedicated leakage tests |

## Release rule

All P0 rows and all P1 rows in the agreed production scope must be `PASS`, or a narrowly justified `BLOCKED` caused by a real external prerequisite. `PARTIAL`, `FAIL`, and `OPEN` are release blockers for their mandatory scope.
