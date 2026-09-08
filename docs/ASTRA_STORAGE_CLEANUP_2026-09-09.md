# Recuperación de almacenamiento — 9 de septiembre de 2026

Limpieza autorizada junto con la revisión de manuales. La versión de producción `5a615d9` permaneció operativa durante la limpieza.

## Resultado medido

| Medida del sistema de archivos raíz | Antes de limpiar cachés |    Al terminar |
| ----------------------------------- | ----------------------: | -------------: |
| Espacio disponible, bytes           |          21.266.984.960 | 35.639.513.088 |
| Espacio disponible, GB decimales    |                   21,27 |          35,64 |
| Ocupación                           |                    87 % |           77 % |

**Ganancia neta observada: 14.372.528.128 bytes, 14,37 GB (13,39 GiB).** El servidor siguió escribiendo durante la medición. No se suman las cifras lógicas de Docker al espacio libre del disco: capas compartidas y reconstrucciones intermedias hacen que no sean equivalentes. La eliminación de backups duplicados ocurrió antes de esta medición y no se añade a la ganancia neta indicada.

## Trabajo realizado

- Docker: limpieza de caché de construcción no utilizada mediante `docker builder prune -a -f`. Primera pasada: 15,06 GB declarados por Docker. El vigilante inició después una reconstrucción de un ZIP supersedido; se canceló antes de activarlo, se retiró el ZIP del directorio vigilado y se limpió la caché generada por ese intento (5,096 GB declarados). Resultado final: **0 B de Build Cache**. `docker image prune -f` no encontró imágenes sin etiqueta que eliminar (0 B).
- pnpm: `pnpm store prune` eliminó metadatos de caché, 66 archivos y tres paquetes no utilizados. La caché de metadatos `/root/.cache/pnpm` pasó de 312 MiB a 8 KiB; se conservaron las dependencias del proyecto.
- Backups: se revisaron 76 manifiestos y se detectaron seis grupos idénticos. Se eliminaron **11 copias redundantes**, 104.215.812 bytes de contenido. Antes de eliminar cada copia se verificaron tamaño y SHA-256 de la base y de todos los documentos tanto en ella como en la copia conservada; se rechazaban enlaces simbólicos, archivos inesperados, archivos ausentes o WAL no vacío. Se conservó la copia más reciente de cada grupo. Ninguna copia del 8 o 9 de septiembre se incluyó en la eliminación.
- Temporales de esta tarea: se eliminaron tres directorios de empaquetado ya utilizados o fallidos y la restauración aislada de ensayo, 820.137.809 bytes de contenido. El ZIP de la versión activa se conserva en `/home/kripta/jaautomation-astra-5a615d961e1d.zip`, con SHA-256 contrastado con el despliegue. La copia temporal restaurada no era la base de producción.
- ZIP supersedido `edf88aa`: movido a `/var/lib/jaautomation/rejected-release-archives/`, fuera del vigilante, para impedir otro intento automático. Los demás ZIP vigilados constan como procesados o rechazados. Vigilante, temporizadores de despliegue, jobs y backups reactivados.

## Conservado

Base SQLite y documentos privados de producción; historial financiero; copias verificadas previas a la migración y al despliegue corregido; imágenes etiquetadas de las versiones actual y anteriores; directorios de releases; navegadores usados para pruebas/manuales; registros de auditoría; archivos personales y otros servicios, incluido Navidrome. No se ejecutó una purga global de imágenes o volúmenes.

La versión antigua de esquema39 necesita su backup compatible para una recuperación: no puede abrir directamente la base actual de esquema41. Conservar su imagen no constituye por sí solo un procedimiento de rollback válido.

## Evidencia y límites

Logs locales: `/tmp/astra-docker-cache-cleanup.log`, `/tmp/astra-docker-cache-cleanup-final.log`, `/tmp/astra-docker-image-cleanup.log`, `/tmp/astra-pnpm-cache-cleanup.log`, `/tmp/astra-backup-deduplication.json`, `/tmp/astra-cleanup-disk-before.txt`, `/tmp/astra-cleanup-disk-after.txt`. Son evidencia operativa temporal; este documento conserva el resultado resumido en Git.

Verificación final: portal y web saludables, jobs en ejecución, ocho imágenes conservadas, cuatro contenedores activos, cero volúmenes Docker administrados y cero caché de construcción. El espacio libre variará con actividad, nuevas copias y construcciones futuras.
