# Evidencia: consolidación de manuales — 19/09/2026

La aplicación y los permisos de negocio conservan su alcance. La autorización documental
agrupa las siete personas en tres familias. Las sesiones de navegador utilizan Better Auth
y datos sintéticos aislados; las comprobaciones públicas/operativas de producción se registran
por separado después de desplegar.

- [Pruebas focalizadas, tipos, Svelte, ESLint y generación](quality-gates.json).
- [Navegador: cuatro anchos, siete perfiles y enlaces antiguos](browser-verification.json).
- [Matriz de 60 accesos permitidos y 48 denegados](browser-matrix-checks.json).
- [Revisión independiente de código, permisos, fuentes y PDF](review.json).
- [Manifiesto de las 90 capturas actuales](../../manuals/validation/current-capture.json).
- [Calidad y hashes de los nueve PDF](../../manuals/validation/pdf-quality.json).
- [Catálogo de las tres familias EN/PT-BR y guías rápidas](../../manuals/README.md).
- [Decisiones de agrupación y límites](../../MANUAL_CONSOLIDATION_2026-09-19.md).

Las referencias utilizan las capturas pertinentes del manifiesto, no todas las imágenes en
cada libro. Las portadas incluyen rutas por perfil y destinos internos verificados; los pies
de cada figura identifican la persona autenticada de la captura. Se conservan representaciones
visuales del PDF para revisión junto con los logs reales de generación y navegador.

Los logs de texto publicados normalizan únicamente espacios finales y líneas vacías al final.
Los recibos registran hashes de los bytes capturados y publicados cuando difieren. Las omisiones
de viewport declaradas en Playwright corresponden a matrices ejecutadas dentro de un solo test
de escritorio o al recorrido específico de Owner a 390 px.
