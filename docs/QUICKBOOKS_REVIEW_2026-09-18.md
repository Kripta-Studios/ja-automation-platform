# QuickBooks y mejoras de cobros — 18/09/2026

Solicitud: analizar QuickBooks frente al ERP existente, integrar mejoras útiles, probar,
publicar en Git, desplegar y limpiar la caché Docker. Extensión explícita posterior al
alcance Client Essential; se conservan SQLite, el monolito, permisos e históricos.

Referencias previas: [revisión ERP](ERP_REVIEW_2026-09-18.md) y
[producción y pendientes históricos](PRODUCTION_DEPLOYMENT_2026-09-18_ERP_REVIEW.md).

## Qué es y cómo funciona QuickBooks

QuickBooks es el producto comercial de contabilidad de Intuit; no se incorpora como dependencia
open source. QuickBooks Online organiza clientes, ventas, gastos y cuentas para convertir
operaciones en registros contables e informes. Su catálogo incluye facturación, cobros,
conexiones bancarias, justificantes, informes y, según edición, presupuestos, inventario,
rentabilidad por proyecto y automatizaciones. Nóminas y pagos tienen servicios específicos.
La disponibilidad depende del país, plan y complementos; no se presupone que todas las
funciones de la oferta estadounidense estén disponibles para J&A.
[Fuente oficial: funciones de QuickBooks](https://quickbooks.intuit.com/accounting/).

Su informe de antigüedad permite identificar cuánto debe cada cliente y cuánto tiempo lleva
pendiente, en resumen o detalle.
[Fuente oficial: cuentas por cobrar](https://quickbooks.intuit.com/learn-support/en-us/help-article/accounts-receivable-reports/run-accounts-receivable-aging-report/L4N7PC2hg_US_en_US).
El planificador de caja utiliza información histórica de cuentas conectadas para prever
entradas y salidas; una previsión no es un movimiento bancario confirmado.
[Fuente oficial: Cash Flow Planner](https://quickbooks.intuit.com/learn-support/en-global/help-article/money-movement/cash-flow-planner/L8kvVEdNC_ROW_en).
La comparación de costes estimados y reales ayuda a seguir la rentabilidad de proyectos.
[Fuente oficial: estimaciones frente a reales](https://quickbooks.intuit.com/learn-support/en-us/help-article/manage-projects/compare-project-cost-estimates-vs-actuals-online/L9oxsLKqN_US_en_US).

## Comparación y decisiones para J&A

La columna de decisiones es análisis propio basado en el repositorio, no una promesa de
compatibilidad con Intuit. No se copia código ni se presenta J&A como contabilidad fiscal general.

| Área                                  | ERP J&A existente                                                            | Decisión de esta entrega                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Clientes y proyectos                  | Directorios, asignaciones, PO, presupuesto y entidad emisora                 | Añadir filtro estable por cliente en cobros y exportaciones; no agrupar por nombres coincidentes.                                           |
| Facturación y recurrencia             | Streams, periodos, borradores automáticos, aprobación, emisión, PDF y abonos | Mantener el ciclo aprobado: no emitir ni enviar facturas automáticamente por añadir analítica.                                              |
| Cobros y antigüedad                   | Pagos parciales, reversiones, ledger por factura, aging por moneda           | Añadir resumen por cliente/moneda con bruto, créditos separados, neto, vencido, documentos y mayor atraso.                                  |
| Seguimiento de cobro                  | Estado de factura y fechas previstas                                         | Añadir cola con facturas vencidas, fechas previstas pasadas o vencimiento ausente y acceso al detalle.                                      |
| Planificación de entradas             | Calendario de movimientos previstos y reales                                 | Añadir distribución del saldo pendiente a 7/30/60/90 días, posterior, pasado y sin fecha. No sustituir el calendario de pagos y reembolsos. |
| Informes                              | Exportaciones financieras autorizadas CSV/XLSX y paquetes contables          | Añadir tres CSV del mismo alcance que la vista, con fecha de referencia y unidades menores explícitas.                                      |
| Rentabilidad                          | Coste laboral, gastos, WIP, presupuesto y contribución por proyecto          | Conservar estas proyecciones; no duplicar ni redefinir margen como saldo bancario.                                                          |
| Gastos y equipo                       | Justificantes, aprobación, reembolsos, compensación privada                  | Mantener separación entre gasto operativo, coste y pago. Las mejoras no amplían los DTO de Worker/PM.                                       |
| Conciliación bancaria y pagos online  | Cobros registrados; no hay feed bancario nuevo                               | No simular conciliación con movimientos inexistentes. Requiere proveedor, cuentas y reglas de conciliación acordadas.                       |
| Nómina fiscal, impuestos e inventario | Compensación contractual y perfiles fiscales por stream                      | No reemplazar nómina legal ni añadir almacenes a un ERP de servicios sin reglas de negocio concretas.                                       |
| IA, recordatorios y entrega externa   | Jobs y outbox controlados                                                    | La cola sirve para revisar; abrir un enlace no contacta con clientes ni modifica registros.                                                 |

## Funciones implementadas

Acceso: **Cobros / ledger → Planificación de cobros**, para los roles financieros autorizados.
Las tres vistas heredan cliente, proyecto, moneda, búsqueda, estado y antigüedad del registro.
Los botones permiten cambiar de vista y exportar su contenido completo, independientemente
de la página visible. La interfaz presenta diez filas por página y tarjetas en móvil.

1. **Saldos por cliente.** Agrupa por identificador estable y moneda, abarcando los proyectos
   y emisores del alcance filtrado. Es un resumen interno de cartera, no un extracto legal
   del cliente. No compensa ni aplica automáticamente créditos entre documentos o emisores.
   El enlace «Revisar facturas» conserva los filtros y abre las facturas de ese cliente.
2. **Prioridades de cobro.** Identifica saldos deudores vencidos, fechas previstas pasadas
   y vencimientos no registrados. Ordena por moneda y mayor antigüedad, con motivo y enlace
   directo al detalle. No clasifica como deuda cobrable los abonos, anuladas o saldos cero.
3. **Previsión de cobros.** Distribuye exclusivamente saldos deudores restantes. Prefiere la
   fecha prevista de cobro; si no hay fecha válida, usa el vencimiento. Hoy pertenece al
   intervalo 0–7; los intervalos no se solapan. Se muestran por separado importes con fecha
   prevista, basados en vencimiento y sin fecha; lo pasado no se traslada artificialmente a
   un día futuro. No es saldo bancario, previsión estadística ni efectivo garantizado.
4. **Exportación y trazabilidad.** CSV por cliente, prioridades o previsión; mismos cálculos
   compartidos con pantalla. Importes exactos, monedas separadas, neutralización de fórmulas,
   auditoría de descarga y `private, no-store`. Owner/Finance y sesión viva se validan antes
   de obtener los datos. Formatos, filtros duplicados y valores desconocidos se rechazan.
5. **Idioma y navegación.** EN/ES/PT; el filtro de cliente se conserva en enlaces y CSV/XLSX
   del ledger. La búsqueda se limpia al navegar a una URL sin `q`, evitando filtros residuales.

Los informes históricos explícitos conservan el corte temporal existente del ledger y no
usan fechas previstas actuales: estas no tienen un histórico de revisiones recuperable.

## Integración directa con Intuit: requisito externo

No se ha conectado una empresa de QuickBooks ni se han transferido datos. Una integración
real requiere aplicación registrada, Client ID/secret, entorno sandbox/producción y autorización
OAuth de la empresa (`realmId`).
[Contrato oficial de autenticación](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0).

Diseño recomendado si se encarga esa conexión: empezar por exportación unidireccional de
clientes y facturas emitidas; conservar J&A como fuente de horas, compensación y snapshots;
mapear identificadores y monedas de forma explícita; guardar tokens cifrados; usar outbox
idempotente con reintentos y conciliación; nunca importar una actualización remota sobre una
factura emitida. Pagos y abonos necesitan decidir antes qué sistema es autoridad. Las claves
y la autorización de la empresa no se pueden sustituir por una implementación ficticia.

## Ejecución y evidencia

Dependencias: modelo compartido y filtros → vistas/exportaciones/traducciones → pruebas
financieras y navegador → revisión independiente → publicación y despliegue. Implementación
principal; revisión independiente de solo lectura según `AGENTS.md`. No hay migraciones ni
mutaciones financieras nuevas. Evidencia final y comprobación de pendientes históricos en
[recibo de despliegue](PRODUCTION_DEPLOYMENT_2026-09-18_QUICKBOOKS.md).

La comprobación completa de Svelte encontró además dos defectos previos de tipos: el editor
de clientes asumía una lista opcional, y la recarga del informe de periodo iteraba una
selección sin validar su tipo. Se añaden guardas de lista y se conservan únicamente IDs de
informes técnicos de tipo texto. `svelte-check` termina con cero errores y cero avisos.

[Evidencia visual y recorridos por rol](evidence/quickbooks-20260918/README.md).
