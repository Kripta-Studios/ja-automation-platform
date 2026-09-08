# Auditoría de cobertura de manuales PDF — 9 de septiembre de 2026

## Dictamen

**Necesitan correcciones: los manuales detallados no cubren suficientemente la aplicación actual.** El manual Owner cubre navegación y operaciones básicas de la versión anterior, pero omite los nuevos flujos ASTRA y explica incorrectamente una secuencia de aceptación de informes. El Worker conserva un incidente ya obsoleto. Este dictamen se refiere a la documentación; no revoca la evidencia de funcionamiento de la aplicación desplegada.

Solo **Owner_User_Guide.pdf, de 65 páginas**, supera las 60 páginas solicitadas. También se contrastó el manual Worker, de 24 páginas, y las tres guías rápidas para determinar qué cobertura complementaria existe. Esta tarea audita los documentos; **no los ha regenerado ni corregido**.

## Alcance, versión y método

| Documento en `docs/manuals`                                              | Páginas | Revisión                                                             |
| ------------------------------------------------------------------------ | ------: | -------------------------------------------------------------------- |
| [Owner_User_Guide.pdf](manuals/Owner_User_Guide.pdf)                     |      65 | Texto completo y contraste funcional; único PDF de más de 60 páginas |
| [Worker_User_Guide.pdf](manuals/Worker_User_Guide.pdf)                   |      24 | Texto completo y contraste de cobertura complementaria               |
| [Employee_Field_Guide_EN.pdf](manuals/Employee_Field_Guide_EN.pdf)       |       5 | Guía rápida, alcance diario                                          |
| [Employee_Field_Guide_ES.pdf](manuals/Employee_Field_Guide_ES.pdf)       |       5 | Guía rápida, alcance diario                                          |
| [Employee_Field_Guide_PT-BR.pdf](manuals/Employee_Field_Guide_PT-BR.pdf) |       5 | Guía rápida, alcance diario                                          |

La producción ejecuta `5a615d961e1dafa2d399be45ca596b139f2e6818`, desplegado a las 00:02:29 CEST del 9 de septiembre. Los cinco PDFs locales coinciden por SHA-256 con `/app/manuals` del contenedor de producción: los hallazgos afectan a los archivos actualmente distribuidos. Owner y Worker declaran el SHA anterior `2058db24…` y fecha 6 de septiembre. Las guías rápidas se revisaron el 8 de septiembre, pero esa fecha no vincula sus capturas a un commit.

Se extrajo todo el texto de Owner y Worker y se contrastaron páginas, rutas, permisos, código y evidencia de los flujos actuales. Inspección visual: Owner pp. 2, 31, 45, 50, 57 y 65; Worker pp. 2, 3, 10, 11, 17 y 24; capturas fuente de Projects, Reports, Finance, Commercial, Accounting, Time y My Pay; capturas actuales de preview, cash, closeout, period follow-up y notifications. No fue una revisión visual píxel a píxel de las 89 páginas, una certificación de accesibilidad ni una nueva ejecución de operaciones financieras sobre datos reales. No se asigna un porcentaje de cobertura sin un denominador funcional acordado.

Las páginas citadas son páginas físicas del PDF. Las rutas de las tablas son relativas al prefijo de producción `/j-aautomation`.

## Hallazgos prioritarios

| ID  | Prioridad documental | Evidencia                           | Problema y corrección necesaria                                                                                                                                                                                                                                                                                  |
| --- | -------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M01 | Alta                 | Worker p. 3                         | Describe un 500 de `/app/approvals` y una corrección sin desplegar. La autorización actual deniega Worker con 403. Sustituir la incidencia histórica por el límite de acceso vigente.                                                                                                                            |
| M02 | Alta                 | Owner p. 31                         | Indica generar/revisar el archivo del cliente solo después de aceptación real. El flujo vigente necesita un PDF listo de la versión actual antes de registrar envío/espera de firma; la aceptación procede de evidencia firmada ligada a esa versión. Reescribir la secuencia con versión, hash y firma exactos. |
| M03 | Alta                 | Owner p. 2; generador               | Presenta capturas como actuales mientras el generador fija el SHA y la evidencia del 6 de septiembre. Vincular texto, capturas y manifiesto a una versión contrastada.                                                                                                                                           |
| M04 | Alta                 | Matriz inferior                     | No documenta Help, Activity Inbox, commercial preview, cash calendar, revisión/seguimiento por periodo, calendarios efectivos ni cierre con ZIP y reapertura. Añadir procedimientos completos por rol.                                                                                                           |
| M05 | Alta                 | Owner pp. 39–58                     | Facturación/finanzas no explican suficientemente emisión, inmutabilidad, ajustes, reversos, cobros, obligaciones y estados de artefactos. Completar los ciclos monetarios y de generación.                                                                                                                       |
| M06 | Media                | Owner pp. 4–5, 59–60; catálogo Help | Finance recibe el manual Owner, que contiene pantallas y acciones no disponibles para ese rol. PM y Auditor carecen de referencias específicas. Marcar permisos por procedimiento o preparar variantes.                                                                                                          |
| M07 | Media                | Owner p. 65; Worker p. 24           | Soporte remite a rutas internas `docs/evidence/...` que un usuario de producción no puede consultar. Sustituir por Help y canal de soporte verificado.                                                                                                                                                           |
| M08 | Media                | Owner p. 50; capturas e índice      | Amontonamiento de leyenda/procedimiento, capturas casi vacías y navegación poco útil. Renovar imágenes, corregir composición y añadir enlaces/estructura accesible.                                                                                                                                              |

## Matriz de cobertura Owner

| Área actual          | Páginas | Ruta                                                                    | Evaluación y carencias                                                                                                             |
| -------------------- | ------: | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Today/dashboard      |     4–5 | `/app`                                                                  | Lectura básica de Owner cubierta. Finance aterriza en Finance y necesita orientación diferente.                                    |
| Clientes             |     6–8 | `/app/projects?view=clients`                                            | Alta/consulta básica adecuada; faltan relaciones con calendario, facturación y cierre.                                             |
| Proyectos            |    9–14 | `/app/projects`, `/app/projects/[id]`                                   | Alta/edición básica cubierta. Falta todo el ciclo closeout.                                                                        |
| Equipo               |   15–17 | `/app/projects?view=team`                                               | Inventario básico; faltan reglas efectivas y su impacto temporal.                                                                  |
| Planificación        |   18–20 | `/app/planning`                                                         | Edición general cubierta. Faltan calendarios efectivos, recordatorios y consecuencias de cambios retroactivos.                     |
| Documentos privados  |   21–23 | `/app/documents`                                                        | Advierte sobre alcance y hash. Faltan audiencias de ZIP, selección de archivos y separación interno/cliente.                       |
| Tiempo               |   24–27 | `/app/time`, `/app/time/[id]`                                           | Captura/revisión básicas. Falta ciclo completo de corrección, conflictos offline y efecto del calendario.                          |
| Aprobaciones         |   28–30 | `/app/approvals`                                                        | Aprobación general cubierta. Falta conexión con inbox, recordatorios y fallos de correo.                                           |
| Informes             |   31–34 | `/app/reports`, `/app/reports/[id]`, `/app/reports/period/[id]`         | Parcial y con secuencia incorrecta en p. 31. Faltan revisión por periodo, versión/hash, compartido frente a firmado y seguimiento. |
| Gastos               |   35–38 | `/app/expenses`, `/app/expenses/[id]`                                   | Alta, recibo y aprobación básicos. Faltan correcciones detalladas, pagador, tratamiento comercial y estados posteriores.           |
| Facturación          |   39–44 | `/app/billing`, `/app/billing/invoices/[id]`                            | Insuficiente: aprobar/emitir, snapshot inmutable, PDF, crédito/débito, anulación, cobro, reversión y collections.                  |
| Finance overview     |   45–47 | `/app/finance`                                                          | Panorama básico; falta caja real/esperada/no confirmada.                                                                           |
| Economic             |   48–49 | `/app/finance/economic`                                                 | Lectura superficial; falta procedencia temporal y reconciliación.                                                                  |
| Commercial           |   50–54 | `/app/finance/configuration`                                            | Configuración anterior. Falta preview; nombres internos de controles necesitan explicación como decisiones operativas.             |
| Ledger               |   55–56 | `/app/finance/ledger`                                                   | Filtros/revisión básicos. Faltan CSV/XLSX, cobros parciales, reversos y reconciliación de pendientes.                              |
| Accounting           |   57–58 | `/app/finance/accounting`                                               | Generar/revisar básico. Faltan jobs automáticos, formatos independientes, estados y reintento.                                     |
| Audit                |   59–60 | `/app/audit`                                                            | Básico adecuado para Owner. Debe indicar que Finance no dispone de este flujo.                                                     |
| Perfil y seguridad   |   61–64 | `/app/profile`                                                          | MFA opcional y passkeys reconocidos. Falta recorrido de activación/verificación, códigos de recuperación y recuperación segura.    |
| Ayuda/soporte        |      65 | `/app/help`                                                             | La página de soporte remite a evidencia interna, no enseña la nueva sección Help.                                                  |
| Activity Inbox       |       — | `/app/notifications`, `/app/notifications/[id]`                         | Ausente: enseñar acceso, detalle y marcado como leído.                                                                             |
| Commercial preview   |       — | `/app/finance/preview`                                                  | Ausente: explicar parámetros efectivos, cálculo y que consultar no modifica datos.                                                 |
| Cash calendar        |       — | `/app/finance/cash`                                                     | Ausente: explicar fechas, certeza, moneda/entidad y categorías real/esperada/no confirmada.                                        |
| Revisión por periodo |       — | `/app/reports/review`                                                   | Ausente: control central de versión, envío y firma.                                                                                |
| Closeout             |       — | `/app/projects/[id]/closeout`                                           | Ausente: confirmación exacta, revisiones, ZIP privados, finalización y reapertura.                                                 |
| Aquarex              |       — | `/{en\|es\|pt}/solutions/aquarex#datasheet`, `POST /api/public/aquarex` | No pertenece al uso diario Worker. Requiere guía pública y procedimiento administrativo separado de seguimiento.                   |

## Worker y guías rápidas

| Área Worker         | Páginas | Evaluación                                                                                                                   |
| ------------------- | ------: | ---------------------------------------------------------------------------------------------------------------------------- |
| Acceso/seguridad    |       3 | MFA opcional correcto; falso incidente 500 de Approvals.                                                                     |
| Today               |       4 | Orientación breve suficiente.                                                                                                |
| Proyectos           |     5–6 | Consulta básica suficiente para su rol.                                                                                      |
| Tiempo/correcciones |    7–10 | Básico presente; faltan offline condicional, conflictos y estados de corrección.                                             |
| Informes            |   11–13 | Superficial. Explicar estados y límites de rol sin atribuir al Worker acciones de firma o revisión reservadas a otros roles. |
| Gastos              |   14–16 | Alta básica adecuada; faltan correcciones y responsabilidad del pagador.                                                     |
| My Pay              |   17–18 | Privacidad básica correcta; generación y diferencia programado/pagado necesitan más detalle.                                 |
| Documentos          |   19–20 | Cobertura básica de documentos privados.                                                                                     |
| Perfil/seguridad    |   21–23 | Parcial; falta recorrido completo de recuperación.                                                                           |
| Soporte             |      24 | Remite a evidencia interna del repositorio.                                                                                  |

Las guías rápidas EN/ES/PT-BR resultan más claras para varias tareas diarias: mantienen horas reales separadas del mínimo comercial; identifican pagador y recibo; explican corrección; impiden interpretar que el trabajador firma por el cliente; mantienen My Pay privado y distinguen scheduled de paid; condicionan offline a su habilitación; remiten al canal verificado de la invitación para soporte. Deben conservarse estas cautelas.

Son guías de cinco páginas, no una cobertura administrativa integral. El generador reutiliza capturas existentes: una fecha de revisión nueva no demuestra que esas imágenes se hayan tomado de la versión distribuida.

## Riesgos que debe resolver la actualización

- **Permisos:** Finance necesita orientación propia; PM necesita approvals, equipo, planificación, documentos y cierre según su alcance; Auditor necesita consulta de ledger/accounting/audit. Cada acción debe llevar sus roles permitidos. No basta con cambiar la portada Owner por Finance.
- **Aceptación contractual:** preparar PDF vigente, revisar versión/hash, registrar envío o espera, incorporar evidencia firmada exacta y derivar aceptación efectiva. Registrar seguimiento operativo no equivale a aceptación del cliente.
- **Closeout:** explicar archivos admisibles, separación de paquete interno/cliente, confirmación exacta, revisión inmutable y reapertura autorizada de Owner con siguiente borrador. No enseñar a sobrescribir paquetes finales.
- **Dinero:** emisión y correcciones conservan el historial; los pagos/reversos deben reconciliarse con sus fuentes. Coste cargado, base porcentual, compensación finalizada y transferencia real son conceptos distintos. El cash calendar no certifica un saldo bancario.
- **Jobs:** queued/running no significa listo ni necesariamente error. PDF, XLSX y CSV tienen estados y reintentos independientes; usuarios normales no deben procesar jobs manualmente. Aplicarlo a facturas, accounting y My Pay.
- **Avisos/correo:** el adaptador solo admite `@j-aautomation.com`. En la verificación de producción se observaron tres avisos de aprobación con correo a destinatarios no corporativos en 502/retry, aunque el aviso interno existe. Enseñar inbox como registro interno de referencia y correo como complemento sujeto a la política de entrega; no prometer correo universal.
- **Aquarex:** el formulario registra una solicitud con seguimiento; no debe describirse como descarga inmediata de una ficha. Añadir procedimiento de atención para el responsable administrativo, separado del manual Worker.
- **Offline/continuidad:** mantener offline condicional a habilitación. Decisiones de infraestructura o excepciones operativas pertenecen a documentación administrativa, no a pasos que deba ejecutar el trabajador.

## Calidad visual y accesibilidad

Owner p. 31 y Worker p. 11 reutilizan capturas casi vacías/redactadas que no enseñan decisiones. Worker p. 10 muestra el móvil a una escala pequeña y deja gran parte de la página vacía; pp. 17–18 repiten My Pay con poco contenido útil. Owner p. 50 amontona la segunda leyenda y «16.1 Procedure». Owner p. 65 y Worker p. 24 están casi vacías y exponen nombres de archivos internos.

El índice no enlaza a las secciones: el generador representa las rutas mediante `span`, sin anclas. Ambos manuales detallados declaran `Tagged: no`; conviene generar estructura etiquetada y comprobar navegación con teclado/lector. Ninguna captura de esos manuales muestra los puntos de entrada ASTRA nuevos. La solución no es retirar la redacción de datos privados: deben usarse escenarios sintéticos útiles y capturas legibles sin datos reales.

## Secuencia de corrección y aceptación documental

1. Corregir M01 y M02 y retirar la afirmación de actualidad de la evidencia antigua.
2. Vincular generación a SHA desplegado y manifiestos de rutas/capturas; fallar si falta evidencia o una captura corresponde a otra versión.
3. Añadir capítulos de Help/inbox, calendarios, preview/cash, revisión de periodos y closeout completo.
4. Ampliar facturación, cobros, compensación y accounting con estados, correcciones, reversos y límites de rol.
5. Preparar referencias Finance/PM/Auditor o marcar claramente cada procedimiento por rol; mantener Aquarex en documentación pública/administrativa apropiada.
6. Renovar capturas móviles/escritorio con datos sintéticos; corregir p. 50, índice, enlaces y estructura PDF; sustituir soporte interno por canales verificables.
7. Validar recorridos representativos con Worker, PM, Finance y Owner; comprobar permisos, correspondencia de versión, enlaces, texto extraído, saltos de página y privacidad de descargas. Registrar aparte cualquier aceptación humana pendiente.

Un manual actualizado debe permitir completar cada recorrido de su rol con estados y decisiones reales. No basta con aumentar páginas o cambiar la fecha. Esta auditoría no da por completada ninguna de estas correcciones.

## Referencias técnicas y reproducibilidad

- [Generador de manuales detallados](../scripts/generate-user-manuals.ts): SHA fijado cerca de línea 28 y conjunto histórico de rutas/capturas.
- [Catálogo privado por rol](../apps/portal/src/lib/server/manual-catalog.ts) y [autorización de secciones](../apps/portal/src/routes/app/[section]/section-load.ts): distribución y permisos actuales; denegación Worker cerca de líneas 45–49.
- [Seguimiento por periodo](../packages/database/src/domains/reports/period-followup-repository.ts), [closeout](../packages/database/src/domains/closeout/project-closeout-service.ts), [preview](../apps/portal/src/lib/server/commercial-preview.ts), [cash](../apps/portal/src/lib/server/cash-calendar.ts) y [entrega de correo](../apps/portal/src/lib/server/outbox-mail-delivery.ts).
- [Evidencia de implementación y despliegue](ASTRA_IMPLEMENTATION_PROGRESS.md), [aceptaciones externas](ASTRA_ACCEPTANCE_REGISTER.md) y [limpieza de almacenamiento](ASTRA_STORAGE_CLEANUP_2026-09-09.md).

SHA-256 de los PDFs auditados y distribuidos:

```text
Owner_User_Guide.pdf          b94df2994fe39bbd18424010096b2eb2820a509e32a6e17160afa931cf62eca5
Worker_User_Guide.pdf         e9ae233c0da6a08012259d875d83d0523f9321800eacbb2b0b9e8c6c1f04b5bd
Employee_Field_Guide_EN.pdf   e98405d51072047ddab441c3af31a493db2b2e4ae03a2fd5d9fd3ca4d900bb16
Employee_Field_Guide_ES.pdf   277dd3f04f9ec8dd4f734ed483f3b56bf284ee9c5113ffc696e5c678a65c6210
Employee_Field_Guide_PT-BR.pdf 1ba88f05de1f19f69f526fca24d86f64886d1b9c86f84d90d08b46d4de8dcd0d
```
