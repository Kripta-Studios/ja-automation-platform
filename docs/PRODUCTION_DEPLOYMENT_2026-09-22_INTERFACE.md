# Renovación visual desplegada — 22 de septiembre de 2026

La web pública y el portal utilizan el nuevo diseño inspirado en `trace-it`: Geist local, fondos neutros cálidos, controles grafito, acentos rojos J&A, navegación más clara, formularios/tablas coherentes y paneles adaptados a móvil, tableta y escritorio.

- Web: https://j-aautomation.com/j-aautomation/en
- Portal y manuales autenticados: https://j-aautomation.com/j-aautomation/app/login
- Código de trabajo: `/home/kripta/ja-automation-platform-vps-hotfix`.
- Producción: `/opt/jaautomation/current`, release `f693b66f52e5e0700ac02a7f9ea1415178fb4626a412c7a5389cc3f9a2601f34`.
- Activación completada: 22/09/2026 00:05:21 Europe/Madrid (21/09 22:05:21 UTC).

Se regeneraron seis manuales principales EN/PT-BR y tres guías rápidas con 104 capturas finales. Los nueve PDF del contenedor coinciden por hash con los archivos verificados. El catálogo y los archivos están en [manuales](manuals/README.md).

Validación: matriz responsive de 30 casos aplicables; 187 pruebas focalizadas; tipos, lint y compilaciones; revisión independiente; capturas y descargas autorizadas. Producción: 592 archivos de ejecución idénticos, SQLite íntegro y cero errores FK, ocho tablas históricas comprobadas y 59 archivos privados conservados. Backup previo verificado y dos ciclos automáticos posteriores sin fallos. Chromium comprueba web EN/PT y login en móvil/escritorio. Un 502 inicial de Caddy se documenta; la ejecución completa posterior pasó sin errores.

Caché Docker: **6,812 GB liberados; 0 B restantes**. Imágenes, volúmenes y posibilidad de volver al release anterior conservados. Timers de jobs/backup y watchers del despliegue activos.

[Informe y evidencias](evidence/design-refresh-20260921/README.md). La suite unitaria general y la aceptación funcional completa de 32 pasos no se repitieron para este cambio visual. La retención histórica de backups mantiene 13 de los 30 días requeridos; las aprobaciones externas anteriores conservan su estado.
