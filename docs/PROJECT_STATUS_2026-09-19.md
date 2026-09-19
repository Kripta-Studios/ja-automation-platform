# Estado consolidado — 19/09/2026

**Producción operativa; aceptación integral Client Essential pendiente.** Este checkpoint actualiza
el [registro del 18/09](PROJECT_STATUS_2026-09-18.md), cuya matriz CORE-01–17 y pendientes externos
se conservan como referencia. La SPEC y el checklist siguen siendo la autoridad de requisitos.

## Entrega técnica y producción

- Código `3893245d52c9afdf1653f88032737649cf8af27b`, activado el 19/09 a las 06:56:23 UTC
  (08:56 Madrid), con recuperación trazable de informes y filtro de facturas por proyecto corregido.
- 1.720 archivos del release comparados con su ZIP: cero diferencias. Sitio y portal saludables;
  dos ciclos automáticos observados sin fallos. Esquema 48, integridad `ok`, cero infracciones FK.
- Recuperados los tres PDF canónicos fallidos; los otros dos tienen sustitutos válidos y auditados.
  El mensual se regeneró con un job enlazado al original agotado. Informes en revisión, sin aprobar
  ni enviar. Permanecen cuatro jobs fallidos y dos PDF bloqueados como historia conservada.
- Facturas, pagos, documentos y snapshots contables idénticos a la copia anterior. Los 50 archivos
  originales conservan sus hashes. Backup posterior y restauración aislada verificados: 59 archivos.
- Regresión general: 1.050/1.050 en `5db9bfc`; corrección posterior de filtro de facturas: 8/8
  focalizadas y revisión independiente. Typecheck, ESLint y Svelte correctos; **aceptación 32/32 PASS en `3893245`**, ligada a operaciones actuales.
- Caché de construcción Docker: 0 B tras liberar 7,135 GB; imágenes de rollback y volúmenes conservados.

[Recibo de recuperación y aceptación](RECOVERY_AND_ACCEPTANCE_2026-09-19.md) y
[evidencia de runtime](evidence/recovery-20260919/runtime-verification.json).
Los commits posteriores dedicados al test y documentación no alteran el código de aplicación desplegado.
QuickBooks sigue siendo inspiración funcional: Intuit/OAuth/sincronización están excluidos.

## Pendientes actualizados

| ID          | Estado actual                                           | Evidencia o siguiente condición                                                                                                                          |
| ----------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01         | Cerrado técnicamente                                    | 32/32 PASS en `3893245`, evidencia por paso y operaciones actuales. No sustituye UAT humana.                                                             |
| P03         | Cerrado técnicamente para las incidencias identificadas | Tres recuperaciones y dos sustituciones verificadas; historial conservado, hashes y vínculos auditados en el recibo. No equivale a aprobar los informes. |
| P04         | Parcial                                                 | Backup/restauración verificados; 18 snapshots en 11 días UTC. La cobertura diaria de 30 días aún no existe.                                              |
| P02/P05/P06 | Bloqueados por decisiones externas                      | Configuración y aprobación fiscal/comercial; legal/privacidad; aceptación de salidas, idiomas y Anexo D por firmantes autorizados.                       |
| P07/P08/P09 | Evidencia/decisiones externas pendientes                | Correo externo y recuperación aplicable, destino autorizado de alertas, decisión sobre credenciales históricas.                                          |
| P10         | Mejora offsite pendiente; dispensa core vigente         | Falta destino separado y ensayo; se conserva la dispensa ya documentada y el timestamp de su evidencia, sin nueva aprobación.                            |
| P11         | Condicional/diferido                                    | Workbook original, extensiones y offline según decisiones de alcance.                                                                                    |

El detalle de cada requisito externo permanece en el [registro P01–P11 anterior](PROJECT_STATUS_2026-09-18.md#4-registro-único-de-pendientes).
No se afirma `CLIENT READY` ni se cierran aprobaciones por silencio o por pruebas automáticas.

La SPEC/checklist sitúan la dispensa offsite en el 04/09; el recibo operativo del 06/09 contiene
`waivedAt: 2026-09-06T13:17:12.563Z`. Se conservan esas referencias históricas y el valor exacto
del recibo reutilizado; no se presenta el 06/09 como una nueva decisión ni se renueva la dispensa.
