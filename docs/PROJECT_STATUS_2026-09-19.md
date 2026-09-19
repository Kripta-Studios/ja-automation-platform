# Estado consolidado — 19/09/2026

**Producción operativa; aceptación humana Client Essential pendiente.** Este checkpoint actualiza
el [registro del 18/09](PROJECT_STATUS_2026-09-18.md), cuya matriz CORE-01–17 y pendientes externos
se conservan como referencia. La SPEC y el checklist siguen siendo la autoridad de requisitos.

## Entrega técnica y producción

- Código vigente `7b369598d23a7a74b872d05a0cc0682597d7f2a6`, activado el 19/09 a las
  08:44:17 UTC (10:44 Madrid): calendarios accionables, disponibilidad editable y selección
  de trabajador conforme al alcance autorizado.
- 1.753 archivos idénticos al ZIP; sitio/portal saludables, dos ciclos automáticos sin fallos.
  Esquema 49, integridad `ok`, cero infracciones FK. Conservadas las 36 filas comparadas de
  facturas, pagos, documentos y revisiones/snapshots contables.
- 1.074 pruebas unitarias generales; 17 focalizadas para el último ajuste de perfil propio;
  527 de integración; 48 de calendario en cinco roles/cuatro tamaños; dos recorridos de
  proveedores en móvil/escritorio. Tipos, Svelte, ESLint y formato correctos.
- Backup posterior esquema 49 y restauración aislada del backup previo esquema 48: 59
  documentos verificados en ambos. Rollback requiere emparejar código/datos compatibles y
  conciliar escrituras posteriores; no se ejecutó un rollback sobre producción.
- Caché Docker a 0 B tras liberar 6,961 GB; imágenes de recuperación y volúmenes conservados.

[Recibo de esta entrega](PRODUCTION_DEPLOYMENT_2026-09-19_PLANNING_CALENDAR.md) y
[evidencia de runtime](evidence/planning-calendar-20260919/runtime-verification.json).
Los commits de recibos posteriores no alteran el código de aplicación desplegado.

La [recuperación anterior en `3893245`](RECOVERY_AND_ACCEPTANCE_2026-09-19.md) conserva sus
resultados: tres PDF recuperados, dos sustitutos auditados, cuatro jobs agotados y dos PDF
históricos bloqueados. Los informes siguen en revisión; esta entrega no los aprueba ni envía.
La aceptación automatizada vigente pasa **32/32 en `7b36959`**, con evidencia operativa nueva
del release; la prueba anterior conserva su atribución histórica a `3893245`. No sustituye
aceptación humana.
QuickBooks sigue siendo inspiración funcional; Intuit/OAuth/sincronización están excluidos.

## Pendientes actualizados

| ID          | Estado actual                                           | Evidencia o siguiente condición                                                                                                                          |
| ----------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01         | Cerrado técnicamente                                    | 32/32 PASS en `7b36959`, prueba estricta y operaciones del release vigente. No sustituye UAT humana.                                                     |
| P03         | Cerrado técnicamente para las incidencias identificadas | Tres recuperaciones y dos sustituciones verificadas; historial conservado, hashes y vínculos auditados en el recibo. No equivale a aprobar los informes. |
| P04         | Parcial                                                 | Backup/restauración verificados; 20 snapshots en 11 días UTC. La cobertura diaria de 30 días aún no existe.                                              |
| P02/P05/P06 | Bloqueados por decisiones externas                      | Configuración y aprobación fiscal/comercial; legal/privacidad; aceptación de salidas, idiomas y Anexo D por firmantes autorizados.                       |
| P07/P08/P09 | Evidencia/decisiones externas pendientes                | Correo externo y recuperación aplicable, destino autorizado de alertas, decisión sobre credenciales históricas.                                          |
| P10         | Mejora offsite pendiente; dispensa core vigente         | Falta destino separado y ensayo; se conserva la dispensa ya documentada y el timestamp de su evidencia, sin nueva aprobación.                            |
| P11         | Condicional/diferido                                    | Workbook original, extensiones y offline según decisiones de alcance.                                                                                    |

El detalle de cada requisito externo permanece en el [registro P01–P11 anterior](PROJECT_STATUS_2026-09-18.md#4-registro-único-de-pendientes).
No se afirma `CLIENT READY` ni se cierran aprobaciones por silencio o por pruebas automáticas.

La SPEC/checklist sitúan la dispensa offsite en el 04/09; el recibo operativo del 06/09 contiene
`waivedAt: 2026-09-06T13:17:12.563Z`. Se conservan esas referencias históricas y el valor exacto
del recibo reutilizado; no se presenta el 06/09 como una nueva decisión ni se renueva la dispensa.
