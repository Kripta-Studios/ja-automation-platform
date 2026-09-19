# Estado consolidado del repositorio y proyecto — 18/09/2026

> Checkpoint histórico. El [estado del 19/09](PROJECT_STATUS_2026-09-19.md) actualiza la recuperación,
> versión productiva y aceptación. Las cifras y pendientes de este documento corresponden al 18/09.

**Veredicto: producción operativa; cierre Client Essential pendiente. No se acredita el 100 % ni `CLIENT READY`.**
Las funcionalidades entregadas tienen evidencia técnica, pero faltan aceptación humana y fiscal/legal,
resolución de incidencias históricas y una ejecución integral de aceptación sobre el código actual.
Esta consolidación documenta el estado: no implementa funcionalidades ni firma una aceptación.

Este documento fue el punto de entrada para el **estado al 18/09**, subordinado a la
[SPEC](../J_A_AUTOMATION_CLIENT_ESSENTIAL_SPEC_2026-08-22.md) y al
[checklist](../J_A_AUTOMATION_CLIENT_ESSENTIAL_CHECKLIST_2026-08-22.md).
Los checkpoints fechados conservan su valor histórico; un `PASS`, `BLOCKED` o «no desplegado»
de una versión anterior no se traslada automáticamente a la actual. Los requisitos no se reducen.

## 1. Identidad y producción verificadas

Comprobación nueva de solo lectura: **18/09/2026, 21:14 UTC / 23:14 Madrid**.
La [evidencia JSON](validation/project-status-20260918.json) guarda identidades, resultados y límites;
no contiene credenciales, identidades de clientes ni filas de negocio.

| Elemento                                              | Estado comprobado                                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Rama                                                  | `codex/v3-production-completion-orchestrated-20260819`                                                                     |
| HEAD local y remoto al iniciar la consolidación       | `be0c9ea`; los commits posteriores al código desplegado son documentación                                                  |
| Código desplegado                                     | `d69efe6afde139e02a7e1d4633203f697a632357`                                                                                 |
| Activación                                            | 18/09/2026, 21:00:49 UTC / 23:00:49 Madrid                                                                                 |
| ZIP SHA-256                                           | `f2d279ae714ee974f7c4d4b02d57a575f191f226ac51cd235237b690f8cd1203`                                                         |
| Fuentes del release frente al ZIP                     | 1.714 archivos comparados; cero ausentes o diferentes                                                                      |
| Sitio / portal / jobs                                 | Sitio y portal `healthy`; jobs en ejecución; dos ciclos automáticos recientes con cero fallos                              |
| Automatización                                        | Timers de jobs, backup y despliegue activos; observador de ZIP activo                                                      |
| SQLite                                                | Esquema 48; integridad `ok`; cero infracciones FK                                                                          |
| Conservación frente a referencia previa al despliegue | 14 snapshots de factura, 14 registros de documento, 6 pagos, 1 revisión contable y 1 snapshot canónico conservados         |
| Último backup local                                   | Verificado en copia aislada; integridad `ok`, cero infracciones FK, 50 documentos del manifiesto comprobados               |
| Cobertura de backups                                  | 12 snapshots en 10 días distintos; todavía no cubre 30 días; no equivale a verificar la integridad de todos los históricos |
| Incidencias históricas                                | 4 jobs `dead_letter` y 5 variantes PDF `failed`; no se suman como nueve incidentes independientes                          |
| Caché Docker                                          | Caché de construcción 0 B; la limpieza previa liberó 6,802 GB conservando volúmenes, backups e imágenes de recuperación    |

Release: `/opt/jaautomation/releases/ja-automation-f2d279ae714ee974f7c4d4b02d57a575f191f226ac51cd235237b690f8cd1203`.
El [recibo del despliegue](PRODUCTION_DEPLOYMENT_2026-09-18_QUICKBOOKS.md) identifica backup,
rollback y validación de la entrega. Esta consolidación modifica solamente documentación/evidencia;
el commit que la publica no requiere reconstruir ni redesplegar la aplicación.

## 2. Funcionalidad entregada y límites de la evidencia

La tabla identifica implementación y evidencia acumulada, **no una nueva certificación `PASS`
de los 17 CORE sobre `d69efe6`**. El recorrido de 32 pasos pasó en `2058db2` el 6 de septiembre;
debe repetirse para cerrar la versión actual (P01). No se deduce ausencia de una función de un
checkbox histórico ni se declara aceptación final por encontrar código.

Referencias: [aceptación técnica del 06/09](evidence/client-ready-20260906/CLIENT_READY_DECISION.md),
[cierre ASTRA](ASTRA_IMPLEMENTATION_PROGRESS.md), [revisión ERP](ERP_REVIEW_2026-09-18.md),
[entrega de cobros](PRODUCTION_DEPLOYMENT_2026-09-18_QUICKBOOKS.md).

| CORE                              | Implementación y evidencia acumulada                                                                   | Límite para el cierre actual                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 01 · Identidad y roles            | Autenticación, invitaciones, sesiones, RBAC y alcance por objeto; smoke Owner/Worker del 06/09         | P01; MFA opcional es una decisión resuelta                                           |
| 02 · Clientes, proyectos y equipo | Ciclos de vida, asignaciones y gestión Owner; ampliaciones posteriores de proveedores/equipo           | P01; [evidencia CRUD](PRODUCTION_DEPLOYMENT_2026-09-10_OWNER_CRUD.md)                |
| 03 · Reglas comerciales           | T&M, all-in, cap, fijo, mínimos y compensación independientes; explicación/preview ASTRA               | P01/P02; ejemplos sintéticos no aprueban acuerdos reales                             |
| 04 · Tiempo                       | Borrador, envío, aprobación, corrección, bloqueo y no solapamiento                                     | P01; evidencia del recorrido base                                                    |
| 05 · Compensación                 | Cálculo y privacidad del trabajador; previsiones, aprobaciones y pagos diferenciados                   | P01/P02; reglas y fechas reales pendientes de validación operativa                   |
| 06 · Gastos                       | Justificantes, aprobación y clasificación Finance; corrección de recibos duplicados                    | P01; [remediación desplegada](PRODUCTION_DEPLOYMENT_2026-09-09_AUDIT_REMEDIATION.md) |
| 07 · Informes técnicos            | Daily/PLC, fuentes y firmas vinculadas a versión; cierre/reapertura versionados ASTRA                  | P01/P03; revisar artefactos históricos afectados                                     |
| 08 · Aprobaciones                 | PM operativo, Finance facturable y override Owner con motivo auditado                                  | P01; evidencia base y ASTRA                                                          |
| 09 · Finanzas                     | Dinero exacto, coste/venta/compensación separados, WIP, presupuesto, contribución y detalle por fuente | P01/P02; no se afirma contabilidad fiscal general                                    |
| 10 · Periodos y borradores        | Cadencias, fuentes aprobadas y borradores automáticos; emisión explícita                               | P01/P02; confirmar configuración real aplicable                                      |
| 11 · Facturas                     | Plantillas versionadas, numeración, snapshots inmutables y correcciones                                | P01/P02; conservación verificada; aprobación fiscal pendiente                        |
| 12 · Pagos y cobros               | Pagos parciales, reversiones, ledger; saldos por cliente/moneda, prioridades, previsión y tres CSV     | P01; pruebas recientes de cobros; sin ejecución bancaria                             |
| 13 · Informes y exportaciones     | Familias de informes y Accounting Pack PDF/XLSX/CSV; estados y reintentos independientes               | P01/P03/P06; artefactos fallidos históricos y aceptación contable pendientes         |
| 14 · Responsive y accesibilidad   | Evidencia 360/390/768/1440; etiquetas EN/ES/PT y navegación por rol                                    | P01; pruebas recientes cubren el cambio, no recertifican cada pantalla               |
| 15 · Archivos y auditoría         | Acceso privado autorizado, DTO seguros, idempotencia y trazabilidad                                    | P01/P03/P05/P09; integridad bloqueada no se convierte en documento válido            |
| 16 · Jobs                         | Ejecución automática, estados veraces, reintentos y fallos por artefacto; ciclos actuales sanos        | P01/P03/P08; un runner sano no resuelve su histórico fallido                         |
| 17 · Operación y continuidad      | Docker/Caddy/SQLite, salud, backup local verificado y material de rollback conservado                  | P01/P04; offsite sigue sin implementar, con dispensa de bloqueo para esta entrega    |

La revisión ERP y la planificación de cobros son mejoras **nativas** autorizadas expresamente.
QuickBooks solo aporta inspiración funcional: conexión Intuit, OAuth, sincronización y transferencia
de datos están **excluidas**, no pendientes. Véase [alcance acordado](QUICKBOOKS_REVIEW_2026-09-18.md).

## 3. Pruebas: qué se puede afirmar

| Evidencia                             | Resultado y alcance                                                                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 06/09 · `2058db2`                     | 32/32 pasos y smoke real Owner/Worker; aceptación humana seguía pendiente. No demuestra el candidato actual                                                                             |
| ASTRA · cierre 08–09/09               | 44/44 casos de navegador; 25 de closeout/follow-up y repetición final 12/12 closeout; entrega corregida `5a615d9`                                                                       |
| 18/09 · revisión ERP `2bb50b2`        | Regresión y pruebas de integración/artefactos; 64 browser aprobados y 12 omisiones intencionales documentadas; migración 47→48 ensayada en copia aislada. Detalle en el análisis ERP    |
| 18/09 · cobros `d69efe6`              | 28/28 focalizadas; pasada general 1.025/1.026 con único fallo de traducción corregido y repetición dirigida 91/91 más 5/5; no se afirma una nueva pasada general completa tras corregir |
| 18/09 · navegador y análisis estático | 20/20 en cuatro anchos; 14/14 adicionales de informes/cobros en 360/1440; typecheck, ESLint y formato correctos; Svelte cero errores/avisos; revisión independiente aprobada            |
| Esta consolidación                    | Comprobación de fuentes activas, salud, ciclos, integridad/conservación, último backup y caché; sin recorrido autenticado nuevo ni restauración sobre producción                        |

Los logs temporales citados en recibos no son archivos versionados duraderos. Las capturas y los
recibos están en Git; la nueva evidencia JSON preserva los resultados operativos de esta consolidación.
P01 debe producir un paquete reproducible ligado al SHA, sin depender solo de `/tmp`.

## 4. Registro único de pendientes

Responsables indicados por función; no implican que una persona haya aceptado una asignación.
`PARTIAL` indica trabajo/evidencia pendiente, `BLOCKED` un dato o aprobación externa necesaria.
La prioridad ordena el cierre; no autoriza envíos, cambios de credenciales ni correcciones de datos.

| ID  | Estado / responsable                                                          | Acción y evidencia necesaria para cerrar                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P01 | PARTIAL · Ingeniería/QA                                                       | Congelar código y repetir los 32 pasos con evidencia vigente de jobs, continuidad y Caddy ligada al mismo SHA; guardar resultados por paso y veredicto independiente. Incluye H10                                                                                                                                                                                                                            |
| P02 | BLOCKED · Owner/asesoría fiscal/Accounting                                    | Confirmar identidad fiscal, domicilio, perfiles Labor/Expenses, vencimiento y reglas comerciales/compensación aplicables; completar configuración de remesa aprobada mediante procedimiento seguro (D11), sin publicar datos bancarios; validar ejemplos y salidas con acuerdos reales. Un mes natural no equivale automáticamente a Net 30. Incluye H06 y decisiones abiertas aplicables del registro Owner |
| P03 | PARTIAL · Ingeniería/operaciones, con Finance para impacto                    | Correlacionar 4 jobs y 5 PDF fallidos con sus fuentes y usuarios afectados. Tres jobs PDF y uno de cierre: `HANDLER_FAILED`; tres PDF `DURABLE_JOB_DEAD_LETTER`, dos `LEGACY_ARTIFACT_UNVERIFIABLE` con integridad bloqueada. Diagnosticar, recuperar solo cuando sea válido y autorizado o registrar disposición auditada; conservar originales y evidenciar resultado                                      |
| P04 | PARTIAL · Operaciones                                                         | Completar y verificar cobertura diaria de 30 días, mantener verificador y ensayar recuperación aislada. Hoy 12 snapshots/10 días; los días perdidos no se recrean. H03; la copia del último backup no prueba restauración integral del servicio                                                                                                                                                              |
| P05 | BLOCKED · Owner/legal/privacidad                                              | Aprobación expresa de DPA, proveedores/región/accesos internacionales y retención/borrado; registrar política autorizada. Mantener archivo/legal hold mientras siga pendiente. Parte de H09                                                                                                                                                                                                                  |
| P06 | BLOCKED · Owner/Accounting/J&A y firmantes autorizados                        | Aceptación humana de PDF/XLSX/CSV, manuales y contenido/idiomas; identificar firmantes y completar Anexo D ligado a versión. El smoke técnico Owner/Worker ya pasó el 06/09; no sustituye firma/UAT. Parte de H09                                                                                                                                                                                            |
| P07 | BLOCKED · Operador de correo/Owner                                            | Completar evidencia DKIM/PTR autoritativa, ida/vuelta externa y recuperación/migración Stalwart/Careers aplicable. Requiere destinatario y prueba autorizados; no se enviaron correos en esta consolidación. H07; el adaptador implementado no acredita entrega externa                                                                                                                                      |
| P08 | BLOCKED · Operaciones/Owner                                                   | Acordar destino externo de alertas y probar recepción/fallo/recuperación. Verificador de backup automático ya implementado y activo; falta evidencia del canal externo. H08                                                                                                                                                                                                                                  |
| P09 | BLOCKED · Responsable de seguridad/Owner                                      | Registrar decisión sobre exposición histórica de credenciales y necesidad de rotación controlada, con evidencia de cierre. No publicar secretos ni inferir rotación realizada                                                                                                                                                                                                                                |
| P10 | BLOCKED para mejora offsite; dispensado como bloqueo core · Owner/operaciones | Proveer destino separado autorizado, cifrado, recuperación y ensayo. H04; la dispensa del Owner permite esta entrega con salvaguardas locales, pero no implementa copia remota                                                                                                                                                                                                                               |
| P11 | CONDITIONAL/DEFERRED · Owner/Accounting                                       | Workbook original y mapeo contable, ejemplos de extensiones ASTRA D/E y ampliación offline si se confirma necesidad. Mantener alcance separado; no convertir roadmap en bloqueo core ni declarar compatibilidad Excel sin el archivo                                                                                                                                                                         |

Fuentes externas pendientes: [decisiones Owner](evidence/client-ready-20260906/OWNER_DECISIONS.md),
[registro de aceptación ASTRA](ASTRA_ACCEPTANCE_REGISTER.md),
[Anexo D preparado](ANEXO_D_UAT_20260904.md) y
[auditoría H01–H10](AUDIT_REMEDIATION_2026-09-09.md).
No se cierran decisiones por silencio, datos sintéticos o cambio de redacción.

## 5. Reconciliación del histórico y decisiones vigentes

| Texto o estado anterior                                    | Lectura actual y evidencia que lo actualiza                                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| README 28/08 `NOT READY`: jobs/timers sin prueba           | Sustituido por este checkpoint; ciclos y timers verificados el 18/09. El cierre total permanece abierto por P01–P09                                                   |
| Matriz 01/09 y candidato 04–06/09                          | Evidencia histórica de esos candidatos. Conservar resultados; usar este documento para pendientes actuales                                                            |
| ASTRA 08/09 «not deployed», closeout/follow-up en progreso | Cierre y entrega 09/09 documentados en el registro ASTRA; no siguen como funcionalidades ausentes                                                                     |
| Auditoría 09/09 H01/H02/H05 pendientes o en preparación    | Correcciones de recibos/adaptador y reconciliación MFA implementadas/documentadas; recibo `5840329`. La prueba externa de correo sigue en P07                         |
| H03 seis snapshots/un día                                  | Sustituido por inventario actual: 12 snapshots/10 días; P04 sigue abierto                                                                                             |
| H10 operaciones sin vincular                               | Runtime actual verificado; no equivale a repetir automáticamente el recorrido completo sobre `d69efe6`; P01 abierto                                                   |
| Smoke Owner/Worker pendiente en Anexo D antiguo            | Smoke técnico ya acreditado el 06/09; no marcar casillas de aceptación humana ni inventar firmas                                                                      |
| MFA obligatorio / step-up en textos anteriores             | Decisión Owner 06/09: MFA opcional para todos, sin step-up; resuelto, no bloqueo                                                                                      |
| Emails operativos automáticos                              | Decisión Owner 10/09: avisos operativos en app; otros emails exigen decisión explícita sí/no sin preselección y consentimiento persistido. Emitir factura no la envía |
| Offline                                                    | Diferido según decisión registrada el 01/09; alcance más amplio condicional. No es requisito nuevo implícito de esta consolidación                                    |
| Offsite                                                    | Dispensa de bloqueo core registrada; backup/rollback local obligatorio. P10 conserva la mejora pendiente                                                              |
| Propuesta de integración QuickBooks                        | Usuario la excluyó expresamente el 18/09. No necesita OAuth ni credenciales Intuit y no pertenece al registro de pendientes                                           |

La secuencia de cierre es: diagnosticar incidencias y completar evidencia técnica P01/P03/P04,
obtener las decisiones/evidencias externas aplicables P02/P05–P09 y registrar la aceptación final
contra la versión verificada. P10 conserva su dispensa explícita; P11 no amplía el alcance sin decisión.

## 6. Validación de esta consolidación

- Ocho archivos de documentación/evidencia; 52 enlaces locales resueltos, JSON coherente con el
  release y formato Prettier correcto; `git diff --check` sin errores.
- Revisión independiente de solo lectura: **PASS**, sin bloqueadores documentales. No constituye
  una recertificación de los 32 pasos ni una aceptación fiscal/legal/humana.
- La evidencia operativa nueva está fechada en el JSON. No se modificaron código de aplicación,
  esquema, registros de negocio o configuración de correo en esta consolidación.
