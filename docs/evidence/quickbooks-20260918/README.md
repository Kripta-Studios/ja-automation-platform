# Evidencia de planificación de cobros

Datos sintéticos en base aislada; ninguna factura ni cuenta real modificada para estas pruebas.

- `tests/e2e/erp-collections-evidence.spec.ts`: **20/20**, cinco recorridos por tamaño
  360×800, 390×844, 768×1024 y 1440×900. Roles Finance, Owner, Worker y PM; solicitud
  sin autenticar, tres idiomas y comprobación de accesibilidad Axe en cobros.
- Finance: factura con pago parcial posterior a su emisión, saldo exacto de 75 USD, filtro
  por cliente/proyecto, tres vistas, exportación, enlace al registro, filtros sin resultados,
  controles táctiles y conciliación del CSV.
- Abonos: saldos bruto/neto, abonos separados, exportación histórica sin fechas previstas
  actuales y rechazo de filtros/formatos inválidos.
- Worker/PM: exportaciones financieras denegadas; se mantiene alcance operativo de gastos.
- Owner: exportación autorizada y traducciones de las vistas ES/PT.
- Primera pasada: 18/20; el botón de paginación tenía 62,45 px de ancho en tableta/escritorio.
  Se corrigió el mínimo a 80 px conservando 44 px de alto. La repetición completa pasó 20/20;
  no se relajaron las comprobaciones.

Capturas del recorrido Finance al regresar del resumen de cliente al registro de facturas:

| Tamaño   | Captura                          |
| -------- | -------------------------------- |
| 360×800  | [Finance 360](finance-360.png)   |
| 390×844  | [Finance 390](finance-390.png)   |
| 768×1024 | [Finance 768](finance-768.png)   |
| 1440×900 | [Finance 1440](finance-1440.png) |

La revisión independiente de solo lectura aprobó dinero exacto, moneda, abonos, cortes
históricos, permisos, auditoría, CSV seguro y presentación responsive. La regresión general ejecutó 1.026 casos: 1.025 pasaron y un fallo de inventario de
traducciones se corrigió registrando Paginación/Registros. La repetición dirigida pasó 91/91
y las cinco pruebas de cobros también pasan. Los 14 recorridos adicionales de informes y
cobros pasan tras las guardas de tipos de clientes/informes. El veredicto final independiente
es favorable. Detalle operativo en el [recibo de entrega](../../PRODUCTION_DEPLOYMENT_2026-09-18_QUICKBOOKS.md).

Log local de navegador: `/tmp/ja-qb-browser-final.log`.
