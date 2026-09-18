# Evidencia visual — revisión ERP 2026-09-18

Capturas del candidato compilado con datos sintéticos aislados; no son cuentas ni registros
de producción. Se comprueban exportaciones reales, filtros, permisos, accesibilidad con axe,
objetivos táctiles y navegación por teclado. El resultado global y el recibo de producción
se documentan en la [revisión funcional](../../ERP_REVIEW_2026-09-18.md).

- [Cobros a 360 px](collections-360.png): saldo parcial, antigüedad y filtros compartidos.
- [Gastos a 390 px](expenses-390.png): justificante obligatorio pendiente y datos propios.
- [Alcance único a 768 px](ledger-filters-768.png): ordenación/paginación sin filtros duplicados.
- [Cobros a 1440 px](collections-1440.png): columnas de conciliación en región desplazable.

Las capturas proceden de los escenarios `erp-collections-evidence` y `ledger-filter-coherence`.
Los filtros guardados de la capa retirada se inyectan expresamente en la prueba y no alteran
el alcance de la pantalla ni del CSV.
