# Manuales agrupados por función — 19/09/2026

El usuario autoriza sustituir siete referencias individuales por tres familias compartidas,
con capítulos y capturas que identifican cada perfil. Se generan seis PDF principales en
**inglés y portugués de Brasil**, más las tres guías rápidas existentes EN/ES/PT-BR.

| Familia                              | Perfiles                     | Contenido común y diferencias explícitas                                                                                                                                                                        |
| ------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trabajo y proyectos                  | Worker, Project Manager      | Trabajo propio, disponibilidad, proyectos, tiempo, gastos e informes. Planificación y revisión del equipo quedan delimitadas al PM y su proyecto; My Pay siempre es propio.                                     |
| Operaciones de proveedores           | Coordinador, técnico externo | Instalaciones vigentes, horas, gastos, informes y correcciones. Gestión de técnicos y carga colectiva son del coordinador. Horas de proveedor requieren Owner; otros registros conservan su revisor autorizado. |
| Administración, finanzas y auditoría | Owner, Finance, Auditor      | Estados, fuentes, facturas, pagos y evidencias. Operaciones y administración distinguidas de consulta; Auditor no muta registros. Accounting Packs: Owner/Finance; Audit global: Owner/Auditor.                 |

Cada portada incluye «elige tu perfil» y enlaces a capítulos. Las imágenes se intercalan con
el procedimiento y su pie identifica al perfil autenticado. Saber cómo funciona una acción
no concede permiso para ejecutarla ni para ver sus datos. Se conserva el RBAC de negocio,
la separación por proyecto/proveedor y la privacidad de compensación personal.

## Ayuda, compatibilidad y generación

Ayuda lista una familia por perfil; Owner tiene las tres, comenzando por administración.
El Worker interno conserva también la guía rápida. Los siete identificadores anteriores se
resuelven a su familia y pasan la misma comprobación de sesión y perfil persistido que los
identificadores nuevos. No se enumeran referencias duplicadas.

Docker distribuye únicamente nueve PDF. Las ediciones individuales anteriores permanecen
como historial del repositorio, fuera de Ayuda y de la imagen desplegable. Los manifests de
construcción eliminan sus entradas antiguas. Una generación parcial solo conserva un PDF
si coinciden runtime, manifest exacto de captura, fuente Markdown y bytes del PDF.

La dependencia de trabajo es: catálogo/Help y seis fuentes → congelar runtime → capturar los
siete perfiles EN/PT-BR → generar nueve PDF → revisar artefactos y descargas → publicar y
verificar producción. Los paquetes de contenido, portal y revisión se trabajaron en paralelo;
la revisión de autorización, fuentes y renderizado es independiente de sus implementadores.

## Evidencia

- 90 capturas de Chromium, 14 pares perfil/idioma, 168 comprobaciones. Aplicación real compilada
  con sesiones auténticas y datos sintéticos aislados; no son sesiones de clientes de producción.
- Seis referencias de 10–12 páginas; cada una incorpora 8–10 capturas y representa todos sus
  perfiles. Nueve PDF verificados: texto extraíble, fuentes incrustadas, imágenes, hashes,
  enlaces internos y orientación por rol en la primera página.
- 16/16 pruebas focalizadas de catálogo, permisos, sesiones, idioma y recuperación GET; tipos
  del workspace y ESLint correctos. El navegador comprueba familias, aliases, descargas,
  rutas por rol y controles en 360/390/768/1440 px.
- Se corrigieron dos ambigüedades documentales durante la revisión: exclusividad Owner limitada
  a horas de proveedores y distinción entre configuración organizacional y Profile propio del Auditor.

[Catálogo con los PDF](manuals/README.md), [pruebas](evidence/manuals-consolidation-20260919/quality-gates.json)
y [revisión](evidence/manuals-consolidation-20260919/review.json).

Código `1b2eef4`, publicado y desplegado el 19/09/2026 a las 11:07:03 UTC. El contenedor
contiene exactamente los nueve PDF revisados. La identidad y la verificación operativa están
en el [recibo de producción](PRODUCTION_DEPLOYMENT_2026-09-19_MANUAL_CONSOLIDATION.md).
Los pendientes externos y la aceptación humana conservan su estado.
