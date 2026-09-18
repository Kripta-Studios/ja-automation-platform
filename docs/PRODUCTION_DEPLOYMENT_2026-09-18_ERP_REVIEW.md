# Producción — revisión ERP, informes y UX por rol

Actualización desplegada el **18/09/2026 a las 19:32:45 UTC (21:32:45 Madrid)**.

- Código: `2bb50b20b85390682727844f1e2d4ab1577a404d`, publicado en
  `codex/v3-production-completion-orchestrated-20260819`.
- Archivo construido desde ese commit, SHA-256:
  `270f6e1191304d0671a232c1dd9bd86b6ed31b83d5e1df296d8b6730c2fd688c`.
- Release activo: `/opt/jaautomation/releases/ja-automation-270f6e1191304d0671a232c1dd9bd86b6ed31b83d5e1df296d8b6730c2fd688c`.
- [Análisis funcional, comparación open source, campos por rol y pruebas](ERP_REVIEW_2026-09-18.md).
- [Evidencia visual con datos sintéticos](evidence/erp-review-20260918/README.md).

## Verificación y conservación de datos

La construcción Docker de sitio, portal y runner terminó correctamente. El despliegue existente
creó el backup previo, activó los contenedores y comprobó ambas URLs públicas. El verificador
`verify-vps.sh --wait-two-automatic-runs` terminó con éxito; los dos ciclos observados no tuvieron
fallos nuevos. Sitio y portal están `healthy`, jobs está en ejecución y los timers de jobs,
backup y despliegue automático están activos. El observador de ZIP se pausó únicamente durante
la publicación explícita y se restauró al terminar.

Comprobación de solo lectura a las 19:34:56 UTC:

| Control                                                   | Resultado                                           |
| --------------------------------------------------------- | --------------------------------------------------- |
| Esquema                                                   | 48                                                  |
| Integridad SQLite                                         | `ok`                                                |
| Errores de claves foráneas                                | 0                                                   |
| Snapshots de facturas emitidas contra referencia anterior | 9/9 idénticos                                       |
| Registros de factura contra backup inmediato              | 14/14 snapshots idénticos, incluidos valores nulos  |
| Documentos registrados / pagos                            | 14 / 6 filas preexistentes conservadas íntegramente |
| Revisión contable / snapshot canónico                     | 1 / 1 filas preexistentes conservadas íntegramente  |

El primer verificador temporal comparaba el hash de bytes crudos con una referencia creada
con `JSON.stringify(snapshot_json)`. Se corrigió exclusivamente esa serialización de comprobación;
los nueve hashes coinciden. Una comparación independiente del contenido exacto contra el backup
inmediato confirma los 14 registros. No se repararon ni reescribieron facturas de producción.

## Backup y recuperación

Backup previo: `/var/backups/jaautomation/2026-09-18T193225856Z-071f17d7-4226-4660-bda0-937dabc1d896`.

- Base SHA-256: `cfe2bcfbab7ad24faef5c479d0341257935bf1650110bf2b0e61a676427e7d16`.
- Verificación a las 19:34:39 UTC: integridad `ok`, cero errores FK y 50 documentos del manifiesto comprobados.
- Se conservan el release anterior y sus imágenes para recuperación. La migración 47→48 había
  pasado previamente sobre una copia aislada de producción, conservando 251.006 filas.
- Una recuperación de base debe coordinarse con las escrituras posteriores al backup; no se
  ejecutó una restauración ni se presupone que volver de imagen revierta el esquema.

## Caché y cierre

Se ejecutó únicamente `docker builder prune -af` después de activar la versión saludable:
**6,917 GB liberados; caché de construcción final 0 B**. No se eliminaron volúmenes, backups,
imágenes de recuperación ni contenedores de otros servicios.

Este recibo y el estado final del análisis/checklist se publican en un commit posterior de
documentación. No modifican el código desplegado identificado arriba.

## Límites operativos preexistentes

- Cuatro jobs en `dead_letter` y cinco variantes PDF en `failed` ya estaban presentes antes del
  despliegue; no son fallos nuevos ni se han reintentado envíos/documentos indiscriminadamente.
- El inventario local reúne 11 snapshots en 10 días distintos: todavía no acredita 30 días de
  cobertura. La integridad indicada corresponde al último backup, no a todos los históricos.
- Los recorridos autenticados de navegador se verificaron con datos sintéticos aislados. En
  producción se verificaron salud, servicios, jobs, esquema y conservación de datos sin generar
  operaciones financieras ni enviar correos de prueba.

Logs locales de la entrega: `/tmp/ja-erp-deploy.log`,
`/tmp/ja-erp-production-after-runtime.log`, `/tmp/ja-erp-production-after.log`,
`/tmp/ja-erp-backup-after.log` y `/tmp/ja-erp-docker-cache.log`.
