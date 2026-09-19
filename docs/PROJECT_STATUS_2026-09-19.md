# Estado consolidado — 19/09/2026

**Producción operativa; aceptación humana Client Essential pendiente.** Este checkpoint actualiza
el [registro del 18/09](PROJECT_STATUS_2026-09-18.md), cuya matriz CORE-01–17 y pendientes externos
se conservan como referencia. La SPEC y el checklist siguen siendo la autoridad de requisitos.

## Entrega técnica y producción

- Código vigente `e43c640611bf3f50297056719e2a5a185ed9783f`, activado el 19/09 a las
  10:07:32 UTC (12:07 Madrid): manuales ilustrados para siete perfiles en inglés/PT-BR,
  traducciones, validación localizada y recuperación automática de descargas transitorias.
  Los conflictos que requieren intervención conservan los datos y explican la acción necesaria.
  Se mantienen los calendarios accionables y la disponibilidad editable de `7b36959`.
- 1.924 archivos idénticos al ZIP y 17 PDF del contenedor idénticos a los revisados;
  sitio/portal saludables, dos ciclos automáticos sin fallos.
  Esquema 49, integridad `ok`, cero infracciones FK. Conservadas las 36 filas comparadas de
  facturas, pagos, documentos y revisiones/snapshots contables.
- 1.123 pruebas unitarias generales y 88 focalizadas para navegación; 34 de integración;
  105 rutas en siete perfiles y EN/ES/PT-BR, autorización de descargas y recuperación GET.
  Editor de disponibilidad y Ayuda verificados en 360/390/768/1440 px. Tipos, Svelte, ESLint y
  formato correctos. Las 527 pruebas de integración de `7b36959` conservan su atribución histórica.
- 14 manuales por perfil EN/PT-BR y tres guías rápidas, con 90 capturas reales de la aplicación
  usando cuentas y datos sintéticos aislados. El manifiesto y los hashes permiten verificarlos.
- Backup posterior esquema 49 y restauración aislada del backup previo esquema 49: 59
  documentos verificados en ambos. Rollback requiere emparejar código/datos compatibles y
  conciliar escrituras posteriores; no se ejecutó un rollback sobre producción.
- Caché Docker a 0 B tras liberar 6,976 GB; imágenes de recuperación y volúmenes conservados.

[Recibo de esta entrega](PRODUCTION_DEPLOYMENT_2026-09-19_MANUALS_I18N.md),
[evidencia de runtime](evidence/manuals-i18n-20260919/runtime-verification.json) y
[entrega anterior de calendarios](PRODUCTION_DEPLOYMENT_2026-09-19_PLANNING_CALENDAR.md).
Los commits de recibos posteriores no alteran el código de aplicación desplegado.

La [recuperación anterior en `3893245`](RECOVERY_AND_ACCEPTANCE_2026-09-19.md) conserva sus
resultados: tres PDF recuperados, dos sustitutos auditados, cuatro jobs agotados y dos PDF
históricos bloqueados. Los informes siguen en revisión; esta entrega no los aprueba ni envía.
La aceptación automatizada vigente pasa **32/32 en `e43c640`**, con evidencia operativa nueva
del release y una aserción actualizada a la etiqueta traducida de compensación. La comprobación
del porcentaje persistido sigue intacta. Las pruebas anteriores conservan su atribución histórica;
ninguna sustituye aceptación humana.
QuickBooks sigue siendo inspiración funcional; Intuit/OAuth/sincronización están excluidos.

## Pendientes actualizados

| ID          | Estado actual                                           | Evidencia o siguiente condición                                                                                                                          |
| ----------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01         | Cerrado técnicamente                                    | 32/32 PASS en `e43c640`, prueba estricta y operaciones del release vigente. No sustituye UAT humana.                                                     |
| P03         | Cerrado técnicamente para las incidencias identificadas | Tres recuperaciones y dos sustituciones verificadas; historial conservado, hashes y vínculos auditados en el recibo. No equivale a aprobar los informes. |
| P04         | Parcial                                                 | Backup/restauración verificados; 22 snapshots en 11 días UTC. La cobertura diaria de 30 días aún no existe.                                              |
| P02/P05/P06 | Bloqueados por decisiones externas                      | Configuración y aprobación fiscal/comercial; legal/privacidad; aceptación de salidas, idiomas y Anexo D por firmantes autorizados.                       |
| P07/P08/P09 | Evidencia/decisiones externas pendientes                | Correo externo y recuperación aplicable, destino autorizado de alertas, decisión sobre credenciales históricas.                                          |
| P10         | Mejora offsite pendiente; dispensa core vigente         | Falta destino separado y ensayo; se conserva la dispensa ya documentada y el timestamp de su evidencia, sin nueva aprobación.                            |
| P11         | Condicional/diferido                                    | Workbook original, extensiones y offline según decisiones de alcance.                                                                                    |

El detalle de cada requisito externo permanece en el [registro P01–P11 anterior](PROJECT_STATUS_2026-09-18.md#4-registro-único-de-pendientes).
No se afirma `CLIENT READY` ni se cierran aprobaciones por silencio o por pruebas automáticas.

La SPEC/checklist sitúan la dispensa offsite en el 04/09; el recibo operativo del 06/09 contiene
`waivedAt: 2026-09-06T13:17:12.563Z`. Se conservan esas referencias históricas y el valor exacto
del recibo reutilizado; no se presenta el 06/09 como una nueva decisión ni se renueva la dispensa.
