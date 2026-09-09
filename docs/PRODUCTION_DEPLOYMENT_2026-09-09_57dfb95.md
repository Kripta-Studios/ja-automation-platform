# Despliegue y limpieza — 9 de septiembre de 2026

El usuario autorizó expresamente desplegar todos los cambios y limpiar cachés, backups y artefactos antiguos. Producción quedó activada a las **10:25:12 CEST** con el commit `57dfb954c481d9107a18d89e3ee8fe7bad797374`.

## Versión y verificación

- Archivo: `jaautomation-production-57dfb95.zip`.
- SHA-256: `6c4ef65c771cde06118fd007d68e76f57c29808453bd8055e2562dbb3a03c412`.
- Release activo: `/opt/jaautomation/releases/ja-automation-6c4ef65c771cde06118fd007d68e76f57c29808453bd8055e2562dbb3a03c412`.
- Los 1.178 archivos del manifiesto se comprobaron antes y después de activar. Las migraciones coinciden exactamente con el release anterior: esquema41, sin migración nueva.
- Web EN/ES/PT y login: HTTP200. Readiness local: `ok`. SQLite: integridad `ok`, cero violaciones de claves foráneas.
- Site y portal saludables; jobs en ejecución. El verificador de VPS pasó con **dos ciclos automáticos**, sin procesamiento manual de colas.
- Node24.19.0 y Next.js16.3.3 comprobados en runtime. Los PDF Owner/Worker PT-BR del contenedor coinciden por SHA-256 con el release.
- Quarantine del outbox en modo lectura: cero mensajes anteriores al corte pendientes. No se inició un envío manual.
- Revisión independiente final: sin incidencia de despliegue o limpieza pendiente detectada.

## Recuperación conservada

La copia previa se restauró en un directorio aislado: integridad y claves foráneas correctas, 29 archivos recuperados y las 13 referencias de documentos committed contrastadas con tamaño y SHA-256. La copia tomada durante el corte también se restauró correctamente con 29 archivos.

Se conservan estas tres copias bajo `/var/backups/jaautomation/`, con manifiestos, base y archivos verificados antes de retirar las antiguas:

- `2026-09-09T003000454Z-3be26167-223e-440e-8c5a-40d238802749`
- `2026-09-09T082246740Z-110c34c6-00b2-4074-994c-c1f9ce03c23b`
- `2026-09-09T082505429Z-cb783d22-34e1-4cb1-8c58-ec477decc13c`

La versión anterior compatible `5a615d9` permanece en el release `4d46c495b4461cbf1bb4deebf5d0a124d4efdafe8b318674787ced3a84962697`, junto con sus imágenes originales y la etiqueta `rollback-20260909082243-6c4ef65c771c`. El rollback de código no requiere reinterpretar la base actual. Una restauración de datos sigue siendo una operación explícita distinta.

## Limpieza medida

- Caché de construcción Docker: **12,47 GB** declarados recuperados; estado final **0 B**.
- Retiradas 66 copias estructuradas antiguas; quedan tres recientes, aproximadamente315 MiB.
- Retiradas ocho etiquetas de imágenes obsoletas, dos releases incompatibles/obsoletos y sus dos archivos ZIP identificados por SHA-256.
- pnpm: metadatos purgados, 164 archivos y diez paquetes sin uso retirados. La caché de metadatos bajó de479 MiB a12 KiB.
- Eliminados los dos directorios temporales de restauración usados en esta comprobación.
- Permanecen cinco imágenes únicas y cuatro contenedores activos. Navidrome sigue operativo. No se eliminaron volúmenes, la base ni archivos privados de producción.
- Vigilante ZIP pausado durante despliegue/limpieza y reactivado al terminar; temporizadores de jobs y backup activos.

Espacio disponible antes del despliegue: **26.470.686.720 bytes**. Al finalizar: **37.739.548.672 bytes** (37,74 GB), ocupación76 %. Ganancia neta observada: **11.268.861.952 bytes (11,27 GB)**. No se suman las cifras lógicas de Docker a la diferencia del disco; el servidor continúa escribiendo. Los 2,689 GB que Docker considera recuperables incluyen las imágenes de rollback conservadas.

## Evidencia y alcance

Logs locales: `/tmp/ja-production-deploy-57dfb95.log`, `/tmp/ja-production-verify-57dfb95.log`, `/tmp/ja-production-recovery-57dfb95.json`, `/tmp/ja-cutover-restore-57dfb95.json`, `/tmp/ja-production-cleanup-plan-57dfb95.json`, `/tmp/ja-production-scoped-cleanup-57dfb95.log`, `/tmp/ja-production-cache-cleanup-57dfb95.log`, `/tmp/ja-production-pnpm-cleanup-57dfb95.log`.

Estas comprobaciones añaden evidencia operativa real al candidato revisado en la auditoría anterior. No modifican el resultado histórico del recorrido local de32 pasos, ni sustituyen firmas de aceptación humana, validación fiscal o decisiones de privacidad.
