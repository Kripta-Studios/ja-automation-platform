# J&A Automation — Client Essential Production Checklist

**Date:** 2026-08-22  
**Scope:** Only release blockers for the client-complete production system.

**Client validation update:** 2026-08-24
The requirements clarified directly with J&A on 2026-08-24 are release-authoritative. Existing PASS/PARTIAL evidence must be revalidated where these clarifications materially change the behavior; no prior PASS may be assumed to prove a newly clarified rule.

## QA cleanup, calendars, billing setup and quick guide — October 5, 2026

New user-requested scope: archive synthetic QA operational data while retaining BBS/Junkers and immutable history; exclude archives from ordinary operational views with explicit history access; Owner Expense Month/Worker controls; blue Time calendar/Log time; project/client defaults in New billing stream; issuer settings/tax management tables; eight-page illustrated project-to-invoice PDF. Final focused tests **43/43**, portal typecheck and scoped lint passed. Sequential browser evidence covers Owner, Worker, PM, Finance and Auditor, responsive controls, save/failure recovery and archive filtering/export continuity. Independent GPT-6.1 Sol review **APPROVE**. The protected production data comparison found all checked rows unchanged across **44** project-linked tables. See [scoped evidence and qualifications](docs/evidence/project-billing-cleanup-20261005/README.md) and [the PDF guide](docs/manuals/Project_to_Invoice_Quick_Guide_EN.pdf). This scope adds no legacy audit credits and does not assert whole-app/Client Essential acceptance; deployment/live evidence is recorded separately after cutover.

## Earlier scoped progress — October 5, 2026

Accepted additions total **75 UX / 69 bugs**, remaining **25 UX / 31 bugs**; original 102 coverage remains **47 scoped / 55 NOT_RUN / 0 whole-compound PASS**. W119-B01 adds exactly one bug fix for the false universal project-number promise; it adds no UX credit. Source `0f32319aa8c2c888d47740dab220ff35cf1c08e8` / archive `49355e708d0f2b12864889a9c72ce9be8378130be5b0eb2583974ef7d6ef97a5` completed its canonical deployment October 4 at 22:56:29 Europe/Madrid. The closed Owner English 1280×720 check and independent GPT-6.1 Sol judgment support the corrected conditional caption only; Save, invoice state, renumbering and financial effects were not exercised. Root acceptance SHA256 `13cef97c09f8f0261be163901c4ede2dd681375140fe1aa2e7bafb483974d5e4`. Prior W116/W118 acceptance and dated scope remain unchanged.

The latest requested Owner invoice-date check passed on this deployed source: exactly one date probe Save and one restoration Save, ordinary departure/reopen persistence, unchanged 11 lines / 68 hours / USD 3,325.00 and an unchanged full public project Overview. Original visible invoice values were restored and reopened; audit/version/PDF/planned-issue effects are retained and explicitly qualified. It adds zero credit. See [the scoped invoice evidence](docs/evidence/owner-invoice-edit-production-20261005.md). W120 confirmed wrong-person assignment error remains unfixed and parked; its BEFORE observation adds zero credit. Source writeback fields, PDF/mobile, other roles, issuance/payment and whole-app/Client Essential acceptance are not certified by this check. The user requested release/cleanup and then STOP; the unfinished 100/100 audit must not continue automatically. Detailed earlier scope: [project worker terms](docs/evidence/project-worker-terms-browser-20261002.md).

## Flujos por rol, gastos semanales y navegación — 2026-10-01

Seguimiento solicitado por el propietario: pruebas funcionales exclusivamente en Chromium con
propietario, jefe de equipo, trabajadores, gestor, administrador financiero, auditor, proveedor y
técnico. Se comprobaron creación/asignación de proyecto, horas/gastos delegados, doble clic,
privacidad, aprobaciones e informe diario; en copia aislada, gastos semanales atómicos, recibos,
conflicto entre pestañas y publicación para varios trabajadores con campos opcionales.
Los filtros conservan posición y foco en Planificación, Gastos, Horas e Informes; anchuras
360/390/768/1440 verificadas. Typecheck/build del portal correctos y revisión independiente.
Evidencia, registros sintéticos y límites: [browser-workflows-20261001](docs/evidence/browser-workflows-20261001.md).
La aceptación histórica completa y los pendientes externos mantienen su estado.

## Seguimiento de funciones y errores — 2026-09-25

La versión `2fa2cb6` continúa en producción mientras se verifica esta corrección. En una base
aislada, Chromium comprobó mediante clics las horas decimales, fecha siguiente, tabla semanal,
envío de horas y comida vinculada, calendario del propietario, gasto sin proveedor, fecha futura,
valores sugeridos de gasto, navegación de Aprobaciones, configuración sin perfil fiscal, emisor
J&A y exportación XLSX con importes de gastos. El informe y sus límites están en
`docs/evidence/feature-browser-audit-20260925.md`; las capturas siguen en el VPS. También pasaron
pruebas de asignación
en móvil y escritorio, y el flujo de clasificación y revisión financiera de gastos con rechazo de
una repetición obsoleta.

La revisión de 180 acciones en `docs/error-warning-action-inventory.md` conserva rutas con
mensajes genéricos y sin prueba individual. La aceptación Client Essential completa y una prueba
autenticada en producción aún no se acreditan; **no se declara `CLIENT READY`** con esta evidencia.

## Corrección de interfaz desplegada — 2026-09-24

El commit `85b8ee0` está desplegado como `zip-ae5996e51fa6c1fe20cc6d321e4d3e3f`.
Se corrigieron la altura de tarjetas colapsadas, la densidad y alineación de formularios,
la búsqueda de trabajadores al crear proyectos, la identificación de gestores con el mismo nombre,
el selector de proyectos según la asignación y fecha del trabajador en Log time, y los enlaces
de atención de tiempo, gastos, informes, aprobaciones, proyectos y reembolsos a sus registros.
Las dos cuentas activas llamadas «Project Manager Test» conservan sus identidades y ahora se
distinguen por correo en los selectores.

Evidencia local: typecheck, lint de archivos modificados y build de portal correctos; las pruebas
E2E focalizadas de tarjetas, búsqueda, asignaciones, navegación y alineación pasaron en 360, 390,
768 y 1440 px. La cola de reembolsos pasó con Owner en 360 y 1440 px. El desplegador creó el backup
online `2026-09-24T164133759Z-e8952a7d-d6d0-44ff-bbd0-5898001eb07e`, completó sus comprobaciones
de salud local y URLs públicas, y los contenedores portal y site quedaron saludables. Las cuatro
URL comprobadas devolvieron HTTP 200. La limpieza de la caché de construcción Docker liberó 6,906 GB
y dejó Build Cache en 0 B. Esta corrección no modifica por sí sola las aprobaciones pendientes de
Client Essential ni acredita `CLIENT READY`.

## Estado actual consolidado — 2026-09-19

**Producción operativa; aceptación Client Essential pendiente. No se acredita el 100 % ni `CLIENT READY`.**
El [estado actual](docs/PROJECT_STATUS_2026-09-19.md) actualiza el registro P01–P11 y conserva la
[matriz CORE-01–17 anterior](docs/PROJECT_STATUS_2026-09-18.md). La SPEC mantiene su autoridad.

- Código desplegado `1b2eef4`; sitio/portal saludables, dos ciclos automáticos sin fallos, esquema 49 íntegro.
- Tres manuales compartidos EN/PT-BR y tres guías rápidas: nueve PDF activos. Siete perfiles,
  rutas de lectura por rol, capítulos enlazados y 90 capturas fuente con datos sintéticos aislados.
  Los nueve PDF del contenedor coinciden con los revisados; aliases y límites de negocio conservados.
- Calendarios accionables, disponibilidad editable, correcciones EN/ES/PT-BR y recuperación
  automática de descargas transitorias; los conflictos humanos conservan valores y explican la acción.
- Tres PDF recuperados y dos sustituidos por versiones seguras; originales e historial conservados.
  P03 cerrado para los incidentes identificados, sin aprobar automáticamente los informes.
- Consolidación actual: 16/16 pruebas focalizadas y 19 E2E en cuatro tamaños; matriz de siete
  perfiles EN/PT-BR en desktop con 60 descargas autorizadas y 48 denegadas entre familias.
  Las suites generales y EN/ES/PT-BR anteriores conservan su atribución histórica.
  Nueva aceptación **32/32 PASS en `1b2eef4`**, con evidencia operativa de este release.
- Backup y restauración aislada de 59 archivos verificados; 24 snapshots en 11 días UTC (P04 parcial).
- Aprobaciones/evidencia externas P02/P05–P09 siguen pendientes; dispensa offsite vigente.
  QuickBooks/Intuit está excluido, no pendiente. Caché Docker: 0 B.

[Recibo de consolidación de manuales](docs/PRODUCTION_DEPLOYMENT_2026-09-19_MANUAL_CONSOLIDATION.md).

Las secciones fechadas y sus casillas conservan el histórico; no son una nueva certificación de la
versión actual. En particular, las entradas «no desplegado» de ASTRA y «pendiente smoke Owner» tienen
evidencia posterior identificada en la reconciliación. No se rellenan firmas ni se borran hallazgos.

## Owner email policy — 2026-09-10

The Owner explicitly replaced automatic operational email with in-app notices only.
Every other application email requires an explicit yes/no decision in the triggering
user's interface; the initial selection is empty and the server checks confirmation.
Invoice issue does not send email; PDF delivery is a separate confirmed command.
Invitations and public inquiries support recording without email. The delivery worker
quarantines unconfirmed historical mail without deleting history, and the SMTP endpoint
checks persisted consent. This instruction supersedes the older automatic-email clause
in Anexo A for this delivery. Validation and deployment evidence is recorded in
`docs/evidence/email-consent-20260910.md`.

## Historical candidate and continuing policy — 2026-09-06

The Owner/requester's formal implementation decision supersedes the older internal step-up design
and the older mandatory-MFA clause for this delivery:
MFA is optional for every user and operation, and the application has no step-up authentication.
Authorization continues to rely on an active session, role and object scope, CSRF/session controls,
idempotency and append-only audit. Historical schema columns and older evidence prose are retained
only for additive migration/history compatibility and are not active authentication gates. This
decision was explicitly confirmed on 2026-09-06 and is no longer an acceptance blocker.

**Frozen and deployed application candidate:** `2058db24ca4d5d6b3f66bde11b6230e271a2d06c`.
Format, lint, 10 project typechecks, unit 128/848, security 32/189, integration 52/390,
migrations 11/85, reporting 1/7, invariants 1/1, offline 3/8, local continuity 1/16, all
workspace builds, the 24-case role/viewport accessibility matrix, the 10-pass cross-role journey
and the manual capture pass all pass. The strict 32-step journey now passes 32/32 using fresh,
identity-bound production evidence: two automatic cycles, verified local pre-deploy backup and
rollback with the Owner's separate-host waiver, and the deployed Caddy boundary. The exact candidate
is live and healthy. Authorized authenticated production smoke also passes for the designated Owner
and Worker, including confidential-route denial and an audited TEST/SYNTHETIC workflow cleanup. The
supplied issuer/currency/rounding/series/remittance/RBAC decisions are recorded. The honest state is
`TECHNICALLY_VERIFIED_AWAITING_OWNER` because verified tax identity/profiles, express DPA/retention
approval and formal signer/human acceptance remain pending.
Read-only production inventory identifies Hetzner/Falkenstein, Germany (EEE), local database/private
storage/backups and self-hosted Stalwart on the same VPS; remote backup is disabled and no external
analytics/monitoring/object-storage/payment/mail SDK was found. This narrows the DPA inventory but
does not fabricate legal approval or authorized US/BR transfer decisions.
See `docs/evidence/client-ready-20260906/RUN_REPORT.md`.

## Legend

- ✅ Implemented/proven enough for this reduced release scope.
- 🟨 Substantially present but needs integration/QA or a bounded fix.
- ⬜ Essential release blocker still to complete.
- ⏭ Deferred from client-essential release.
- ❓ Conditional: required only if J&A confirms the operational need.

Audit classifications used below: `PASS`, `PARTIAL`, `FAIL`, `BLOCKED`, `CONDITIONAL`, `DEFERRED`. `PASS` requires executable evidence, not code presence.

## Historical candidate qualification — 2026-09-04

**Verdict: BLOCKED — not `CLIENT READY`, solely pending the remaining human/external ANEXO D
acceptance: authoritative DKIM/PTR and external send/receive validation, localized content approval,
the Owner role/project-assignment smoke, and responsible approver signatures.** The
application-to-Stalwart path is proven in production: a real contact submission returned HTTP `202`,
Stalwart accepted the message through authenticated STARTTLS Submission on port `587`, the durable
inquiry/outbox state became `delivered`, and the designated operator confirmed that the acceptance
message reached the agreed `migration-test@j-aautomation.com` mailbox in **Inbox**, not Junk. The
reviewed application release was committed, published and deployed on 2026-09-04 from branch
`codex/v3-production-completion-orchestrated-20260819` at commit
`8d02bd5e32032e26895d3f5a5260620e3935ba6d`; migration
`0035_stalwart_mail_integration.sql` remains latest. The active immutable release, Caddy routing,
production database, Stalwart integration and automatic jobs were verified on the VPS. The subsequent
acceptance-contract correction records the Owner's explicit separate-host continuity waiver without
weakening the mandatory local backup and rollback safeguards.

Pinned Node was `v24.19.0`, Corepack pnpm `11.22.0`; every repository gate used the pinned runtime and
`corepack pnpm --config.verify-deps-before-run=warn`. The reviewed deployer performed the authorized
production backup, image build, additive migration, atomic activation, unit installation and health
checks. It did not alter Stalwart data, accounts, passwords, hashes or DNS. The final release also
reconciles durable localized-PDF jobs that exhausted all retries so their UI state becomes truthfully
`failed` and retryable instead of remaining `running`; two historical production variants were recovered
with immutable attempt evidence. Post-cleanup free disk was 42 GiB while the active images and immediate
rollback pair remained retained.

| Gate                           | Result                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Format, lint, typecheck        | **PASS** — final post-remediation rerun; 10 workspace typechecks.                                                     |
| Unit                           | **PASS** — final post-remediation rerun; 122 files / 725 tests.                                                       |
| Integration                    | **PASS** — final post-remediation rerun; 52 files / 370 tests.                                                        |
| Security                       | **PASS** — final post-remediation rerun; 29 files / 177 tests.                                                        |
| Migrations                     | **PASS** — 11 files / 84 tests.                                                                                       |
| Reporting, invariants, offline | **PASS** — 1/5, 1/1, and 3/8 respectively.                                                                            |
| Continuity local drill         | **PASS** — 1 file / 16 tests; does not prove remote restore.                                                          |
| Site, Portal, jobs builds      | **PASS** — Site generated 255 pages; Portal used disposable environment paths; jobs bundle built.                     |
| Client Essential 32-step       | **PASS** — 32/32 with fresh, identity-bound production evidence; Owner waiver is explicit and fail-closed.            |
| 360/390/768/1440 matrix        | **PASS** — 20/20 role/viewport combinations.                                                                          |
| Production form/mail adapter   | **PASS** — authenticated STARTTLS Submission, durable delivery and human-confirmed Inbox placement; 11 focused tests. |

The journey now consumes the protected production evidence file and passes all 32 steps. Step 30 is
backed by two distinct automatic `jobs.cycle` records with zero failures. Step 31 accepts either complete
separate-host continuity or a strict Owner waiver that also proves a successful local backup and retained
rollback images; missing or informal waiver data still fails closed. The protected redacted evidence
is `/var/log/jaautomation-client-ready-mail-evidence.json` (`root:root`, mode `0600`). End-recipient
mailbox confirmation is now proven; the remaining external DNS/mail checks and customer/ANEXO D UAT
remain unproven, so the overall verdict cannot be marked `PASS`. See
`docs/CLIENT_READY_EVIDENCE_20260903.md` for commands and redacted details.
The current redacted acceptance evidence is
`/var/log/jaautomation-client-ready-mail-acceptance-20260904.json` (`root:root`, mode `0600`). The
post-deployment localized-PDF recovery and container-cleanup evidence is
`/var/log/jaautomation-client-ready-pdf-recovery-20260904.json` (`root:root`, mode `0600`).
redacted DKIM/DNS preflight is `/var/log/jaautomation-dkim-preflight-20260904.json` (`root:root`,
mode `0600`): Stalwart reports automatic DKIM management with RSA-SHA256 and Ed25519-SHA256 and the
configured selector template, while the least-privilege portal key correctly receives `forbidden`
when attempting to enumerate DKIM-signature objects. This proves the domain configuration without
expanding portal authority; it does not prove the generated selector TXT or an externally received
DKIM signature. The ready-to-sign human acceptance record is `docs/ANEXO_D_UAT_20260904.md`.

## Repository-grounded audit snapshot — 2026-09-01 (historical; not revalidated above)

**Current audit verdict: NOT READY pending final independent review and external acceptance.** The current
candidate closes the previously reproducible local product defects: the normal Finance flow assigns a
canonical legal-entity revision before invoice issue, the Accounting Pack HTTP action accepts the browser
payload without weakening its fail-closed step-up rules, and the Client Essential browser journey completes
steps **1–29** on a fresh disposable SQLite database. Steps **30–32** fail only with explicit missing-evidence
messages for two automatic production job cycles, a natural scheduled backup/isolated restore, and the
deployed Caddy origin. These are not replaced with mocks.

Fresh pinned Node `24.19.0` evidence for this candidate supersedes older counts in the historical checkpoints
below: format and lint PASS; all **10** workspace typechecks PASS; unit/regression **113 files / 660 tests**,
integration **48 / 329**, security **25 / 150**, migrations **11 / 84**, reporting **1 / 5**, invariants
**1 / 1**, offline regression **3 / 8** and continuity **1 / 16** all PASS. Local backup and restore drills,
database `foreign_keys=1`/`integrity=ok`, Site (**255 routes**), Portal and jobs production builds, Compose,
deployer and operations tests also PASS. The final 20-combination responsive matrix and independent finance,
security, browser and specification reviews are being frozen against this exact tree before the local statuses
below can be promoted.

**Offline/PWA decision (J&A, 2026-09-01):** offline capture is not a go-live requirement for Client
Essential. Existing offline code remains protected by regression tests, but implementation expansion is
deferred post-go-live and does not control the release verdict.

| Requirement                           | Status       | Current evidence and exact next dependency                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CORE-01 Authentication/users/roles    | PASS (local) | Generic WebAuthn failure responses, real P-256 valid/invalid assertions, active-user preflight before every MFA/passkey mutation, inactive-user no-session/no-cookie and mutation compensation pass the current **25/144** security gate; independent security review returned APPROVED. Final release rerun still applies after integration freeze.                                                                                   |
| CORE-02 Clients/projects/assignments  | PASS         | Identifiers, lifecycle, effective assignments and additive migration preservation pass; steps 2–3 and 6 plus artifact-lifecycle browser tests cover create/edit/archive/restore without fabricating legacy values.                                                                                                                                                                                                                     |
| CORE-03 Commercial rules              | PASS         | Exact effective rates, reference minutes, independent minimum billing, overtime, Travel and separate Labor/Expense tax streams pass integration and steps 4–10.                                                                                                                                                                                                                                                                        |
| CORE-04 Time/timesheets               | PASS         | Actual Work/Commissioning, Travel and Standby, submission/approval/locking and immutable correction pass transaction tests and browser step 12, including phone cards.                                                                                                                                                                                                                                                                 |
| CORE-05 Worker compensation/privacy   | PARTIAL      | The local authenticated Worker Statement lifecycle now proves PDF/CSV, truthful independent states, service-actor processing, private semantic downloads, persisted hash/length/bytes, other-Worker 404, PM/Finance/Owner denial under the current own-only policy, and per-format failure/retry. Automatic deployed execution remains dependent on CORE-16.                                                                           |
| CORE-06 Expenses/receipts             | PASS         | Operational-only Worker expense/receipt intake, separate reimbursement/recovery and Finance classification pass steps 16, 20 and 21 plus private-artifact security coverage.                                                                                                                                                                                                                                                           |
| CORE-07 Daily/PLC technical reports   | PASS (local) | The authenticated replacement-report journey now completes queued → running → ready, real PDF download, persisted hash/length/private storage key, locale/version refresh, failure/retry recovery and zero remaining failed jobs. Deployed automatic processing remains under CORE-16.                                                                                                                                                 |
| CORE-08 Approval workflow             | PASS (local) | The complete Customer Sign-off journey binds exact snapshot version/hash, records conformity, invalidates it after source change, generates and approves a replacement, records a new conformity and preserves cross-project/privacy denials. Final frozen-candidate rerun remains required.                                                                                                                                           |
| CORE-09 Project finance/profitability | PARTIAL      | Canonical source hashes, exact source identities, point-in-time entity checks, settlement linkage, exact-money reads and stronger producer/payment evidence pass **7/69** focused tests on Node 24. Independent finance-integrity review of this exact tree is still in progress.                                                                                                                                                      |
| CORE-10 Billing periods/drafts        | PASS (local) | The UI renders `[data-issue-blocker]`, reason and report-specific `Open sign-off`; the authenticated journey proves no partial writes before conformity, real issue after a valid signature, re-block after invalidation and real issue after replacement conformity. CORE-16 remains separate.                                                                                                                                        |
| CORE-11 Invoice rendering/corrections | PARTIAL      | Issued snapshot/PDF immutability, correction lifecycle and Accounting Pack rejection of draft/void/cross-scope sources are implemented and focused tests pass; final finance review and full integration rerun remain.                                                                                                                                                                                                                 |
| CORE-12 Payments/ledger               | PARTIAL      | Exact payment/reversal causality, ownership, provenance and mobile reconciliation pass focused tests; final finance review and a green frozen-candidate UI/integration matrix remain.                                                                                                                                                                                                                                                  |
| CORE-13 Essential reports/exports     | PARTIAL      | Customer Report and Worker Statement local lifecycles pass; Accounting Pack still awaits independent finance approval and all three artifact families require the frozen-candidate final gate.                                                                                                                                                                                                                                         |
| CORE-14 Responsive/accessibility      | PARTIAL      | Contrast/input/i18n/toast remediations compile and UI regressions pass **6/37**. The fresh 360/390/768/1440 browser matrix is **93 pass / 10 intentional skips / 9 fail** in three repeated contracts; fixes and an integrated axe/keyboard/overflow rerun are active.                                                                                                                                                                 |
| CORE-15 Private files/security/audit  | PASS (local) | Current private artifact, IDOR, origin, audit and inactive-user coverage passes **25/144**, including Worker/PM/Finance/Owner/inactive boundaries; independent security review returned APPROVED. Final release rerun remains mandatory after candidate freeze.                                                                                                                                                                        |
| CORE-16 Durable jobs                  | BLOCKED      | Durable queued/running/ready/failed/retry semantics, deployment-scoped service-actor code and no normal-user processing path have focused evidence. This worktree now starts an always-on looping Compose jobs worker with the portal (`--loop`, default stack, `restart: unless-stopped`); `jaautomation-jobs.timer` is only a watchdog. Privileged VPS diagnosis and two consecutive automatic `jobs.cycle` records remain required. |
| CORE-17 Deployment/health/backup      | BLOCKED      | Pinned Node 24 typecheck/build, continuity **16/16**, local backup/restore and issued/private-artifact drills pass. The Owner waived separate-host continuity as a nonblocking post-release improvement on 2026-09-04; local backup/rollback remain mandatory. Final deployment plus live Caddy/form/email evidence still require production verification.                                                                             |
| Offline/PWA                           | DEFERRED     | J&A confirmed on 2026-09-01 that offline capture is not required for Client Essential go-live. Existing code remains covered as a non-blocking regression; expansion moves post-go-live.                                                                                                                                                                                                                                               |
| V3.1–V3.4 expansion                   | DEFERRED     | Industrial platform, generic ERP/business, broad integrations and ML/data-readiness remain post-core roadmap and do not control `CLIENT READY`.                                                                                                                                                                                                                                                                                        |

### Integration checkpoint — 2026-08-31

- Current pinned-runtime gates: integration **41/272**, unit/regression **106/595**, security
  **24/123**, migrations **11/81**, supporting coverage **8/36**, lint, formatting, full workspace
  typecheck, local recovery and Site/Portal/jobs builds all pass.
- Durable Worker Statement request/job/artifact/download behavior and deployment-scoped service actor
  namespace migration `0033` are integrated. Source-cut and summary/detail reconciliation defects are
  remediated; authenticated download proof and independent review remain.
- UI_PLAN is closed for the local candidate: client/team directories, project drawer,
  mobile 4+More navigation, toast region, semantic invoice preview states, phone finance forms and
  tablet containment, phone timesheet cards, tablet drawer and Team actual-hour projection. Focused
  i18n/UI regression passes **5 files / 43 tests** plus the catalog residue guard **12/12**. After adding regressions
  for the shipped internal-cost schema and non-monetary source links, the seed creates its authoritative
  canonical Accounting Pack. The dedicated current-tree browser journey passes **8/8** across
  360/390/430/768/1024/1280/1440/1920 with axe, strict application-console, search/Enter, ES locale,
  Team privacy and no-overflow assertions; the required 360/390/768/1440 matrix is included.
- Finance remediation checkpoint: Accounting Pack revisions/artifacts, reversals, payments/ledger and
  Worker Statements pass **6 files / 45 tests**; migration `0034` and the full migration suite pass
  **11 files / 81 tests**. Overlapping source cuts now use period-scoped semantic evidence while
  preserving existing legacy evidence identities, and semantic collisions fail as domain conflicts
  before SQLite insertion.
- The two defects from the prior independent security review are remediated and the current security
  gate passes **24 files / 123 tests**; the prior independent security review approved the remediated
  origin/private-artifact boundary and the current authenticated browser journey passes.
- Updated UI remediation adds phone timesheet cards, the 768px drawer contract, Team planned/actual
  separation, explicit production origins and natural translations for newly exposed labels. Runtime
  search/toast/invoice-preview, role, axe, console, Team privacy and responsive evidence now pass.
  Required 360/390/768/1440 evidence remains the release matrix; extra widths are risk-based smoke
  checks, not separate release products.
- External/operational acceptance remains open: healthy jobs service with two consecutive automatic
  timer executions, encrypted copy and isolated restore on a separate host, real website/email/DNS
  evidence, and signed ANEXO D UAT acceptance.

### Wave 0 evidence

- Authority graph retargeted across root/nested instructions, prompts, orchestration gates, agent/skill routing, historical RTM semantics and release scripts.
- Migration contract repaired mechanically to bind the current shipped SQL bytes for `0019`–`0024`; `b5-migration-contract`, populated upgrade/rollback, adversarial migration, lifecycle and effective-membership suites: **4 files / 32 tests PASS**.
- Exact-money/billing smoke: **11 tests PASS**; reporting/i18n smoke: **14 tests PASS**; policy/offline isolation smoke: **9 tests PASS**; generic backup and restore tests PASS. These are partial evidence only, not release acceptance.
- Dedicated step-up throttling and finance-export HTTP boundary regression: **8 focused HTTP/session tests PASS**. Public website lint, typecheck and production build also PASS (host Node 25 warning remains; release evidence must be repeated on pinned Node 24.19.0).
- Accounting Pack artifact lifecycle: **5 integration tests PASS**, including five-attempt dead-letter behavior, linked job-run fencing, idempotent ready outputs and independent PDF failure without loss of XLSX/CSV/JSON outputs.
- Essential repository authorization/privacy: **2 files / 8 tests PASS** for worker/PM DTO redaction, current and object-date assignment enforcement, technical `reportDate` checks and same-project receipts in normal/offline creation. Database package typecheck PASS.
- Controlled invoice/domain and operational correction integration: **6 files / 16 tests PASS** for the five renderer families, exact controlled selectors, stream defaults, credit adjustment, expense editing projections and immutable approved reports with audited correction drafts.
- Scanner fencing/security: **6 files / 25 tests PASS** for exact job/run/fence/binding/capability proof, provider checks, quarantine/download behavior, audit redaction and a fail-closed human HTTP route. Full workspace typecheck PASS on the host runtime.
- Localized-PDF authorization: **4 focused suites / 33 tests PASS** for current and source-date assignment rechecks across request/list/retry/download, stale/forged principal denial, technical `report_date` enforcement and durable localized-artifact regressions.
- Client Essential projection firewall (2026-08-24): **4 files / 14 tests PASS** plus database/reporting/portal typechecks and packet-level security/privacy approval. Customer period-report snapshots/PDFs are allowlisted to hours and activity with zero money; legacy/localized variants require an exact current safe snapshot-hash binding; Worker and PM repository DTOs omit Finance-only project/expense fields server-side. The current worktree adds PM approval/document allowlists and requires a fresh independent review; this does not by itself complete CORE-05/07/13 browser and sign-off requirements.
- WP-03 canonical commercial-authority integration (2026-08-24): combined post-remediation selection **7 files / 45 tests PASS** plus database typecheck. Canonical project/legal-entity assignment, legacy Accounting Pack bridging, operational-only Worker/PM expense intake and Finance/Admin-only commercial classification are wired without duplicate authority. Classification now rejects invoiced or billing-locked expenses and invalidates stale billing/project-currency/tax/FX projections instead of presenting mismatched financial truth. Immutable Accounting Pack writes require a current human Finance/Owner step-up whose proof is persisted and bound into the idempotent command payload. Independent finance re-review remains the acceptance dependency.
- WP-04 customer conformity and billing gate (2026-08-24): packet-level security re-review **APPROVED** with the integrated conformity/private-artifact/UI selection **3 files / 19 tests PASS** plus database and portal typechecks. Customer snapshots are zero-money allowlists; sign-off binds signer/server timestamp to an immutable report version and exact PDF proof; record/invalidate require stepped-up human Finance/Owner authority; draft invoices remain possible while issue fails with `customer_signoff_required` and a report deep link. The current worktree still needs fresh independent security review, and role/browser evidence remains before CORE-07/10/13 can pass.
- WP-05/06 operational UX focused evidence (2026-08-24): role-specific navigation plus Worker Today, Time, Expense, Daily/Technical Reports and first-class Client Sign-off regression selection **6 files / 25 tests PASS**. Entry surfaces use progressive disclosure and responsive sheets; Worker operational forms contain no client billability, rate, tax, internal-cost or margin controls. Today no longer fabricates the former fixed 10-hour expectation. This is code-level integration evidence only; authenticated 360/390/768/1440, keyboard, focus and payload/DOM checks remain open.
- WP-07 PM serialization boundary (2026-08-24): focused PM projection plus repository privacy selection **2 files / 6 tests PASS** and portal typecheck. The section loader now applies closed-world server allowlists: PM search payloads exclude invoices and unknown finance-backed entities, approval rows drop expense minor units, document listings omit internal metadata, and PM milestone review DTOs exclude amount, currency, rate, tax, margin, internal-cost and billing-treatment fields. Project-detail/approval mounting and authenticated payload/DOM browser evidence remain open.
- Post-change focused rerun (2026-08-25): `pnpm exec vitest run tests/security/localized-pdf-variants-security.test.ts tests/security/portal-pm-projection.test.ts tests/security/repository-privacy.test.ts tests/integration/v3-finance.test.ts` passed **4 files / 18 tests**. This covers the `0030` legacy refresh fixture, PM approval/document projections and draft reimbursement synchronization; it is not the full pinned release gate.
- Pinned security rerun (2026-08-28): with Node `24.19.0` and pnpm `11.22.0`, `pnpm test:security` passed **19 files / 98 tests** after repairing stale step-up fixtures and the Vitest `$app/paths` alias, returning symlink/non-regular-file reads as audited integrity conflicts, and narrowing repeated download step-up to restricted invoice/Accounting Pack artifacts. The focused regression selection additionally passed **5 files / 35 tests**. Independent current-tree security approval remains unavailable because the Luna review lane exhausted its quota.
- Pinned integration rerun (2026-08-28): with Node `24.19.0` and pnpm `11.22.0`, `pnpm test:integration` passed **37 files / 238 tests** on schema `0032`. The rerun repaired stale step-up fixtures without weakening the protected commands, made customer-conformity fixtures supply client rate/internal cost/compensation truth before closing a period, and proved that service-actor IDs cannot collide with human user IDs. Current-schema remote continuity recovery remains open.
- Pinned unit/regression rerun (2026-08-28): with Node `24.19.0` and pnpm `11.22.0`, `pnpm test:unit` passed **95 files / 522 tests**, including browser-backed offline user partitioning **2/2**. Stale schema-30 assertions now track additive schema `0032`, finance mutation fixtures use real recent step-up, zero-source invoice tests use authoritative billable sources, and role landings no longer race navigation.
- Pinned supporting gates (2026-08-28): Node `24.19.0` reporting **1 file / 4 tests**, invariants **1/1**, offline **3 files / 8 tests**, continuity contracts **1 file / 14 tests**, isolated database check/integrity **2/2**, and `ops:backup:test` plus `ops:restore-test` **2/2** all passed with a valid disposable deployment identity. These prove local behavior and recovery only; they do not replace the separate-host encrypted restore or live jobs evidence.
- Client Essential 32-step browser checkpoint (2026-08-28): with the Node `24.19.0` binary directory first on `PATH` and `JA_E2E_CADDY_BASE_URL=https://j-aautomation.com`, `playwright test tests/e2e/client-essential-32-step.spec.ts --project=desktop` completed every local authenticated mutation and responsive assertion in steps **1–29** and the deployed public-routing contract in step **32** on a fresh disposable database. Step 32 proved public site and portal login HTTP `200`, public `/health/live` HTTP `200`, and public scoped readiness HTTP `404`, without mutating DNS, Caddy or the VPS. The aggregate failure contains only the deliberate operations gates **30–31**: two proven automatic timer runs and an encrypted remote-copy restore drill. Evidence trace: `test-results/client-essential-32-step-C-97fa0-d-fixture-covers-steps-1–32-desktop/trace.zip`. This checkpoint also proves truthful queued invoice-PDF presentation, canonical legal-entity-backed expense classification, PM approval, Finance review, issue/payment/ledger flow, and 360/390/768/1440 overflow/accessibility checks. The two external gates keep the verdict `NOT READY`.
- Current-tree production compilation (2026-08-28): pinned Node `24.19.0` `pnpm build` passed the Next.js public site (**255 generated pages/routes**) and the SvelteKit portal adapter-node production build with `JA_OFFLINE_ENABLED=false`; `pnpm jobs:build` also produced the bundled durable runner successfully. This is local build evidence, not proof that the current tree is deployed.
- Pinned migration rerun (2026-08-28): with Node `24.19.0`, `pnpm exec vitest run tests/migrations` passed **9 files / 77 tests**, including fresh and populated upgrade paths through additive migrations `0031` and `0032`, immutable prior metadata and schema-integrity guards. Remote continuity recovery evidence remains open.
- Release build artifact (2026-08-25): `pwsh -NoProfile -File scripts/build-release-and-upload.ps1 -ReleaseDate 20260825 -Force` passed the pinned Node `24.19.0` typecheck, `@ja/site`, `@ja/portal` and jobs builds, archive-entry/private-path validation, local SHA-256 generation and remote checksum verification. Uploaded as `kripta:/home/kripta/jaautomation-release-20260825-final.zip`; SHA-256 `894f315be30b923856f2a9cdb642dbf759b420771c2e1c1c4505724eb721f8c9`, source commit `fcfb596`. This proves a deployable archive, not `CLIENT READY`.
- VPS deployment evidence (2026-08-25): the user-run `sha256sum -c` returned `OK`; the automatic path watcher had already processed the same SHA, so the later explicit installer correctly returned `El ZIP ya fue desplegado`. VPS journal evidence records successful image builds, container recreation, local/public health checks and `DESPLIEGUE COMPLETADO` at `01:37:00` for `/opt/jaautomation/releases/ja-automation-894f315be30b923856f2a9cdb642dbf759b420771c2e1c1c4505724eb721f8c9`. Independent endpoint checks returned HTTP `200` for site local, portal readiness/API and both public URLs. Inspecting the root-only release path requires `sudo`/TTY; this deployment evidence does not change the `NOT READY` Essential verdict.
- Client Essential additive persistence contract (migration 0028): independent migration/data-integrity review **APPROVED** after the final inclusive-interval hardening; the final migration/contract selection is **2 files / 21 tests PASS** plus database typecheck. Direct-SQL adversarial evidence covers missing/mismatched project, revision and deployment scope, assignments outside revision bounds, inclusive same-day overlap, a valid adjacent interval, and `INSERT OR REPLACE`/update/delete immutability. Earlier focused migration review also covers byte-preserving legacy/schema-18 upgrades, optional identifiers/planned dates, append-only commercial policy, exact conformity snapshot/PDF binding, permanent signed-report identity and safe storage keys. Reachable services and browser workflows remain separate checklist evidence.
- Checkpoint verification rerun (2026-08-24): the WP-03 expense classification, Accounting Pack boundary, repository privacy and revision selection is **4 files / 24 tests PASS**, with database and portal typechecks PASS on the host runtime. Final independent finance approval, stale integration-fixture migration and pinned Node `24.19.0` evidence remain open; therefore this is not a CORE finance `PASS` claim.
- WP-07 Project Detail (2026-08-24): focused role-safe UI regression **5/5 PASS** plus portal typecheck. PM/Worker omit Commercial and Billing surfaces, authorized roles receive server-gated finance data, finance periods are validated and default truthfully to the current UTC month, tabs implement roving keyboard navigation, and money display avoids binary-number conversion. Project and Approval sections are now mounted; authenticated PM browser evidence remains open.
- CORE-08 approval/correction lifecycle: **5 files / 17 tests PASS** after independent review, including nonblank reasons, strict correction-field allowlists, cross-actor/override idempotency binding, Owner-only step-up override, immutable locked/invoiced guards, original preservation and native technical `report_date` projections.
- CORE-04 backend acceptance: independent final review PASS; focused validation **13/13** on host and pinned Node 24, related lifecycle selection **4 files / 18 tests PASS**, and pinned database typecheck PASS. Evidence includes current/object-date authorization inside each write transaction, authorization-before-validation, audit rollback, direct interval checks and real worker-thread contention preserving aggregate/overlap invariants. Portal clock fields and offline validation remain conditional/non-goals unless activated.
- Reviewed additive migration `0025`: migration contract **10/10 PASS**, adversarial migration **18/18 PASS**, and cross-migration hardening **10/10 PASS**. Existing client data remains unchanged with unknown new fields stored as `NULL`; migration metadata, finance cutover evidence and FK/integrity contracts are preserved.
- Realistic production backup/restore drill PASS: issued invoice snapshot unchanged; private receipt and PLC backup bytes/hashes/lengths preserved; SQLite integrity/FK checks pass; traversal manifest rejected.
- CORE-01 invitation/security acceptance: independent invitation re-review **3 files / 20 tests PASS** and lead full security gate **15 files / 66 tests PASS**. Evidence covers single-use CAS claims, stale no-identity and exact-credential recovery, wrong-role/identity denial, atomic activation/finalization/audit, secret redaction, Origin/Referer enforcement, cross-origin throttle isolation and same-origin attempt-11 `429`.
- CORE-09/12 backend finance-truth acceptance: independent final review PASS; finance/reversal/accounting-pack selection **4 files / 15 tests PASS** plus database typecheck. Evidence covers Finance-approved expense revenue, computed source-backed WIP, dangling/frozen-cost incompleteness, full-command idempotency, causal append-only payment reversals, transactional void/replay guards, reversal-aware compensation, rejected/void readiness exclusion in both billing paths, row-wise BigInt totals, independent as-of reconciliation and atomic pack/job/audit creation.
- CORE-07 attachment migration foundation: independent security re-review PASS; pinned Node 24 migration/contract/adversarial/cross suites **4 files / 44 tests PASS**. Migration `0026` preserves populated upgrades and unrelated documents; enforces report/project/type/creator/immutability guards; supports scanner-required `quarantined/pending -> committed/clean` and honestly scanner-disabled `committed/not_scanned`; rejects impossible state pairs; permits generic technical collections while preventing duplicate/branched PLC before/after history. Service, authorization, private-file and report-detail UI work remains before the requirement can pass.
- CORE-05 backend compensation truth: independent finance re-review PASS; focused compensation **3/3**, related finance/privacy **6 files / 18 tests**, finance-truth/accounting/privacy **3 files / 10 tests**, effective-membership/security **2 files / 10 tests**, and database typecheck PASS. Evidence covers per-source assignment dates, exact BigInt project/global reconciliation for hourly/daily/fixed/custom/percentage rules, daily top-up allocation, immutable settlements, identical-only reimbursement replay and worker-safe DTOs. A private, durable worker statement export remains before CORE-05/13 can pass.
- CORE-17 readiness/storage/recovery packet: independent deployment re-review PASS. Lead pinned-Node run: health/migration/backup/private-write/artifact suites **7 files / 35 tests PASS**; `ops:backup:test`, `ops:restore-test` and the migrated realistic drill PASS with `invoice=issued`, two private artifacts, integrity and FK checks. Reviewer additionally verified 20-way health single-flight/TTL, exact `0026`/manifest hashes, public-health static Caddy ordering, compose configuration, BigInt disk arithmetic, symlink/reparse rejection and current loopback runbooks. Live Caddy validation and VPS smoke remain environmental release evidence; production must rebuild the ignored jobs bundle as the Docker/deployment flow specifies.
- Pinned Node `24.19.0` portal production build PASS against an isolated migration-26 database and private document root. The prior build failure was deployment-identity configuration, not source compilation; required tenant/deployment/binding values were supplied without weakening runtime validation.
- Additive migration `0027` durable-cleanup contract: independent security re-review PASS. Fresh/upgrade **3/3**, contract/adversarial/cross **38/38**, attachment migration/service **16/16**, Accounting Pack **14/14**, readiness **2/2**, and pinned database typecheck PASS. It adds only `temporary_upload_cleanup -> storage.temporary.cleanup`, preserves every prior pair/legacy quarantine, enforces report-link creator=owner, and registers a user-only `accounting_pack.export_retry` audit action without broadening service or audit authority.

---

# A. Architecture and foundation

- ✅ Modular-monolith direction preserved.
- ✅ Initial frontend shell decomposition completed.
- ✅ Route loader/action extraction completed.
- ✅ Database repository decomposition completed to useful domain boundaries.
- ✅ Schema modularization completed.
- ✅ API/schema parity foundations preserved.
- ✅ Core test harness exists.
- ✅ Authority now stops further megafile decomposition unless a file materially blocks Essential correctness, security, testing or ownership.
- ⏭ “Every remaining megafile must be completely decomposed” is not a client-release requirement.
- ⏭ 207-row legacy RTM completeness is not the client-release definition of done.

# B. Responsive UI and accessibility

- ✅ Mobile drawer/full labels/focus/scroll-lock pass the current multi-width browser journey.
- ✅ Shared form/card primitives are implemented and tested.
- ✅ Invoice preview / Modify Report behavior is verified in the built portal.
- ✅ Worker, PM, Finance and Owner workflow surfaces pass authenticated role journeys.
- ✅ Finance forms, responsive tables, labels, focus and validation pass browser and regression coverage.
- ✅ Representative browser proof at 360/390, 768 and 1440 passes on the current worktree.
- ⏭ Separate blocking QA at 430/1024/1280/1920 if responsive behavior is already covered; smoke-check instead.
- ⏭ Migrating every existing screen to new primitives is not required if the screen is already usable.

# C. Authentication, users and RBAC

- ✅ Auth/security, cross-role and MFA/audit evidence pass the current gates.
- ✅ Invitation-only production user activation lifecycle works (independently security-reviewed; 20 focused tests PASS).
- ✅ Owner/Admin, Finance, PM and Worker permissions are enforced server-side; PM approval/queue scope is bound to active membership plus `can_review=1`.
- ✅ Assignment-effective access, Worker/PM commercial redaction, live-session validation, IDOR controls and service/background actor fencing have focused evidence; MFA is optional and no operation uses step-up authentication.
- ✅ The current security gate, independent remediation review and authenticated journeys pass.

# D. Clients, projects and assignments

- ✅ Client create/view/edit/archive/restore is implemented and browser-proven.
- ✅ Project create/view/edit/activate/close/archive/restore is implemented and browser-proven.
- ✅ Worker assignments retain start/end dates and history; migration `0028` preserves nullable legacy values without fabrication.
- ✅ Project-manager assignment/scope is server-gated; PM review permissions require active membership and `can_review=1`.
- ✅ Project commercial configuration covers currency, budget/PO, billing model, cadence, reference schedule, overtime, Travel and tax streams and passes the acceptance journey.
- ✅ Draft deletion and final/finance-bearing history use bounded lifecycle rules; no hard-delete of issued/finalized financial history.
- ⏭ Full rich client CRM metadata beyond billing/operational essentials.

# E. Time and worker pay

- ✅ Core time/timesheet foundations and Worker fast-entry surfaces pass authenticated browser proof.
- ✅ Worker draft create/edit/delete, submission, actual Work/Commissioning, Travel and Standby capture are implemented.
- ✅ PM approve/reject is implemented with active-membership plus `can_review=1` enforcement and browser evidence.
- ✅ Approved time locks and typed corrections preserve old value → new value → reason with audit history.
- ✅ Regular, standby, overtime and travel time use canonical domain rules without frontend financial reimplementation.
- ✅ Project reference hours (for example 10/12/14) are configurable planning/commercial settings,
  never fabricated actual time; minimum billable and worker-compensation rules remain independent.
- ✅ Hourly/daily/fixed and percentage-of-eligible-client-labor compensation rules are covered by exact-money focused evidence.
- ✅ Worker sees own pay/activity/state/dates only; internal loaded cost and client bill rate remain separate server-side.
- ✅ Phone/desktop correction and cross-role browser proof pass.
- ✅ Missing/overlap/impossible-duration validation catches obvious errors and survives real competing writers (independently reviewed; 13/13 focused PASS).
- ⏭ Copy-previous-day/repeat-week shortcuts can follow after go-live.

# F. Expenses and receipts

- ✅ Expense foundations and the operational-only Worker form pass browser proof.
- ✅ Worker creates/edits/submits expense with receipt, project, date, category, amount/currency, payer and description only.
- ✅ Receipt photo/PDF upload and private download are authorization-fenced and artifact-tested.
- ✅ PM may approve operational truth where authorized; Finance/Admin exclusively owns commercial classification and billability.
- ✅ All-in, reimbursable and non-billable classifications remain separate from Worker input and preserve reimbursement/client-recovery states.
- ✅ Who-paid, expected/actual reimbursement and recovery dates are persisted as distinct concepts.
- ✅ Approved expense correction is typed, reasoned, audited and non-destructive.
- ⏭ OCR.
- ⏭ Mileage subsystem unless the client specifically needs it.

# G. Daily and PLC/technical reports

- ✅ Report foundations and Modify Report UI pass the authenticated journey.
- ✅ Daily and PLC/technical Draft → Submit → review/approve state paths exist with immutable correction support.
- ✅ Problem/diagnosis/change/result/safety fields and immutable attachments are represented in the report contracts.
- ✅ Technical attachments/private downloads and PLC backup history pass migration, service and browser/artifact proof.
- ✅ Customer-visible reports use an explicit zero-money allowlist and exclude internal financial/private notes.
- ✅ Exact source-ID/version binding in migration `0030` and nested-value fail-closed validation pass migration/security and browser sign-off evidence.
- ⏭ Plant → Area → Line → Station hierarchy.
- ⏭ Full automation asset registry.
- ⏭ FAT/SAT/commissioning module.
- ⏭ Punch lists.
- ⏭ Closeout-package builder.
- ⏭ QR/photo-annotation/knowledge-base features.

# H. Approval workflow

- ✅ Time, expense, Daily and PLC/technical approval operations enforce active membership plus `can_review=1` and pass authenticated PM evidence.
- ✅ Finance billability/classification approval exists with Finance/Admin authority and passes the acceptance journey.
- ✅ Reject/reopen/correct requires typed fields/reason and preserves immutable original truth with audit.
- ✅ Owner override requires an active authorized Owner session and a nonblank audited reason; it does not use step-up authentication.
- ✅ Authenticated PM/Finance browser evidence and independent security approval pass.
- ⏭ Dedicated universal Approval Center if domain-level approval screens are sufficient.
- ⏭ Bulk approval framework until real volume justifies it.

# I. Finance and project profitability

- ✅ Exact-money and finance foundations pass the integrated finance gate.
- ✅ Exact monetary calculations persist safely using canonical integer/exact-money paths.
- ✅ Worker compensation, internal labor cost and client revenue remain separate.
- ✅ Effective rates, independent minimum/overtime/Travel treatment, direct project cost, WIP, invoiced, collected, outstanding, Contribution and margin foundations exist.
- ✅ Finance view/source drill-down and planned-versus-actual reconciliation pass browser and full-suite evidence.
- ✅ Signed-source binding and immutable finalized finance history pass focused and integrated evidence.
- ⏭ Full versioned forecast/EAC engine.
- ⏭ Change-order subsystem.
- ⏭ Travel-leakage analytics beyond correct expense/cost treatment.

# J. Billing and invoices

Los marcadores de esta sección describen implementación y evidencia focalizada; no convierten el
CORE ni el DoD final en `PASS` mientras falten las pruebas integradas y autenticadas.

- ✅ Invoice preview/presentation is implemented and browser-tested.
- ✅ Labor and expense streams can be configured independently.
- ✅ Weekly / 14-day / semi-monthly / monthly / custom / milestone/manual periods needed by J&A.
- ✅ Approved source rows are selected deterministically.
- ✅ Duplicate billing is prevented by source uniqueness and transactional guards.
- ✅ Invoice drafts generate automatically or from a normal Finance action.
- ✅ Finance explicitly issues invoices.
- ✅ Unique numbering.
- ✅ Issued invoice snapshot/PDF is immutable.
- ✅ Void/Credit/Adjustment correction path.
- ✅ Labor and expense tax profiles remain independent.
- ✅ Normal workflow does not require manual “process jobs”; two consecutive production cycles passed.
- ✅ One reusable renderer provides the five controlled business layouts.
- ⏭ Automatic invoice send by default.
- ⏭ Jurisdiction-specific statutory tax engine.

# K. Payments and ledger

- ✅ Record full payment.
- ✅ Record partial payment.
- ✅ Received date/reference with causal date-only normalization.
- ✅ Outstanding balance updates exactly.
- ✅ Invoice/Cost/Collection ledger shows invoice, cost, collected, outstanding and contribution.
- ✅ Payment/reversal behavior is auditable.
- ⏭ Bank payment execution.
- ⏭ Bank statement import/matching.
- ⏭ Full general ledger.

# L. Essential reports and Accounting/Finance exports

- ✅ Reporting catalog and artifact lifecycle are complete for the Essential report families.
- ✅ Daily/PLC operational report.
- ✅ Customer period report.
- ✅ Project internal finance/profitability report.
- ✅ Worker compensation/statement report as a durable private artifact.
- ✅ Invoice/collection ledger report.
- ✅ Monthly Accounting/Finance export.
- ✅ PDF for customer/official documents.
- ✅ XLSX or CSV for finance/accounting tables.
- ✅ Invoice and expense CSV registers.
- ✅ Monthly totals and detail values reconcile exactly to authoritative sources.
- ✅ Finalized export revision cannot be silently rewritten.
- ✅ Pending/failed output has explicit UI/API state, not HTTP 500.
- ✅ Retry is idempotent.
- ✅ PDF failure does not destroy/prevent independent CSV/XLSX output.
- ✅ Semantic filenames.
- ⏭ JSON export unless a real consumer needs it.
- ⏭ ZIP packs unless Accounting requests them.
- ⏭ Separate Artifact Center and incident-management UI.
- ⏭ Dozens of separately engineered reports that can instead be filters/views of the six core report families.

# M. Lifecycle and correction semantics

- ✅ Draft operational records can be safely edited/deleted.
- ✅ Submitted records can be rejected/reopened with audit.
- ✅ Approved records are locked.
- ✅ Post-approval corrections preserve prior truth.
- ✅ Issued invoices are immutable.
- ✅ Final accounting exports are versioned/frozen.
- ✅ No hard delete of financial history.
- ⏭ Complex autosave conflict/recovery/compare/discard framework unless real user testing shows it is needed.
- ✅ Long entry surfaces provide safe draft behavior; advanced autosave conflict UX remains deferred.

# N. Private files, uploads and downloads

- ✅ Storage-key/hash/security foundations exist.
- ✅ Authorize before final file write.
- ✅ MIME/extension/size validation.
- ✅ Safe filenames/storage paths.
- ✅ Receipt/report/invoice/PLC files are private.
- ✅ Every private download checks permission.
- ✅ Sensitive download/audit behavior where required.
- ✅ Production scanning fails safely or is explicitly disabled with bounded accepted risk; it never fakes success.
- ⏭ Full document-management platform.

# O. Background jobs

- ✅ Durable job/timer foundations exist.
- ✅ Production runner automatically advances normal report/invoice/export jobs.
- ✅ Money-related jobs are idempotent.
- ✅ Failed generation is visible and retryable.
- ✅ No hidden user dependency on manual processing; production runtime proof passed.
- ⏭ Generic Job Center.
- ⏭ Distributed scheduler/message broker/Redis.

# P. Offline/PWA

- ✅ Go-live decision recorded from J&A on 2026-09-01: plant offline capture is not a Client
  Essential release requirement.
- ⏭ Per-user isolated cache, offline time/report/PLC drafts, queued receipt/photo, sync/conflict UX
  and logout/offboard purge move to post-go-live.
- ✅ Existing offline code remains isolated and covered by the non-blocking **3 files / 8 tests**
  regression gate; it is neither expanded nor removed as part of this closure.
- ⏭ Multi-deployment offline infrastructure beyond the actual deployment topology unless needed.

# Q. Deployment, operations and recovery

- ✅ Existing Docker/Caddy/systemd/deployment foundations are preserved and production-verified.
- ✅ Node 24 pinned production build.
- ✅ Portal and website start automatically.
- ✅ Safe DB migration at deployment.
- ✅ Basic health endpoint without sensitive detail.
- ✅ Disk/storage sanity check.
- ✅ Scheduled local backup.
- ✅ Restore runbook.
- ✅ One successful restore drill including issued/private artifacts.
- ⏭ Ten-dimension Operations Health dashboard.
- ⏭ Alerting/outbox platform beyond the minimum needed for operational failures.

# R. Public website

- ✅ Existing multilingual Next.js website remains working without expanding marketing scope.
- ✅ Public website builds 255 routes locally; the exact-candidate deployed Caddy boundary validates and EN/ES/PT-BR plus portal login pass over verified TLS.
- ✅ Contact/support forms remain isolated from private portal data.
- ✅ Employee Portal entry works.
- ⏭ New marketing-site feature expansion unless separately requested.

# S. Explicitly deferred roadmap

- ⏭ Full industrial hierarchy and asset registry.
- ⏭ FAT/SAT/commissioning.
- ⏭ Punch lists and rich closeout.
- ⏭ Skills/certification management.
- ⏭ Global search and command palette.
- ⏭ Bulk operations framework.
- ⏭ General Import Center.
- ⏭ Configurable notification platform.
- ⏭ Client portal.
- ⏭ Accounting-provider adapters.
- ⏭ Bank import/payment execution.
- ⏭ Advanced FX/multicurrency ledger.
- ⏭ Feature flags product UI.
- ⏭ Project Intelligence.
- ⏭ Point-in-time ML snapshots.
- ⏭ Feature/training export registry.
- ⏭ Model registry.
- ⏭ Prediction history/shadow mode.
- ⏭ GBT/JEPA models.
- ⏭ ML leakage release gates for a product that is not yet using ML.

# T. Client Essential Definition of Done

The release can be called **CLIENT READY** only when all of these pass:

Las casillas técnicas y operativas se cierran con los gates, el despliegue real y la evidencia protegida
del VPS. La entrega aplicación → Stalwart ya está probada; la confirmación humana de recepción y la
aceptación contractual ANEXO D se mantienen como gates externos separados y no se sustituyen con mocks.

- [x] Owner can invite and manage users.
- [x] Admin can create/edit/archive/restore a client.
- [x] Admin can create/edit/close/archive/restore a project.
- [x] Admin can assign workers with effective dates.
- [x] Project commercial/rate/expense/billing rules can be configured.
- [x] Worker can record and submit actual time on phone.
- [x] Worker can see own compensation without confidential commercial data.
- [x] Worker can submit daily and PLC/technical reports.
- [x] Worker can submit expenses with receipts.
- [x] PM can approve/reject operational records.
- [x] Finance can approve billability and review project economics.
- [x] All-in vs reimbursable expense behavior is correct.
- [x] Project cost/revenue/WIP/invoiced/collected/margin reconcile.
- [x] Customer period report generates.
- [x] Labor/expense/fixed invoice drafts generate as required.
- [x] Finance can issue an immutable invoice.
- [x] Credit/void/adjustment correction path exists.
- [x] Full and partial payments can be recorded.
- [x] Invoice/Cost/Collection ledger is correct.
- [x] Monthly Accounting/Finance export reconciles.
- [x] Export pending/failure/retry semantics are truthful.
- [x] Normal jobs run automatically.
- [x] Core flows work on phone/tablet/desktop.
- [x] RBAC/privacy/IDOR tests pass.
- [x] Private uploads/downloads are safe.
- [x] Approved/finalized history is non-destructive.
- [x] Local backup/restore drill passes; separate-host continuity is a non-blocking post-release improvement by Owner waiver dated 2026-09-04.
- [x] Production build/deployment behind Caddy works.
- [x] A real production contact submission reaches the signed internal adapter and is accepted by
      Stalwart over validated STARTTLS, with durable `delivered` state and no replay of the legacy backlog.
- [x] The designated operator confirms receipt of the production acceptance message in the agreed
      `migration-test@j-aautomation.com` mailbox with Inbox placement.
- [x] Designated production Owner and Worker login without MFA; Owner protected routes pass, Worker
      confidential finance routes fail closed, and the authorized project-assignment workflow is
      archived with an audited TEST/SYNTHETIC cleanup. The literal Worker project → time → expense/
      receipt → report → expected-payment path and Owner planned/budget view also pass; Worker output
      contains no confidential budget/rate/cost keys.
- [ ] Authorized DNS/mail operators separately verify authoritative DKIM/PTR and external
      send/receive if still required. This campaign does not touch mail accounts, passwords, routing
      or server configuration.
- [ ] Authorized humans approve Accounting outputs, the Worker manual walkthrough and localized
      marketing/legal content; identify the signers and record ANEXO D acceptance. Fiscal/DPA and
      retention approvals remain itemized in the current client-ready decision.
- [x] No core business flow requires a spreadsheet as the system of record.
- [x] Project reference hours are configurable (for example 10/12/14), never become real worked
      hours, and remain independent from minimum billable hours and worker compensation.
- [x] Minimum billable hours/day/service are configurable independently from worker compensation.
- [x] Overtime is optional and supports a configurable threshold plus worker/client multiplier or rate (including cases such as 1.6x and 2x).
- [x] Travel time can be independently configured as client-billable or non-billable, with separate worker-pay treatment.
- [x] Authorized Admin/Finance can add/reduce/correct worker hours with reason, audit trail and preservation of prior approved/submitted truth.
- [x] Customer time/activity report contains no monetary values, can be signed/conformed by the client, and blocks final labor billing when the project requires signature.
- [x] Worker view/report shows own hours/activity, amount expected to receive, reimbursement/settlement state and expected/actual payment dates without Finance-only data.
- [x] Admin/Finance view/report shows hours/activity, money to pay, money to receive, billing/collection state and planned/actual cash-flow dates.
- [x] Expenses maintain separate worker-reimbursement and client-billing/collection states and dates.
- [x] Invoices expose the configured client code/acronym, client number, project number and project cost-center code/number, and Labor/Expenses tax treatment can independently be configured as applicable or no-tax/0%.
- [x] Project and worker active/inactive states prevent inappropriate new activity without deleting historical records.

When this section is fully checked, deferred roadmap items must not prevent the release verdict.

# U. Requested Stalwart identity extension — 2026-09-03

- [x] Live mailbox catalogue uses Stalwart 0.16.19 JMAP `/jmap`; the browser projection excludes
      `credentials` and the portal never reads RocksDB or the historical NDJSON import.
- [x] Idempotent reconciliation links every live corporate mailbox as an active verified `worker`,
      except `antonny.luty@j-aautomation.com`, which is the protected canonical `owner_admin`.
- [x] Better Auth retains Antonny's existing local demo credential and delegates fallback password
      verification to IMAPS; linked workers use IMAPS without storing or caching their Webmail
      passwords.
- [x] Mailbox create, role change, portal offboarding, password rotation and mailbox destruction are
      canonical-Owner-only, require an active authorized Owner session, revoke affected sessions and append
      redacted audit evidence. Portal offboarding preserves history and is separate from Stalwart
      mailbox destruction.
- [x] Reconciliation is non-destructive: a mailbox absent from a live Stalwart read does not
      archive/offboard its portal identity, revoke sessions, replace its stable account ID or undo
      an Owner-approved role/lifecycle decision. Delegated login still fails closed through live
      Stalwart revalidation, and only Antonny can invoke the explicit lifecycle actions.
- [x] Additive migration 0035 and its pinned migration contract pass fresh/populated upgrade tests;
      focused auth, JMAP, directory, UI and RBAC suite passes 62 tests, and the portal production
      build succeeds with an isolated deployment identity.
- [ ] VPS-only acceptance is partially complete: the restricted Stalwart token and authenticated SMTP
      Submission secret are installed, the release is deployed, initial reconciliation is complete,
      IMAPS/JMAP pass, and the production acceptance message reached Inbox. Antonny's
      role/project-assignment smoke from `docs/DEPLOYMENT_VPS.md` remains part of signed UAT; do not
      expose passwords, tokens or hashes while capturing it.

## Historical ASTRA candidate evidence — 2026-09-08 (not yet deployed at that checkpoint)

This section records new local evidence against `ASTRA_PLAN.md`; earlier deployed handbacks do
not certify these uncommitted changes. Plan-only commit `a2604fc` was pushed. Candidate
implementation, final review, and representative browser completion remain in progress.

- [x] Parent commercial-preview, cash-calendar and Aquarex regression run: 5 files / 21 tests
      passed using disposable SQLite. Covers exact commercial examples, actual versus expected
      cash, original reimbursement currency, unconfirmed compensation finalization, real-session
      role denial, durable public-form retry and rate limiting.
- [x] Parent Help catalog and private-download regression run: 2 files / 8 tests passed.
      Persisted roles and live sessions protect private manuals. Generated EN/ES/PT-BR guides
      carry revision 2026-09-08; first-page visual inspection completed in all three languages.
- [x] Parent Finance UI and translation regression run: 2 files / 19 tests passed after task-copy
      changes and explicit compensation-finalization labels.
- [x] Parent frozen migration contract and operational-readiness run: 2 files / 15 tests passed
      with additive migrations 0040/0041, populated historical upgrades, rollback and preserved
      source projections. Original migration hashes and fixture evidence remain unchanged.
- [ ] Closeout: complete immutable audience packages, source/privacy/failure evidence and
      localized browser lifecycle before accepting the candidate.
- [ ] Period follow-up: complete version-bound staff workflow and exact source-readiness browser
      evidence, retaining the existing signed-evidence invoice gate.
- [x] Aquarex, commercial preview, cash calendar and Help representative browser matrix:
      28 passed across 360/390/768/1440, with both production builds completed.
- [ ] Closeout/follow-up browser matrix and fresh independent final review remain pending.
- [ ] Human agreement/accountant mapping, content rights, named-signatory authority and employee
      walkthrough remain explicit acceptance inputs in `docs/ASTRA_ACCEPTANCE_REGISTER.md`.

Exact commands, candidate limitations and subsequent outcomes are tracked in
`docs/ASTRA_IMPLEMENTATION_PROGRESS.md`. No production mail, deployment or production data
mutation is part of these checks.

### ASTRA final candidate verification — 2026-09-08

Owner explicitly authorized commit, push and production deployment. The completed ASTRA core browser matrix passes **44/44** at 360/390/768/1440 widths. Closeout/follow-up integration passes **25 tests**, with **12 closeout tests** rerun after final transaction source/role checks. Migration/readiness/localized-UI regression passes **52 tests**. Full workspace TypeScript passes; extended Svelte diagnostics show **zero errors**, seven existing unused-CSS warnings. Independent review corrections enforce exact confirmed snapshot hashes and atomic one-time latest-final reopen with next-draft creation and rollback.

Production online backup restored with **29 private documents** and integrity `ok`. Candidate migrations39→41 applied successfully to that isolated restored production copy: integrity `ok`, zero foreign-key violations. Detailed commands, logs, backup identity and remaining human/conditional inputs are recorded in `docs/ASTRA_IMPLEMENTATION_PROGRESS.md`. Deployment identity will be recorded separately after activation; this entry does not claim human UAT or accountant approval.

## Production evidence — 9 September 2026

### Migration regression correction — 9 September 2026

The broader functional run exposed six stale migration expectations across B5 legacy upgrades,
Client Essential schema/metadata preservation, localized PDF registries and report attachments.
A seventh occurred in issued-invoice upgrade coverage. Five test files still expected schema39
or metadata versions19–39 despite the existing closeout/follow-up migrations40–41.
Updated exact expectations to schema41 and metadata versions19–41; retained all data-preservation,
integrity, foreign-key, immutable-history, authorization and artifact lifecycle assertions.
Focused Vitest runs pass **45/45 plus 6/6 (51 total)**, with formatting and diff checks passing.
Commands: `pnpm exec vitest run tests/migrations/b5-cross-migration-hardening.test.ts tests/migrations/client-essential-20260824-migration.test.ts tests/integration/localized-pdf-variants.test.ts tests/migrations/report-attachments-migration.test.ts --no-file-parallelism --reporter=verbose`
and `pnpm exec vitest run tests/migrations/client-essential-invoice-immutability.test.ts --reporter=verbose`.
Local logs: `/tmp/astra-six-failures-fixed.log` and `/tmp/astra-invoice-migration-fixed.log`.
These are test-only corrections; no production schema or data was changed. Full application
functional verification remains in progress and is not certified by this focused result.

Core ASTRA implementation and reminder rollout correction were committed, pushed and deployed as `5a615d9` at 00:02:29 CEST. EN/ES/PT and login return HTTP200; local readiness and full SQLite integrity are `ok`, schema41 has zero foreign-key violations; production verifier passed. The first rollout's scheduler conflict and incompatible schema39 rollback, forward recovery, independent correction review, remaining non-corporate email delivery limitation and retained backups are recorded in [the implementation ledger](docs/ASTRA_IMPLEMENTATION_PROGRESS.md). This does not replace human UAT or conditional external approvals. Authorized cleanup recovered 14.37 GB net, with 35.64 GB available; see [storage evidence](docs/ASTRA_STORAGE_CLEANUP_2026-09-09.md).

## 2026-09-09 — Production audit corrections verified; deployment evidence pending

Confirmed assignment/contact editing, compensation configuration, conformity state, document access and classification, upload validation, restore integrity, mobile controls and PT-BR distribution corrections are implemented and independently reviewed. [The audit record](docs/PRODUCTION_AUDIT_2026-09-09.md) records 1,351 Vitest cases verified across the complete run and focused rerun, the resolved harness failures, all 72 executable role/viewport cases covered, 17 additional browser checks, clean dependency audit and successful production builds. All seven manuals were regenerated from 45 current synthetic captures.

The final Client Essential journey passes steps 1–29 and 32. Steps 30–31 remain `OPERATIONS_EVIDENCE_MISSING`; the unaltered result is `NOT_READY`. This worktree is a reviewed remediation candidate, not a deployed release. Exact-revision deployment/operational evidence and the existing human/fiscal/privacy acceptance boundaries remain outstanding. No production history was modified.

## 2026-09-09 — Revisión57dfb95 desplegada y limpieza verificada

Por autorización expresa del usuario, `57dfb95` quedó activo a las10:25:12 CEST. Web EN/ES/PT y login HTTP200, readiness e integridad correctas, esquema41 sin nuevas migraciones, dos ciclos automáticos de jobs y restauración aislada de29 archivos comprobados. Se eliminaron cachés y66 backups antiguos conservando tres copias verificadas y el release anterior compatible. Caché Docker0 B y37,74 GB disponibles. [Recibo de despliegue, recuperación y limpieza](docs/PRODUCTION_DEPLOYMENT_2026-09-09_57dfb95.md). La evidencia histórica local y los límites de aceptación humana se conservan.

## 2026-09-09 — Auditoría del despliegue frente a SPEC y PDF contractual

**Veredicto posterior: NO se acredita cumplimiento íntegro de ambos documentos.** Esta auditoría
no modifica la aplicación ni producción. Los1.178 archivos del manifiesto del release activo
`57dfb954c481d9107a18d89e3ee8fe7bad797374` coinciden y el código local de aplicación coincide con
ese release. Base productiva esquema41, integridad correcta, cero violaciones FK y13 documentos
committed con hash/tamaño correctos. Nueva restauración aislada de la copia del9/9 08:25 UTC: correcta.

El navegador autenticado local pasa13 casos, omite10 por distribución prevista entre viewports y
falla el recorrido compuesto de32 pasos. El paso16 reproduce HTTP500 al volver a subir bytes de un
recibo existente: `finalizeUpload` expone la colisión del índice global `document_content_idx`.
Prueba aislada adicional confirma `UNIQUE constraint failed: document.sha256, document.byte_length`;
el original se conserva. No se debilitaron assertions ni se corrigió el producto en esta auditoría.
Los pasos30–32 no recibieron parámetros de evidencia externa en esa ejecución; jobs/Caddy/restore
se verificaron por separado, sin transformar el resultado del comando en un PASS.

Otros límites confirmados: el adaptador de outbox solo acepta avisos/formularios, no los topics de
invoice/invitación emitidos por otros flujos; destinatarios no corporativos fallan. «Mark sent» es
registro manual, no confirmación SMTP. Solo quedan tres backups completos estructurados del9/9,
aunque retención configurada es30 días; continuidad remota está desactivada bajo dispensa previa.
MFA opcional/no step-up sigue siendo la decisión del Owner, pero difiere del texto literal del PDF
y de las frases no reconciliadas de la SPEC. Permanecen configuración fiscal, DPA/retención,
aceptación humana y evidencias de migración/correo. PTR actual ya apunta a `mx1.j-aautomation.com`.

Informe y matrices de enunciados con evidencia y límites:
`/home/kripta/auditoria-ja-2026-09-09/INFORME_AUDITORIA.md`, `MATRIZ_SPEC.csv`,
`MATRIZ_CONTRATO_ANEXO_A.csv`, `production-readonly.json`, `restore-drill.json`,
`e2e.json` y `duplicate-receipt.log`. Los resultados generales automatizados quedan detallados en
el informe final; los antiguos checks técnicos no resuelven el defecto reproducido ni equivalen
a aceptación contractual/humana.

Cierre de la batería actual: `vitest run --no-file-parallelism` termina con salida0, **199 archivos / 1.351 pruebas PASS**, duración1.233,41s. La prueba adicional del duplicado confirma el defecto fuera de esa batería; el veredicto global continúa NO CUMPLIMIENTO ÍNTEGRO. Log: `/home/kripta/auditoria-ja-2026-09-09/vitest-full.log`.

### Remediación técnica posterior a la auditoría — 2026-09-09

La auditoría anterior conserva su valor histórico. El registro actualizado es
[docs/AUDIT_REMEDIATION_2026-09-09.md](docs/AUDIT_REMEDIATION_2026-09-09.md).
Se han corregido los recibos duplicados, la integración de invitaciones/avisos y el envío explícito
de facturas con PDF, la diferenciación entre registro manual/cola/aceptación SMTP/entrega incierta,
y la verificación real de backups con retención mínima y acceso privado del worker.

Evidencia local: 78 pruebas en 11 archivos de regresión pasan sobre las correcciones estabilizadas;
los dos recorridos nuevos de navegador pasan a 360/390/768/1440 px. Typecheck y ESLint pasan.
La corrección posterior de normalización de mayúsculas del destinatario tiene su propia prueba
idempotente. La batería amplia ejecutada durante los cambios tuvo 202 archivos / 1.403 pruebas
correctas y ocho fallos en cuatro archivos; todos esos archivos están incluidos en la repetición
correcta, sin declarar que el primer comando fue un PASS.

El recorrido de 32 pasos supera los pasos funcionales 1–29. Los pasos 30–32 todavía requieren sus
parámetros de evidencia operacional, continuidad y Caddy. La verificación real de la última copia
retenida confirma integridad SQLite, cero errores de claves foráneas y 29 documentos; cinco copias
cubren un solo día de los treinta exigidos. El código no recupera el histórico eliminado.

No se declara cumplimiento contractual íntegro: destino externo de backups, alertas externas,
pruebas de entrega/migración/recuperación real de correo, datos fiscales verificados y aprobaciones
humanas siguen pendientes. La SPEC recoge la decisión existente del Owner sobre MFA opcional y
sin step-up; no se altera ni se firma retroactivamente el contrato original. La activación y las
comprobaciones de producción se acreditarán en el recibo de despliegue de esta remediación.

### Corrección de idiomas y preparación del despliegue — 2026-09-09

Inglés por defecto sin preferencia previa; selector EN/ES/PT compartido entre portal y login,
con migración de preferencias antiguas, cookies de un año y conservación tras navegación,
recarga y cierre/inicio de sesión. Se corrigen etiquetas visibles y accesibles, estados de
proveedores/CSV, mensajes de cierre, guardados financieros y mensajes de acciones en inglés.
No se traducen datos originales ni se modifican permisos o importes por cambiar de idioma.

La revisión final local supera 110 pruebas en 12 archivos, typecheck del workspace, ESLint y
formato. Las 12 pruebas reales de persistencia pasan a 360/390/768/1440 px; el recorrido de
78 páginas de Owner y Worker en ES/PT no encuentra textos conocidos del catálogo sin traducir.
Las capturas y los PDF se vinculan al código mediante el digest del manifiesto de manuales.
El recibo de producción separará las pruebas sintéticas de las verificaciones del VPS.

Estos resultados no cierran el histórico perdido de backups, la copia externa, la entrega y
recuperación real del correo, los datos fiscales ni la aceptación humana pendientes del registro
de remediación. No se crean ni reactivan agentes tras la prohibición expresa del solicitante.

### Activación verificada y limpieza — 2026-09-09, 22:09 CEST

Commit de aplicación y manuales `58403295db6c0ba585eaf2e873437044cb065e24` desplegado;
1.604 archivos y siete PDF coinciden con el paquete. Portal/site saludables, jobs activo,
schema 42, integridad correcta y cero errores de claves foráneas. Seis casos de idioma
EN/ES/PT en móvil/escritorio pasan contra el login productivo; dos ciclos automáticos de jobs
pasan y `backup.verified` acredita la copia real nueva con 29 documentos. Se conservan seis
backups, que cubren un solo día. Limpieza de Docker/cachés: aproximadamente 8,66 GB recuperados.

Recibo y límites: [despliegue de la remediación](docs/PRODUCTION_DEPLOYMENT_2026-09-09_AUDIT_REMEDIATION.md).
Los pendientes externos, fiscales y de aceptación humana de la auditoría siguen abiertos.

## 2026-09-10 — Proveedores y configuración comercial (CORE-02 / CORE-14 / CORE-15)

- [x] Navegación compartida en proveedores e informe; drawer móvil y enlaces por perfil.
- [x] Directorio con búsqueda, edición y baja/restauración confirmada para el propietario; historial y privacidad conservados.
- [x] Separación de bloques, títulos, descripciones y aviso de autoridad de emisión en Finance configuration.
- [x] Migración aditiva 43 para las acciones de auditoría: actualización poblada desde 42, metadatos previos e integridad verificados. Las pruebas de versiones actuales se actualizan de 42 a 43.
- [x] Evidencia: 41 pruebas de integración/seguridad; suites de migración comprobadas (91 pruebas entre pasada general y repetición dirigida); 16 escenarios de navegador y 4 repeticiones finales del directorio en 360/390/768/1440; compilaciones web/portal, Svelte sin errores y ESLint del alcance correctos.
- Evidencia y capturas: [supplier-ui-20260910](docs/evidence/supplier-ui-20260910/README.md).
- Estado: desplegado en producción el 2026-09-10 a las 09:39 UTC desde `f70c21c`; verificador de producción superado, esquema 43 íntegro y recuentos comprobados conservados. Limpieza Docker: aproximadamente 19,4 GB liberados, caché de compilación vacía y versión anterior conservada para reversión. Este alcance no cambia el veredicto global de entrega.

## 2026-09-10 — Gestión Owner y selectores con búsqueda

- [x] Gestión central de gastos, horas e informes: reapertura, edición delegada y eliminación con motivo y auditoría, con independencia del origen demo/mock.
- [x] CRUD Owner de planificación, disponibilidad, hitos y cambios técnicos; edición, archivado y restauración de documentos.
- [x] Descarte de facturas no emitidas y liberación transaccional de reservas; el historial emitido mantiene correcciones/anulaciones.
- [x] Búsqueda en selectores de entidades sin distinguir mayúsculas ni acentos, conservando selección y desplegable nativo.
- [x] Migración 44 probada desde base vacía y copia aislada de producción 43; integridad y referencias verificadas después de eliminar los tres borradores de factura y once gastos de esa copia.
- [x] Permisos, concurrencia, privacidad, finanzas, jobs y continuidad comprobados; navegación y operaciones en móvil/tablet/escritorio.
- Evidencia y límites: [owner-crud-20260910](docs/evidence/owner-crud-20260910/README.md). Esta ampliación no modifica las aceptaciones externas históricas pendientes.

- Estado de esta ampliación: commit `031077b` desplegado a las 10:49:09 UTC, esquema 44 íntegro y 19 recuentos de tablas conservados; verificador de producción superado. Caché Docker a cero tras liberar 6,828 GB. [Recibo de producción](docs/PRODUCTION_DEPLOYMENT_2026-09-10_OWNER_CRUD.md).

### 2026-09-10 — Owner financial landing and management UI

Explicit Owner follow-up implemented: currency-separated exact cash/receivable/payment overview, clickable monthly bars and status donuts with matching source filters, and explicit responsive Manage buttons/navigation. Evidence: `docs/evidence/owner-finance-20260910/README.md`. Eight financial tests, 235 security/invariant tests validated (including updated dependency mock rerun), 20 final browser scenarios across 360/390/768/1440, workspace typecheck, and Svelte check with zero errors. No migration or financial history mutation; existing contractual external acceptance items remain as recorded.

### 2026-09-10 — Operational-first landing and authorized Demo finance history

- [x] Field operations overview precedes Owner finance charts; 8 browser checks pass at 360/390/768/1440 with chart drill-through and Worker finance isolation.
- [x] Owner-authorized additive training batch uses four existing Demo projects and test identities; issued invoices, simulated receipts/reimbursements and pending settlements retain normal lifecycle/audit semantics and prevent external invoice delivery.
- [x] Isolated rehearsal preserves 189 original business rows; atomic rollback, live-session authorization and durable idempotence pass 3 integration tests. Production load has SQLite integrity `ok` and zero foreign-key violations.
- Evidence and production activation: [Owner training delivery](docs/evidence/owner-training-20260910/README.md). This requested demonstration content does not change the global release verdict.
- Production: `3f066a5` activated at 14:04:44 UTC; all seven real test-profile journeys pass. Nine invoice PDF jobs succeeded, nine Owner downloads verified, Worker downloads correctly masked as unavailable. Services healthy, 38-document final backup complete, Docker build cache 0 B after 6.834 GB reclaimed.

## 2026-09-18 — Revisión ERP, informes por rol y conciliación

- Revisión funcional y comparación con ERPNext, OpenProject, Dolibarr y Firefly III: [análisis y alcance](docs/ERP_REVIEW_2026-09-18.md). No implica sustituir la arquitectura ni modificar documentos ya emitidos.
- [x] Implementación: cobros con antigüedad y saldos por moneda; filtros/exportaciones coherentes; evidencia de gastos; selección técnica revisada y acotada; ayuda por rol EN/ES/PT; mejoras táctiles y de accesibilidad.
- Los casos de abonos detectados durante las pruebas requieren corregir las proyecciones y permitir agregados firmados en snapshots mediante migración 48. La aceptación exige procedencia válida, rechazo de sobrecobros, preservación de datos y revisión independiente.
- [x] Migración 48: 2 pruebas específicas y 14 de contrato; ensayo 47→48 en copia productiva conserva 163 tablas, 251.006 filas, el snapshot real y 387 triggers, con integridad correcta y cero errores FK.
- [x] Regresión general de 1.019 casos e integración/artefactos de 517 casos ejecutadas; los fallos detectados se resuelven con repeticiones dirigidas documentadas en el análisis. Typecheck, ESLint y revisión independiente aprobados.
- [x] Navegador: 64 casos aplicables aprobados entre la pasada final y la repetición de tres contratos actualizados; 12 exclusiones de viewport preexistentes. Incluye 48 comprobaciones de mejoras ERP, alcance y accesibilidad en 360/390/768/1440. Aislamiento offline y controles estructurales: 18/18.
- [x] Publicación y producción: código `2bb50b2` desplegado a las 19:32:45 UTC; esquema 48 íntegro, snapshots emitidos y registros financieros conservados, backup de 50 documentos verificado, dos ciclos automáticos sin fallos nuevos. Caché Docker 0 B tras liberar 6,917 GB.
- Estado: actualización desplegada y verificada. [Recibo y límites operativos](docs/PRODUCTION_DEPLOYMENT_2026-09-18_ERP_REVIEW.md). No modifica las aceptaciones externas ni los pendientes históricos documentados.

## 2026-09-18 — Planificación de cobros inspirada en QuickBooks

- [x] Ampliación explícita: resumen de saldos por cliente/moneda, filtro por cliente, prioridades de cobro, previsión de entradas a 90 días y tres CSV del mismo alcance. [Análisis y decisiones](docs/QUICKBOOKS_REVIEW_2026-09-18.md).
- [x] Dinero exacto y corte temporal: 28 pruebas focalizadas, incluyendo integración del calendario; abonos separados, importes grandes, fechas límite y exportación segura.
- [x] Regresión general: 1.026 casos ejecutados (1.025 pasaron; un fallo de inventario de traducciones corregido). Repetición dirigida de 91 casos y cinco comprobaciones del resumen pasan. No quedan fallos sin resolver de esta pasada.
- [x] Navegador: 20/20 en 360/390/768/1440; 14/14 adicionales tras guardas de tipos previas en clientes e informes. Owner/Finance autorizados, Worker/PM denegados, EN/ES/PT, Axe y controles táctiles. [Capturas y evidencia](docs/evidence/quickbooks-20260918/README.md).
- [x] Typecheck y ESLint; Svelte con cero errores y cero avisos; formato; revisión independiente final aprobada. No se necesitan migraciones y no se añaden escrituras financieras.
- Publicación, backup, conservación de históricos y limpieza Docker: [recibo de producción](docs/PRODUCTION_DEPLOYMENT_2026-09-18_QUICKBOOKS.md). QuickBooks se usa únicamente como referencia funcional; cualquier conexión con Intuit está expresamente excluida por el usuario y no es un pendiente. No cierra los pendientes históricos ni las aceptaciones externas.
- [x] Desplegado `d69efe6` a las 21:00:49 UTC: sitio/portal saludables, dos ciclos automáticos sin fallos nuevos, esquema 48 íntegro, 14 snapshots de factura y todos los registros financieros de referencia conservados, backup de 50 documentos verificado. Caché Docker 0 B tras liberar 6,802 GB. Continúan los cuatro jobs/cinco PDF históricos fallidos y la cobertura de backup de 10 días; se documentan sin declararlos resueltos.

## 2026-09-19 — Recuperación histórica y aceptación técnica completadas

- [x] P03: tres PDF canónicos recuperados y dos sustitutos seguros en producción; mensual regenerado
      con job enlazado al agotado. Originales, cuatro jobs históricos y dos filas legacy bloqueadas conservados.
- [x] P01: **32/32 PASS** sobre `3893245`, con operaciones productivas actuales y evidencia por paso.
      Cierre, aprobación, firma sintética y emisión usan el mismo proyecto, periodo, regla, factura y fuente.
- [x] Filtro de facturas por proyecto corregido; regresión causal, 8/8 pruebas focalizadas y revisión
      independiente. Regresión general anterior `5db9bfc`: 1.050/1.050; no se atribuye al commit posterior.
- [x] Desplegado `3893245` el 19/09 a las 06:56:23 UTC; sitio/portal saludables y dos ciclos automáticos
      observados sin fallos. 1.720 archivos del release coinciden con su ZIP; esquema 48 íntegro, FK cero.
- [x] Facturas, pagos, documentos y snapshots contables conservados; 50 originales con hashes idénticos.
      Backup y restauración aislada de 59 archivos verificados. Caché Docker 0 B, 7,135 GB liberados.
- P04 sigue parcial: 18 snapshots en 11 días UTC, aún sin cobertura de 30 días. Aprobaciones externas y
  humanas pendientes; no se declara `CLIENT READY`. La prueba de firma es sintética, no aceptación real.

[Recibo y límites](docs/RECOVERY_AND_ACCEPTANCE_2026-09-19.md),
[resultados por paso](docs/evidence/recovery-20260919/acceptance-32-steps.json) y
[estado actualizado](docs/PROJECT_STATUS_2026-09-19.md).

## 2026-09-19 — Calendarios accionables y disponibilidad (CORE-01/02/14/15)

- [x] Migración 49 ensayada en copia aislada de producción: 163 tablas y 259.034 filas anteriores conservadas; integridad `ok`, cero errores FK, 387 triggers.
- [x] Revisión independiente de propiedad, edición por versión, auditoría, UTC y selección de trabajador; correcciones incorporadas.
- [x] Chromium: 48/48 casos de calendario, cinco roles y 360/390/768/1440 px; proveedor/coordinador/técnico externo, 2/2 recorridos en 390/1440 px. Capturas y logs en `docs/evidence/planning-calendar-20260919/`.
- [x] Tipos de los diez paquetes, Svelte, ESLint y formato correctos; suite unitaria 1.074/1.074 y 17/17 pruebas focalizadas sobre la última corrección de perfil propio.
- [x] Aceptación posterior al despliegue: 32/32 pasos, con operaciones y backup del release `7b36959`; sin sustituir aceptación humana.
- [x] Integración general 527/527 (70 archivos); código `7b36959` publicado y activo en producción a las 08:44:17 UTC. 1.753 archivos idénticos al ZIP, esquema 49 íntegro y filas financieras comprobadas conservadas.
- [x] Dos ciclos automáticos sin fallos; backup posterior y restauración aislada previa verificados con 59 documentos. Caché Docker a 0 B tras liberar 6,961 GB; imágenes y volúmenes conservados.

[Análisis, comparación y alcance](docs/ERP_PLANNING_REVIEW_2026-09-19.md) y [recibo de producción](docs/PRODUCTION_DEPLOYMENT_2026-09-19_PLANNING_CALENDAR.md). Los pendientes externos se conservan; P04 sigue parcial con 20 snapshots en 11 días UTC.

## 2026-09-19 — Manuales por perfil, idiomas y recuperación de errores

- [x] 14 referencias EN/PT-BR para siete perfiles y tres guías rápidas; 90 capturas reales de Chromium, 14 pares perfil/idioma y 168 comprobaciones. Texto, fuentes, imágenes y hashes de los 17 PDF verificados.
- [x] Ayuda aplica sesión vigente, rol persistido y perfil de proveedor al listar/descargar. Owner conserva biblioteca de formación; los demás perfiles reciben sus guías. Navegador: 26 accesos permitidos, 12 denegados y sesión caducada con acción para entrar.
- [x] Descargas GET con recuperación transitoria acotada, sin alertas tras recuperación correcta. Fallos persistentes y conflictos de gestión explican qué hacer y conservan los valores; no se reintentan escrituras automáticamente.
- [x] Traducciones, estados, navegación, validación y formatos de lectura EN/ES/PT-BR; valores financieros canónicos conservados. Idioma de proveedores conservado en redirecciones.
- [x] 1.123/1.123 pruebas unitarias generales; 88/88 de cierre de navegación; 34/34 de integración focalizada. Chromium: 105 rutas de siete perfiles en tres idiomas; disponibilidad y Ayuda verificadas en 360/390/768/1440 px. La suite general precede a los últimos ajustes de etiquetas/CSS, cubiertos por las regresiones finales.
- [x] Código `e43c640` activo desde las 10:07:32 UTC: 1.924 archivos idénticos al ZIP y 17 PDF del contenedor con hashes coincidentes. Producción pública 3/3, dos ciclos automáticos sin fallos, esquema 49 íntegro y filas históricas comprobadas conservadas.
- [x] Backup posterior y restauración aislada de la copia previa, ambos esquema 49 y 59 documentos. Caché de construcción Docker a 0 B tras liberar 6,976 GB; imágenes/volúmenes conservados y watchers activos.
- [x] Aceptación **32/32 PASS** del código desplegado con evidencia operativa nueva. Se actualiza una aserción que esperaba el enum interno a su etiqueta traducida y al trabajador correcto; se conserva la comprobación de porcentaje y tipo en la base de datos. Los intentos anteriores se documentan.

[Recibo de producción](docs/PRODUCTION_DEPLOYMENT_2026-09-19_MANUALS_I18N.md), [catálogo de manuales](docs/manuals/README.md) y [evidencia y alcance](docs/evidence/manuals-i18n-20260919/README.md). Las sesiones autenticadas usan datos sintéticos aislados; no se fabrican operaciones de clientes reales. P04 sigue parcial con 22 snapshots en 11 días UTC y las aprobaciones externas permanecen pendientes.

## 2026-09-21 — Renovación visual de web y portal

- [x] Sistema visual inspirado en `trace-it`: tipografía Geist local, superficies cálidas, navegación lateral clara, formularios/tablas coherentes y dashboard compacto. No modifica reglas financieras ni permisos.
- [x] Navegador: 30/30 casos aplicables en 360/390/768/1440, cinco perfiles, Axe, navegación y controles táctiles. Seis exclusiones previas de pruebas públicas exclusivas de escritorio. Fallos iniciales de contraste y tamaño de calendario corregidos y matriz completa repetida.
- [x] 187/187 pruebas focalizadas de UI/i18n/validación; tipos de todos los paquetes y ESLint de archivos modificados correctos. Revisión independiente sin hallazgos materiales pendientes.
- Manuales y despliegue: se registran tras ejecutar en [evidencia de la renovación](docs/evidence/design-refresh-20260921/README.md). Las aceptaciones externas anteriores conservan su estado.
- [x] Cierre visual del inicio del trabajador: cuatro tamaños aprobados y revisión independiente. Capturas finales: 104/182 comprobaciones; nueve PDF actualizados con fuentes, imágenes, texto y hashes verificados. Descargas/errores/sesión en navegador y cuatro pruebas de autorización aprobadas.

- [x] Despliegue completado el 22/09 a las 00:05:21 (Madrid): release `f693b66f…`, 592 archivos de ejecución idénticos y nueve PDF instalados verificados por hash. Web/portal saludables; comprobación pública EN/PT/ES y tipografías correctas.
- [x] SQLite íntegro, cero errores FK; ocho tablas financieras comprobadas y 59 archivos privados conservados. Backup previo verificado en copia aislada. Dos ciclos automáticos posteriores sin fallos; verificaciones del VPS aprobadas.
- [x] Chromium en producción: web EN/PT y login en 390/1440, sin desbordamiento ni errores en la ejecución final. Se conserva evidencia del 502 transitorio inicial y su repetición completa correcta.
- [x] Caché de construcción Docker a 0 B, 6,812 GB liberados; imágenes/volúmenes conservados y watchers/timers activos.
- Límites: no se repite ni se atribuye una nueva aprobación del recorrido funcional de 32 pasos a esta renovación visual; cobertura histórica de backups aún parcial (13/30 días). [Recibo del despliegue](docs/PRODUCTION_DEPLOYMENT_2026-09-22_INTERFACE.md).

## 2026-09-22 — Menor densidad y paneles desplegables

- [x] Tipografía/espaciado compartidos, filtros secundarios, tareas financieras, acciones de proyecto e historiales agrupados; valores, validación, impresión y permisos conservados.
- [x] 64 casos responsive en 360/390/768/1440; 187 unidades focalizadas; 4 pruebas de seguridad de manuales; tipos/lint; revisión independiente. Regresión posterior 13 casos aprobados y último ajuste visual 5 casos aprobados con capturas finales.
- [x] 112 capturas, 196 comprobaciones y 9 PDF regenerados y verificados. Producción activada 11:33:26 Madrid, release `0ba62783814a…`: 594 archivos de ejecución y nueve PDF coincidentes.
- [x] SQLite íntegro, cero errores FK, ocho tablas históricas y 59 archivos conservados; respaldo previo y dos ciclos automáticos verificados. Segunda comprobación pública móvil/escritorio sin errores; 502 puntual inicial documentado.
- [x] Caché Docker 0 B tras liberar 6,861 GB; imágenes/volúmenes conservados; timers/watchers activos.
- Límites: aceptación completa de 32 pasos no repetida; cobertura histórica de respaldo 14/30 días. [Recibo y alcance](docs/PRODUCTION_DEPLOYMENT_2026-09-22_PORTAL_DENSITY.md).

## 2026-09-22 — Publicación Git y comprobación operativa

- [x] Renovación completa publicada en GitHub como `eb80da4`; ZIP de ese commit desplegado, 2.140 archivos extraídos idénticos. Integridad SQLite, ocho tablas históricas y 59 archivos privados conservados; nueve PDF instalados verificados.
- [x] Reproducción de 502 durante readiness documentada. Mitigación acotada de reutilización de conexiones Caddy/Node, configuración completa validada y revisión independiente sin bloqueo; seis páginas y nueve solicitudes concurrentes posteriores correctas. No se atribuye resolución de la latencia de readiness.
- [x] Nueva vinculación de manuales a la configuración final: 112 capturas, 196 comprobaciones y nueve PDF verificados; resumen de fuente `89b84e99ba4817e04bcb267836fa829df7456864b480f90fdea478ae5cbcff93`.
- [x] SMTP/STARTTLS/SMTPS/IMAPS y dos webmails verificados, sin autenticación ni envío de correo. Se conservan advertencias anteriores de PhishTank/DNSSEC-DANE; no se declara ausencia absoluta de errores.
- [x] Commit `ef1e6a0` desplegado a las 12:44:29 Madrid; 2.154 archivos idénticos al ZIP, nueve PDF instalados correctos, seis páginas públicas y dos ciclos automáticos aprobados. Respaldo íntegro con 59 documentos; cobertura histórica aún 14/30 días.
- [x] Caché Docker a 0 B tras liberar 9.57GB; imágenes y volúmenes conservados. Correo, Caddy, contenedores, timers y bind de música activos. [Evidencia de publicación](docs/evidence/github-release-20260922/README.md).

## 2026-09-22 — Intervalos reales y filtros/selectores del portal (CORE-04, UI_PLAN)

- [x] Fecha actual por defecto, inicio/fin locales del proyecto, pausa opcional y duración neta calculada. Edición, proveedor y payload offline conservan los campos canónicos; sin migración ni horas inventadas para registros antiguos.
- [x] Intervalos en nuevos informes web/PDF/CSV y extractos autorizados; retratos finalizados, importes exactos, privacidad y artefactos históricos preservados. Selecciones Vitest de 63/63 y 20/20; revisión independiente con 71 casos y dictamen SHIP.
- [x] Búsqueda integrada en selectores, filtros activos legibles, reinicio coherente, estados sin coincidencias y filtros de informes que respetan rol y listado. Casos nuevos aprobados en 360/390/768/1440 px; recorridos finales Owner 12/12. Se conservan los fallos iniciales y correcciones de pruebas en la evidencia.
- [x] Tipos, ESLint y diffcheck aprobados; Svelte-check: cero errores y avisos. Fuente publicada: `2c67713`.
- [x] Captura final en fixture limpio: 116 imágenes y 202 comprobaciones; nueve PDF activos regenerados y verificados, con fuentes incrustadas y digest de fuente coincidente.
- [x] Commit `955f748` desplegado a las 14:53:40 Madrid: 2.227 archivos idénticos al ZIP, nueve PDF verificados, integridad SQLite/FK correctas, ocho tablas históricas y 59 archivos privados conservados. Navegación pública y dos ciclos jobs aprobados; respaldo íntegro (cobertura histórica aún 14/30 días). Correo/TLS y webmails correctos, PID sin reinicio. Caché de construcción Docker a 0 B tras recuperar 6,858 GB; imágenes, volúmenes y datos preservados.
- Evidencia: [intervalos e interfaz](docs/evidence/time-interval-20260922/README.md). No sustituye la aceptación completa de 32 pasos ni los pendientes externos históricos.

## 2026-09-22 — Ejemplos completos de exportación y legibilidad (CORE-13)

- [x] Inventario de generadores reales: cinco plantillas de factura, períodos cliente/interno, informes diarios/técnicos, liquidación propia, paquete contable, gastos, revisión económica, cobros, proveedor y cierre. Datos sintéticos aislados; sin lectura de registros de producción para crear ejemplos.
- [x] Tablas y resúmenes PDF más legibles, Excel con cabeceras y tipos monetarios/fechas, precisión de valores grandes conservada. Resumen de cierre paginado sin recortar entradas; Unicode fuera de WinAnsi explícito y conservado en JSON/copia del PDF.
- [x] Versiones por familia, rechazo de trabajos obsoletos antes de escribir, recuperación versionada y conservación de artefactos finalizados. Pruebas de ciclo de vida, privacidad y dinero exacto aprobadas; revisión independiente SHIP sin P0/P1/P2 pendientes. Corrección probada de 450 minutos → 7,50 horas en el PDF contable.
- [x] Galería local probada a 390/1440 px; filtros de formato/idioma/búsqueda correctos. 30 impresiones reales del navegador, con detalle cliente/interno y 3 idiomas, verificadas en fixture desechable.
- [x] Colección de 86 archivos: 64 PDF (30 impresiones del navegador), 6 XLSX, 13 CSV, 1 JSON y 2 ZIP. Nueve manuales regenerados con 116 capturas/202 comprobaciones vinculadas a `5b65dfd`; generación final de navegador 2/2 aprobada.
- [x] Commit `1d730f3` desplegado a las 16:28:05 Madrid: 2.441 archivos del ZIP y 601 de ejecución coincidentes; nueve PDF instalados correctos. SQLite/FK, ocho tablas históricas y 59 archivos privados conservados; dos ciclos automáticos, respaldo, navegador público y correo/TLS verificados. Caché Docker 0 B tras recuperar 6.854GB. Los timeouts transitorios de readiness y los pendientes históricos quedan documentados en [la evidencia](docs/evidence/manual-examples-20260922/README.md).

## 2026-09-22 — Navegación y revisión integral de textos (UI_PLAN, CORE-04, CORE-13)

- [x] Buscador de secciones por rol con Ctrl/⌘ K, fechas rápidas, filtros eliminables individualmente y navegación semanal. 24/24 pruebas de teclado, accesibilidad y presentación en 360/390/768/1440 px.
- [x] Catálogo de 2.739 claves por idioma y 754 textos de la web por idioma revisados. Estados condicionales, avisos, terminología económica y de horas, variantes BCP47 y opciones dinámicas corregidos. Selección i18n 105/105; seguimiento de etiquetas dinámicas 23/23 (selecciones solapadas).
- [x] Navegador: 105 rutas para siete perfiles/EN/ES/PT-BR y 78 visitas adicionales a listados y detalles ES/PT, sin restos ingleses conocidos. Captura final comprueba categorías, detalle de viaje y título técnico en los tres idiomas. Revisión independiente SHIP.
- [x] Typecheck, Svelte-check (0 errores/avisos), ESLint, formato y diffcheck aprobados. Fuente de ejecución final: `767d1f9`; sin migraciones ni cambios en cálculos, permisos o datos históricos.
- [x] Nueve manuales regenerados desde 142 capturas y 239 comprobaciones; la guía española incluye pantallas españolas. PDF, fuentes incrustadas, imágenes, texto y hashes verificados. Índices sin numeración duplicada.
- [x] Colección regenerada de 86 ejemplos: 64 PDF (30 impresiones reales), 6 XLSX, 13 CSV, 1 JSON y 2 ZIP. Galería probada a 390/1440 px, con filtros y descargas portátiles.
- Evidencia y comprobaciones posteriores al despliegue: [navegación y traducciones](docs/evidence/workspace-ux-20260922/README.md). Esta revisión no sustituye la aceptación contractual de 32 pasos ni cierra los pendientes externos históricos.

- [x] Commit `d7fbd72` desplegado a las 17:49:09 Madrid: 2.538 archivos del ZIP y 604 de ejecución coincidentes, nueve PDF instalados verificados, SQLite/FK correctas, ocho tablas históricas y 59 archivos privados conservados. Doce páginas públicas, dos ciclos automáticos y respaldo íntegro aprobados; historial de backups aún 14/30 días. Caché Docker a 0 B tras recuperar 6.88GB; imágenes y volúmenes preservados. Servicios y contenedores ajenos conservados.

## 2026-09-22 — Agenda, formularios resistentes y bandeja de actividad (CORE-04/06/07, UI_PLAN)

- [x] Agenda del trabajador con todas las asignaciones del día UTC, turnos nocturnos y próximos trabajos; enlaces autorizados y estado vacío explícito.
- [x] Gastos e informes conservan valores/adjuntos ante fallos, muestran validación localizada y evitan dobles envíos. Horas, gastos e informes protegen cambios sin guardar al cerrar, volver o recargar.
- [x] Bandeja con filtros Todas/Sin leer y marcado explícito por aviso; navegación activa coherente, acceso por perfil y filtros de proyectos sin duplicados. Traducciones EN/ES/PT.
- [x] 92 casos distintos de navegador validados en 360/390/768/1440: matriz inicial 82 aprobados/10 fallos de pruebas; repetición corregida 16/16. Axe, teclado y presentación para cinco perfiles. 192 comprobaciones focalizadas, tipos, Svelte (0 errores/avisos), lint/formato y revisión independiente SHIP.
- Evidencia, alcance y recibo posterior al despliegue: [mejoras operativas](docs/evidence/operational-ux-20260922/README.md). No sustituye la aceptación contractual de 32 pasos ni modifica sus pendientes externos. Manuales existentes conservados; esta entrega no incluye su regeneración.

- [x] Snapshot `0721986d94ba…` desplegado a las 23:51:05 Madrid, release `b30ae7b55a3f…`. 2.266 archivos del manifiesto y 604 fuentes de ejecución comprobados; navegador público 12/12. SQLite/FK, ocho tablas financieras y 59 archivos privados conservados; respaldo verificado y 17 ciclos automáticos sin fallos. Doce contenedores ajenos/PID de Caddy conservados y timers activos. Arranque frío inicial y cobertura histórica de respaldo 14/30 documentados.

## 2026-09-23 — Cierre de UX operativa y manuales

- [x] Horas conserva valores y tiempos ante errores/desconexión, bloquea dobles envíos y comparte validación localizada. Resumen de errores coherente al corregir campos y reset; buscar en un selector no genera cambios ficticios.
- [x] Listados conservan preferencias separadas por usuario/proyecto/URL y revelan el registro autorizado solicitado, sin alterar el orden de listas controladas.
- [x] Matriz final 65/65 casos aplicables aprobados: 64 recorridos en 360/390/768/1440 y una captura integral; tres exclusiones solo para repetir la captura fuera de escritorio. 63 pruebas focalizadas; tipos, Svelte, lint/formato y revisiones correctos.
- [x] Nueve PDF actuales regenerados desde 153 capturas/261 comprobaciones, con hashes, fuentes, imágenes y texto verificados. Instrucciones de agenda, bandeja y recuperación actualizadas.
- Recibo de despliegue y limpieza: [evidencia de cierre](docs/evidence/operational-ux-followup-20260922/README.md). No sustituye la aceptación contractual completa ni cierra pendientes externos históricos.
- [x] Release `97502e4a6676…` activada el 23/09 a las 08:51:52 Madrid: 2.365 archivos de manifiesto y 604 fuentes de ejecución verificados. Navegador público 12/12; web/portal saludables; 3.288 ciclos jobs sin fallos. SQLite/FK, ocho tablas financieras y 59 archivos privados conservados; respaldo aislado correcto. Caddy, cinco units y doce contenedores ajenos preservados.
- [x] Caché exacta de la compilación: 50 registros sin uso/compartición eliminados, 6,941 GB recuperados y 14,41 GB libres. Imágenes, contenedores, volúmenes, releases y datos sin cambios; no se ejecutó limpieza global.

## 2026-09-25 — Auditoría real de navegador y correcciones pendientes de despliegue

- [x] Cuatro subagentes usaron Chromium con cuentas de prueba en producción y registraron pasos reproducibles, capturas y resultados para planificación, facturación, gastos, proveedor, documentos, notificaciones, Ayuda y permisos. Los nuevos registros quedaron limitados al proyecto QA sintético. [Informe y límites](docs/evidence/browser-swarm-20260925.md).
- [x] Código local: enlace y edición/cancelación de planificación para PM; contacto comercial limitado al cliente; flujos de facturación activos y errores útiles; créditos separados de cobros; gastos no aprobados fuera de la cola de reembolso; gestión de borradores delegados de Crew/proveedor; correcciones de tiempo sin doble suma; tamaños y archivo de documentos; aviso de idioma real en Ayuda.
- [x] Tipos de todos los paquetes correctos; pruebas focalizadas de planificación, Crew, cliente, proveedor y facturación ejecutadas. La repetición de 3 casos de facturación sensibles a contacto, periodicidad y fecha local pasó 3/3.
- [x] Matriz local de navegador: 27 recorridos aprobados y 13 exclusiones previstas en 360/390/768/1440 px; planificación con error corregible, Crew, enlaces de proyecto, configuración comercial y Ayuda. Build del portal, tipos y lint focalizado correctos.
- [x] Repetición real en Chromium de IMPC Gmbh: proyecto creado con cliente correcto en móvil 390 y escritorio 1440 (2/2); hito creado por Owner y visible sin enlace de gestión no autorizado para Finanzas y Auditoría (1/1). Aislamiento sin conexión entre usuarios 2/2. Migraciones/permisos 26/26, integridad comercial 13/13 y catálogos/inmutabilidad 21/21; `typecheck`, `svelte-check` (0 errores/avisos) y ESLint global aprobados. Revisión independiente final: SHIP.
- [ ] Formato global: el repositorio aún contiene 137 archivos históricos fuera de Prettier, principalmente documentación y pruebas no modificadas en esta auditoría. Todos los archivos TS, Svelte y CSS modificados en esta corrección pasan Prettier por separado; no se acredita `format:check` global.
- [ ] Regresiones generales, migración de copia de producción y despliegue con verificación posterior. Los cambios de esta sección **todavía no acreditan el comportamiento de producción**.

## 2026-09-25 — Seguimiento de horas, gastos, facturación y recuperación de errores

- [x] Auditoría con Chromium real y Playwright MCP/CDP sobre una base de datos sintética aislada: formulario de horas y fecha siguiente, gasto sin proveedor y USD modificable, descripciones Perdiem/Only hours, tabla semanal, envío semanal con comida vinculada, calendario de propietario, pestaña de gastos de aprobaciones, factura sin perfil fiscal y XLSX con importes de gastos. Se inspeccionaron red, consola y almacenamiento local sin conservar tokens. [Capturas y resultados](docs/evidence/feature-browser-audit-20260925/README.md).
- [x] Conflictos de cierre de cliente, asignación obsoleta y período de factura vacío: seis recorridos reales en móvil 390 y escritorio 1440, con formularios preservados, una advertencia accionable y bloqueo del borrador vacío. Revisión independiente de los cambios de alto riesgo sin bloqueo.
- [x] Revisión financiera de un gasto: dos recorridos reales móvil/escritorio; el gasto sin clasificación no avanza, el clasificado sí y una repetición obsoleta deja intactos versión y fecha de aprobación. Error de cobro con factura anulada identificado en navegador y corregido con instrucción de revisar el libro de factura.
- [x] La matriz aislada de navegador para aprobaciones, cobros y ejemplo financiero aprobó 10/10 casos; la repetición de clave de cobro aprobó 2/2.
- [ ] No se ha repetido la aceptación completa de 32 pasos ni las 180 acciones inventariadas. La producción autenticada sigue sin prueba de navegador con una cuenta real; la comprobación pública solo cubre la página de acceso. No se declara `CLIENT READY` por esta evidencia parcial.

## 2026-09-25 — Recibo del despliegue de seguimiento

- [x] El commit de aplicación `87c089abbe37c1e3f29636112e61da0136268826` se publicó en GitHub y se desplegó desde su ZIP verificado. El desplegador creó una copia de seguridad antes de la activación, compiló las imágenes, activó site/portal/jobs y aprobó salud local y URLs públicas.
- [x] La repetición aislada de Chromium aprobó 10/10 casos de aprobaciones, cobros y ejemplo financiero en móvil 390 y escritorio 1440; el conflicto de clave de cobro repetida aprobó 2/2. El ejemplo conservó exactamente su posición de desplazamiento (1746/1746/1746 px en móvil; 1470/1470/1470 px en escritorio). [Evidencia saneada](docs/evidence/error-warning-finance-billing/README.md).
- [x] Typecheck de 10 paquetes y ESLint global correctos; pruebas focalizadas de facturación/emisor 16/16 y de cierre/proveedor/notificaciones 49/49. El barrido unitario general se detuvo por consumo de recursos del VPS y no se acredita como aprobado.
- [x] Verificador VPS posterior al despliegue aprobado, site y acceso del portal HTTP 200, site/portal saludables y ciclo de jobs sin fallos. Las dos numeraciones históricas se corrigieron mediante el repositorio: Junkers `C-0020-P-004` / centro `004`, BBS Mexico `C-0020-P-001` / centro `001`; `quick_check=ok` y cero errores de claves foráneas.
- [x] Caché de construcción Docker limpiada de 6,803 GB a 0 B, con 30 GB libres. Se conservaron las imágenes necesarias, volúmenes, datos y copias de seguridad; path/timer de despliegue restaurados.
- [ ] No se repitió la aceptación completa de 32 pasos ni cada una de las 180 acciones inventariadas; la producción autenticada sigue sin prueba de navegador con credenciales reales. La evidencia de QA no autoriza declarar `CLIENT READY`.

## 2026-09-25 — Segundo despliegue de Crew y cierre

- [x] El commit `4199160e7fa5dc61d23ff27f5389a9045c29a57d` se publicó en GitHub y se desplegó desde un ZIP creado con `git archive HEAD`. Incluye conservación de formulario y desplazamiento en Crew, reinicio de confirmación de cliente obsoleta y los campos de estado que necesita la actualización protegida del cierre. No incluye las modificaciones posteriores aún sin confirmar en proyectos e informes.
- [x] La ejecución aislada de Playwright/Chromium aprobó 4/4 casos aplicables de Crew y cierre en móvil 390 y escritorio 1440; hubo dos omisiones intencionales por proyecto de navegador. Se verificaron botones, formularios, respuestas HTTP, controles de rol, foco y desplazamiento. [Evidencia de Crew](docs/evidence/error-warning-supplier-crew/README.md) y [evidencia de cierre](docs/evidence/error-warning-finance-billing/README.md).
- [x] El verificador VPS posterior aprobó, site y acceso del portal devolvieron HTTP 200, site/portal están saludables, y el ciclo de jobs informó cero fallos. El ZIP watcher y timer quedaron activos. Se borró la caché de construcción Docker y dos generaciones anteriores de imágenes J&A; se conservaron la imagen actual y la reversión inmediata. El disco quedó con 31 GB libres.
- [ ] La aceptación completa de 32 pasos, las 180 acciones inventariadas y la navegación autenticada en producción siguen pendientes; no se declara `CLIENT READY`.

## 2026-09-26 — Candidato de recuperación y configuración de facturación

- [x] Chromium sobre SQLite aislada completó los pasos funcionales 1–29 y 32 de la aceptación Client Essential (30/32); los pasos 30–31 quedaron bloqueados por falta de evidencia operativa externa vigente, no por un fallo de formulario. El flujo cubrió Owner, Worker, PM y Finance, además de 360/390/768/1440 px en el paso 29. [Recibo y hashes](docs/evidence/browser-release-20260926/README.md).
- [x] El navegador descubrió y verificó las correcciones de proyecto (dos guardados sucesivos), pestaña de aprobaciones persistente, perfil fiscal activo seleccionable, conservación de la pestaña de configuración y recuperación del porcentaje fiscal 7,5 % / 750 puntos básicos tras un POST nativo fallido y reintento exitoso. El perfil fiscal sigue siendo opcional para el flujo de gastos.
- [x] Typecheck de los diez paquetes y ESLint global aprobados; pruebas focalizadas de acciones, migraciones y recuperación 285/285, regresiones UI 33/33, y validación fiscal 30/30. El conjunto general secuencial sigue en ejecución y se documentará con su resultado exacto.
- [ ] Commit, publicación en GitHub, despliegue de este candidato, comprobación de producción y evidencia operativa fresca para completar los pasos 30–31. Esta sección todavía no declara `CLIENT READY`.

## 2026-09-29 — Auditoría autenticada del despliegue y seguimiento de UX

- [x] Chromium/Playwright MCP y CDP en la aplicación desplegada con siete perfiles: Owner, Finanzas, PM, Auditoría, Worker, Supplier y Technician. 304 comprobaciones de ruta/anchura; 300 rutas disponibles HTTP 200 y cuatro rutas Notifications ajenas al menú de Supplier/Technician excluidas. Formularios reales, descargas y estados comprobados; registros nuevos limitados a QA sintético. [Alcance, resultados y límites](docs/evidence/live-browser-audit-20260929/README.md).
- [x] Confirmados en navegador: proveedor vacío, fechas futuras, horas decimales, fecha siguiente, tabla/calendario Owner, envío semanal de horas/comidas vinculadas sin enviar aparcamiento independiente, sufijo de centro de coste, perfil fiscal opcional y emisor J&A USD predeterminado. XLSX de fixture descargado mediante UI: 12 gastos de factura / 850,00 USD, coincidentes con sus filas fuente. Perdiem configurable y editable probado en fixture aislado.
- [x] Candidato: conservación de pestañas/filtros de aprobaciones y facturación, semana de siete días con filtros y formulario nativo, orden explícito de URL, etiqueta de proveedor opcional, resumen fiscal/emisor traducido, rol Auditor correcto y eliminación de directorios/formularios duplicados en Projects. Tipos y lint focalizados; 30 regresiones, 7 unidades y 11 comprobaciones de defaults/XLSX aprobadas.
- [x] Correo inválido conserva atributos accesibles, mensaje asociado y foco en el campo; SVG decorativo coherente y contraste corregido en menú/calendario. Matriz ampliada de 172 casos: 94 aprobados inicialmente, 57 exclusiones previstas y 21 fallos corregidos; repeticiones 18/21 y 3/3 completan 115 casos aplicables aprobados. Tipos de diez paquetes, ESLint global, Prettier de 57 archivos modificados y builds site/portal/jobs correctos.
- [x] Revisiones independientes SHIP para aplicación y corrección operativa; commits publicados. Release `d7e998d64774…`, ZIP `0aa32d902b42…`, activado el 29/09 a las 23:39:24 Madrid: 4.225 hashes verificados, respaldo aislado íntegro y tres días de manifiestos disponibles. Chromium autenticado posterior 19/19 para siete perfiles, sin excepciones, HTTP fallidos ni desbordamiento. SQLite/FK correctos, ocho tablas financieras y dos archivos privados preservados; doce contenedores ajenos y PID Caddy conservados, timers restaurados. Fallo previo de retención resuelto manteniendo respaldo y rollback; ocho pruebas operativas aprobadas. Cache de build sin uso eliminada: 9,657 GB recuperados, 16 GB libres.
- [ ] No se acredita repetición universal de 180 acciones ni de los 32 pasos contractuales en esta auditoría. Las limitaciones y el estrés de rate limiting se describen en la evidencia; no se declara `CLIENT READY` únicamente por este seguimiento.

## 2026-09-30 — Auditoría de acciones mediante UI, segunda ronda en curso

- [x] Todos los nuevos datos de negocio de esta ronda creados mediante formularios visibles del navegador sobre una copia aislada; sin SQL, helpers ni POST directos para preparar registros. Invitación enviada por outbox HTTPS y SMTP reales a Mailpit aislado, abierta desde correo, activada y acceso posterior aprobado. [Método y evidencia](docs/evidence/browser-ui-action-audit-20260930/README.md).
- [x] 58 comprobaciones UI distintas aprobadas en ejecuciones separadas: 24 de búsqueda/contexto, restauración, fechas de retirada, botones Log time/Record expense y retirada de expertise en 360/390/768/1440; tres idiomas de recuperación de invitación con activación real y uso único; cuatro fechas de informe técnico, un ciclo MFA, cuatro límites de fechas Supplier y cuatro precedencias de búsqueda financiera y 18 estados de finalización Accounting (tres roles/tres idiomas/dos anchuras) (sin contar dos veces la repetición móvil). Confirmaciones de UI, foco, conservación de datos, HTTP y persistencia tras recarga.
- [x] Worker: envío semanal incluye horas/comidas vinculadas y conserva aparcamiento Draft; PM: devolución, corrección, reenvío y aprobación, rechazo operativo con motivo; Technician: adjuntos únicos, hashes, envío y PDF asíncrono; Owner: catálogo, notificaciones y cambios de rol/sesiones. Filtros de facturación verificados sin JavaScript y mediante navegación hidratada; notificaciones de otro usuario denegadas a Worker/Auditor.
- [x] MFA opcional de cuenta con contraseña corregido y ciclo UI completo aprobado, incluidos recuperación de un solo uso, desactivación y nueva alta. Passkey: alta, acceso y revocación mediante UI/CDP con origen válido. Revisión independiente SHIP del lote y 39/39 pruebas puras/mock; fixtures con inserción de negocio no ejecutados. Supplier: técnico futuro creado por UI, selección limitada a fechas autorizadas y guardado/recarga en cuatro anchuras. Finanzas: aviso de revisión comercial pendiente y horas exactas corregidos.
- [ ] Facturas: emisión, PDF, correo real capturado con hash coincidente y cobro total aprobados; reversión completa y par de un céntimo aprobados tras actualización automática; quince descargas de Accounting Pack coinciden entre Owner/Finanzas/Auditoría. Gastos de factura poblados, crédito/void y restantes acciones Crew siguen en curso. La matriz conserva los pendientes y no acredita cobertura universal.
- [x] Revisión final independiente SHIP del lote completo, 59/59 casos puros/mock en seis archivos; typecheck de diez paquetes, ESLint global, formato y diff correctos. Builds website/portal/jobs aprobados; portal compilado: ocho medidas/aperturas de botones y diez comprobaciones de búsqueda/Accounting aprobadas.
- [x] Commit de aplicación `6189979bbac6…` publicado y desplegado el 30/09 a las 02:50:46 Madrid desde ZIP `d9c84dd76452…` con 4.246 entradas verificadas. Producción autenticada 19/19 para siete roles y ocho comprobaciones de botones en cuatro anchuras aprobadas; sin excepciones, respuestas fallidas ni desbordamiento. Verificador VPS/jobs y respaldo íntegro aprobados: tres documentos, cero errores FK y tres días de manifiestos. Ocho tablas financieras, tres archivos privados, doce contenedores ajenos y PID Caddy conservados; timers restaurados. Caché de build sin uso eliminada: 6,896 GB recuperados. No se declara CLIENT READY ni cobertura universal a partir de esta evidencia parcial.

## 2026-09-30 — Continuación: categorías, Supplier y navegación de proyecto

- [x] Commit `050a3f2`: categorías canónicas compartidas entre gastos/políticas, fechas obligatorias acotadas para asignaciones finitas, lookup de descripción Supplier con grant vivo y sincronización del panel/tab/URL. Revisión independiente SHIP, 77 pruebas puras/mock, typecheck global y ESLint aprobados. Suite de autor 8/8; navegador independiente 16/16 para Owner/Finanzas/Auditor/PM en 360/390/768/1440, con clics repetidos, recarga, atrás/adelante y teclado. Sin reescritura de políticas/historial ni datos mock por código.
- [x] Factura de gastos emitida por UI por USD 3,61, sin perfil fiscal, correo ni pago; PDF listo y descargado. Owner y Finanzas exportaron XLSX idéntico con Expenses/Invoices/Invoice expenses poblados y reconciliados a 111 + 250 unidades menores. Aparcamiento Rejected permanece excluido; no se modificó la guarda de facturación.
- [x] Supplier: gasto/adjunto/edición/envío/aprobación PM, eliminación de Draft propio, filtros operativos y denegación de Finance/Billing sin datos. Técnico: búsqueda visible del encabezado enviada dentro de su ámbito. Owner: proyecto/hito nuevos por UI, importe decimal creado/editado, confirmación requerida con foco y conservación, envío por PM sin campos comerciales.
- [x] Builds portal/jobs/website aprobados; suites independientes del portal compilado: 8/8 políticas/pestañas y 6/6 copy de creación/edición EN/ES/PT. SVG decorativo compartido en 29 enlaces, razones/confirmaciones correctas al crear frente a editar; revisión independiente SHIP y 36 pruebas puras/mock.
- [x] Crédito sintético de USD 0,01 creado/aprobado/emitido por Finanzas y PDF listo descargado. Owner anuló únicamente la factura laboral sintética con cobros netos cero; cobros/reversiones e instantáneas/PDF originales permanecen íntegros.
- [x] Continuación publicada: commit `f5fbf7812aec…`, ZIP `d5cef8630a05…`, 4.252 entradas verificadas, despliegue 30/09 a las 04:24:22 Madrid. Producción 19/19 siete roles y ocho comprobaciones de botones aprobadas; verificador VPS/jobs y respaldo íntegro correctos. Ocho tablas financieras, tres documentos y quince contenedores fuera del despliegue gestionado conservados; Caddy sin cambio de PID. Caché sin uso eliminada: 6,897 GB. Watcher/timer activos y habilitados.
- [x] Recuperación de foco y control Void Owner: revisión independiente SHIP, diez casos del portal compilado y pruebas reales POST400 EN/ES/PT correctos; búsqueda global no disponible omitida para perfiles restringidos, filtros locales y teclado conservados. La ausencia inicial de proyecto nuevo correspondía a fecha civil New York todavía anterior al inicio, no caché de sesión.
- [ ] Aviso de clasificación pendiente, variantes de factura y demás ciclos siguen en las matrices privadas. No se acredita cobertura universal ni CLIENT READY.

## 2026-09-30 — Clasificación de gastos y moneda verificada

- [x] Aviso Owner/Finanzas para gasto aprobado con clasificación explícitamente requerida; enlace exacto conserva proyecto/gasto/idioma y revela el registro autorizado pese a filtros guardados incompatibles. Moneda extranjera sin conversión verificada ya no etiqueta el importe fuente como moneda del proyecto; explicación legible en móvil. Sin cambios de cálculo, DTO, decisiones comerciales ni datos de negocio.
- [x] Revisión independiente SHIP; navegador de fuente 16/16 y portal de producción compilado 16/16 en EN/ES/PT, 390/1440, sin POST ni excepciones. Filtros, recarga, atrás/adelante, privacidad Supplier/PM, Worker autenticado 403, fallback de igual moneda y texto móvil comprobados. Build portal, tipos globales y lint aprobados. Publicación de este paquete pendiente.
- [x] Draft sintético mensual de gastos USD 0,23 con dos filas 0,11 + 0,12 y preview descargado para Owner/Finanzas/Auditor; periodo parcial rechazado correctamente por cadencia. PM aprobó informe de periodo de cliente, ahora Ready for signature. Sin emisión, correo, pago ni firma ficticia.
- [ ] Flujo de entrada de FX verificado no disponible; controles engañosos de edición Auditor, PDF Draft Queued y agrupación de gastos pendientes de corrección. Archivo realmente firmado pendiente de muestra QA/acceso de cliente. Las matrices conservan las acciones no probadas; no se declara cobertura universal ni CLIENT READY.

## 2026-09-30 — Controles de factura y corrección Supplier

- [x] Lote de facturación revisado SHIP: editor Draft solo Owner/Finanzas, Preview veraz sin polling previo a emisión, preferencias de agrupación conservadas sin prometer salida no implementada, siete flechas SVG y protección de marcadores históricos antes de actualizar. Fallos conservan valores/foco/errores locales, sin imprimir cambios no guardados. Fuente y compilado 18/18 cada uno: doce casos reales de lectura y seis fallos interceptados sin enviar; 77 pruebas focalizadas. Rechazo histórico probado mediante mocks, no factura histórica fabricada.
- [x] Corrección Supplier: fallo real del formulario sin campos operativos corregido; revisión detectó y cerró precedencia incorrecta de minutos ocultos. Revisión final SHIP, 47 mocks independientes y 84 pruebas focalizadas del autor. Cuatro anchuras y error de horas conservado/focalizado. Luna en compilado creó 0,50 h, editó a 0,75 h y envió una sola vez, tres POST200 con GET frescos; original 0,25 h conservado/superseded, historial/enlace comprobado por Owner. Sin aprobación ni efectos financieros; PM excluido por diseño.
- [x] Build portal/jobs, tipos globales y lint aprobados; dieciséis casos de gastos compilados también aprobados. Ocho tablas financieras y 33 archivos privados existentes conservados; SQLite OK/FK cero. Perfil fiscal QA sin referencias creado y confirmado mediante UI.
- [ ] Publicación de estos lotes pendiente. Accounting septiembre rechazado por FX no verificado (409, ningún pack/job nuevo); aviso promete control de conversión inexistente y requiere guía veraz. Registro fiscal omite fechas/tipos/rename/archive; trabajo UX en definición. Firma genuina pendiente y matrices no universales; no CLIENT READY.

## 2026-09-30 — Guía Accounting e idioma móvil

- [x] Aviso FX explica importes verificados necesarios y control de conversión actualmente no disponible, sin prometer éxito; código/409/contexto/enlace/guardia conservados. Select nativo EN/ES/PT-BR legible en teléfono, nombres accesibles completos/localizados y dos flechas externas SVG.
- [x] Fuente: seis conflictos reales EN/ES/PT 390/1440 y doce casos de idioma/teclado/AX en cuatro anchuras sin POST; registro/IDs de packs sin cambios después de cada rechazo. Una sonda previa separada; ocho errores iniciales del harness AX conservados y repetición final 12/12 sin nuevos intentos de pack. Pruebas focalizadas 24/24.
- [x] Revisión final SHIP con hashes iguales; portal de producción compilado 18/18 sin skip/flaky/fallos imprevistos, seis conflictos reales adicionales y doce controles de idioma sin POST. Tipos/lint globales aprobados; ocho tablas financieras y 33 hashes de archivos privados intactos, SQLite OK/FK cero.
- [x] Luna revalidó producción: ambos botones Worker 88 px y estilo/padding equivalente, ancho completo móvil, abrir/cancelar cuatro anchuras sin POST/error; búsqueda financiera omitida Supplier/Technician con filtros operativos conservados.
- [ ] Publicación pendiente. Conversión verificada/pack no vacío y firma genuina siguen abiertos; no cobertura universal ni CLIENT READY.

## 2026-09-30 — Publicación de lotes de seguimiento

- [x] Aplicación `b2d3a5e929bd…` publicada en GitHub y activada 30/09 06:54:50 Madrid; ZIP `5cd0d7ed1f8e…`, 4.258 hashes. Incluye clasificación/moneda, factura/historia, corrección Supplier, aviso Accounting/idioma/SVG.
- [x] Chromium de producción: 19/19 para siete roles, 12/12 idioma cuatro anchuras y 8/8 abrir/cancelar Worker, sin POST de negocio, excepciones ni HTTP fallidos. VPS/jobs/readiness y respaldo reales aprobados. Ocho tablas financieras, tres archivos privados, quince contenedores ajenos y PID Caddy conservados. Integridad/FK OK y tres días de manifiestos; watchers/timers activos/habilitados.
- [x] Caché de builder sin uso eliminada: 7,021 GB. Imágenes/volúmenes/datos/rollback/drafts offline preservados; headers y fetch network-first verificados. No se afirma borrar almacenes de todos los navegadores.
- [ ] Auditoría universal sigue incompleta: registro fiscal sin detalles/rename/archive, entrada FX verificada inexistente, pack no vacío bloqueado y firma genuina pendiente. Auditor sin configuración fiscal por diseño. No CLIENT READY.

## 2026-09-30 — Perfil fiscal y recuperación segura

- [x] Lote once archivos revisado SHIP: fecha/moneda/emisor/estado y componentes exactos ordenados para Owner/Finanzas; DTO Auditor original y Setup ausente conservados. Rename solo nombre/Archive existentes con confirmación; tasas/fechas/moneda e historial intactos, dependencia aprobada y reemplazo explícito explicados. Recuperación conserva nombre/foco, refresca lectura una vez si perfil no disponible y elimina reintentos imposibles; sin refrescar datos protegidos tras 403. Cinco flechas de semana/revisión SVG.
- [x] Fuente 18/18: 36 contextos reales de lectura sin POST, 18 fallos interceptados no enviados y tres adicionales de bookkeeping; 36 pruebas puras/mock y cuatro anchuras de glyphs. Error500 transitorio de edición corregido/conservado; screenshots de matriz fuente borrados por rerun final, JSON e imágenes revisadas EN390 disponibles; compilado generará artefactos independientes. Build portal aprobado.
- [x] Worker autenticado denegado en XLSX contable ajeno con 404 oculto/JSON, ningún byte de artefacto. Ocho imágenes antiguas J&A sin uso retiradas por tags específicos; referencias de todos los contenedores/current/rollback/una versión sana adicional preservadas; 16 GB libres, sin prune global ni tocar datos/volúmenes.
- [x] Tipos/lint globales y compilado 18/18 sin skip/flaky/fallos imprevistos; 90 screenshots nuevos conservados en carpeta independiente. Cuatro anchuras SVG de semana/revisión compiladas también aprobadas sin POST/error.
- [x] Ciclos UI reales: Owner rename/Finanzas archive del perfil original; Finanzas create/rename y Owner archive del segundo perfil QA sin referencias. Create conserva toast/GET pero no estado POST; primer rename Owner duplicado tras fallo selector GET, ambos POST200/audits conservados, una acción cubierta, versión1→4 correcta. Componentes exactos/metadatos, ocho tablas financieras y33 archivos privados preservados; SQLiteOK/FK0.
- [ ] Publicación pendiente. Entrada FX/firma genuina y acciones no demostradas permanecen abiertas; no CLIENT READY.

## 2026-09-30 — Publicación controles fiscales

- [x] Aplicación `21dfee6394f2…` publicada/activada 30/09 08:16:55 Madrid, ZIP `4ff6ae10c621…` y4.263 hashes; rollback inmediato `b2d3a5e929bd` conservado.
- [x] Chromium vivo19/19 siete roles, idioma12/12 y botones8/8 sin POST de negocio/error/HTTPfallido; VPS/jobs/salud/backupOK/FK0/tres documentos/tres días aprobados. Ocho tablas financieras, tres archivos privados, quince contenedores ajenos y PIDCaddy intactos; watchers/timers activos/habilitados. Buildercache sin uso7,018GB eliminado; datos/volúmenes/imágenes/drafts offline preservados y headers/network-first verificados.
- [ ] Anchos desktop de Log time/Record expense todavía difieren por etiqueta; ajuste CSS común y prueba cuatro anchuras/ENESPT en curso. Auditoría universal, FX verificado y firma genuina continúan abiertos; no CLIENT READY.

## 2026-09-30 — Botones iguales en todas las anchuras

- [x] CSS común Log time/Record expense:320px desde768 y ancho completo móvil; wrapping/foco/labels/colores/handlers/roles conservados. Conflicto inicial de especificidad móvil corregido antes de publicación; revisión independiente SHIP.
- [x] Fuente y compilado independientes:28 medidas/14 pares cada etapa; Worker24 controles ENESPT cuatro anchuras abrir/cancelar y Owner4 EN390/1440 solo medidas. Todos88px alto,328/358 móvil y320 tablet/desktop; fuente/padding iguales, sin recorte/overflow/POST/error/HTTPfallido. Build portal aprobado, artefactos separados preservados.
- [ ] Publicación de ancho igual pendiente; pruebas UI del stream QA sin uso en curso. Matrices no universales, FX verificado/firma genuina pendientes; no CLIENT READY.

## 2026-09-30 — Publicación botones iguales y auditoría continuada

- [x] `f92d577af41a…` publicado/activado30/09 10:38:04Madrid; ZIP `f6b564e7e57e…`,4.263 hashes y rollback21dfee conservado. Chromium vivo28 medidas/14 pares ENESPT/cuatro anchuras más19 casos siete roles:88px alto,320desktop/tablet y ancho completo móvil, sin POST de negocio/error/HTTPfallido/recorte. Un login UI Worker reconstruyó el estado temporal perdido por reboot; fallos iniciales del harness conservados aparte.
- [x] VPS/jobs/salud/backupOK/FK0/tres documentos/tres días; ocho tablas financieras/tres archivos privados/quince contenedores ajenos/PIDCaddy intactos; watchers/timers activos. Buildercache6,198GB eliminado; cuatro imágenes antiguas/ocho tags retirados específicamente, todos18 contenedores/current/rollback/versión sana adicional preservados, sin tocar datos/volúmenes/drafts offline.
- [x] Fixture UI R5: proyecto tras rechazo de código duplicado409 sin escritura; número coincide con dígitos centrocoste. Finanzas streamExpense mensualUSD sinTax/autoDraftoff→PO-onlyupdate→archive, native200/freshGET; cero personas/rates/fuentes/facturas/email/pagos.29 filas financieras y33 hashes privados intactos, SQLiteOK/FK0. Captura original de colisión sobrescrita por harness; nota/mensaje conservados sin afirmar imagen disponible.
- [x] Notificaciones propias Owner/Worker/PM filtros/detail/target sin POST; Auditor vacíos all/unread, detailN/A; no prueba ID cruzado afirmada.
- [ ] Defecto real postarchivo: tarjeta Owner diceActive aunque enabled0/version3/audits correctos; parche UI acotado en curso. Descargas de evidencia/Teamhistorial y matrices universales pendientes; FX/firma genuina abiertas, no CLIENT READY.

## 2026-09-30 — Streams archivados y navegación de lectura

- [x] Cuatro archivos UI: estado enabled real Active/Archived/Unknown, settings/historia/fechas guardadas preservados, controles/opciones draft solo activos y fallback de error conservado; backend metadataupdate intacto. Tres cadencias traducidas y Auditor View personrates hacia Finance readonly, Owner/Finanzas Configure intacto; overflow phone real corregido mediante wrapping acotado.
- [x] Fuente14/14,30 contextos reales, ENESPT/cuatro anchuras, cero POST/error/skip/flaky; wizard3/3 abrir/cerrar sin opción archivada ni POST. Revisión SHIP con cuatro hashes iguales/imágenes móviles inspeccionadas; fallos iniciales/interrupciones/timing harness conservados. Build portal/tipos/lint globales aprobados.
- [x] Luna Team8 casos Owner/Worker/PM/Auditor390/1440 mantiene tab/URL/reload/Back/Forward; descarga UI exacta84bytes por Owner/PM/Worker hash igual, Auditor sin Reports/Documents N/A. Descarga inicial PDF ajeno por locator amplio corregida, copia local retirada sin mutar documento; no guardia ID-notificación cruzada afirmada.
- [x] Compilado independiente14/14,30 contextos y wizard3/3 sin POST/error/skip/flaky; imágenes PT390/ES390 inspeccionadas.29 filas/ocho hashes financieros y33 archivos iguales, SQLiteOK/FK0, cuatro hashes fuente revisados intactos.
- [ ] Publicación pendiente. Finance246 filas19PASS1N/A1FAIL225UNTESTED y Operations59 filas48PASS1FAIL10N/A separados; no cobertura universal. FX verificado/pack no vacío/firma genuina pendientes, no CLIENT READY.

## 2026-09-30 — Publicación streams archivados

- [x] d1ccd266db69 publicado/activado30/09 11:37:38Madrid; ZIP e85e6d4b162a y4.264 hashes/commit activos verificados, rollback f92d577 conservado. Chromium producción19/19 siete roles sin error/HTTPfallido; fixtureR5 compilado14 no repetido contra datos inexistentes producción.
- [x] VPS/jobs/salud/backupOK/FK0/tres docs/tres días; ocho hashes financieros/tres archivos/quince contenedores ajenos/PIDCaddy912 intactos, watchers activos/habilitados. Buildercache6,943GB retirado, imágenes/current/rollback/volúmenes/datos/drafts intactos; headers/network-first verificados.
- [x] Dos defectos de presentación registrados FIXED por compilado: Finance246 filas19PASS1N/A1FIXED225UNTESTED; cicloFinance69 filas59PASS6N/A1FIXED2UNTESTED1BLOCKED; Operations59 filas48PASS1FIXED10N/A, sin sumar como cobertura universal.
- [ ] Próximo lote browserUI-only draft diario/documentos QA en ejecución, no PASS anticipado. Auditoría universal/FX/firma genuina siguen pendientes; no CLIENT READY.


## 2026-09-30 — Inventario real de roles y recuperación de informes

- [x] Chromium producción, identidad visible de siete roles:97 estados de página,79 entradas nav,349 apariciones de formularios y1.340 botones inventariados; diez enlaces de menú de cuenta llegan a URL/heading esperado. Cero escrituras de negocio/HTTP>=400/errores console o página/overflow.26 eventos GET fallidos de datos de ruta conservados sin estado HTTP; páginas correctas. Presencia no equivale a PASS de acciones/autorización.
- [x] R6 por UI: Finance upload/download/archive documento propio105bytes; Owner93bytes download Owner/Finance y archive; hashes exactos, documentos históricos conservados, proyecto QA sin fuentes.29 filas/ocho hashes financieros y33 archivos originales intactos;35 archivos incluyen dos uploads, SQLiteOK/FK0. Worker/Auditor sin nav Documents no implica prueba de backend.
- [x] Defecto real informe: autosave200 seguido Save409 por envelope SvelteKit no decodificado. Candidato acotado conserva typing/versión propia/optimistic guard y copia diferente; Source autosave→Save, Save antes debounce y respuesta real retenida→latest typing/Save aprobados. Copia redundante exacta se elimina sin warning; contexto único y reload200 comprobados. Fallos de harness/evidencia inicial conservados. Root33/33 pruebas focales con hashes iguales.
- [ ] Conflicto remoto genuino, compilado independiente, revisión final y publicación del candidato pendientes. Cobertura completa de todas las acciones, FX verificado/pack no vacío/firma genuina permanecen abiertos; no CLIENT READY.


## 2026-09-30 — Protección de Submit/upload y compilado corregido

- [x] Source real: Owner update200→Worker staleSave409; Submit y upload ceroPOST, texto/base antiguos y archivo seleccionado conservados, freshOwner mantiene versión nueva. Warning accionable compare/copy; tres fallos previos harness cero mutaciones conservados.
- [x] Revisión independiente corregida SHIP, cuatro hashes iguales y44/44 focales. Build portal/tipos/lint corregidos aprobados; compilado cuatro casos reales autosave→Save/predebounceSave/inflightack→newtypingSave/conflictoguardaSubmitUpload aprobados. Dos GETJS/noJS readonly no son prueba de mutación.
- [x] Menú cuenta siete roles390/1440:14/14, SVG logout20px/ariahidden/focusablefalse/Escape, ceroPOST/error/overflow; directorio privado round15 corresponde a build ejecutado round16.
- [ ] Ciclo positivo UI creó un único Draft sintético, autosave200 base1→ack2 y attachment201; harness exigía200 y paró, sin fallo producto/no retry. Continuación mismo registro para download/hash/dirtySubmit y cleanup keeper pendientes antes de FIXED/publicación. Withdraw/noJSdirtymutation no demostrados; auditoría universal/FX/firma genuina siguen abiertos.

- [x] Continuación mismo Draft: download221bytes/hash exacto; autosave200 base2→nativeSubmit303 versión3, sin repeat create/upload/submit. Bodyautosave no recuperable tras navegación: fallo harness conservado, sin inventar ack decodificado. Screenshot Submitted/version4; GET-only register200/fresh200/texto final/archivo v2/SHA, selector Report summary VERSION4 aprobado. Primer selector amplio capturó v2 del attachment y falló, artefacto preservado. Fixture Submitted sintético retenido sin approve/sign/bill/pay.

- [x] Keeper propio Draft17/0archivos borrado por UI: autosave17→18 real200 retenido, una confirmación/noDelete durante hold, Delete18→200 trasack, freshregister200 fila/marker ausentes, sin errores. Submitted QA retenido. Ocho tablas/29filas y33 hashes originales intactos;36 archivos, SQLiteOK/FK0. Defecto Save registrado FIXED por evidencia compilada; Operations50PASS2FIXED10N/A62filas, sin cobertura universal. Publicación siguiente; Withdraw/noJS/FX/firma genuina pendientes.


## 2026-09-30 — Publicación recuperación de informes

- [x] Aplicación0493689edcc2 publicada; deploy completo12:17:02UTC/14:17:02Madrid, ZIP4f965cf0d885 y4.265 hashes/commit activo verificados. Rollbackd1ccd266 conservado. Readiness503 real por espacio<1GiB trasbuild; cachebuilder sin uso6,202GB retirado sin bajar threshold ni tocar datos/volúmenes/imágenes actuales/rollback, recuperación antes de completar deploy.
- [x] Chromium producción19/19 siete roles y14/14 SVGmenú, sin error/HTTPfallido; VPS/jobs/backup realOK/FK0/tres docs/tres días. Ocho hashes financieros/tres archivos/quince contenedores ajenos/PIDCaddy912 intactos, watchers activos/habilitados. Headersprivate/no-store y SWappno-cache/network-first; primer probeURLSWerróneo404 conservado, drafts locales/offline intactos. Dos imágenes antiguas/fourtags sin uso retiradas específicamente,18 referencias/current/rollback/versión sana extra intactas;8,3GB libres.
- [x] Prerequisito live Worker: Reports→Newdailyform→Cancel sin writes/errors, única asignación QA ERROR AUDIT visible. Ciclo Draftlive autosave/Save/Delete preparado, pendiente sin PASS anticipado. Auditoría universal/Withdraw/noJS/FX/firma genuina siguen abiertos; no CLIENT READY.

- [x] Regresión producción real Worker aprobada: único Draft QA Oct1 create200/autosave1→2 200 decodificado antes navegación/Save2→200/fresh200 Draft2 texto exacto sin recovery/Delete2→200 una confirmación/freshregister200 ausencia. Solo cuatro acciones esperadas, cero errores/bloqueos/POST imprevistos; sin attachment/Submit/approve/sign/finanzas. Root comprobó receipt y ocho hashes financieros/tres privados postciclo iguales al predeploy, SQLiteOK/FK0. Límite55 pares command-role capturados verificados, no total universal; diez próximos lotes UI registrados.


## 2026-09-30 — Scope Worker/crew y traducciones: candidatos Source

- [x] Browser real Worker/member/Technician/Supplier: R5/R6 no aparecen en listas/opciones y directGET403 sin detalles; búsqueda Worker scoped positiva/R6sinmatches. EN/ES/PT Worker conserva IDs/autorización y textos de formulario/denegación. ChiefWorker2 identidad real, Crew/opciones soloC0043/member delegado. Fallos login iniciales eran guardharnessrutaPOST equivocada; sign-in correcto200, no bug autenticación.
- [x] Lookup crew/description cuatro hashes verificados, Root46/46 y reviewseguridadSHIP. Source regularassigned200[]/chiefassigned200member; unassigned/nonexistent403 igual. Current+requested membership/projecttimezone/status/supplierlive/future elegible probados en tests aislados. No baselineoracle runtime original ni endedassignmentbrowserPASS anticipado.
- [x] History/Profile reviewSHIP/19tests; history12/12 ENESPT390/1440 con summary/changeSummary traducidos y hashes originales de auditoría iguales. Profile30/30 catálogo QA existente +30/30 catálogo producción vacío restaurado aislado, cinco rolesloginUI, cero businessfixtures por código. Ownerlink3/3 phone conserva locale por cookies/storage, href sinlangquery. No todos textos/campos/casosfallback runtime demostrados.
- [ ] Único proyecto QA y assignment/terms sintéticos/draftsDaily+Technical/planning1h creados soloUI; endedassignment→restore→close bajo prueba, consultas operacionales actuales/notifications/offline pendientes. Helper16tests aún sin conectar, sin PASS de scoping universal/publicación. Producción sigue049; current/rollbackd1 protegidos, extraimágenesf92 sin uso retiradas,18containerrefs iguales/readinessinterno200/11,471GB libres. Auditoría todas acciones/FX/firma real siguen pendientes.

#### Seguimiento: privacidad de Worker y caché offline (candidato sin publicar)

- **FAIL de navegador confirmado**: tras finalizar la asignación en la interfaz del Owner, Today oculta el proyecto pero su respuesta serializada aún incluye un turno pasado y datos del proyecto. El candidato filtra Planning/Technical Changes y contexto de notificaciones mediante sesión viva, cuenta activa, estado operacional y pertenencia efectiva según zona horaria del proyecto. Los registros históricos permanecen en el servidor. DTO Worker de Planning excluye coste planificado y creador internos.
- **FAIL offline confirmado**: un Worker sin otros proyectos recibe una asignación QA por UI, llena la caché normal al usar Today/Time y pierde dicha asignación por UI. En el mismo contexto, GET online 200 muestra opciones vacías; offline reaparece el proyecto revocado. No se guardan datos offline ni se crean mutaciones/adjuntos. Corrección de caché en curso; debe preservar borradores y adjuntos sin sincronizar.
- Backend parcial: **49/49** pruebas focalizadas, incluyendo **37** casos SQL reales aislados. Revisión independiente del padre sin cambios de código: sin bloqueadores de fuente, pendiente verificación real postfix/compilada y gates completos. No se declara cobertura completa de roles/acciones ni entrega Client Essential. Producción continúa en `0493689edcc2811f8ade33a719d97711b449238b`.
- Caché Source corregida: mismo contexto Worker con una asignación QA, fin por UI Owner, GET online200 con cero opciones/caché, luego offline también cero; ninguna mutación creada. Restauración de asignación por UI. Advertencia EN/ES/PT independiente si falla el almacenamiento, preservando borradores y adjuntos. Compilado/producción aún pendientes.
- Drafts UI válidos:0,25 horas decimales y Meals USD0,01 con vendor vacío, create200/fresh filas exactas; sin submit/approve/pay/invoice/email. Ocho hashes financieros/29filas y36 archivos intactos, SQLiteOK/FK0. Zona QA Pacific/Kiritimati y fin temporalSep30 revelan **FAIL de privacidad**: pantallas/opciones vacías y detalle403, pero HTML/loader aún serializa proyecto y expenseDraft; Time muestra expected-hours históricos. Fin restauradoOct3/v11 por UI. Corrección bloquea publicación;191 tests del padre anteriores y revisión13fuentes no sustituyen esta prueba de navegador. Producción sigue049, auditoría universal/FX/firma genuina pendientes.


## 2026-09-30 — Candidato final privacidad, navegación y archivos

- [x] Root revisión independiente readonly de28 hashes finales; Worker helper live/current+recordday/projecttimezone conectado a SQL/DTO/loaders/search, weeklyschedules y own aggregates; historial ownMyPay preservado. Caché assignments authoritative[] reemplaza lista, conserva drafts/adjuntos/conflictos; warning ENESPT de almacenamiento separado.
- [x] Defectos URL/render Source corregidos mediante goto real; Owner Team→Update→Remove→Update→Allprojects ENESPT Source y compilado igual freshreload, ceroPOST, register real ocho enlaces. Contexto/locale/worker/hash y fail-values por acción preservados. Weekdays ES/PT y Team0.25h Source aprobados; no traducción universal afirmada.
- [x] Portalbuild Node24/globaltypecheck/globallint PASS; Root242/242 focales, sin sumar pruebas author superpuestas. Compilado19/19 siete roles; History12/12 ENESPT; Profileempty30/30 cinco roles/locale/phone-desktop y Ownerlink3/3. Fallo inicial configloopback del harness conservado, no bypass producción.
- [x] Browser invoices/billing28 casos readonly: Owner/Finance/Auditor nueve PDF descargados por link visible; Worker/PM/Supplier/Tech invoice403 genérico sin datos. Owner/Finance dos XLSX reales; demás sin control export. PDF cliente/numero/lineas/totales2.25h225USD/expense3.61/credit-.01, hashes iguales por rol; XLSX nueve hojas Invoiceexpenses111+250=361minor, laborhistóricoVoided22500/credit-1 exactos. No nuevas fuentes/approve/issue/pay/email. Traducciones de archivos/directdownloadRBAC/otros periodos pendientes.
- [x] Compilado ciclo UI date-onlyv13→14→15 restauradoOct3; cache1→online0→offline0/queue0, HTML/search/options vacíos/direct403. Ocho tablas29filas/36archivos intactos, SQLiteOK/FK0.
- [ ] Compiled loaderbody capture faltó aunque __data200 observados: ejecución parcial, sin PASS universal. Verificación corregida antes publicación; producción049. Auditoría todas acciones/FX verificado/firma genuina siguen abiertas.


### Gate adicional: respuestas correctas y detalle offline revocado

- [x] Compiled sharedloader capturado por browserGET de datos en pestañas separadas: Time200/2.002bytes y Expenses200/493bytes sin IDs/nombre/número/resúmenes QA revocados. Ciclo UIv17→18→19 restauradoOct3. Capturas previas incompletas/timing conservadas; no sumarlas como PASS independientes.
- [ ] **FAIL nuevo**: Time detalle visible calentado/caché20023060bytes antes de revocar; mismoURL online403 genérico, offline200 muestra proyecto/registro anterior. Worker ceroPOST; Owner restauración200. Serviceworker cache invalidation/concurrency fix en curso, sin publicar; Expenseoffline no probado tras stop-first-leak.
- [x] Triage Source overviewPlanning/PMPlanning pa.*: tres-path fix allowlist operacional, Worker propio published/current+span, Finance3roles campos intactos. Author87/87 SQL real/diez nuevos y checks focales; Root revisión readonly tres hashes SHIPsource pendingbrowser. Coste runtime disponibleNULL, sin afirmar leak de valor financiero real. Build/gates anteriores no califican cambios posteriores.
- [ ] UIfixture planning y compilado actualizado, cache-revocation postfix y gates globales pendientes. Export controlperiodo/scope notas/precisión overview/captionsstatus traducción son followups de presentación; no cambiar matemática/política snapshot. Producción049; todasacciones/FX/firma genuina abiertos.

- [x] OwnerplanningUIfixture únicoQA2Worker8Oct2/1h/60min/siteQA/expertiseblank native200/freshPublishedrow; guardfield erróneo abortado sinservidor y locatorpostsavefallido preservados, norecreate. BrowserWorker200overviewDTO2782bytes incluyeid/site +planned_cost_minorNULL/created_by populated, baseline leakmetadatacomprobado. TrespathSourcefix pendingcompiled.
- [x] DirectbrowserGET17 denegaciones files/cinco roles: WorkerPM PDFs404genérico; SupplierTech403; XLSX403todosinclAuditor; sin invoice/project/client/money/download bytes, sinPOST/errors. No permiso Auditor export concedido.
- [ ] **FAIL nuevo billingdate**: PDFimmutable DueOct30 vsUIDueSept30; canónico due_at/snapshotdueAtOct30 correctos. UI usa due_date inexistente y guessissued; listInvoices omite due_at y XLSXquedaDueblank aunquemappingcorrecto. Fixlectura/display acotado pendiente; no mutar historia/PDF ni matemática. Verificaciónfiles previa11 cubriólineas/totales, no igualdadduedate.


### Revised compiled browser round18 — invoice dates, files and privacy (2026-09-30)

Publication remains held while the final localized export and offline revocation browser checks finish. Root, an independent integrator who did not author application source, inspected and hash-matched the five-path private-read cache packet, three-path canonical invoice due-date packet, and seven-path drawer/status/hours packet. Root repeated **298 focused tests (298 PASS)**, the portal build, required global typecheck and lint; each completed successfully on Node24. The copied business fixtures and document store were preserved.

Actual rebuilt browser checks passed **19 seven-role/responsive smoke cases**, **28 invoice/project-billing cases**, **nine visible-link PDF downloads**, and **two visible-link English Excel downloads**. Canonical saved due dates now match invoice UI, extracted PDF text and the actual Excel invoice cells; the earlier incorrect issue-date fallback and missing workbook date were reproduced before correction. All nine PDF hashes equal their prior immutable files, including the subsequently voided labor invoice; no issued snapshots were regenerated. Expense lines reconcile exactly to111+250=361 minor units; credit and void history remain intact. Invoice page access stays denied to Worker/PM/Supplier/Technician; finance export controls stay absent for restricted roles. Prior complementary direct file endpoint denial evidence remains17 checked GETs with no private bytes.

Luna's rebuilt planning overview browser proof is positive for both roles: Owner sees the existing published planning row and authorized creator/cost metadata; Worker sees its own published operational row and site while the actual200 loader payload omits creator/cost keys. This is paired with isolated SQL tests using a non-null private cost; browser fixture cost is null and is not represented as non-null browser evidence.

Six actual browser Excel downloads (Owner/Finance × EN/ES/PT) completed with valid ZIP/XLSX files and correct requested locale. Inspection found an additional **FAIL**: Spanish/Portuguese sheet names are localized but Summary/Invoices/Invoice-expense column headings remain English. A bounded reporting-copy correction is pending; financial values, source scope and historical PDF content must remain unchanged. Complete every-role/every-action/all-text acceptance and genuine customer-signature/FX-pack evidence are still pending; these scoped successes do not imply universal acceptance.


### Final compiled round19 and upgrade audit — 2026-09-30

The workbook translation defect is corrected. Root independently reviewed the closed copy dictionary and narrow caption-only call sites. Six actual Owner/Finance × EN/ES/PT browser downloads passed ZIP/XLSX inspection: all nine sheets and94 header instances are localized,45 Summary metric labels and reader explanations are translated, canonical due-date cells are populated, and numeric/date/source values retain their original types, styles and exact amounts. Existing controlled status columns remain localized; arbitrary user descriptions and machine identifiers are preserved. Nine PDF downloads still have the exact earlier immutable hashes; 111+250=361 expense minor units,22500 historical voided labor and-1 credit reconcile. The revised28 invoice/billing browser cases and17 direct restricted file GETs passed. PDFs remain their historical language and are not rewritten for locale changes.

Round19 root gates passed301 focused tests, production portal build, global typecheck and lint. The reviewer matched42 frozen application/test paths. Luna completed six actual Project-register status-filter cases at390/1440 pixels: Closing/Closed, En cierre/Cerrado and Em encerramento/Fechado retain their raw controlled values and show the corresponding existing rows. The Worker project detail shows2.75h for165 stored minutes. These are scoped locale checks, not every-string acceptance.

The completed QA expiry boundary version25→26→27 passed proactive and denial cache privacy: before any direct Expense denial, its warmed private page returned offline503 with localized online-access guidance and no original data. Time denied403 online then503 offline; Expense also denied403 online then503 offline. Both real loader responses were nonempty200 with no denied project/record identifiers or summaries. Owner restored the date toOct3/version27 through visible UI. The final combined harness stopped at an ambiguous draft-link locator, which remains preserved as a failed harness receipt; a separate narrowed GET-only continuation verified both original Time0.25h and Meals USD0.01 Drafts survived with200. No Worker write or queued mutation occurred. Financial29 rows/private36 files remained identical to the protected baseline. Earlier harness failures and their append-only date-change audits were retained.

A further read-only upgrade review found the previous service worker could retain legacy private pages across a release. The four-path correction gives new private reads their own v3 namespace and purges both exact current-identity namespaces on activation and existing signout cleanup. Other users, current static cache, authentication, and unsent IndexedDB drafts/attachments remain separate. Deletion failure blocks serving private fallback and provides online recovery guidance; old-worker late writes into the legacy namespace cannot be read by the new worker. Root independently reviewed the actual emitted-worker tests and source diffs and matched44 paths;313 focused tests, portal build, required global typecheck/lint and19 seven-role browser cases passed.

A GET-only loopback proxy served the actual public049 service-worker bytes, then the rebuilt candidate bytes to the same real Chromium context. Existing UI-created authorized Time/Expense Drafts warmed the real predecessor cache. Initial harnesses read too early: controllerchange and an asynchronous wait predicate returned during activation. Those STOPPED receipts remain preserved. Explicit awaited browser-state polling showed four activating probes followed by activated with the legacy cache absent, before any fresh navigation. Both old detail caches were absent; the old Time URL offline returned generic503 with no original data. Fresh authorized reads returned200 into v3 and kept both original drafts. This is actual old-to-new browser evidence, not code presence or seeded cache bodies.

That same real offline navigation found a separate loading FAIL: Svelte immutable JavaScript lives outside the service worker's app-route path and was not cached, so fresh offline Expense HTML displayed its authorized summary but hydration raised a dynamic-import error. Publication is held for a bounded public-asset caching correction and renewed compiled/browser gates. This partial privacy PASS does not claim complete offline form functionality. The broader every-action audit, healthy finance-period controls/scope explanations, genuine customer signing and verified FX/pack evidence remain open. Production remains0493689edcc2 until a new verified release receipt is recorded below.


### Final public-asset correction and publication gate — 2026-09-30

The separate offline JavaScript failure is fixed with a strict public-asset allowlist: same-origin immutable JS/CSS/fonts and six known app public assets. Cache writes are tracked until completion. API resources, unrelated and cross-origin paths, non-GET requests, and authenticated image/document paths cannot enter the global static cache; private responses retain their identity partition. The existing activation/generation/denial safeguards remain unchanged. Root independently reviewed both final overrides and matched all44 frozen source/test paths.

Root's final suite passed **332/332**, portal production build, required global typecheck and lint. The final compiled seven-role responsive smoke passed **19/19**. Luna then ran actual Chromium through the GET-only proxy with the real current-public049 predecessor script followed by the compiled candidate. Both existing UI-created Drafts warmed200; completed activation removed the legacy private cache before fresh reads. The old Time URL offline returned data-free503 with online-access guidance. Fresh online Time/Expense remained200; the authorized Expense reopened offline200 from v3. The actual account menu opened and closed with Escape offline,38 immutable asset requests were cached, and the receipt records zero page errors, blocked writes or non-GET requests. This confirms the hydration defect is corrected for the exercised previously visited route; it does not promise never-visited routes work offline. Earlier stopped/partial and diagnostic receipts remain preserved.

After all UI and read-only browser checks, quick_check remainsOK, foreign-key errors0, all protected eight financial-table hashes (29 rows) and36 private-file hashes equal the original baseline. Source publication is now qualified for this scoped correction batch; production deployment and verification are recorded separately below. Wider action/period-control/signing/FX acceptance remains open.


### Production release verification — 2026-09-30

GitHub branch codex/release-integration-20260928 now contains source **3dee05c49a7092ed00f533221cb7d45958d6ec16**. Canonical production deployment completed successfully with archive SHA256 **e1e105dcf8ed68f7ad39a9bc399b0548f2942aaf928353b03f0a0bf48657b47e**. All **4,276** installed manifest hashes match the reviewed source. Public/internal health, current jobs verification and real backup verification passed. SQLite quick_check isOK and foreign-key errors0; all eight production invoice/payment table hashes (currently0 rows) and all3 private-file hashes match the predeployment snapshot. Caddy PID912,15 unrelated containers and enabled deployment watcher states remain preserved. Authentication sessions remain usable.

Actual public browser smoke passed19/19 across seven roles and representative360/390/768/1440 widths. Account-menu SVG/keyboard checks passed14/14. Luna then confirmed actual Owner/Worker1/Worker2 identities, discovered live project options through the UI, and completed **8/8** scope/download checks. Worker1 and the crew-chief Worker2 each see only their assigned project in the Time list and unsent Log time form; an Owner-visible unassigned UUID project is absent from both and returns generic403 for project detail and crew lookup, with no IDs/names/private bytes. The Owner followed the visible QA project link and localized PT billing tab, clicked its exact export action, and received a200 valid13,299-byte XLSX. No business POST or mock-data write occurred on production.

Independent inspection of that actual production workbook passes: nine sheets/94 Portuguese header instances, project name/number and Aug1–Sep30 period match, five time rows match stored worker/date/category/minutes, and two receipt rows match stored IDs, descriptions, dates, currencies and exact minor units. An initial overbroad inspection included a third stored original receipt that had been superseded by an approved correction; after inspecting the existing finance lifecycle query, the corrected check verifies that original is excluded and the approved correction is included. The original inspection stop is preserved; no receipt/history was changed. Empty invoice and invoiced-expense sheets accurately reflect no issued production invoices. Nine immutable PDF-content/byte-hash checks remain **isolated compiled browser** evidence rather than genuine production-issued PDFs.

Only unused Docker builder cache was pruned after both image builds completed, freeing about6.3GB; all18 observed container image references were retained. Five earlier byte-identical unused staging ZIP copies were also retired after SHA comparison, retaining their originals and protected current/rollback archives. The new source archive uses an immutable same-filesystem hardlink to avoid another redundant ZIP copy. No volume, database, private document, session or draft cache was deleted. New browser v3 private-cache activation and visited public-asset refresh are separately qualified by the actual049→candidate Chromium upgrade receipt.

The first scope harness selected an existing non-UUID imported project and received a validation400 before the expected crew denial; that original receipt remains preserved. The corrected UUID scope test qualifies403 privacy. A separate Owner browser inspection then confirmed a real usability defect: the active imported project C-0020-P-001 is an enabled Record expense option, but selecting it in the unsent form triggers time-options400. Existing project identity must be preserved. A narrowly scoped follow-up is implementing the already-authoritative stored project-ID schema for Time/Expense references and related lookups, keeping record UUID generation and object-access guards unchanged. This follow-up is not yet deployed and is not folded into the eight passing production checks. Complete every-action/signing/FX and finance-period-control acceptance remains open.


### Follow-up browser findings — legacy projects, stale saves and PDF layout (2026-09-30)

The native stale-form check confirms a write-access defect in the isolated compiled app. Worker8 opened Record expense while assigned, Owner ended the QA2 assignment on September30 through the visible Team form (version27→28; project-local today October1), and Worker clicked Save draft once. The SvelteKit action decoded as success200 and a fresh visible register search independently found the new Meals USD0.01 Draft. Owner restored October3/version29 through the UI; the unexpected Draft and the original Time/Expense Drafts remain as evidence. No submission, approval, invoice/payment or production business write occurred. Earlier selector stops and the post-save harness ReferenceError are preserved; creation was not repeated. Current-access write checks and localized retained-input recovery are being corrected separately from the frozen eight-path legacy-ID validation packet. Neither follow-up is represented as deployed yet.

Root also visually inspected the actual downloaded one-page labor, expense and credit PDFs. The examples show readable parties, dates, descriptions and totals:2.25h/USD225, expense lines USD1.11+USD2.50=USD3.61, and credit USD-0.01. No clipping, overlapping columns or internal pay/cost fields were observed in these specimens. The previously checked immutable hashes and exact Excel source comparisons remain valid. These are existing browser-created synthetic issued snapshots, not production-issued PDF evidence or qualification of every long/multipage template.

After the verified3dee release, only two unused older D1 Docker images were retired after checking all18 container image references and the retained original archive/extracted-source integrity. Current3dee and immediate049 rollback images/archives remain protected. Unused npm/pnpm download/store and apt download caches were cleaned; no installed runtime dependency, volume, database, document, session or draft was removed. The bounded maintenance receipt records unchanged container image references and about9.9GiB free for the next canonical release.


A further read-only Luna browser pass checked the compiled Billing register across seven roles, using the existing UI-created synthetic records. Owner/Finance list loads200; Auditor loads200 with an explicit read-only review label. Worker/Manager list access403 and known invoice detail404 remain generic; Supplier/Technician list/detail403 disclose no invoice numbers or project hints. Actual Owner status chips yield Drafts1, Outstanding1, Credit balances1, Paid0 and All4; native invoice search returns its one matching row. Open PDF opens a separate tab and closes cleanly. The three existing invoice issue/due dates agree with their canonical values. No pagination control exists for the four-row fixture, so pagination is not qualified. The private receipt records zero blocked non-GET requests, page errors or console errors; all contexts closed before the next rebuild.


### Follow-up source publication gate — 2026-09-30

Root independently reviewed and hash-matched the final 16 source/test paths: the eight-path stored-project-ID correction, seven-path own operational write guard, and the two-path caption override that shares the guard dictionary. Time/Expense project references and three lookup validators now accept the existing authoritative stored project-ID format, without rewriting legacy records or changing UUID generation. Worker own Expense creation and canonical Time mutations recheck live current project-local authority and requested-day membership inside their transactions; separate legitimate assignment intervals remain allowed. Owner/nonWorker/delegated boundaries, financial locks and history stay preserved. Existing localized access-change messages retain safe inputs; Time guidance now describes both current access and the requested work date.

The independent focused security/operational/locale suite passed **469/469**; portal build, required global typecheck and lint passed. The guard build passed **19/19** seven-role/responsive browser cases. Actual stale-form Save clicks cover Time/Expense × EN/ES/PT once each: all six decode as SvelteKit failure403 inside HTTP200, with expected problem keys, visible localized guidance and retained date/summary plus0.25 decimal hours/15 hidden minutes or USD0.01 expense values. The first corrected run stopped after three completed clicks because its Spanish warning aggregation was truncated; root independently verified the exact Spanish alert and screenshot. The remaining three clicks used a new helper/output rather than repeating completed actions. Owner expiry/restoration cycles29→30→31 and31→32→33 end at October3/version33. Fresh native register searches find all six markers absent and preserve both original Drafts and the earlier unexpected Draft. Zero blocked requests, page errors or console errors were recorded. Previously known project selections stay in retained stale forms; denied response bodies add no project name/number. All stopped receipts and date-change audits remain preserved.

The same browser screenshot exposed an untranslated weekly-submit caption. A final caption-only override registers the two existing literals and supplies ES/PT copy. Root reviewed that incremental diff, matched the final16 hashes, reran **19 existing locale tests**, rebuilt the production portal and repeated required global typecheck/lint; all passed. Actual post-rebuild browser reads show EN Submit all week drafts, ES Enviar todos los borradores de la semana and PT Enviar todos os rascunhos da semana. No weekly submission was clicked; the progress label is dictionary/test evidence rather than an exercised pending save.

Owner's actual enabled BBS Mexico Expense option now triggers the native time-options GET200 with the stored legacy ID and date, with no invalid-project warning; the form was cancelled without saving. The response-body reread failed in the browser harness, so HTTP/visible-form recovery is qualified without a new raw-body claim. Owner's initial Log time form, before selecting a worker, offers only Select assignment; no positive legacy Time save or fabricated assignment is claimed. All contexts closed. SQLite quick_check remainsOK, foreign-key errors0, all29 protected financial rows and36 private files exactly match the original baseline. A custom scoped compiler retains its pre-existing outside-scope action-utils generic diagnostic; the authoritative repository typecheck/build/lint pass without modifying that file.

This scoped source batch is qualified for publication; canonical production verification is recorded separately below. Broad every-action/all-text acceptance, finance-period controls/scope explanations, genuine signing and verified FX/pack evidence remain open.


### Production follow-up release verification — 2026-10-01

Source **69ed5e5a2eb8d3e09a62947ae4a2ecf330ea1f55** is pushed to GitHub and deployed through the canonical production release workflow. Archive SHA256 **b90d33add74cf307045c1a45fea4c7814b9987087a8040bbbb01be277c333f61** matches the reviewed snapshot; all **4,277** installed manifest hashes pass. The source ZIP is a verified immutable hardlink rather than a redundant staging copy. Public/internal health, current jobs checks and real backup verification pass. The public GET-only responsive/browser smoke passes **19/19** across seven roles, with zero page errors or failed requests. SQLite quick_check isOK, foreign-key errors0; all eight invoice/payment table hashes (currently0 rows) and all3 private-file hashes match the predeployment snapshot, including a final check after all browser activity. Caddy PID912,15 unrelated containers and enabled deployment watchers remain preserved.

Luna's actual production Owner/Worker1/ChiefWorker2 browser checks pass. Owner discovers the enabled BBS Mexico expense option through the UI; its native time-options request returns200 with the matching stored legacy project ID/date, top-level rows and zero entries, with no invalid-project warning. Its project/Expenses transitions are qualified by the actual SPA destination and rendered content, not a nonexistent document response event. Worker1 and ChiefWorker2 each see only assigned C0043 in the visible Time register and Log time form; the legacy project is absent. Its discovered project detail and crew lookup each deny403 generically, with the expected crew scope-denied code rather than validation400, and no target name/code/ID/email in the denied bodies. Both roles have two expected403 console-resource messages and zero page errors; no business POST is permitted. Worker1 reads the translated Spanish/Portuguese weekly-submit captions with an existing draft and never clicks submission. All contexts close.

The first production receipt marks Owner FAIL solely because the harness required a document status for SPA navigation; that receipt is retained separately. A corrected second GET-only run qualifies actual route/rendered content and the real lookup response. Worker/Chief checks were repeated in that completed second run; no third optional Owner recovery was executed. No source patch was required for the capture failure and no production data was created. The six denied stale-save cases remain isolated compiled-browser evidence, paired with exact installed guard-source hashes; production assignments were not revoked merely for a write test. The prior actual production Excel source-value and scoped immutable test-PDF evidence remains qualified, since financial/reporting paths are unchanged; this release does not claim a genuine production-issued PDF where none exists.

After both production images completed, one unused Docker builder-cache prune reclaimed **6.962GB**. Its post-prune snapshot helper hit a race while an owned container was legitimately replaced; the successful prune was not repeated. Read-only recovery compares the final15 unrelated containers and confirms all six current/immediate3dee/extra049 portal/site images plus both older original archives and extracted sources remain intact. Original helper/stop receipts and the corrected maintenance proof are retained. No volume, database, private document, session or draft cache was deleted; post-maintenance free space is about10.7GiB.

These scoped corrections are deployed and verified. Complete every-action/all-text acceptance, finance-period controls/scope explanations, genuine customer signing and verified FX/pack evidence remain open.

### Production maintenance verification — 2026-10-01

Owner-authorized cleanup reclaimed 9.46 GiB, leaving 20.18 GiB available. Removed 14 obsolete extracted releases, 20 old archive/sidecar files and two unreferenced historical J&A images; unused Docker build cache was already empty. Current 69ed5e5 and immediate 3dee05c rollback archives, extracted sources and images remain verified (4,277/4,276 installed manifest hashes). A refreshed canonical backup retains three daily recovery snapshots with verified latest database/document integrity and complete day coverage. All 18 container references/states, Caddy PID, financial hashes and three private-file hashes are unchanged; SQLite quick_check/FKs pass and deployment triggers are restored. Public/internal health, public site and jobs checks pass; the post-cleanup actual production GET-only browser smoke passes 19/19 across seven roles and representative widths, with zero page errors/failed requests. Full every-action acceptance remains open. Details: `docs/evidence/browser-ui-action-audit-20260930/README.md`.

### Multi-role adversarial workflow follow-up — 2026-10-01

Continued browser-only operational QA after zip48b9c466 found and repaired missing approved-report facts, internal PDF filenames, receipt-less correction dead ends, silent weekly-entry worker/context changes, misleading approved-filter emptiness and lost finance project context. Worker/crew, manager, owner, finance and unassigned-worker Chromium checks cover validation recovery, private receipts, corrections/withdrawal/approval, role-safe views, unsaved-input safeguards and localized calendars. Duplicate receipt content shows an explicit no-new-expense error and retains correction fields; durable expense/week/planning replay branches now have distinct already-saved/no-duplicates EN/ES/PT messages, independently source-reviewed. Production activation and final verification are recorded in `docs/evidence/role-adversarial-browser-20261001.md`. This entry covers the exercised flows, not the complete historic acceptance suite.

The follow-up activated as **zip366bef47558b2fe5e79263f810b3688f** at12:39:02 Europe/Madrid. Full type/lint and portal/site/jobs builds pass. Live duplicate receipt rejects with retained fields and unchanged23-record count; weekly context guards, manager permissions/approved results/review links, technical detail submission (one POST), operational report facts/semantic PDF, finance scope and planning filter scroll1911→1911 pass. Deployment backup and health/jobs/timer checks succeed. Nonzero native POST scroll restoration remains a stated runtime limit; the observed technical submit was0→0. Complete every-action/financial-issuance/offline acceptance is not claimed.

### Proactive multi-role workflow round3 — 2026-10-01

Browser-only QA across owner, crew chief/worker, supplier coordinator and technician found silent crew draft loss, stale project recovery using cached data, premature SSR Edit clicks, misleading actual-hour/cost-center guidance, missing time-correction lineage and a planning editor collapsing on input. Reviewed fixes preserve dirty data, enforce role-safe origin links and retain working editor context. Real correction create/withdraw/stale-submit, supplier overlap/discard/double-save, project optimistic conflict recovery and planning publish/update/cancel pass; actual project hours unchanged4.25. Global type/lint plus scoped compilation pass. Activation and detailed limitations are in `docs/evidence/proactive-role-workflows-round3-20261001.md`; no complete every-action/financial/offline acceptance claim.

- 2026-10-01 Round3 activation and live UI evidence: `zip-2d6a8bb49564fc5eb49e66430527e68f` (13:45:01 Europe/Madrid); production portal/site builds, online5-document backup, health/public URLs/jobs actor/timers PASS. Actual live owner/Worker1 no-write regressions PASS for planning expansion/filter scroll, current hydrated project edit, timefacts360/768, crew unsaved context/nav guards andzero-hour0POST360/390/1440. Live empty worker fieldset512px defect fixed via scopedlayout; independentSHIP plus actual candidate/live empty/populated390/1440 verification. Detailed scope/limits and backup/image/cache receipts: `docs/evidence/proactive-role-workflows-round3-20261001.md`.


## Browser workflow follow-up — 2026-10-01, round 4

[Round 4 browser evidence](docs/evidence/browser-role-workflows-round4-20261001.md) covers owner project/assignments, two-worker delegated hours, one shared receipt/exact allocation, revoked-delegation atomic rejection, operational correction/approval, actual labor totals and role denials. Reproduced unsaved receipt-allocation loss is corrected with EN/ES/PT confirmation and hydrated candidate browser regression at representative widths. This scoped evidence does not promote other checklist items or establish complete Client Essential acceptance.

Round 4 activated at 14:57:09 Europe/Madrid as `zip-9d175ee14b8a2825769d0a4d8d8eab52`. Live crew allocation cancellation at 360/390/768/1440, double-click save and two-tab duplicate-allocation rejection passed. Portal/site healthy and jobs/backup timers active after activation.


## Browser workflow follow-up — 2026-10-01, round 5

[Round 5 browser evidence](docs/evidence/browser-role-workflows-round5-20261001.md) covers daily report validation/double-save/autosave/submission/owner approval and generated PDF, report correction recovery, private attachments, and Owner/Finance/Auditor/PM/unassigned-worker views. Reproduced silent project-edit discard, raw commercial codes/free-text budget choices and generic unchanged-report correction errors are corrected with localized UI recovery. Candidate browser checks cover360/390/768/1440. This is scoped evidence, not complete Client Essential acceptance. Activation and final live results follow in the evidence record.

Round5 activated at15:52:26 Europe/Madrid as `zip-4f34490d89e84fe4e3dfaee559fb817f`. Independent read-only review SHIP, static checks, production portal/site builds,8-document backup, installed hashes, health/jobs/timers pass. Live Owner/Worker360/390/768/1440 discard/error recovery and PDF download pass; live Owner save/restore of a synthetic alias passes with unchanged commercial/time/cost/report facts. Extra fresh role sign-ins were rate-limited; other role evidence is candidate/pre-activation as qualified in the report.


## Browser workflow round 6 and production cleanup — 2026-10-01

[Round 6 evidence](docs/evidence/browser-role-workflows-round6-20261001.md) records source-backed browser findings, Astra classification and independent code review. Initial release `5cb15a0` activated 18:01:58 Europe/Madrid with successful builds, ten-document online backup and deployment health/jobs checks. Six QA projects and their billing stream archived via Owner UI, preserving history. Two additional billing bugs (imported ID selection rejected; draft sources directed to empty Approvals) and contextual cadence UX are implemented and preview-verified; follow-up activation/live configuration pending. This is scoped evidence, not a full Essential acceptance verdict or completed10+10 quota.


## Editable previews and remembered views — 2026-10-01

[Browser evidence](docs/evidence/preview-editing-persistence-browser-20261001.md) records Worker/Chief/PM/Owner/Finance/Auditor checks on an isolated production snapshot, acknowledged report edits/correction history, optimistic invoice conflicts, subsequent-draft billing defaults, canonical PDF downloads, role-scoped persistent filters and representative widths. Independent review SHIP and full workspace typecheck/lint pass. Migration0069 is additive; issued history and calculated-money authority stay protected. Production activation and the final live regression are recorded in that evidence after deployment. This does not promote untested Essential journeys.

Final preview/persistence release `5068a61` / `zip-12f67b777800364b7e02220a2630ee7d` activated21:48:50 Europe/Madrid. Additive migration upgrade,10-document preactivation backup, portal/site/jobs builds and public/runner health pass. Live currency round-trip persistence,2realActiveprojects, canonical invoice download, report4width/CSP/source-correction opening, password/mobiletabs and earlier-layout→current-layout generation/history download pass. Final cache cleanup10.92GB;15GB available. Independent review SHIP. Scoped evidence and the distinct selected10UX+10bugs are recorded in the linked evidence; broader Essential acceptance remains unchanged.

### Actual document source writeback and older PDF refresh — October 1

Owner clarification supersedes separate reusable invoice-default behavior. [Scoped evidence](docs/evidence/document-source-writeback-20261001.md) records actual project PO, stream PO/terms/notice and issuer bank/contact writeback, date-only preservation, source conflict retention/atomic rejection, current-source rebuilds, one current draft/exact totals, Owner/Finance/Auditor/Worker boundaries and four editor widths. Additive migration70 fresh engineering integrity and representative normal startup upgrade pass. Independent review SHIP; GPT‑6 Astra High accepts the refinement and candidate fixes without changing the completed 10+10 count. Three older production report PDFs were regenerated/downloaded, with previous artifacts preserved; the fourth was already current. Private worker statement checks cover only the displayed periods and do not establish global historical absence. Runtime `8952fb0` / archive `b7d35460f2f6300d1b4cb127720c49c3d27e38d6c0ae166fdb35bee3fb9e5f78` activated23:00:54 Europe/Madrid. Workspace typecheck/lint, portal/site/jobs builds,14-document preactivation backup and public/jobs health pass. Live Owner/Finance no-op settings/Cancel, Auditor read-only, Worker404 and current invoice download pass without QA source changes. Build-cache cleanup reclaimed6.133GB. This does not promote untested Essential journeys.


### Per-person project terms browser continuation — 2026-10-02

Owner production browser creation with optional individual assignment rows, retained validation, future-dated rates, revised project defaults, general settings and explicit per-person expense preferences has scoped evidence in `docs/evidence/project-worker-terms-browser-20261002.md`. Existing individual agreements survived default/general-setting changes. PM current and historical expense views retained operational-only privacy, and live review revocation blocked stale correction writes. Worker own cross-project pay and ended-assignment historical compensation were observed independently. Owner source/project calculations reconcile approved Daily10c, fixed-period11c and fixed-project12c without multiplying by the two sources per person; Worker approved-pay verification remains pending. W48 source871b0ef is pushed/deployed with backup/health/jobs checks; Time context and compact MyPay card repairs await live Worker verification. Expense classification exposed an unused wrong-currency issuing-authority setup dead end, under repair; no reimbursement PASS or complete56UX/46bug re-verification is claimed. Functional checks use the browser UI only, with source/static/build checks as supporting evidence. All current agents use GPT6.1Sol.


October2 W48/W49 continuation: independent Worker Daily/fixed readers and scoped Chief delegation/withdrawal cleanup are recorded in the linked per-person terms evidence. W49 `856f4d83` activated14:11:50 with canonical backup/upgrade/health/jobs checks after a VPS restart interrupted the first build. Finance repaired an unused wrong-currency authority through the new append-only UI, observed prospective currency409 recovery, classified/reviewed four exact QA expenses and reconciled the three project treatments plus ended-worker historical markup. Worker reimbursement/statement, used-authority rejection, replay, per-currency-minute captions and fresh empty-delegate labels remain pending. Context/required-field corrections `7b84a210` are pushed and building; no full102-item/all-role acceptance is claimed. Browser execution is restricted to one session/page at a time, and current agents remain GPT6.1Sol.


W50 `7b84a210` activated14:45:40 with20-document backup and health/jobs gates. Live Finance400/409/200 submissions retained dates/locales/filters; visible other-project cost scope saved successfully. New Worker7 hourly guarantee selected through normal assignment,30-minute actual source approval and own pay reconciled2c; Owner future basic rate edit retained60-minute guarantee. Worker4 per-currency minutes passed EN/ES/PT390/1440; Worker2 English390/1440. Worker5 own reimbursement2EUR and ended-worker6 historical1EUR matched dated project/person policies and their actual browser PDF previews/downloads. Closed empty-delegate caption and hours/statement locale display regressions are being corrected; no all102-item or full Essential PASS. Detailed source IDs, runtime, cleanup and pending branches remain in the per-person terms evidence.


W51 `4a8e57a2` activated15:27:07 with24-document backup and deployment gates. Root live closed-empty Chief caption and Worker hours/statement locale repairs pass within EN/ES/PT390/1440; date/nondelegated/ordinary-worker negative controls and create/cancel/filter-removal regression are scoped in the evidence. Build cache0B after6.977GBcleanup, three daily snapshots and immediate rollback retained. Root closes the page before Finance/Auditor handoff; queued Owner/PM coverage and complete102 compound verification remain pending.

W51 root single-browser Finance independently reconciled nonhourly4approvedh/pay36c/cost16c and exact once-only source allocations; four expense ledger/detail readers retained dated per-person1/0,1/1.10,1/1.10,0/0 treatment. Auditor read-only Time/Accounting/Billing/calculation/Documents/Profile checks are scoped English1440; Approvals403/0forms, commercial mutation exclusion and Audit keyboard/older/localized400 recovery passed EN/ES/PT390/1440. Found expense-subtotal omission, raw treatment/reimbursement enums and Auditor invoice-management copy. W52 combined six-file independent GPT6.1Sol source review SHIP; scoped static gates pass, deployment/live acceptance pending. No full102 or Essential acceptance claim; see per-person evidence for exact limitations.

W52 `ea31b551` activated17:24:52;24-document backup/health/jobs passed. Cache cleanup6.978GB/0B remaining, obsolete W50 images removed, W51 rollback/three daily snapshots retained. Expense subtotal/treatment labels Owner/Finance/Auditor, None status Owner/Finance/Worker5, Auditor versus manager invoice copy, Worker/PM Finance403 and bounded PM private-field exclusions passed EN/ES/PT390/1440. Independent GPT6.1Sol qualification accepted three supplemental bugs; BUG-029 copy repair adds0. Historical102 reverification38scoped64NOTRUN0wholecompoundPASS; supplemental3bugs make accepted definitions56UX/49bugs toward unfinished100/100. Owner optional table and dated overrides observed; Duplicate-worker guard/default-versus-override state were verified by DOM/payload after a helper false alarm; inactive-history review omission is under repair, not accepted. Full Essential and all-role acceptance remain unproven.

W53 bounded source repair makes retained inactive person terms readable inside the recorded inclusive assignment interval, while preserving authorized project/role access and active-only configuration controls. Localized retained/read-only guidance and visible stale-form errors added. No financial arithmetic, persistence or migration changed. Scoped lint/format/Svelte compilation and portal TypeScript pass; independent GPT6.1Sol source review SHIP. Source0d888938/archivee460daacc99ada0999140d6e806347aa374e8eb235a6b2c528df5d2503d51841 activated18:05:55 with24-document backup, build/upgrade/health/jobs gates. Cache6.981GB reclaimed; W51 images removed with current/rollback retained; backup retention ran. Live role/date controls remain pending. This is remediation progress, not acceptance credit. Current agents use GPT6.1Sol exclusively and share one browser session serially; detailed evidence remains in the linked per-person terms report.

W52 additional Owner/PM shared browser checks cover project tabs, empty expertise/inspector wording, same-title distinct expense search details, separated Owner expense currencies and singular invoice caption. Remaining variants untested; profile selected person survives reload but search text clears. Fresh PM Dashboard exposed expense amounts in delivered approval records despite the money-free UI; fresh detail was correctly redacted. Bounded W54 repair applies the existing PM queue projection to the root loader, preserving time duration and other roles. TypeScript/format/scoped lint pass; independent GPT6.1Sol source review SHIP. Deployment and live verification pending. Historical102 now42scoped/60NOTRUN/0wholecompoundPASS; accepted supplemental totals unchanged56UX/49bugs. See linked per-person terms evidence for precise scope.

W54 source81bdbed5/archive d37416711707342561f498c512b2d9f853b33bf952145c49c801e131865ebc3c activated18:14:11;24-document backup/build/upgrade/health/jobs passed. Cache6.964GB reclaimed/final0B; obsoleteW52 images removed with currentW54/rollbackW53 retained, three daily backups and active watchers/timers. Fresh PM all6 locale/width deliveries retain six expense identities without amounts and three time durations; Owner money controls intact. W53 dated read-summary Owner/Finance/Auditor five dates all6 retains endedWorker6 exact10c/4c/6c with read-only controls, inclusive bounds and active override/default separation. Owner extra360/768 fit. Person policy choices active-only; Auditor0POST, Worker/PM403all6. No writes; solebrowserclosed. Untested variants and independent count qualification explicit in evidence; no full Essential/all-role PASS. W55 compensation-method display localization source/static ready, review/deployment/live pending.


W55 `a29dab2b`/archive50fd1b849cebbd81c637a720d378623a05439329e5f2cdac8d4d2c660f9a5e6c activated18:38:01 with24-document backup and eventual health/jobs gates. Final build-cache cleanup6.964GB/0B and obsolete W53 images removed; W55 current/W54 rollback/three daily backups retained. Owner/Finance/Auditor72 browser cases across EN/ES/PT360/390/768/1440 verify localized compensation captions with unchanged amounts/history/controls. Independent GPT6 Astra Ultra accepted W55-B01 exactly one bug, zero UX; with W53/W54 acceptance totals56UX/52bugs108definitions, historical102 remains42scoped60NOTRUN0whole-compoundPASS. Latest user instruction uses GPT6 Astra Ultra for all new subagents with one serial browser. W56 reviewed single-component navigation/portfolio-source/mobile-parity repairs pass static gates and independent Astra Ultra source review SHIP; deployment/live acceptance pending, no credit yet. Detailed receipts and untested variants remain in linked per-person evidence.


October3 W56 sourceffc8e6b5/archivecd2756936977b8a50c269fbdd2edf8df31d1b106e486cb6fd72f4e942d598769 activated00:58:00 after confirming the interrupted October2 export had stopped before activation. Canonical cached serialized retry,24-document backup, upgrade/local/public/jobs health passed; portal/site healthy. Cache6.966GB reclaimed/final0B, obsolete W54 images removed with W56 current/W55 rollback retained, three backup snapshots retained, watchers/timers active and15GB free. Latest user instruction permits onlyGPT6.1Sol; fresh Sol source review SHIP. Exclusive single-session browser verification underway; W56 acceptance/credit pending, totals56UX52bugs unchanged. Exact runtime/backup/cleanup evidence in linked per-person report.


W56 Sol browser acceptance:167 scoped cases across Owner/Finance/Auditor, Worker5/PM and historical Chief-fixture denial; project context/date terms, portfolio-worker actual source links, eight/ten-fact phone parity and role controls pass within observed scope. Default-Portfolio URL omission is canonical behavior; paired-source first-page false and signout/sandbox helper errors are explicitly recorded as harness limits. Independent GPT6.1Sol accepts exactly2bugs+1UX; root accepted57UX54bugs111definitions. Historical102 remains42scoped60NOTRUN0whole-compoundPASS. No appwrites; solepageclosed beforeW57Ownerdraft/error/inheritance checks. Full100/100 and wider Essential/all-role certification remain incomplete.


W57 Owner browser confirmed unsaved-person draft loss across project tabs/rejected sibling save, inaccessible raw-field error recovery, and misleading inheritance under a dated default. Revised five-file repair passes portal/databaseTypeScript, scopedlint/format, Sveltecompile0warnings and independentGPT6.1Sol sourceSHIP after two review corrections. Captured draft concurrency tokens, visible associated localized errors, truthful dated inheritance and independent stored policy fallback are included. Deployment/live successful+rejected saves/date-fallback tests pending; no credit yet. W58 OwnerEN390 weeklyduplicate warning/separate-work save worked; one naturaldoubleclick created onlyone intendedextra draft, so replaynotreproduced andnewcredit0. BothnewQA sources were auditedDeleted/404, existingapprovedOct2hour unchanged, browserclosed. Details in linked per-person evidence.


W57fc5ecd22/archive6b20668cd5efed9f1bab4c97f524ac13562d00116a585e17869a950e4938e5a5 activatedOctober3 01:45:43 with24-documentbackup/build/upgrade/local/public/jobs gates. Cache7.022GBreclaimed/0B, obsoleteW55imagesremoved withcurrentW57/rollbackW56 retained, threebackup snapshots, activewatchers/timers, healthycontainers and14GBfree. GPT6.1Sol owns the sole browser for full scoped retest; no W57 credit or full Essential PASS at activation. Accepted57UX54bugs unchanged.

W57 follow-up: Owner EN1440 rejected single/batch saves retained both drafts and concurrency tokens, with visible linked error focus. Actual header EN→ES switching exposed a step reset and stale editor language; the bounded page correction requires independent Sol review and deployed retest before acceptance. Isolated QA financial checks continue in the sole browser session. All new agents/reviews use GPT-6.1 Sol only under the latest user instruction. Accepted totals remain 57 UX / 54 bugs; no credit for correcting the introduced regression.


W57 language correction fce95d99 / archive 5cc5b546a4c9a5a65594e8d869904fe936f66923303267a8653eb79513a13fc7 activated October 3 at 02:13:53 after build/backup/upgrade/readiness/jobs gates. Cache cleanup reclaimed 7.022GB, with 0B remaining; obsolete W56 images removed, current/immediate rollback and three backup snapshots retained, timers active, containers healthy, 13GB free. Single-browser GPT-6.1 Sol retest resumed after cleanup. Acceptance remains pending; 57 UX / 54 bugs unchanged.


W57 corrected browser run found a remaining English Unchanged in the Portuguese future-terms notice. The one-entry shared translation repair (ES Sin cambios / PT Sem alterações) passed scoped lint/format, portal TypeScript and independent Sol source review; deployment and actual locale proof pending. No additional quota credit. Main W57 candidates and role/privacy gates remain pending.


W57 remains pending: actual accepted Discard then Billing re-entry resurrected rejected pay/date values and errors, despite clearing customer/pin values. The parent-only exact-response consumption repair passed scoped static gates and independent Sol review at 42f3eebd69401795cbe8ff9298348ab8937edcc97878c9a419e732858987fe8d. Cancel, initial failed-form recovery and fresh responses are preserved. Combined deployment with the scheduled-status translation and affected browser retest are pending; zero new definitions for these corrections.


Combined discard/translation corrections 1312170d / archive 0740d53585908a96d4d82bb13a8a8fcaf926b17d21b3afb784ca8e181cd8034e activated October 3 at 02:44:57 after canonical build/backup/upgrade/readiness/jobs gates. Cache cleanup reclaimed 7.022GB/final0B; current/immediate rollback images and three backups retained. Thirteen byte-verified old inbox ZIP duplicates removed, all audit copies preserved, recovering about4.03GB; disk16GB free, timers active and containers healthy. Single Sol browser resumed only after cleanup for focused discard recovery, remaining Finance5 and scheduled-status locale proof. W57 acceptance pending; 57UX/54bugs unchanged.

W57 closed independent GPT-6.1 Sol qualification PASS; root accepted exactly two bugs (complete unsaved-person draft/discard lifecycle and misleading inherited reimbursement) plus one UX (visible localized linked rejection recovery). Combined1312170d OwnerEN360 and FinanceEN1440/ES390/ES1440/PT390/PT1440 prove complete Cancel retention, accepted-discard canonical restoration, fresh errors and keyboard field focus; both scheduled-notice variants translate correctly. Final canonical cleanup and explicit browser close confirmed. Earlier financial and role cases retain their actual source versions and limitations; no future-payment, complete privacy or all-method certification. Accepted totals **58 UX / 56 bugs / 114 distinct definitions**; frozen102 remains42scoped/60NOTRUN/0whole-compoundPASS. No extra credit for introduced regressions, localization completion or cleanup. Equal-value persisted override N02 is being verified separately. Full Essential/all-role and100/100 goals remain incomplete; see the linked per-person evidence and external W57 acceptance ledger.

N02 OwnerEN1440 persisted equal-value reimbursement portion independently reviewed/root accepted on1312170d: new marked QA fixture, projectNoneOct1, explicitWorker5NoneOct2 and Worker7inheritOct2, later projectAtCostOct3. Worker5 keepsOverrideNone, Worker7 followsreadonlyAtCost; saved numeric terms, assignment identities and dated history retained. Five intended writes; one status lost but canonical version/history proves outcome without replay. Equalrate/pay/costpinning, later assignment-copydefaults and operationalmoney remain separateNOTRUN. No operational sources/finalization, browserclosed. Zero newquota;58UX/56bugs and frozen102coverage unchanged. Exact scope in linked evidence and externalN02Solreview.

W63 WorkerEN1440 on1312170d independently reviewed/root accepted within scope: BUG016 mixed-date weekly rejection names Sep30, retains all rows and leaves zero partial sources; eligible-only restage creates one Oct2 EUR0.02 Draft. BUG004 natural Submit double activation yields one observedPOST200, Submitted/removesaction and same-ID reload. Exact source Owner auditedDeleted with reason/retained before-history, detail404/marker0; ordinary Withdraw and universal replay NOTRUN. Frozen102 now43scoped/59NOTRUN/0whole-compoundPASS; no new quota,58UX/56bugs unchanged. Chief/other variants and full Essential acceptance remain pending. Browser explicitly closed before next source deployment.

W62 combined two-file source candidate adds direct person-heading navigation, full-predicate local dirty markers/count and scoped checkbox/label alignment after actual six-person and checkbox beforeproof. Component69b7e348/catalog04855853 passed static gates and fresh independent GPT-6.1 Sol SHIP; all financial/server/guard/payload contracts remain unchanged. Production deployment and browser focus/state/locale/geometry/save verification pending, zero credit yet. Browser closed; next lease follows deployment and cleanup. Details and exact hashes are in linked per-person evidence and external combined source review.

W62 source09d77b6f/archive6805159aec47fdd88edcb065598a37002d775c7ec79bbd07b6b0bf157f7352f8 activatedOctober3 03:43:49 with24-document backup and build/upgrade/readiness/jobs gates. Cache7.021GB reclaimed/final0B; obsolete W57-language images removed, W62current/W61rollback and three backups retained. Watchers/timers active, healthy web containers,17GB free. Sole Sol browser resumes after cleanup for the scoped UI and equal-pin checks; no runtime acceptance/extra quota yet,58UX/56bugs and43scoped/59NOTRUN/0whole-compoundPASS unchanged.

W64 independent GPT-6.1 Sol review/root comparison of saved W56 evidence qualifies BUG005 Owner/Finance/Auditor EN1440: exact Worker8 Submitted three-minute source has visible State Submitted under neutral Time source records, distinct from billing/configuration. No repeated app request or new bug definition. Historical102 now44scoped/58NOTRUN/0whole-compoundPASS;58UX/56bugs unchanged. Conditional projection-warning wording, visible Submitted phone cards and W62 repeat remain unverified; full Essential acceptance is incomplete.

W62 independent GPT-6.1 Sol qualification and root acceptance add exactly two UX outcomes (direct person-heading navigation; named local unsaved markers/count) and one visual bug repair (shared selection/pin checkbox layout). Actual deployed09d77b6f Owner/Finance proof includes full eleven-value retention, native keyboard/caption operation, localized counts and complete canonical Discard cleanup; Auditor remains read only. Original roster finishes unchanged and the browser explicitly closes. Accepted progress is **60 UX / 57 bugs / 117 definitions**, with **44 scoped / 58 NOT RUN / 0 whole-compound PASS** in the frozen historical102. Natural pending state and recorded broader variants remain unverified; no extra credit for W57 regressions or role/width/locale variants.

Separate N02 Owner EN1440 proof on the same release confirms equal customer/pay/cost pin independence: new finite marked fixture, ten intended once-only UI actions, Worker5 pins7/3/4c on October2 and keeps them after later October3 rules, while Worker7 follows8/5/6c. Earlier dated values/history remain. Customer rules are project-wide; pay/cost rules are worker/project scoped. Creation status LOST is supported by canonical success/newID without replay; pending state NOT RUN. No operational records or financial finalization. This strengthens an existing requirement with zero quota; assignment-copy defaults, other roles and calculated-money coverage remain partial. See linked per-person evidence and external N02 Sol review. Full Essential and100/100 goals remain incomplete.

W64 Owner EN1440 on09d77b6f independently reviewed/root accepted: BUG006 Daily attention includes the same two Submitted sources as its status filter, count2 from five loaded field records; BUG010 native Name sorting reorders seven distinct files while preserving exact membership/context. Read-only lane closed, zero writes or new quota. Historical102 now **46 scoped / 56 NOT RUN / 0 whole-compound PASS**; accepted **60 UX / 57 bugs / 117** unchanged. Other roles, Technical/state variants, pagination and broader collation remain unverified. Original phone screenshots captured sidebar-transition occlusion; separate fresh settled390 open/close checks show normal unobscured closed navigation, with no persistent defect counted. Exact boundaries are in linked per-person evidence and external W64 Sol receipts/review.

W60 scoped Sol review/root acceptance on09d77b6f: Chief/Worker changed-amount drafts and withdrawals; own19c Needs changes original plus linked20c correction withdrawn to Rejected;17c receipt7+9 rejection retains fields then7+10 saves one split/one expense. Exactly five expenses/two3min Draft times/two new finite grants; grants revoked, protected older records retained. Allocated Draft/time and correction history deliberately retained, no financial approval/payment. Owner Finance All/Needs classification complete two-card positive result excludes two Withdrawn and Rejected sources, qualifying BUG019 inbox/count only. Historical102 now **47 scoped / 55 NOT RUN / 0 whole-compound PASS**; **60 UX / 57 bugs / 117** unchanged. Stale classification guard, full audit, broader roles/accessibility/money remain untested. Browser explicitly closed. W65 live allocation preview is a separate pending uncredited UX candidate.

W65 two-file Crew receipt-preview candidate uses exact totals/remaining/excess, honest incomplete and distinct-worker guidance, EN/ES/PT text and a quiet live region, preserving native forms and financial/server contracts. Crew df85933c/catalog65802cc2 passed static gates including TypeScript and zero-warning component compilation; root actual diff/hash and scoped lint/format/diff checks pass. Fresh independent GPT-6.1 Sol source SHIP accepted by root; production deployment and single-browser proof remain pending. Exactly one invalid16c/17c Save is selected, no successful allocation; bounded fresh fixture cleanup preserves protected W60 history. **60 UX / 57 bugs / 117** and historical **47 scoped / 55 NOT RUN / 0 whole-compound PASS** remain unchanged.

W65 sourcecaee25ec/archive84a91eb0f0b1d06e400456857479ac188cc7546ed4c6d9f5b131f04b8b508db1 activatedOctober3 05:27:33Madrid. Serialized builds/25-document backup/readiness/jobs passed and deployed hashes match review. Cache7.017GB reclaimed/final0B, obsoleteW61images removed with all-container-reference guards, W65current/W62rollback and three daily backups retained; timers active, containers healthy,16GBfree. Sole Sol browser resumed only after cleanup, runtime/count pending. W67 saved W52 Auditor invoice-guidance review/root comparison also resolves stale pending wording with global-register versus project-tab limits; zero quota/counter change.

W66 Owner delegation date/state clarification is source-ready: Crew59a25c7f/catalog837c7aba passed static gates/root inspection and fresh independent Sol SHIP. Only loaded-date range explanation/relationship labels/localized revoked wording change; native forms, stored status, full authorization and W65 preview preserved. Future existing-grant browser plan requires zero grant/revoke writes, after W65 closure and separate deployment. One provisional UX only, no current bug/quota; **60 UX / 57 bugs / 117** and historical **47 scoped / 55 NOT RUN / 0 whole-compound PASS** unchanged.

W65 pre-repair browser closed after exact preview/quiet feedback/oneinvalid200 retention/Cancel/reset proof. Independent Sol verdict FIX FIRST: actual rejected390 layout expands301.625px form children to350.453px/document395; normalSPA header language updates shell/URL but leaves Crew/document stale. Full-load translations/PTcomma proof is separate. Same17c unallocated Draft/two3min Draft times/twoActiveOct3grants deliberately retained for onepostfixrejection and ordinarycleanup; no newfixture, no approval/payment. Combined W70/W71 Crew5cf6507f static/root gates pass; fresh source review/deployment/afterproof pending. W65/W66/newbugs remain uncredited; **60 UX / 57 bugs / 117** unchanged.


W71 separate predeploy Chief browser confirms Cancel leaves native ES with unchanged EN URL/body/document/action and complete draft/token/time origin. Zero Save/stored writes, ordinary local cleanup and explicit close. Final combined Crew5cf6507f/layout08c50a6f/catalog837c7aba candidate restores committed native selection before existing navigation and fixes Crew locale precedence/rejected allocation layout. Complete static gates and root diff/hash/scoped checks pass; fresh independent GPT-6.1 Sol combined review SHIP accepted by root. Prior Crew-only review does not qualify the layout addition. Production/normal-header/Cancel/error-fit/fixture-cleanup afterproof pending, no quota; **60 UX / 57 bugs / 117** unchanged. Latest user restriction remains GPT-6.1 Sol only and one serial browser.


Combined697009ac/archive0944ca6e62caba9b0b3e53046a86f8d633545209ad541284cf11f92d92ce921a activatedOctober3 06:17:09Madrid; reviewed hashes,26-document backup/build/upgrade/local/public/jobs gates passed. Docker portal initialstarting settled healthy before solebrowserlease. Cache7.017GB/final0B, obsoleteW62images safely removed; current/W65rollback and three daily backups retained, timers active,15GBfree. Sol browser resumed retained-fixture W65/W70/W71 afterproof/cleanup only; W66 separate later plan. No runtime/count acceptance yet: **60 UX / 57 bugs / 117**, historical **47 scoped / 55 NOT RUN / 0 whole-compound PASS** unchanged.


W65/W70/W71 closed Sol review and root acceptance add **1 UX +2 bugs**: live receipt-share arithmetic, rejected allocation layout, and one successful/canceled Crew language family. Actual697009ac proof includes same-document locale/Cancel, complete8-control retention, one invalid200, four rejected widths/native keyboard and exact ordinary cleanup. New receiptWithdrawn/timesVoid/newgrantsrevoked; protectedW60Drafts/oldgrants retained, browserclosed. Revised accepted progress **61 UX /59 bugs /120**, historical47scoped/55NOTRUN/0whole-compoundPASS unchanged. W66 Owner guidance remains separate pending proof; wider role/race/translated-error/accessibility/history limits remain explicit in linked evidence.


W66 closed Sol review/root acceptance adds1UX for Owner administrative delegation status versus loaded-date coverage. ActualOct3outside→typedunappliedOct2stillOct3→normal303Oct2within→303restoreOct3outside preserves exactActiveIDs/dates, Revokedmultiset and blankgrantpeople; localizedspecific hints visible, browserclosed. No Grant/Revoke actions; metadatareset and scrolledparagraph/Dateinputfocus limits preserved. Current **62 UX /59 bugs /121 definitions**, historical47scoped/55NOTRUN/0whole-compoundPASS unchanged. Broaderrole/eligibility/money and100/100 remain incomplete.


W68 closed Finance697009ac zero-save proof/rootacceptance adds scopedN03 controls/reset coverage, +0: configurablelocaldefaults/noOwnerWorkertable, legitimateManagerBasics, ordinaryreset/noaddedPOST/explicitclose. ActualmisleadingFinanceintro and oversized672.5×44defaultscheckbox confirmed. CombinedW69/W72 three-file source852573bd/f4a049a2/35df9ccf passes static/rootchecks and freshwholeSolSHIP; roletext/14scopedCSSlines only, nativefinancialcontracts preserved. ExistingN13/W62familycompletions, noextraquota; OwnerFinancebrowserafterproof/deploymentpending afterN02closure. Current62UX/59bugs121 unchanged.


N02 closed Sol review/root acceptance adds existing N01/N02 copied-default independence proof on697009ac, +0: finite W4 copies A(.11/.04/.06/None), later B leaves its complete form/fingerprint and original W5/W7 unchanged, distinct W3 copies B(.13/.05/.08/AtCost). Four intended configuration actions retained; first statusLOST/no replay and transient wrong-date capture remain explicit. Settled dated review, clean final Billing and browserclosure observed; no operational/finalized money writes. Rendered lineage/full monetary/other-role coverage remains incomplete. Current62UX/59bugs121 and historical47scoped/55NOTRUN/0whole-compoundPASS unchanged; linked evidence contains exact scope.


W69/W72 source3fce9958/archive34fdca2b activatedOctober3 07:15:37Madrid, N02browserclosedfirst. Reviewed deployedhashes/build/26documentbackup/upgrade/public/jobs and normalDockerhealth passed. Cache7.017GB/final0B, obsoleteW65images safelyremoved; current/W70rollback and three daily backupsretained, timersactive,14GBfree. SoleSol Owner/FinancezeroSavebrowser startedaftercleanup; runtime+0completionspending,62UX/59bugs121 unchanged.


W69/W72 closed Owner/Finance Sol review/root acceptance completes existingN13 wording/W62-B01 sizing +0 on3fce9958. ExactFinanceENESPTphone intro/Ownercontrols, fourcompactcheckboxsamples, normalreopen-basedJSONretention and complete30controlreset eachrole proved; noSave/rows, mainnetworkunchanged, explicitclose. Immediate2Space fails because existingenablement closes disclosure/hidesfocus; separateW73candidate, notCSSregression/acceptedfix. Cleanuptransport/finalFinanceURL and widerfinancial/server/creation limits preserved. Counts62UX/59bugs121 unchanged.


W73 preexisting defaultsOFF hidesfocus/blocks immediateSpaceON reproduced within W69/W72; workaroundretainsvalues, no dataloss/CSSregression. Minimal onefile64edfe7d/diff4928e932 separates native disclosurestate from businessenablement, unchangedfinancialcontracts. Static/zero-warningcompile/rootactualdiff and freshSolwholeSHIP accepted. Deployment waitsW74browserclosure; Owner/FinancezeroSaveimmediatekeyboard/manualsummary/reset afterproof pending. Atmostonebug provisional, noacceptedquota;62UX/59bugs121 unchanged.


W74 actualFinance3fce9958 boundedconfigurationPASS/rootaccepted,+0: W7Oct4recoveryAtCost preservesNonefallback/Inherit/rates; projectinheritOct5version3→4 preservesallfouragreements/explicitcontrols/history. Two200configsuccessorsretained, nooperations, cleanBilling/scoped0registers/explicitclose. ExpectedfutureAtCost→None isconfigurationinference only; no renderedresolved/payoutoracle. Current62UX/59bugs121 unchanged; fullreceipt/reviewlimitsinlinkedevidence.


W73 source2c9f4079/archivee1c838a7 activatedOct3 07:42:44Madrid afterW74closed. Exacthashes/26documentbackup/build/upgrade/readiness/jobs/normalDockerhealth passed. Cache7.034GB/final0B, obsoleteW70safelyremoved,current/W72rollback/3dailyretained,timersactive,13GBfree. SoleSol OwnerFinancezeroSave immediatekeyboardafterproofactive; maxonebugpending,62UX/59bugs121unchanged.


W73 closed Solreview/rootacceptance adds exactly1bug0UX: native defaultsOFF keepscontainingsection andsamevisiblefocusedcheckbox, immediateONrestoresfullJSON inOwnerFinance390/1440. Manualsummary/reset/0Save/rows/explicitclose verified. PreexistinginteractiondistinctfromW62sizing; no data loss orrole-widthdoublecredit. Current **62UX/60bugs/122**, remaining38UX/40bugs; historical47scoped/55NOTRUN/0whole-compoundPASS. FullSSR/rows/server/race/privacy/money limits remainexplicit.


### 2026-10-03 — W78 reimbursement and expense review candidate

CORE-02/03/06/14/15: the exact eight-file candidate passed hash-attributed static gates and fresh independent GPT-6.1 Sol financial/privacy review (full diff SHA256 `d8c77c83b5aeddf68c4985583f95e1785f13f3280b0e54e7f60ba0e153a86683`). Dated selected-person reimbursement lookup, local unsaved-policy confirmation/date recovery, authorized correction-origin navigation and unsaved weekly expense recap are source-ready. Production build and browser outcomes remain pending. No financial algorithm, action or permission expansion; no source-only quota credit. Accepted totals remain 62 UX / 60 bugs. Detailed evidence: `docs/evidence/project-worker-terms-browser-20261002.md` and external W78 source/review packets.


### 2026-10-03 — W78 production activation and retention

CORE-17: application `532b15f7`, archive `056630610a757bc9a061cdfedbdde26afe20fe1157d90c4cd03c6aa4e73fb554`, activated 10:59:37 Europe/Madrid. Serialized builds, 26-document preactivation backup, upgrade, local/public readiness, jobs and healthy current images passed; all eight reviewed deployed hashes match. Cache reclaimed 7.018 GB/final 0B. Exact image/reference guards removed only obsolete W72; current/W73 rollback and three daily backups retained, timers/watchers active, 12 GB free. Sole zero-domain-write browser afterproof started only after cleanup. No additional quota or all-role acceptance; totals 62 UX / 60 bugs. Full deployment/cleanup receipt: external `finance-auditor/ROOT_W78_DEPLOY.md` and linked repository evidence.

## W78 aceptado por alcance y W79 pendiente — 2026-10-03

Aceptadas tres mejoras UX: revisión del reembolso configurado por persona/fecha/pagador/categoría, navegación de una corrección al gasto original autorizado y resumen exacto/completo del lote semanal aún sin guardar. Evidencia real cerrada de126eventos, revisión independiente Sol y recomputación de controles/limpieza. Totales65UX/60bugs; faltan35UX/40bugs. Los102 históricos conservan47alcances/55sin nueva prueba/0certificaciones compuestas completas. No Save financiero, pago, privacidad universal ni total de red de toda la sesión.

W79 corrige únicamente el idioma reactivo del detalle de gasto, observado con cabecera portuguesa/cuerpo español. FamiliaW71, crédito adicional0. Fuente revisada SHIP, lint/formato/TypeScript correctos y compilación Svelte0/0advertencias; despliegue y navegador posterior pendientes. Detalles y límites: `docs/evidence/project-worker-terms-browser-20261002.md`.


## W79 desplegado y limpiado; revisión del navegador pendiente — 2026-10-03

CORE-17: aplicación8a630faa/archive023ba114 activada12:14:29Madrid; fuente revisada del detalle de gasto verificada, backup26documentos, upgrade, disponibilidad pública/local, portal/site saludables y jobs correctos. Cache7.034GB/final0B; comprobación de18referencias antes de eliminar sólo imágenesW73 obsoletas. W79actual/W78rollback, tres backups diarios y timers activos conservados;11GBlibres. Sesión única cerrada con No open tabs tras40eventos del plan nativo de idiomas/Cancel. Revisión independiente de ejecución pendiente; familiaW71+0, totales65UX/60bugs sin cambio. Evidencia y límites en `docs/evidence/project-worker-terms-browser-20261002.md` y ROOT_W79_DEPLOY.md externo.


## W79 ejecución aceptada por alcance — 2026-10-03

CORE-02/06/15: revisión Sol SCOPEDPASS/SHIP y recomputación de root aceptan el idioma reactivo del detalle y Cancel nativo con token/campos intactos. GET aceptado rota token y conserva motivo local; limpieza visible restaura campos y registros protegidos, cierre explícito. FamiliaW71+0;65UX/60bugs. El aviso genérico de pérdida y opciones/etiqueta de recibo sin traducir siguen como candidatos separados. Sin certificación completa de roles, traducción, anchuras ni finanzas. Informe SHAe4df2782 y packetSHA918ce12a en evidencia vinculada.


## W80 flujos reales aceptados por alcance — 2026-10-03

CORE-02/03/06/14: Worker3 creó una única corrección21c mediante doble activación nativa y la retiró a Rejected; original19cNeedschanges y corrección20cRejected conservados. Worker5 creó una pareja3min/1c y una retirada conjunta dejó ambosWithdrawn, enlaces/hechos/historia conservados, totales activos restaurados y60minApproved protegidos. Cuatro comandos,97eventos cerrados, revisión Sol SCOPEDPASS/SHIP SHAa4d5fdd6 y recomputación de root. BUG009/033 ganan ramas limitadas; no Submit/privacidadPM/concurrencia/auditoría completa. +0;65UX/60bugs e histórico47alcances/55sinprueba sin cambio. Detalles e IDs en evidencia vinculada.


## W83 fuente revisada; despliegue/prueba nativa pendientes — 2026-10-03

CORE-02/03/06/15: cuatro fuentes congeladas, avisos específicos veraces EN/ES/PT,15categorías canónicas sin cambios con etiquetas registradas y recibo opcional traducido. Formato/lint/TypeScript/diff correctos; dos componentes compilados baseline/final0warnings. Root acepta SHIP independiente SHA0ffab604 y diff completoSHAff370d87. Sin cambio de guards, campos/tokens, permisos ni reglas financieras. Despliegue/navegador/dedup pendientes; avisos+0, traducción candidata máximo1bug todavía sin crédito.65UX/60bugs sin cambio.


## W83 desplegado; prueba nativa pendiente — 2026-10-03

CORE-02/03/06/15: e9af38c2 desplegado13:30:50Madrid mediante retry canónico después de fallo por espacio y rollback verificado. Cuatro hashes congelados correctos, portal/site saludables, jobs/preflight/URLs públicas correctos. Caché Docker0B, cuatro tagsW78 obsoletos sin referencias retirados sinforce, W79rollback conservado y18referencias completas sin cambios. Backup canónico26documentos conservado con snapshots diarios1/2/3Oct; timersactivos y12GiB libres. Evidencia vinculada y ROOT_W83_DEPLOY.md externo. Navegador/dedup todavía pendientes; +0,65UX/60bugs e histórico47alcances/55sinprueba sin cambio.


## W83 prueba nativa aceptada por alcance — 2026-10-03

CORE-02/03/06/15: revisión Sol SCOPED PASS / SHIP y recomputación de root del packet cerrado de 162 eventos aceptan un único bug W81: categorías y etiqueta opcional de recibo traducidas en el formulario de corrección, conservando 15 valores canónicos y hechos protegidos. Seis Cancel con snapshots y tráfico idénticos; GET aceptados con retención/refresh veraces, limpieza y cierre explícitos. Avisos W80/W82: +0. Límites de captura/modal/header/file/crops conservados; sin pruebas de Save, uploads, finanzas ni todos los roles. Totales **65 UX /61 bugs**, histórico 47 alcances/55 sin prueba sin cambio. Detalles en evidencia vinculada y QUALIFIED_W81_ADDITION.md externo.

## W84 validación nativa y candidato W85 — 2026-10-03

CORE-02/03/06/15: packet Worker3 EN390 cerrado (61 eventos, SHA634c857f) demuestra importe inválido con foco/error fuera de pantalla y enlace «Enter a reason» al título en vez del textarea tras rechazo lógico. Bloqueo nativo sin petición; único POST de motivo con espacios rechazado, siete IDs sin cambios y cero registros nuevos. W85 propone mensaje decimal ya traducido, revelado nativo exclusivo de corrección de gasto y destino de motivo condicionado a create autorizado, manteniendo retiro/privacidad/semántica financiera. Prettier, lint, TSC y compilación Svelte directa sin warnings; revisión independiente y prueba nativa desplegada pendientes. Evidencia y límites en sección W84/W85 vinculada y artefactos externos. Sin crédito: **65 UX /61 bugs**, histórico sin cambio.

W85-R1 SOURCE SHIP aceptado por root (revisión SHAac8773ff, diff cumulativo SHAe5cf48ba): el HOLD inicial del destino bajo header se resuelve con margen local 8rem en textarea de gasto/PM, manteniendo Time y recuperación del servidor. Hashes de tres fuentes y baseline Git, gates y warnings verificados. Artefactos iniciales y HOLD conservados. Producción y prueba nativa aún pendientes; cero crédito adicional.

## W85 desplegado; prueba nativa en curso — 2026-10-03

CORE-02/03/06/15: commit465786bf/ZIPe44193f81b32 desplegado14:56:31Madrid una vez por proceso canónico serializado, con backup previo, salud local, jobs actor y readiness públicos. Tres fuentes exactas; rollbackW83 y W79 preservados. Cache0B tras liberar7.032GB; prune canónico correcto, snapshots1/2/3octubre y nuevo26docs intactos,18referencias/cuatro volúmenes iguales tras mantenimiento. Timers activos y8.6GiB libres. Sesión de navegador única concedida después; sin operaciones release durante prueba. Sin crédito por despliegue:65UX/61bugs. Evidencia ampliada y ROOT_W85_DEPLOY.md externoSHA57efe580; verificación nativa/dedup pendientes.


## W85 prueba nativa aceptada por alcance — 2026-10-03

CORE-02/03/06/15: packet cerrado129eventos, revisión Sol SCOPED PASS/SHIP SHAe7f1dce8 y recomputación de root SHAc5ea0097 aceptan1UX/2bugs: formato decimal comprensible, errores nativos visibles con foco y enlace real al textarea de motivo. Cinco bloqueos nativos sin tráfico; único POST200 rechazado lógicamente, sin registros nuevos,14campos/token intactos y siete fuentes protegidas sin cambios. **66UX/63bugs**, faltan34UX/37bugs; histórico47alcances/55sinprueba sin cambio. PM/keyboard/roles restantes sin prueba; summary automático del servidor todavía fuera de pantalla, reparación posterior+0. Después del cierre, ocho ZIP de inbox obsoletos verificados contra copias auditadas conservadas liberan2.31GiB; rollback/source/audits/backups/18referencias/4volúmenes intactos y cinco unidades activas. Mantenimiento+0. Evidencia ampliada vinculada y QUALIFIED_W84_ADDITIONS.md externo.

## W87 candidato de claridad Owner y duración Crew — 2026-10-03

CORE-02/03/04/06/15: beforeproof Owner92eventos SHA7de14e29/revisión5606d95e y Crew89eventos SHAfa04d0fa/revisióna6aea014 cerrados y aceptados por alcance. Copia local conserva fecha propia del trabajador; defaults provisionales no borran override local. Crew rechaza0.0167h válidas en primer Save, mientras Worker convierte naturalmente a1min sin Save. Un grant temporal, un rechazo y una revocación exacta; cero fuentes nuevas, protegidas intactas y No open tabs. Seis fuentes congeladasW87 SHA2288cc5c: aviso de fecha, recap actual de defaults, parser de tiempo4decimales/redondeo con límite24h antes y summary automáticoW86+0. Prettier/lint/TSC y tres compilaciones Svelte baseline/final sin warnings; fallo inicial de formato y erratum de hash auxiliar conservados. Revisión final, push/deploy y afterproof nativo pendientes. **66UX/63bugs sin cambio**, máximo condicional2UX/1bug; histórico47/55 sin cambio. No certificación completa de roles/historia/pago. Evidencia ampliada vinculada y artefactos externosW87.

W87: root acepta revisión independiente completa **SOURCE SHIP** SHA348f35a6 para seis fuentes congeladas2288cc5c; hashes baseline/final/protegidos y gates completos verificados. Fallo inicial de formato y timestamp heredado conservados con límites explícitos. Push, activación real y afterproof pendientes;66UX/63bugs e histórico47/55 sin cambio.

## W87 desplegado y mantenimiento verificado — 2026-10-03

CORE-02/03/04/06/15: c2681bae/ZIP786180f6634a desplegado17:41:34Madrid una vez,4713archivos y seis fuentes exactas, backup26documentos, salud/jobs/readiness correctos. W85rollback nuevo y original/W83/W79 conservados. Cache0B después7.042GB liberados; prune0adicionales, snapshots1/2/3octubre.18referencias/cuatro volúmenes intactos tras limpieza, cinco unidades activas y8.05GB libres. Navegador cerrado durante release; afterproof separado pendiente.66UX/63bugs sin cambio, +0. Evidencia ampliada vinculada y recibos externosW87.

## W87 afterproof nativo aceptado y W88 wording — 2026-10-03

CORE-02/03/04/06/15: root acepta2UX/1bug tras Owner154eventos/revisiónaec26acd y Crew121/revisión721b818d, con recomputación independiente: aviso de fecha propia en copia, recap actual de defaults por assignment y primer SaveCrew0.0167h→1min. Duplicado rechazado, nuevoDraftVoid/grantRevoked, seis protegidos iguales y No open tabs; errores77/81 sin activación/POST conservados. **68UX/64bugs**, faltan32UX/36bugs; histórico47alcances/55sinprueba/0PASScompuesto. OwnerdraftEN390/1440 y ChiefSharedEN1440 únicamente; historia guardada/roles restantes sin prueba, límites de red/prebaseline/atribución explícitos. Evidencia ampliada vinculada y QUALIFIED_W87_OWNER_ADDITIONS.md/QUALIFIED_W87_CREW_ADDITION.md externos.

W88: dos fuentes cambian solo caption de selección bulk y traduccionesES/PT, no handlers/valores/payload/roles/money/version. Gates scoped y compilación Svelte0warnings; SOURCE SHIP45828827 aceptado por root, deploy/browser pendiente,+0. Tras cierre real: imágenesW79sinreferencias y cuatroZIPfuenteprocesados obsoletos retirados para espacio; actualW87/rollbackW85W83/audits/source/ZIPoriginalW79/Git/datosprivados/18referencias/4volúmenes/3backups intactos. Datos empaquetados antiguos idénticos alZIPW87; noDB, no copiaZIPcompleta afirmada.11.585GB libres, watchers pausados para release; mantenimiento+0.


## W88 desplegado y mantenimiento aceptado — 2026-10-03

CORE-02/03/04/06/15: commit1f8fba27/ZIPfc25afe489a4 desplegado19:51:25Madrid una vez;4713archivos, dos fuentes de caption y20protegidas exactas, salud/site/portal/jobs/readiness correctos. Verificador inicial rechazó formatoZIPnormalGit; fallo conservado y archivo existente validado sin rehacerlo. W87rollbacknuevo+original/W85/W83 exactos. Cache0B tras liberar7.017GB; prune0adicionales, backupsOct1/2/3 con14/24/26documentos.18referencias previas y4volúmenes intactos; servicio ajeno añadido simultáneamente:19referencias finales. Cinco unidades activas, scanner procesando inbox naturalmente y7.917GB libres. Helper de metadata corregido contra conteos históricos reales; stops conservados, sin créditoapp. Recibo root680d5b40/after9331d3cb y ROOT_W88_DEPLOY.md externos. Browsercaption todavía sin prueba; **68UX/64bugs**, histórico47/55/0 sin cambio, +0.


## W88 caption nativo aceptado por alcance — 2026-10-03

CORE-02/03/04/06/15: OwnerEN/ES/PT y FinanceEN, packet61b6a934dd/revisiónSol53091724/recomputaciónroot: checkbox y dos bulkbuttons son únicas diferencias,4cards/7forms restaurados, dirty0 y POSTnegocio0 por pares. Financecrop274×45 solamente; ES/PTFinance/historia/otrosroles sin prueba. Errors1/33/34/43 y close59→blank60→cleanup61 conservados; NoTabs real, no claim de contexto ininterrumpido ni tokens ocultos. Watchers restaurados tras cierre. +0, **68UX/64bugs**, histórico47/55/0 sin cambio.


### Continuación W89/W90 — 2026-10-03

Prueba nativa W89 cerrada83eventos y revisión Sol independiente `dfd7c7a6`, aceptación raíz `44f67e0a`: ampliar el intervalo válido de Worker4 desplaza indebidamente la misma tarifa fija EUR0.12 aprobada a pendiente, conservando60min aprobados; intervalo estrecho restablece el importe y el amplio reproduce. Finance confirma reparto aprobado0.12/0.00. Su explicación válida del proyecto carece de controles de período. Auditor solo acredita identidad; selección equivocada del probador deja la comprobación dependiente NOT RUN. Errores del probador/capturas transitorias se conservan; no se cuentan.

Candidato W90 de2fuentes: prioridad aprobada/bloqueada del grupo fijo sin duplicar importe BigInt; formulario GET de período disponible en explicación válida, conservando errores y recuperación existentes. Formato/lint/TSC de database/portal/compilación Svelte sin advertencias PASS,25fuentes protegidas iguales, freeze `05f0c4f9` y diff reversible `946f5ac5`. Revisión independiente de fuentes, push/despliegue y prueba nativa posterior pendientes. Antes solo FixedProjectAmount demostrado; otras2familias fijas compartidas requieren prueba nativa o NOT RUN. Conteo aceptado68UX/64bugs sin cambio, techo condicional1UX/1bug; cobertura original47scoped/55NOT RUN/0PASS compuesto.

Revisión independiente de fuentes **SHIP** `d7f85959` leída y aceptada por raíz contra freeze final `05f0c4f9`, diff completo y27identidades de fuentes. Prosa larga/manifiesto inicial conservados; sin cambio de fuentes/gates. Push/despliegue y prueba nativa posterior pendientes;68UX/64bugs sin cambio.

### W90 producción/mantenimiento — 2026-10-03

Commit `a76a138c` / ZIP `111e9366d776…` desplegado una vez a las 21:37:28 Madrid, tras push y SOURCE SHIP. Archivo de 4.713 fuentes exactas, delta de dos fuentes/dos documentos y 27 hashes desplegados exactos. Build, backup con 26 documentos, salud pública/local y jobs PASS. Cache: 6.965 GB liberados y 0 B restantes. Retención canónica: cero retiradas adicionales, snapshots de octubre 1/2/3 con 14/24/26 documentos intactos.

19 referencias, cuatro volúmenes y las imágenes W88/W87/W85 coinciden antes/después; 8.278.155.264 bytes disponibles. Copias extraídas W79/W83/W85 retiradas tras verificar ZIP/Git exactos y ausencia de referencias; originales, audits, Git y fuentes extraídas W90/W88/W87 intactos. W13/W14 no retirados. Snapshot de salud inicial y parada por orden de mounts conservados; continuación limitada sin repetir el unlink W57. Watchers ZIP pausados hasta el cierre nativo próximo; demás tres timers activos. Evidencia externa ROOT_W90_DEPLOY.md y aceptación 4aaf247b / metadata posterior ab8e3347. Prueba nativa posterior pendiente: 68 UX /64 bugs sin cambio; histórico 47/55/0.

### W90 prueba nativa de producción aceptada — 2026-10-03

CORE-02/03/04/06/15: packet cerrado102eventos `5fea0de7`, revisión independiente GPT-6.1 Sol SCOPED PASS `237f22f3` y aceptación raíz `0bf23549`: exactamente1UX/1bug. Worker4 mantiene EUR0.12 aprobado/0pendiente y60min al pasar estrecho→amplio→estrecho, contando una vez la tarifa fija; USD18.75/3.75 y75min intactos. Finance/Auditor eligen fechas en pantalla válida mediante GET: octubre1 cero fuentes/importe, octubre2 dos fuentes aprobadas de30min/EUR0.12. Ambos recuperan rango invertido con valores retenidos y guía, corrigen y restauran fechas. Finance360/390/768 muestra labels/fechas/botón completos y44px; desktop restaurado.

30proyecciones completas/32snapshots/6imágenes, hashes y eventos verificados por raíz; identidades frescas y retornos auth suprimidos. Metadata final6POSTauth/0POSTnegocio; errores12/32 y estados13/36 excluidos. NoTabs real102 sin herramientas posteriores, watchers restaurados inmediatamente. **69UX/65bugs**, faltan31UX/35bugs; histórico47/55/0sin cambio. Otras familias fijas/Daily, roles/locales, reglas/versiones inmutables, pagos e historia completa NOT RUN. Restauración de intervalo, no igualdad exactaURL/DOM. Daily y mantenimiento+0; evidencia ampliada vinculada y ROOT_W90_NATIVE_AFTER_ACCEPTANCE.safe.json externo.


### W91 Daily antes / W92 fuente aceptada — 2026-10-03

CORE-02/03/04/06/15: W91 cerrado77eventos, raw4c601990, revisión GPT-6.1 Solf4ba4ea7 y aceptación raíz42a7ce6c: Worker8 octubre2 Daily EUR0.10aprobado/0pendiente; nuevo draft propio3min mueve indebidamente la tarifa a0/0.10 con60min aprobados. Delete normal protegido retira solo el nuevo draft; cuatro registros originales y ambos períodos restaurados. Finance confirma método Daily visible. Inventario registra Create200+4auth, sin par Delete: no cobertura completa de tráfico. NoTabs77 real, watchers restaurados antes de ensamblar.

W92 una fuente/+3−3: prioridad Approved/Locked del grupo Daily conserva una única tarifa;26fuentes protegidas, agrupación/fechas/elegibilidad/divisas/comandos/historia exactos. Formato/lint/TSC database+portal PASS; freeze2c02b754/diff e42a9324/gates c2b6c040 y SOURCE SHIP independiente46391b08 leídos y aceptados por raíz. Interrupción inicial previa a escritura/gates conservada. Push/despliegue/prueba nativa posterior pendientes. Finalización de familia W90+0: **69UX/65bugs**, faltan31/35; histórico47/55/0 sin cambio. Variantes legacy/locked/pending-only, otros grupos/roles/locales/pagos NOT RUN.


### W92 producción y mantenimiento aceptados — 2026-10-03

Aplicación `08361cb2` / ZIP `54c7368b540b…` desplegada una vez a las 23:30:17 Madrid tras push y SOURCE SHIP. Los 4.713 archivos Git/ZIP son exactos, con una fuente y dos documentos cambiados; 265 fixtures intactos y 27 hashes desplegados verificados. Build, backup con 26 documentos, salud pública/local y jobs PASS. Imágenes W85 no usadas retiradas (2.506.600.448 bytes); originales inbox duplicados W79/W83/W85 retirados individualmente contra audit/Git/CRC/referencias. Todos los audits/Git, W87 original/fuentes/imágenes y rollback inmediato conservados; W13/W14 intactos. Retirada detenida al alcanzar el espacio requerido.

Cache: 6.96 GB liberados y 0 entradas/0 B. Retención canónica explícita PASS, sin retiradas adicionales. Antes `abbf6d79` / después `114c9a9e`: 27 fuentes, 19 referencias/cuatro volúmenes, tags retenidos y tres backups exactos. Octubre 1/2/3 conserva 14/24/26 documentos; sustitución normal del snapshot de hoy durante despliegue, antes de mantenimiento. Aviso legacy-builder conservado, sin crédito de bug. Disponibles 8.127.000.576 bytes; aceptación raíz `69c6d6bb` / ROOT_W92_DEPLOY.md externo. Prueba nativa Daily posterior pendiente: **69 UX /65 bugs**, faltan 31/35; histórico 47/55/0 sin cambio. Operaciones y familia W90 +0. ZIP triggers pausados para una sola sesión.

### W92 Daily producción: prueba nativa aceptada — 2026-10-04

CORE-02/03/04/06/15: packet cerrado76 `721e46ad`, revisión independiente GPT-6.1 Sol SCOPED PASS `d7e699ce`, 54 comprobaciones `5d997178` y aceptación raíz `3c293076`. Finance confirma fuentes Daily Worker8 octubre2/EUR0.10. Worker conserva EUR0.10 aprobado/0pendiente/60min y una tarifa al añadir draft propio3min; W91 antes mostraba0/0.10. Draft nunca enviado/aprobado; Delete normal protegido lo elimina físicamente. Cuatro registros originales/controles y ambos períodos de pago restaurados exactamente; pendiente independiente de octubre1 intacto.

Raíz verifica76eventos/20DOM/33snapshots/4imágenes y visualiza todas. Inventario final4POSTauth200+Create323200; par Delete ausente, sin certificación completa del tráfico. NoTabs76 real, watchers restaurados inmediatamente antes de ensamblar. Finance/Worker8 EN1440 solamente; legacy/Locked/pending-only, otras reglas/divisas/roles/locales/pagos e historia completa NOT RUN. Finalización de familia W90 **+0: 69 UX /65 bugs**, faltan31/35; cobertura original47scoped/55NOT RUN/0PASS compuesto sin cambio.

### W93 Owner: rechazo de fecha y fuente aceptados — 2026-10-04

CORE-02/03/04/06/15: before nativo cerrado57 `5edb11d4`, revisión Sol `1d67cb9f` y aceptación raíz `4714a47b`. Un Create400 con defaultsOct4/asignación heredadaOct3 deja error genérico fuera de pantalla y fecha sin marcar/asociar; 46 controles públicos y override válido conservados. Reset/formulario vacío/registro y búsqueda del marcador sin coincidencias verificados; NoTabs57 real/watchers restaurados antes de ensamblar. Raíz verifica57eventos/17DOM/18snapshots/7imágenes y visualiza todas. Código interno inferido por fuente; no claimDB/tráfico universal. Geometría excluida de igualdad de controles; console400 esperado/storemiss no nativo conservados.

Candidato5fuentes/+165−7: errores semánticos EN/ES/PT por índice real, fecha asociada/enlace exacto y foco visible cancelable por nuevo rechazo. Guard/código400/orden previo a repositorio/JSON/nombres/finanzas/historia/permisos y22 fuentes protegidas intactos. Formato/lint/TSCportal/compilación Svelte0→0warnings PASS; formato inicial1→corrección0 conservado. Freeze `ec39a599`/diff `9ef24786`/gates `636dc2d4`, SOURCE SHIP Sol `c895750b` y aceptación raíz `4a1daefe`. Push/despliegue/prueba posterior pendientes. **69UX/65bugs**, faltan31/35; histórico47/55/0 sin cambio. Máximo1UX condicionado a resolución dirigida nativa posterior y dedup;0bugs, sin crédito actual.

### W93 production and maintenance accepted — October 4, 2026

Actual pushed source `555c87c0a450c9be6af79777618df1701de6e70b`; archive `4d285402142da7fa875c8447d71950ce4be91bf4f9ad24d6414e3953ac602036`, 310,223,551 bytes and 4,713 Git files. Exactly five reviewed sources and these two evidence documents changed; all 265 tracked source fixtures are unchanged. One canonical deployment ran 23:05:15–23:08:46 UTC, exit 0, with readiness, public health and jobs gates. Portal/jobs image `33261aad`, site `e50e4f41`; all 27 source hashes match. Native Owner afterproof is still NOT RUN.

Qualified W87 retirement preserves its audit ZIP and Git backing, all audit ZIPs, current W93 and W92/W90/W88 rollback releases, 19 container references and four volumes. Initial cleanup stopped with zero mutations because its whole-stat guard included read access time; the separate corrected one-shot receipt retains that pause. The estimated space target was not met; an exact immutable Git archive stream forecast matched the package and preserved the same 10 GiB floor plus 100,034,560-byte reserve, without expanding cleanup.

The first post-deployment snapshot caught Docker health starting; the first maintenance attempt stopped before either operation. After both web containers became healthy, a fresh pinned snapshot supported one build-cache prune (6.959 GB reported) and one canonical retention start. Cache is now 0 entries/0 B; the legacy-builder warning remains recorded. Canonical deployment replaced daily backup coverage with October 2/3/4 (24/26/26 documents) before the settled maintenance baseline. Settled before `4aa9fecc` / after `2d0f6781` match sources, roles, all container/volume references, retained tags/source roots and backup metadata exactly. Root acceptance `f7d6e732`; approximately 7.96 GB available. No database or document payload was used for these operational checks.

Accepted counts stay **69 UX /65 bugs**, remaining 31/35. W93 earns no credit before its closed deployed native check and fresh dedup review; maximum one conditional UX and zero bugs. Original 47 scoped /55 NOT RUN /0 whole-compound PASS coverage is unchanged.


### W93 Owner date recovery: deployed native acceptance — October 4

CORE-02/03/04/06/15: closed packet `2040c252`, fresh GPT-6.1 Sol review `6d06f812` with 57 checks and root `ROOT_W93_NATIVE_AFTER_ACCEPTANCE.safe.json`. First return after Create 400 focuses the indexed inherited Starts-on date with readable, associated EN/ES/PT remedy; 46 public values and valid sibling override remain. Phone offered-anchor recovery and canonical defaults OFF/zero-row restoration verified. Root verified 65 events / 20 DOM captures / 20 snapshots / eight images and viewed all images. NoTabs 65 and immediate watcher restoration precede assembly. Seven hidden suppressed controls excluded; raw action URLs differ only by literal `lang=en`. Owner desktop rejection and phone anchor only; corrected successful creation, phone Create, cancellation race, other roles and financial history remain NOT RUN. One distinct directed recovery UX; supporting captions/focus/retention/locales/widths not split. **70 UX / 65 bugs**, remaining 30/35; original 47/55/0 unchanged. Application `555c87c0` unchanged by this documentation acceptance.


### W94 historical cross-project pay: scoped native acceptance — October 4

CORE-02/03/04/06/15: 73 native calls with Owner/Finance/Worker 5; packet `4ad39027`, independent Sol review `393728fe` (145 checks), root acceptance `73b1c502`. Finance actual Dedicated pay/cost 2/3c and Timezone 1/1c agree with Worker 5's displayed 2c + 1c = 3c, plus directly displayed 120 approved aggregate minutes in both intervals. EUR 2.00 reimbursements are separate. Root matched 97 manifest files/73 event objects and viewed actual screenshot. All role contexts restored; ordinary NoTabs 73 and immediate watcher restoration precede assembly. Zero business POSTs only in captured passive brackets. Stale returns, first failed Finance identity and timeout preserved. Exact per-source minutes/rate multiplication, computed October 3 pricing, Owner Timezone October 2, assignment IDs and all-role coverage NOT RUN. Existing N01/N02/N16 **+0: 70 UX / 65 bugs**, remaining 30/35; original 47/55/0 unchanged.


### W97 first individualization / W99 pending repair — October 4

CORE-02/03/04/06/15: closed Owner49-call BEFORE, fresh Sol `462d3a24`199checks/root`5bfd13a9` qualify an unexplained first override pay change 0.12→0.05 while explicit sibling0.07 remains. Root decision`d6642ba8` requires copying currently displayed defaults on first customization and remembering previous individual terms. One-component repair`f17c9de2`/staticgates`3605b487`: formatting/lint/TypeScript/diff/zero-warning Svelte compilation passed;26protected sources unchanged, submission payload/CSS unchanged. Supporting PATHfailure preserved/corrected, noappfinding. Fresh Sol source review `21480c00` / 61 checks accepted; push/deploy/native AFTER pending. **+0:70 UX /65bugs**, remaining30/35; maximum conditional1UX0bugs, no saved-money conclusion/all-role promise; original47/55/0 unchanged.


### W99 first individual override: deployed and accepted — October 4

CORE-02/03/04/06/15: pushed application `a3f66cdc` / ZIP `f65682c4` deployed once at 04:14:27 Madrid; one component and 26 protected sources verified, health/jobs passed. Docker cache reclaimed 6.96 GB/final 0 B; canonical retention passed with no eligible expired backup. Operational Sol review `c19e688b` /19 checks and root comparison preserve references, volumes, rollbacks and audit archives.

Closed Owner AFTER: 71 calls/18 DOM/16 snapshots/seven images all verified and viewed by root. Never-explicit A's first override now uses current 0.12 rather than stale 0.05; complete offered seven terms retained, B's explicit 0.07 preserved. Remembered B and current-defaults-OFF conversion pass as supporting regressions only. Expected ARIA/default-option availability differences and phone overlay/truncation limits remain explicit. Canonical blank/OFF/zero rows and register restored; actual NoTabs 71, immediate ZIP/runtime-cleanup timer restoration and zero browser/profile locks precede assembly. Fresh Sol `7fd8d844` /23 grouped checks and root `ef52bce2` accept exactly +1UX/0bugs: **71 UX /65 bugs**, remaining29/35, original47/55/0 unchanged. No new saved-money, other-role or complete-traffic claim. Evidence and precise NOT RUN limits are in the linked production browser document.


### W100/W102 closed native reverification — 2026-10-04

Deployed W99 `a3f66cdc` remains current. W100 source `01a104d5-d3cb-777c-8133-48758c3fb283` completed Worker Draft→Submit→Owner approval once each; public exact60-minute facts, dated Owner3c/4c pay/cost, exact Finance source and Worker own-pay periods reconcile independently of older2c/3c terms and reimbursements. Closed85 calls, independent Sol19 grouped checks/root`27ed749e`, +0.

W102 retained QA project `01a104e9-4cea-718e-9757-4f0291009b53` saved optional Worker1/2 individual terms, then a later October5 defaults revision. Fresh dated labor/reimbursement/policy readers preserve explicit pay0.12/0.07 and expense rules. Closed72 calls, independent Sol19 grouped records/root`f57b8251`, scoped persistence pass/+0. Non-overridden resolution/calculation remains NOT RUN. Successful defaults save resets Billing Step3→Step1; existing context-retention regression requires repair and is not passed or counted anew. Both sessions restored triggers before assembly and stopped browser tools after actual NoTabs. Passive transport lists are incomplete; image/harness limits are explicit. **71 UX/65 bugs**, remaining29/35; original102 coverage47 scoped/55 NOT RUN/0 whole-compound PASS unchanged. No Client Essential READY claim.


### 2026-10-04 W103 native role checks and W104 context repair

- W103 scoped native PASS: Owner created one temporary delegation; Chief QA Worker 1 created/submitted six minutes for QA Worker 2; one identical Chief attempt was rejected with retained form values and one original Submitted source. Worker 2 independently read that exact source; Owner revoked the new grant. One session, 68 calls, four successful writes/five attempts, no replay. Manifest `227152b677bff9adf098a59d65a9b1262bd6a31694b27fb5f737d78cd31f5452`; root acceptance `574bf44693f0355901dbcea5c2e40b42fd10e0beef2cef6533443b1d0d35b68b`. Expense/crossactor duplicate, post-revoke denial and financial/privacy/history outcomes remain NOT_RUN.
- W104 source repair for W102 Step3→Step1 defaults-save regression uses enhanced feedback-first submission plus a refresh preserving shallow tab state. Static gates and independent Sol review pass; production browser afterproof remains pending. This repairs an existing context family (+0), with 71 UX / 65 bugs and original102 coverage 47 scoped / 55 NOT_RUN / 0 whole compound PASS unchanged. See `docs/evidence/project-worker-terms-browser-20261002.md`.

### W104 deployed / W105 Owner afterproof accepted — 2026-10-04

CORE-02/03/04/06/15: application4151b0ff/archive451a6f1a completed one canonical deployment at06:28:01Madrid. Scoped maintenance preserves28 source hashes/19 containers/four volumes/retained releases and43 archives/three backups; cache6.96GB reclaimed/0B, later retention removed0. Closed W105 Owner53 calls: same-date defaults rejection and correctedOctober5revision2 both preserve shallow Billing Step3 and unsaved A0.13/B0.07; genuine discard/reload restores saved A0.12/B0.07 and complete original expense terms. Root67pins/53actualobjects/30selected/seven originalimages and independent Sol11groupedchecks8d9db0cb accepted. NoTabs53 and first trigger restoration/Chrome-profile0 precede assembly. Existing context family+0: **71UX/65bugs**, remaining29/35; original102 coverage47scoped/55NOT_RUN/0wholecompoundPASS. Other roles/locales, broad phone/accessibility, advanced/history/arithmetic/final artifacts NOT_RUN. No Client Essential READY claim. Details and actual source/runtime boundaries in linked evidence.


### W106 Chief linked expense and subject duplicate checks — 2026-10-04

CORE-02/03/04/06/15: one closed native91-call session on W1044151b0ff verified genuine Owner delegation, Chief six-minute time and linked EUR0.01 Parking Draft→Submit, Chief expense duplicate rejection, Worker2 exact own readers/crossactor time duplicate rejection, and sole new-grant revoke. Six successes/eight attempts; sources remain Submitted, no approval/payment/privacy claim. Root108 pins/91 objects/79 selected/nine images; fresh Sol12 grouped checks24c57f78/root2ff26b41. NoTabs91 and first trigger restoration/Chrome-profile0 precede assembly. Existing workflow +0; one canceled optional-source resurrection BEFORE bug and one known-project fresh currency preset UX candidate await repair/deployed-after proof, maximum1bug/1UX. Historical date reset/other roles/financial consequences NOT_RUN. Counts **71UX/65bugs**, original47/55/0 unchanged. No Client Essential READY claim. Details in linked production browser evidence.


### W107 fresh expense intake repair pending deployment/afterproof

CORE-02/03/04/06/15: one-component source1982941b reads fresh visible URL prefills and presets known project currency only on fresh opening; explicit foreign currency/failed-form recovery remain. Static gates8ad98c8d pass, zero-warning Svelte/CSS identical,28 protected sources exact. GitHub/deployment/closed native acceptance pending; no credit yet, **71UX/65bugs**, conditional at most1UX/1bug. Original47/55/0 unchanged; no Client Essential READY claim.


### W107 deployed / W108R2 scoped native acceptance — October 4

CORE-02/03/04/06/15: W107d07bdc85/archive4f4dba8d deployed08:15:50Madrid, portal/sitehealthy/jobsrunning;29sourcepins/19containerrefs/fourvolumes preserved. Cache6.913GB reclaimed/0B; additionalbackupprune0, daily3snapshots retained. Fresh sole W108R2 closed64calls, four successes/fourattempts: genuine delegation, marked12min Draft→Submit, onlynew grantRevoked. Offered linked intakeEUR; explicitUSDretained; acceptedCancelcleansURL and generic same-page reopen clearsoptionalTime/presetsEUR; deliberatelink/discard controlalso passes. NoExpenseSave/financialconsequence. Rootall64objects+originalimage; independentSol11groupreview6ac3ac70/root835e42ca accept **+1UX/+1bug →72UX/66bugs**, remaining28/34. NoTabs64 and firsttimerrestoration/Chrome-profile0 precedeassembly. Imagecurrencybelowcrop/033emptytarget/fourselectorerrors preserved; nonToday390otherroles/locales/failure-recoveryNOT_RUN. Original47/55/0 unchanged; no Client EssentialREADY. W109date-local error association repair source/staticgates ready, deployment/nativeafterpending/+0. See linked production browser evidence.


### W109 deployed; W109/W110 closed native checks; W112/W113 candidates — October 4

CORE-02/03/04/06/15: application `ed983da4` / W109 archive `52421b44` completed one canonical deployment at 11:32:11 Madrid; 30 source pins/19 references/four volumes and healthy portal/site/jobs qualify. Cache reclaimed 6.968 GB/final 0 B; additional backup-prune0 with daily three snapshots retained. Independent ops `6c66f5c0` / root `b507a8d9`.

Closed W109 Owner41 calls/two attempts confirms same-date rejection association, date-only October6 revision3 success, Billing Step3 and unsaved A0.13/B0.07 retention; genuine discard/reload restores saved A0.12/B0.07/full expense terms. Root49 pins/41 objects/original image, peer `a6b5c7ae` / root `cad1f6b2`: scoped core +0. Duplicate local feedback/global message-as-caption remains unresolved in the deployed release; W112 source repair passed static gates/independent review `a3cb6a9b`, with fresh 1440/390 afterproof pending. No complete feedback UX certification.

Closed W110 Finance→Auditor55 calls/zero business writes confirms populated draft invoice search/stage/manage/return/reset and independent exact Auditor expense/treatment/source readers. Missing unclassified pair and positive Alerts remain NOT_RUN; image right columns clipped, snapshot47 supplies exact amounts. Root61 pins/55 objects/original image, peer `f7b98a6b` / root `5c9d6c04`, existing +0. Both sessions actual NoTabs and first trigger restoration/Chrome-profile0 precede assembly. W113 fixed-green negative-margin presentation is one pending neutral-style UX candidate, no arithmetic/alert bug or credit.

Qualified unused W99 retirement `2a6b577c` follows actual430-command proof `ea6802e1`, retains audit/Git/currentW109/W107/W104/19refs/fourvolumes/otherarchives/backups/markers and raises free bytes8,101,539,840→11,287,367,680; housekeeping +0. **72 UX /66 bugs**, remaining28/34; original47 scoped/55 NOT_RUN/0 whole-compound PASS unchanged. Other roles/locales, positive-margin fixture, screen-reader/SSR/noJS, financial consequences/history and complete Essential certification remain pending. See linked project-worker production evidence.

### W112/W113 accepted; W114 preflight; W115 money support — October 4, 2026

CORE-02/03/04/06/15: accepted deployment `fd892bd92d75900afbe983322519bc10acdf3276` / archive `3a39cb292a84c4ab3fc4cf1fdc290c28396cdfbd9add962f4e0233df5b0dc7b1` completed13:04:41Madrid. W112 closed Owner47-call1440/390 feedback/focus/full drafts/discard/reload adds0; successful defaults save remains unrun. W113 closed Auditor33-call neutral negative/N/A badge presentation accepts exactly1UX/0bugs. W114 closed Owner22-call stale-gate preflight stopped before money; legitimate Finance W74 W7 AtCost and separate reimbursement/version4/template revision2 history establish no configuration defect.

W115 closed134-call supporting0 proof made six actual business actions39/43/60/64/84/90. Actual Finance106 binds two October4 Approved/Complete1h sources: Worker4 `01a106df-0227-745c-ae1d-fa7e5261b595` pay€0.04/cost€0.06; Worker3 `01a106e0-9937-774e-ae10-b6b783c8a81c` pay€0.05/cost€0.08. Separate own My Pay identities show matching exact N02 estimates/marked Approved activity within September1–October4 across own projects. Narrower filters NOT_RUN/source IDs NOT_REBOUND/estimates not paid cash. Actual close134 and first trigger restoration precede assembly; ROOT acceptance/independent review verify153 pins while preserving bounded raw-reading, image and harness-error limits.

Current **73 UX/66 bugs**, remaining27/34; original47 scoped/55 NOT_RUN/0 whole-compound PASS unchanged. Broader roles/locales/widths, W113 positive/native contrast/audio, postapproval canonical readers, customer recognition, expense/reimbursement/futureOctober5 outcomes, statements/invoices/settlement/payment/cash collection, historical immutable money and complete Essential certification remain NOT_RUN. Earlier dated72/66 entries remain historical. See linked project-worker production evidence.

### W116 Finance native BEFORE — October 4, 2026

Closed Finance53-call/zero-write desktop1440/phone390 observations identify missing worker attribution in Time source review and misleading assignment-coverage feedback for reversed settlement dates. Existing money/source facts and valid recovery were preserved; repair/deployed AFTER/independent qualification are pending. **No credit;73 UX/66 bugs.** See linked project-worker evidence for scope, image and fresh-name limits.

### W116 Finance deployed AFTER accepted — October 4, 2026

CORE-02/03/04/06/15: application `2b9c32d230a317105e384ae6c2913231487dc644` / archive `2b0eab743cc2e274f03edd36ae1a92877f5fa9233c9431d042d6971a6fde6a16` completed one canonical deployment at16:33:17 Europe/Madrid. Root saved32 source matches,19 container references/four volumes, portal/site healthy/jobs running. Qualified W104 unreferenced expanded-source/two-image retirement retained audit/inbox ZIPs/Git/other releases/references/backups; separately qualified obsolete dependency cache removal and builder prune (6.968GB) add0. Canonical daily backup creation explicitly replaced the older October4 snapshot after the new snapshot completed; October2/3 remained exact. Warnings and operational limits remain in the linked evidence; no new host/runtime audit by the native judge.

Closed Finance English1440/390 AFTER:67 calls/zero business attempts, six unedited original PNGs. Root verifies99 pin occurrences/98 unique files and15 embedded public DOM objects; critical states/images inspected, no all-raw-snapshot semantic certificate. **W116-U01,+1UX:** direct Worker attribution in Time rows/cards, independently bound by fresh offered canonical readers40/45 to exact sources and original markers, all ten old facts/hrefs retained. **W116-B01,+1bug:** reversed5→4 shows local date-order cause/endARIA at17/21; phone recovery24, genuine uncovered3→3 coverage28, covered recovery31 and original blank restore34 remain correct. Native Tab16 is limited segmented-date focus evidence, not audio/full traversal.

Original scope semantically restored64 (initial implicit project normalized); Signout65/settled EN Login66/actual NoTabs67. Root restored ZIP.path+ZIP.timer FIRST then runtime-cleanup.timer before inspection, all3active/Chrome0/fiveSingleton0. Original53 phone footer obstruction remains; native PageDown55 and separate57 prove unobscured Worker4 recovery. Desktop right columns remain image-clipped inside contained scrolling; public DOM binds all11 headers/facts. Harness errors43/59 add0.

Fresh GPT-6.1 Sol judge SHA `f5ac8192692b1a032f7ff4797196429adfeef0c2f2ee9557c70b2a1d1db5a184`; root native acceptance `557e8fb2e763eeb82cb3c0cb47a61b38645c4b1b7469e98bb06cff5454090cc2`. **74UX/67bugs**, remaining26/33; original47 scoped/55 NOT_RUN/0 whole-compound PASS unchanged. Both postapproval canonical Time readers are complete **Finance only**; W115 own My Pay narrowfilters NOT_RUN/activity source IDs NOT_REBOUND/estimates not cash. Auditor/other roles/locales, missing/same-name, full keyboard/audio/horizontal-scroll/SSR/noJS, financial recognition/history/finalization/payment and complete Client Essential certification remain NOT_RUN. Earlier dated73/66/pending entries remain historical. See [project worker terms](docs/evidence/project-worker-terms-browser-20261002.md).

## W117 Worker2 linked-expense date scope — October 4, 2026

Closed Worker2 English390 browser verification (44 native calls, zero Save/business attempts) confirms existing date-scope helper and unavailable-source alert, exact Oct4 source recovery after Oct5, optional clearing and Cancel with native local discard. Existing public Expense and Time facts remain as captured. Root inspected 54 original primary files and three unedited images; independent GPT-6.1 Sol review accepts PASS_RETIRED_0. Actual close44 returned No open tabs; root restored original three triggers before inspection/assembly and verified all3active/Chrome0/five Singleton0. No source repair or deployment was required; accepted totals remain74UX/67bugs and original47scoped/55NOT_RUN/0whole-compoundPASS. This one-role cycle does not certify Save validity, all-role workflows, database conservation, financial calculations or payments. Root acceptance SHA2569be7f529c9c510f884796842094138fab079d7279a702f450afb4221225a22fc; independent review SHA256cde5224ad1eec37f35b1daab972a404d64e256f91f743f3d0d3f78452deddc44. Originals remain under /home/kripta/ja-audit-20261002/reverification/finance-auditor.

## W118 Owner expense payer: closed BEFORE observation — October 4, 2026

Existing marked N02 project01a0ff4b-a8b0-74fc-96a5-56724c3a83e5 and QA Worker3 passed a fresh Owner UI prerequisite. Ordinary Client→Worker selection changed explicit At cost reimbursement / Do not charge customer into No reimbursement / At cost customer recovery, while reimbursement source, labor/date and siblings stayed unchanged. Existing named dirty feedback and useful payer-scope/Non-billable help were present; the direct dependent-input replacement was not specifically explained. No Save or business write was attempted, and no saved policy or money loss is inferred. A local source candidate is being reviewed; deployed AFTER and final distinct-cause judgment are pending, so this adds0 and totals remain74UX/67bugs.

Root independently compared complete original public states23/26/28; only payer and two dependent controls differed forClient26, and only the two dependent controls for returnedWorker28. Manual correction32 and native Team→Billing return37 exactly equal complete baseline23, including all53 rendered controls and main text. All52 primary manifest file hashes/sizes matched; all47 call arguments and six public read-only inspection functions were read; both original economic-control images were viewed. Sticky header obscures the image heading/dirty badge, which are supplied by public DOM rather than standalone photographs. Public Team bound Worker3 windowOctober4→5 and worker UUID; no assignment UUID was offered. Signout45, settled public Login46, actual close47 returnedNoTabs; root restored original ZIPpair thencleanup.timer before evidenceinspection/assembly and verified all3active/Chrome0/fiveSingleton0.47calls comprise29investigation and18restoration/cleanup, fitting60total/45investigation but exceeding a strict15-total-restoration reading; this disclosed limitation prevents a blanket budget-compliance claim. One Owner English1280×720 local roundtrip only, no all-role/financial/history/whole-compound certification.

Original evidence under /home/kripta/ja-audit-20261002/reverification/finance-auditor: W118_OWNER_PAYER_BEFORE_NATIVE_RECEIPT.md SHA895a7ef4dcc34153d0e53ba4618c6c4734e5fd9d5d08e1892a2be8804c9f5c3a; ordered manifestSHAa7dca774e76924c230f593b292d65856263597b834a2dda9e7a1b4064dc207d1; root actual closureSHA602bdb7fa0ebf2ed66420748de677e0ec6f4285ed2762541639c6f0cb380106c. W57 departure/rejected-save lifecycle and existing dirty markers are excluded from new credit; final GPT-6.1 Sol judgment may classify this as supporting completion only.

## W118 deployed Owner/Finance payer draft: root accepted — October 4, 2026

Root accepted **W118-U01 (+1 UX)** and **W118-B01 (+1 bug)** on deployed `0f6d8b2b466cd7d97d67d8e5dc9d82003fa694eb` / archive `2c8e96f959787c13b597807ad9ccfc94a2bf573647ce06df98b683f85bc127ac`. Both Owner and Finance independently returned the existing Worker3 At cost reimbursement / Do not charge customer recovery choices after an ordinary Worker→Client→Worker cycle; dirty state returned to zero and complete sibling/date/labor public states were preserved. Adjacent English guidance was visible at 1280×720 and legible at 390×720. This is one cause family: roles, widths, dependent fields, dirty/navigation checks, translations, source gates and operations add no separate credit; existing W57 departure/rejected-save and W62 navigation/dirty behavior are not counted again. Accepted totals are **75 UX / 68 bugs**, remaining **25 UX / 32 bugs**; original coverage remains **47 scoped / 55 NOT_RUN / 0 whole-compound PASS**. The preceding BEFORE and pre-judge pending counts remain historical.

The closed AFTER used **93 calls = 61 investigation + 32 restoration**, within strict 120/85/35, with **zero Save or business-write attempts**. Actual close93 returned No open tabs; root restored the original three triggers first and recorded all active, Chrome0/five Singleton0 at that closure. This is a saved closure observation, not current live state. Event45 retained authenticated `/app` DOM; only its separate wrapper title mentioned login/loading. Event46 alone established settled Owner Login before Finance authentication47. Finance overview retained the selected project and economic/scope values but exposed two additional child navigation links (24→26), so full-page/link-list equality is not claimed. Worker7 inheritance was sibling preservation only; no assignment UUID, inherited branch, saved selected-payer submission, financial/history or all-role proof is inferred. Save/person/bulk/persistence, other payers/roles/locales, project-default inheritance, non-hourly/markup math and ledger/history/payment outcomes remain NOT_RUN. Source and operational checks provide supporting evidence only. Full originals, judge, correction and closure pins are recorded in [the accepted W118 evidence section](docs/evidence/project-worker-terms-browser-20261002.md#w118-deployed-ownerfinance-payer-draft-root-accepted--october-4-2026); root acceptance SHA256 `7e4ab6e1f61b26148c53097ba0ea53f147c03cd8743b9a75cd005ee6d5ccc71f`.
