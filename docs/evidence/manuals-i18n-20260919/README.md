# Evidencia: manuales, idiomas y UX — 19/09/2026

Los recorridos autenticados usan la aplicación real compilada, Better Auth y una base aislada
con datos sintéticos. No representan sesiones de clientes de producción. Las comprobaciones
públicas y operativas posteriores al despliegue se registran por separado.

- [Resultados de pruebas y alcance de cada pasada](quality-gates.json).
- [Revisión independiente y ajustes finales](review.json).
- [Recibo de navegador, rutas por perfil y reintentos](browser-verification.json).
- [Manifiesto de las 90 capturas de los manuales](../../manuals/validation/current-capture.json).
- [Validación de los 17 PDF y sus hashes](../../manuals/validation/pdf-quality.json).
- [Guías por perfil, enlaces y regeneración](../../manuals/README.md).

Se conservan los logs iniciales con fallos y sus repeticiones correctas. Se corrigieron el
seed de prueba con divisas incompatibles, selectores que confundían menús cerrados y etiquetas
con opciones, y defectos reales: idioma perdido en redirecciones, etiquetas inglesas, controles
de Ayuda demasiado pequeños y campos recortados en el editor de disponibilidad. No se ocultan
fallos mediante omisiones de pruebas. Las exclusiones de viewport corresponden a escenarios
que ejecutan su propia matriz o capturas dentro de una única invocación de escritorio.

Las pruebas generales preceden a los últimos ajustes de etiquetas/CSS; las regresiones focales
y el manifiesto final cierran esos cambios. La suite de integración completa del release de
calendarios anterior queda vinculada como antecedente, no como una nueva ejecución.
