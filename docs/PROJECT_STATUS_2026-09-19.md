# Estado consolidado — 19/09/2026

**Producción operativa; aceptación humana Client Essential pendiente.** Este checkpoint actualiza
el [registro del 18/09](PROJECT_STATUS_2026-09-18.md), cuya matriz CORE-01–17 y pendientes externos
se conservan como referencia. La SPEC y el checklist siguen siendo la autoridad de requisitos.

## Entrega técnica y producción

- Código vigente `1b2eef40247371e0fd88a11a946cfd92a217a471`, activado el 19/09 a las
  11:07:03 UTC (13:07 Madrid): tres manuales compartidos para siete perfiles en inglés/PT-BR,
  con rutas de lectura por perfil, capítulos enlazados y capturas intercaladas. Ayuda conserva
  los enlaces antiguos y controla la sesión y el perfil persistido sin ampliar permisos de negocio.
  Se mantienen traducciones, validación localizada, recuperación automática de descargas,
  calendarios accionables y disponibilidad editable de las entregas anteriores.
- 1.976 archivos idénticos al ZIP y 9 PDF del contenedor idénticos a los revisados;
  sitio/portal saludables, dos ciclos automáticos sin fallos.
  Esquema 49, integridad `ok`, cero infracciones FK. Conservadas las 36 filas comparadas de
  facturas, pagos, documentos y revisiones/snapshots contables.
- Esta consolidación: 16 pruebas focalizadas y 19 E2E correctas en 360/390/768/1440 px.
  La matriz desktop cubre siete perfiles EN/PT-BR, 60 descargas autorizadas y 48 denegadas. Tipos,
  Svelte, ESLint y formato correctos. Las 1.123 pruebas generales, 88 focalizadas, 34 de
  integración y 105 rutas EN/ES/PT-BR del release anterior conservan su atribución histórica,
  igual que las 527 de integración de `7b36959`; no se presentan como repetidas aquí.
- Seis manuales principales EN/PT-BR y tres guías rápidas, construidos con 90 capturas reales
  de la aplicación usando cuentas y datos sintéticos aislados. Cada libro usa sus imágenes
  pertinentes. El manifiesto y los hashes permiten verificar fuentes y PDF.
- Backup posterior esquema 49 y restauración aislada del backup previo esquema 49: 59
  documentos verificados en ambos. Rollback requiere emparejar código/datos compatibles y
  conciliar escrituras posteriores; no se ejecutó un rollback sobre producción.
- Caché Docker a 0 B tras liberar 6,961 GB; imágenes de recuperación y volúmenes conservados.

[Recibo de esta entrega](PRODUCTION_DEPLOYMENT_2026-09-19_MANUAL_CONSOLIDATION.md),
[evidencia de runtime](evidence/manuals-consolidation-20260919/runtime-verification.json),
[manuales e idiomas anteriores](PRODUCTION_DEPLOYMENT_2026-09-19_MANUALS_I18N.md) y
[entrega anterior de calendarios](PRODUCTION_DEPLOYMENT_2026-09-19_PLANNING_CALENDAR.md).
Los commits de recibos posteriores no alteran el código de aplicación desplegado.

La [recuperación anterior en `3893245`](RECOVERY_AND_ACCEPTANCE_2026-09-19.md) conserva sus
resultados: tres PDF recuperados, dos sustitutos auditados, cuatro jobs agotados y dos PDF
históricos bloqueados. Los informes siguen en revisión; esta entrega no los aprueba ni envía.
La aceptación automatizada vigente pasa **32/32 en `1b2eef4`**, con el contrato operativo nuevo
de la consolidación: una ejecución estricta en 2,9 minutos, sin fallos ni cambios de prueba.
La comprobación del porcentaje de compensación persistido sigue intacta. Las ejecuciones
anteriores conservan su atribución histórica; ninguna prueba automática sustituye aceptación humana.
QuickBooks sigue siendo inspiración funcional; Intuit/OAuth/sincronización están excluidos.

## Pendientes actualizados

| ID          | Estado actual                                           | Evidencia o siguiente condición                                                                                                                          |
| ----------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01         | Cerrado técnicamente                                    | 32/32 PASS en `1b2eef4`, prueba estricta y operaciones del release vigente. No sustituye UAT humana.                                                     |
| P03         | Cerrado técnicamente para las incidencias identificadas | Tres recuperaciones y dos sustituciones verificadas; historial conservado, hashes y vínculos auditados en el recibo. No equivale a aprobar los informes. |
| P04         | Parcial                                                 | Backup/restauración verificados; 24 snapshots en 11 días UTC. La cobertura diaria de 30 días aún no existe.                                              |
| P02/P05/P06 | Bloqueados por decisiones externas                      | Configuración y aprobación fiscal/comercial; legal/privacidad; aceptación de salidas, idiomas y Anexo D por firmantes autorizados.                       |
| P07/P08/P09 | Evidencia/decisiones externas pendientes                | Correo externo y recuperación aplicable, destino autorizado de alertas, decisión sobre credenciales históricas.                                          |
| P10         | Mejora offsite pendiente; dispensa core vigente         | Falta destino separado y ensayo; se conserva la dispensa ya documentada y el timestamp de su evidencia, sin nueva aprobación.                            |
| P11         | Condicional/diferido                                    | Workbook original, extensiones y offline según decisiones de alcance.                                                                                    |

El detalle de cada requisito externo permanece en el [registro P01–P11 anterior](PROJECT_STATUS_2026-09-18.md#4-registro-único-de-pendientes).
No se afirma `CLIENT READY` ni se cierran aprobaciones por silencio o por pruebas automáticas.

La SPEC/checklist sitúan la dispensa offsite en el 04/09; el recibo operativo del 06/09 contiene
`waivedAt: 2026-09-06T13:17:12.563Z`. Se conservan esas referencias históricas y el valor exacto
del recibo reutilizado; no se presenta el 06/09 como una nueva decisión ni se renueva la dispensa.
