# Evidencia: consolidación de manuales — 19/09/2026

La aplicación y los permisos de negocio conservan su alcance. La autorización documental
agrupa las siete personas en tres familias. Las sesiones de navegador utilizan Better Auth
y datos sintéticos aislados; las comprobaciones públicas/operativas de producción se registran
por separado. Código `1b2eef4`, activo desde el 19/09/2026 a las 11:07:03 UTC.

- [Pruebas focalizadas, tipos, Svelte, ESLint y generación](quality-gates.json).
- [Navegador: cuatro anchos, siete perfiles y enlaces antiguos](browser-verification.json).
- [Matriz de 60 accesos permitidos y 48 denegados](browser-matrix-checks.json).
- [Revisión independiente de código, permisos, fuentes y PDF](review.json).
- [Manifiesto de las 90 capturas actuales](../../manuals/validation/current-capture.json).
- [Calidad y hashes de los nueve PDF](../../manuals/validation/pdf-quality.json).
- [Catálogo de las tres familias EN/PT-BR y guías rápidas](../../manuals/README.md).
- [Decisiones de agrupación y límites](../../MANUAL_CONSOLIDATION_2026-09-19.md).
- [Recibo de producción](../../PRODUCTION_DEPLOYMENT_2026-09-19_MANUAL_CONSOLIDATION.md).
- [Identidad del release](release.json) y [runtime, jobs y caché](runtime-verification.json).
- [Nueve PDF instalados y fronteras públicas](production-manual-artifacts.json).
- [Chromium en producción](production-browser.json) y [datos conservados](production-after.json).
- [Backup posterior](backup-verification.json) y [restauración aislada](precutover-restore.json).
- [Contrato operativo propio de este release](operations-evidence.json).
- [Aceptación estricta posterior: 32/32 pasos](acceptance-32-steps.json).
- [Revisión independiente de recibos y verificación final](production-review.json).

Las referencias utilizan las capturas pertinentes del manifiesto, no todas las imágenes en
cada libro. Las portadas incluyen rutas por perfil y destinos internos verificados; los pies
de cada figura identifican la persona autenticada de la captura. Se conservan representaciones
visuales del PDF para revisión junto con los logs reales de generación y navegador.

Los logs de texto publicados normalizan únicamente espacios finales y líneas vacías al final.
Los recibos registran hashes de los bytes capturados y publicados cuando difieren. Las omisiones
de viewport declaradas en Playwright corresponden a matrices ejecutadas dentro de un solo test
de escritorio o al recorrido específico de Owner a 390 px.
