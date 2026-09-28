# Client Essential — auditoría de readiness y plan de cierre

Fecha de auditoría: 2026-08-28
Autoridad: `J_A_AUTOMATION_CLIENT_ESSENTIAL_SPEC_2026-08-22.md`, `J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md`, contrato local `ANEXO A`/`ANEXO D`, `AGENTS.md`.

## Actualización de integración — 2026-08-29

El veredicto continúa en **NOT READY**, aunque el árbol ha avanzado desde la auditoría original:

- Node `24.19.0`: integración **39 archivos / 252 tests**, seguridad **22 / 115**,
  migraciones **10 / 78**, reporting **4/4** y continuidad **16/16** pasan.
- Typechecks de database/reporting/portal, builds de portal/site/jobs y backup/restore local pasan.
- El full-unit concurrente dejó dos timeouts; ambos archivos pasan serialmente (**8/8**). Falta un
  full-unit limpio y aislado como gate final.
- Worker Statement durable, service actors con namespace persistente (`0033`) y la mayor parte de
  `UI_PLAN.md` están integrados. La UI focalizada pasa **6 archivos / 39 tests**. Se corrigió la
  incompatibilidad del seed con el Accounting Pack autoritativo mediante regresiones sobre el esquema
  real y vínculos no monetarios; el rerun final pasa **40/40** en 360/390/768/1440.
- La revisión financiera independiente termina en **CHANGES REQUIRED**. Bloquean el release: packs
  que confían agregados del caller o aceptan `null`; conversión incorrecta de gastos extranjeros;
  costes internos ausentes tratados como cero; sobrecréditos; fechas de pago inválidas; orden temporal
  con precisiones mezcladas; inconsistencias de Worker Statement; cortes de fuente no transaccionales;
  omisión de trabajadores solo con gastos y de pagos/reversiones de facturas anuladas; Travel all-in
  sin billability independiente; protección incompleta del snapshot emitido; refresh stale inexistente;
  y exportes de cero bytes.

Estos hallazgos sustituyen cualquier aprobación financiera histórica para el árbol candidato actual.
No deben reinterpretarse como carencias de UI: son invariantes de dominio y persistencia que deben
corregirse antes de ejecutar la evidencia final.

## Veredicto

**NOT READY / no se debe declarar CLIENT READY todavía.**

La aplicación tiene una implementación sustancial y las invariantes principales están cubiertas, pero la evidencia de release no cierra aún el producto completo. El checklist vigente registra 17/17 CORE como `PARTIAL`; esa conclusión es coherente con la auditoría: el código, las pruebas focalizadas y el último E2E cubren gran parte del dominio, pero siguen faltando el cierre de calidad independiente, evidencia operacional completa en el entorno real, continuidad remota y aceptación contractual.

El riesgo no es que falte todo el producto. El riesgo es afirmar disponibilidad de cliente sin haber demostrado simultáneamente: flujo multirol real reproducible, jobs automáticos sanos, continuidad remota cifrada, aceptación contractual D.1/D.2/D.3 y gates estáticos limpios.

## Evidencia local registrada y verificada contra el árbol actual

El repositorio fija Node `24.19.0` y pnpm `11.22.0`; esos son los runtimes de la evidencia
registrada en el checklist. El shell de esta revisión reporta Node `25.8.1` y no se usa como
evidencia de gate; las reproducciones deben ejecutarse con las versiones fijadas.

La evidencia de ejecución local registrada en el checklist indica PASS aislado para:

- `pnpm test:unit`: 95 archivos / 522 tests.
- `pnpm test:integration`: checkpoint actual 39 archivos / 252 tests.
- `pnpm test:security`: checkpoint actual 22 archivos / 115 tests.
- `pnpm test:reporting`: 1 archivo / 4 tests.
- `pnpm test:invariants`: 1 archivo / 1 test.
- `pnpm test:offline`: 3 archivos / 8 tests.
- `pnpm typecheck` con Node 24.
- `pnpm build` con Node 24: sitio Next.js y portal SvelteKit.
- `pnpm db:check` y `pnpm db:integrity` sobre bases desechables; migraciones pasan 10 archivos / 78 tests hasta schema `0033`.
- `pnpm ops:backup:test` y `pnpm ops:restore-test`.
- `pnpm test:continuity`: 16/16 contratos locales.
- Límite público observado con `curl`: `/health/live` 200, sitio `/j-aautomation/en` 200, login `/j-aautomation/app/login` 200 y readiness privado 404.
- E2E Client Essential (2026-08-28): `JA_E2E_CADDY_BASE_URL=https://j-aautomation.com pnpm exec playwright test tests/e2e/client-essential-32-step.spec.ts --project=desktop` completó los pasos 1–29 y 32. El checklist referencia `test-results/client-essential-32-step-C-97fa0-d-fixture-covers-steps-1–32-desktop/trace.zip`, pero ese archivo no está presente en este árbol y debe adjuntarse para la evidencia reproducible; los pasos 30–31 son bloqueos operativos deliberados, no fallos del flujo local.

Falla o queda abierto:

- `format:check`: 30 archivos fuera de formato.
- `lint`: 2 errores en `packages/database/src/domains/worker-statements/worker-statement-repository.ts` (`B5_AUDIT_CONTRACT_VERSION` y `sameExecution` no usados).
- El E2E Client Essential completa los pasos 1–29 y 32 en el checkpoint actual, pero deja los pasos 30 y 31 bloqueados explícitamente: el navegador no puede probar por sí solo dos ejecuciones automáticas del timer ni el restore remoto cifrado.
- La evidencia del checklist indica que `jaautomation-jobs.service` sale con código 1; faltan diagnóstico privilegiado, corrección y dos ejecuciones consecutivas exitosas.
- Falta un drill de continuidad en otro host con copia cifrada que restaure base de datos, facturas emitidas y ficheros privados.
- El contrato ANEXO D exige además la aceptación de web, sistema de gestión y migración de correo; el repositorio prueba el sitio, pero no demuestra por sí solo la migración real de cuentas/histórico ni SPF/DKIM/DMARC y envío/recepción completos.

Los timeouts registrados al lanzar unit/integration/security en paralelo no se consideran regresiones:
el registro indica que, al repetirlas aisladas, unitarias, integración y seguridad pasaron completas.

## Matriz ejecutiva por CORE

| CORE                            | Estado defendible | Qué existe                                                                                                                                              | Qué falta para PASS                                                                                 |
| ------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 01 Auth/users/roles             | PARTIAL           | Invitaciones, lifecycle, RBAC, step-up, DTO/IDOR y MFA focalizados; el E2E 2026-08-28 cambia Owner→Worker→PM→Finance en los pasos 1–29                  | MFA enrollment/recovery audit completo y revisión independiente del árbol final                     |
| 02 Clients/projects/assignments | PARTIAL           | CRUD/lifecycle, identificadores, cost-center, asignaciones efectivas e histórico; el E2E cubre creación/configuración/asignación en los pasos 2–6       | Fresh + populated migration evidence final y revisión role-specific de lifecycle/archive/restore    |
| 03 Commercial rules             | PARTIAL           | Exact money, reference hours, minimum billable independiente, overtime, Travel y taxes por stream                                                       | Journey de configuración y consumo completo en UI; rerun pinned con evidencia de edge cases A/B/E/H |
| 04 Time                         | PARTIAL           | Draft→submit→approve/reject→lock, Work/Travel/Standby/overtime y correcciones auditadas; el E2E cubre captura, envío y aprobación en 12, 17 y 18        | Evidencia browser explícita de corrección administrativa y revisión final de lifecycle              |
| 05 Compensation/privacy         | PARTIAL           | Hourly/daily/fixed/percentage, My Pay own-only, fechas y estados                                                                                        | Artifact durable Worker Statement, descarga privada y evidencia autenticada de redacción            |
| 06 Expenses                     | PARTIAL           | Intake operacional telefónico con receipt, clasificación Finance/Admin, all-in/reimbursable, estados separados; pasos 16, 18, 20–21 cubren el flujo E2E | Descarga privada, revisión de clasificación y artefacto durable en el árbol candidato               |
| 07 Daily/PLC                    | PARTIAL           | Reports, attachments, zero-money projection, conformity/version binding                                                                                 | Creación→adjunto→firma→supersession browser y artifact inspection                                   |
| 08 Approval                     | PARTIAL           | PM scope activo+`can_review`, razones, corrección tipada, Owner override step-up; el E2E prueba PM y Finance en 17–18                                   | Review independiente sobre el árbol final                                                           |
| 09 Finance/profitability        | PARTIAL           | WIP/direct cost/invoiced/collected/outstanding/contribution, fechas y drill-down base                                                                   | Reconciliación signed-source, revisión Finance en UI y rerun completo                               |
| 10 Billing periods              | PARTIAL           | Cadencias, streams, source uniqueness, drafts, sign-off gate, issue transaction; pasos 22–23 prueban bloqueo por sign-off e issue                       | Jobs reales y revisión del flujo draft→block→sign→issue sobre el release candidato                  |
| 11 Invoices                     | PARTIAL           | Registry de cinco familias, identifiers, snapshots, correction foundations; pasos 23 y 27 cubren issue inmutable y estados de artefacto                 | Inspección de PDFs/artifacts, UI locked y correction journey completo                               |
| 12 Payments/ledger              | PARTIAL           | Full/partial, reversals, outstanding y Collections/Ledger; pasos 24–25 cubren pago y reconciliación en navegador                                        | Evidencia de reversión y reconciliación final independiente                                         |
| 13 Reports/exports              | PARTIAL           | Six families, role-safe projections, accounting pack y per-format failure tests; pasos 14–15, 22 y 26–27 cubren reportes/exportación                    | Catálogo/descarga artifact, Worker Statement durable y source reconciliation final                  |
| 14 Responsive/accessibility     | PARTIAL           | CSS, drawer, labels, focus/error/touch suites; pasos 11–16/28 ejercitan 390 y el paso 29 comprueba 360/390/768/1440 sin overflow                        | Revisión independiente sobre build final; evidencia de usabilidad por rol, no solo overflow         |
| 15 Security/files/audit         | PARTIAL           | 98 security tests, private storage/download, scanner truth, audit redaction                                                                             | Aprobación independiente current-tree y journeys de archivos privados                               |
| 16 Jobs                         | PARTIAL           | Durable states, idempotency, service actor fencing, no manual user path                                                                                 | Corregir servicio live, logs privilegiados y dos timer runs consecutivos                            |
| 17 Deploy/health/backup         | PARTIAL           | Build, migrations, health, local/realistic local restore                                                                                                | Backup programado y restore remoto cifrado aislado en host separado; jobs sanos                     |
| Offline                         | CONDITIONAL       | Aislamiento offline probado                                                                                                                             | Decisión explícita de conectividad de planta; si required, completar cache/sync/conflict            |

## Checklist contractual ANEXO D

Este registro separa la evidencia de repositorio/local de la aceptación contractual. `PASS` requiere
artefactos fechados del entorno y aprobación J&A/EVOCON; no se debe inferir desde código, un test
focalizado o un resumen de transición.

| Bloque                  | Estado actual | Evidencia mínima que debe adjuntarse                                                                                                                                                                                                                                                                                                                                            | Evidencia disponible ahora                                                                                                                                                  |
| ----------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D.1 Web corporativa     | **PENDING**   | EN/ES/PT y rutas públicas con códigos HTTP; `/health/live` público; `/j-aautomation/health/ready` externo `404`; screenshots/trace 360/390/768/1440; Home, Capabilities/Services, Industries, Projects, Aquarex, About, Careers, Contact, Employee Portal y legales con contenido/imágenes aprobados; envío real de contact/support/career con message IDs; firma de aceptación | Browser checkpoint 2026-08-28 prueba rutas públicas y responsive del portal en pasos 1–29/32; no hay en este árbol aprobación de contenido ni pruebas reales de formularios |
| D.2 Sistema de gestión  | **PARTIAL**   | E2E 32/32 sin bloqueos; logs de dos ejecuciones automáticas de jobs; backup/restore remoto cifrado de DB+artefactos; resultados financieros/RBAC y firma UAT                                                                                                                                                                                                                    | E2E prueba pasos 1–29/32; 30 (jobs automáticos) y 31 (restore remoto) siguen bloqueados; tests locales no cierran aceptación                                                |
| D.3 Migración de correo | **PENDING**   | Checklist redacted de cuentas/alias e histórico migrado; DNS SPF/DKIM/DMARC; envío y recepción externa; integración de notificaciones; timestamps/message IDs; firma de aceptación                                                                                                                                                                                              | Inventario Stalwart/SES y resumen de transición solamente; no demuestra migración, DNS final ni send/receive completo                                                       |

Para D.1, el operador debe conservar solo URLs, códigos, capturas, resultados de formulario y
message IDs no sensibles. Para D.3, conservar únicamente el checklist de cuentas sin credenciales,
salidas DNS, timestamps y message IDs; nunca incorporar contraseñas, claves, tokens o cuerpos de
correo al repositorio o al paquete de evidencia.

## Dependency DAG de cierre

```text
G0  Congelar commit candidato + runtime Node24
 ├─ G1  Limpiar format/lint/typecheck/build
 ├─ G2  Revisión independiente security/RBAC/files
 ├─ G3  Revisión independiente finance/reconciliation
 ├─ G4  Revisión browser multirol + responsive
 └─ G5  Contrato operativo jobs/backup
       ├─ G5a Diagnóstico y corrección jaautomation-jobs.service
       ├─ G5b Dos ejecuciones automáticas observables
       └─ G5c Backup cifrado remoto + restore aislado DB+artifacts
G1..G5 ──> G6 Ejecutar E2E 32 pasos sin bloqueos 30/31
G6 + ANEXO D.1/D.2/D.3 ──> G7 release gate y checklist final
```

## Plan detallado de implementación y verificación

### W0 — congelación y reproducibilidad (C / Sol lead)

1. Crear un commit candidato limpio sin perder cambios ajenos actuales; registrar SHA, `git status`, Node y pnpm.
2. Separar evidencia por ejecución bajo `artifacts/quality-gates/<timestamp>`.
3. Ejecutar todos los gates secuencialmente; prohibir declarar PASS por una suite lanzada en paralelo con timeouts.
4. Actualizar checklist únicamente con comandos y artefactos que correspondan al commit candidato.

Aceptación: árbol identificado, runtime fijado, logs completos y cero ambigüedad sobre qué cambios contiene la release.

### W1 — gate estático y hygiene (A / Luna Max)

Archivos principales: los 30 listados por `prettier --check`, más `packages/database/src/domains/worker-statements/worker-statement-repository.ts`.

1. Ejecutar Prettier solo sobre esos archivos y repetir `pnpm format:check`.
2. Eliminar o utilizar correctamente `B5_AUDIT_CONTRACT_VERSION` y `sameExecution`; no silenciar ESLint con comentarios ni prefijos artificiales.
3. Repetir `pnpm lint`, `pnpm typecheck`, unit, integration, security y build.

Aceptación: format, lint, typecheck y build verdes en Node 24; ningún assertion debilitado.

### W2 — jobs automáticos (B / Sol Medium con implementación acotada Luna)

Archivos/contratos: `deployment/jaautomation-jobs.service`, timer correspondiente, `deployment/compose.production.yml`, `deployment/scripts/jobs-run.mjs`, env de despliegue y runbook `docs/DEPLOYMENT_VPS.md`/`docs/OPERATIONS.md`.

1. En el VPS inspeccionar como operador autorizado `systemctl status`, `journalctl -u jaautomation-jobs.service`, `docker compose config`, imagen/bundle jobs y variables efectivas; no reiniciar hasta entender el fallo.
2. Verificar que el servicio usa el mismo `JA_DATABASE_PATH`, `JA_DOCUMENT_ROOT`, tenant, deployment y actor de servicio que portal/DB.
3. Corregir el contrato de imagen, working directory, permisos, env o bundle que cause exit 1; conservar fencing y no abrir una ruta de “process jobs” para usuarios normales.
4. Ejecutar manualmente solo como operador para validar; después habilitar el timer y capturar dos ejecuciones automáticas consecutivas con estados de job `queued→claimed/running→succeeded/failed`, estados de artefacto `queued/running/ready/failed` y logs sin secretos.
5. Añadir/ajustar test de contrato que reproduzca el fallo observado y test de health que distinga timer activo de job exitoso.

Aceptación: `jaautomation-jobs.service` exit 0 en dos invocaciones consecutivas del timer, cola durable procesada automáticamente, retry/idempotency demostrados y evidencia fechada.

### W3 — continuidad y restore remoto (B/C / Sol Medium + operador de infraestructura)

Archivos/contratos: `deployment/scripts/continuity-backup.mjs`, `deployment/scripts/backup.mjs`, `deployment/jaautomation-backup.service`, env/secret store y runbooks.

1. Configurar destino remoto cifrado y credenciales fuera del repositorio; no guardar claves en logs ni `.env` versionado.
2. Generar backup con SQLite consistente y copia de `issued/private artifacts`, manifest, hashes y metadatos de versión.
3. Transferir por SSH/SFTP a un host separado con permisos mínimos y retención definida.
4. Levantar un entorno aislado sin acceso al origen, restaurar DB + documentos, ejecutar `db:integrity`, comprobar FK, hashes, invoice issued y descargas privadas autorizadas.
5. Documentar fecha, origen, destino, hash, versión de schema, resultado y tiempos RPO/RTO.
6. Añadir prueba no destructiva de que un restore parcial o hash incorrecto falla cerrado y no presenta artifacts como válidos.

Aceptación: drill reproducible en otro host; documento emitido y dos artefactos privados recuperados byte-a-byte o por hash; integridad DB válida; runbook ejecutable por otra persona.

### W4 — evidencia browser multirol y responsive (A / Luna Max + reviewer independiente)

Archivos: `tests/e2e/client-essential-32-step.spec.ts`, fixture, `playwright.config.ts` y rutas Portal.

1. Ejecutar Owner→Worker→PM→Finance con fixture desechable, esperando estados de producto y no sleeps arbitrarios; el checkpoint actual ya cubre los pasos 1–29 y cambia de rol en el flujo.
2. Mantener los formularios operativos representativos en 390×844 y ejecutar el paso 29 en 360×800, 390×844, 768×1024 y 1440×900; validar labels completos, foco, errores, touch targets, tablas móviles, uploads/descargas y ausencia de datos Finance en DTO/network.
3. Adjuntar evidencia explícita de corrección administrativa de horas, firma customer report, bloqueo previo a firma, issue inmutable, partial payment, ledger y artifact states; los pasos 30–31 siguen siendo gates operativos, no browser-only assertions.
4. Repetir con build desplegado detrás de Caddy; separar fixture local de evidencia de producción.

Aceptación: todos los pasos funcionales pasan en navegador y los pasos 30–31 tienen evidencia operativa externa adjunta; no hay console/network errors críticos.

### W5 — aceptación contractual de web y correo (B / responsable de despliegue)

1. Probar ANEXO D.1 en EN/ES/PT, rutas públicas, responsive y formulario contact/support/career; confirmar aislamiento de portal.
2. Verificar ANEXO D.3 con proveedor real: cuentas/alias acordados, histórico migrado según alcance, DNS SPF/DKIM/DMARC, envío y recepción externa y conexión de notificaciones.
3. Guardar evidencia no sensible: URLs, códigos HTTP, capturas, checks DNS, message IDs y checklist de cuentas; nunca secretos.

Aceptación: bloques D.1, D.2 y D.3 firmados por responsable J&A/EVOCON o incidencia contractual documentada como bloqueada externamente.

### W6 — revisión final y release gate (C / Sol High)

1. Repetir `format:check`, `lint`, `typecheck`, unit, integration, security, reporting, invariants, offline, DB check/integrity, build, E2E, backup/restore y continuity drill.
2. Obtener revisiones independientes de security, finance, responsive/browser y spec compliance.
3. Reconciliar cada fila CORE y cada DoD del checklist con artefacto concreto; no usar “implemented” como sustituto de PASS.
4. Confirmar que Offline queda `CONDITIONAL` solo si J&A acepta conectividad; si no, activar el paquete de sync antes del gate.
5. Aplicar `$release-gate`; cualquier `FAIL`, `PARTIAL` u `OPEN` no condicional reabre su wave.

Aceptación: checklist 17/17 CORE `PASS`, 32/32 sin bloqueos, contrato D.1/D.2/D.3 aceptado, y release gate verde en el mismo SHA.

## Qué no debe implementarse ahora

No bloquean Client Essential: jerarquía industrial completa, FAT/SAT, punch lists, ERP genérico, bank import/payment execution, accounting-provider adapters, client portal, global search, bulk operations, feature flags de producto ni ML/data-readiness. Deben permanecer como roadmap diferido y no mezclarse con las waves de cierre.

## Criterio final de decisión

Declarar `CLIENT READY` solo cuando el mismo commit tenga: gates estáticos verdes, suites reproducibles, browser multirol real, jobs automáticos exitosos, restore remoto cifrado probado, seguridad/finanzas/responsive revisados independientemente y aceptación contractual D.1/D.2/D.3. Hasta entonces, el estado correcto es `NOT READY`, aunque la funcionalidad implementada sea amplia.
