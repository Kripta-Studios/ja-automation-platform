# Producción — planificación de cobros inspirada en QuickBooks

Desplegado el **18/09/2026 a las 21:00:49 UTC (23:00:49 Madrid)**.

- Código: `d69efe6afde139e02a7e1d4633203f697a632357`, publicado en
  `codex/v3-production-completion-orchestrated-20260819`.
- ZIP generado mediante `git archive` de ese commit, SHA-256:
  `f2d279ae714ee974f7c4d4b02d57a575f191f226ac51cd235237b690f8cd1203`.
- Release activo:
  `/opt/jaautomation/releases/ja-automation-f2d279ae714ee974f7c4d4b02d57a575f191f226ac51cd235237b690f8cd1203`.
- [Análisis de QuickBooks y alcance implementado](QUICKBOOKS_REVIEW_2026-09-18.md).
- [Capturas y evidencia por rol](evidence/quickbooks-20260918/README.md).
- Acceso: [Cobros / ledger](https://j-aautomation.com/j-aautomation/app/ledger), apartado
  «Planificación de cobros»: saldos por cliente, prioridades y previsión, con exportación CSV.

## Validación de la entrega

| Comprobación                                  | Resultado                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| Pruebas focalizadas financieras y calendario  | 28/28                                                                          |
| Regresión general                             | 1.026 casos; 1.025 pasaron, un fallo de inventario de traducción corregido     |
| Repetición dirigida de idiomas y cobros       | 91/91; cinco pruebas adicionales del resumen con las etiquetas corregidas, 5/5 |
| Navegador 360/390/768/1440                    | 20/20 tras corregir el ancho de paginación                                     |
| Recorridos adicionales tras guardas de tipos  | 14/14, informes y cobros en 360/1440                                           |
| Typecheck, ESLint y formato                   | Correctos                                                                      |
| Svelte                                        | Cero errores y cero avisos                                                     |
| Revisión independiente de solo lectura        | Aprobada, incluidas las correcciones finales                                   |
| Construcción Docker de sitio, portal y runner | Correcta                                                                       |

La primera ejecución general concurrente se detuvo por presión de memoria del host y se
repitió secuencialmente. No se presenta esa ejecución interrumpida como evidencia aprobada.
El único fallo de la pasada general completa era la ausencia de `Pagination` y `Records`
en el inventario de traducciones; ambas claves y sus traducciones ES/PT quedaron registradas
y verificadas. No se relajaron pruebas ni se ignoraron fallos de seguridad.

## Estado de producción y conservación

El despliegue existente construyó las imágenes, creó un backup previo, activó los contenedores
y comprobó las dos URLs públicas. El observador automático de ZIP se pausó durante la
publicación explícita, tras dejar terminar el escaneo activo, y se restauró al terminar.
Los timers de despliegue, jobs y backup están activos.

`verify-vps.sh --wait-two-automatic-runs` terminó correctamente. Sitio y portal están
`healthy`; el runner está activo y los dos ciclos observados no registraron fallos nuevos.
La comprobación posterior a la limpieza de caché mantiene sitio y portal saludables.

Verificación de solo lectura a las **21:01:24 UTC**:

| Control                                         | Resultado                                |
| ----------------------------------------------- | ---------------------------------------- |
| Esquema                                         | 48; esta entrega no añade migraciones    |
| Integridad SQLite                               | `ok`                                     |
| Errores de claves foráneas                      | 0                                        |
| Snapshots de factura frente a referencia previa | 14/14 idénticos, incluidos valores nulos |
| Documentos registrados                          | 14/14 registros conservados íntegramente |
| Pagos                                           | 6/6 registros conservados íntegramente   |
| Revisión de paquete contable                    | 1/1 registro conservado                  |
| Snapshot canónico de paquete contable           | 1/1 registro conservado                  |

Las comprobaciones autenticadas de interfaz utilizaron datos sintéticos aislados. En producción
se comprobaron salud, jobs, integridad, artefactos y conservación; no se crearon transacciones
financieras ni se enviaron correos de prueba.

## Backup y recuperación

Backup previo:
`/var/backups/jaautomation/2026-09-18T210038599Z-3f06b86f-866e-4dce-b286-5303df9931f7`.

- Base SHA-256: `03e558e996d7f19e8550f0ccf7266b8d2a2c7398a837d00aba88d9a8b809560e`.
- Verificación posterior: integridad `ok`, cero errores FK y **50 documentos** del manifiesto
  comprobados, incluidas las referencias de artefactos almacenados.
- Se conserva el release anterior `ja-automation-270f6e1191304d0671a232c1dd9bd86b6ed31b83d5e1df296d8b6730c2fd688c`
  y sus imágenes. No se ejecutó una restauración; cualquier recuperación de base debe coordinar
  las escrituras posteriores al backup.

## Caché Docker

Después de validar la versión saludable se ejecutó `docker builder prune -af`:
**6,802 GB liberados; caché de construcción final 0 B**. Se conservaron volúmenes, backups,
imágenes de recuperación y servicios ajenos.

## Pendientes históricos comprobados

Estos estados existían antes del cambio y mantienen los mismos totales después:

- **Cuatro jobs en `dead_letter`**: tres de PDF localizado y uno de informe de cierre de
  periodo, con `HANDLER_FAILED`.
- **Cinco PDF en `failed`**: tres con `DURABLE_JOB_DEAD_LETTER` y dos revisiones de informe
  con `LEGACY_ARTIFACT_UNVERIFIABLE` e integridad bloqueada. No se han reescrito ni declarado
  válidos documentos cuya integridad histórica no está acreditada.
- **Retención aún incompleta**: 12 snapshots en 10 días distintos; no acredita 30 días de
  cobertura. La integridad indicada corresponde al último backup, no a todos los históricos.
- La conexión directa a una empresa de QuickBooks requiere credenciales y consentimiento
  OAuth de Intuit. Esta entrega incorpora funciones nativas de análisis, sin sincronización externa.

Este recibo se publica en un commit posterior de documentación; el código desplegado sigue
siendo `d69efe6afde139e02a7e1d4633203f697a632357`.

Logs locales: `/tmp/ja-qb-deploy.log`, `/tmp/ja-qb-production-runtime.log`,
`/tmp/ja-qb-production-after.log`, `/tmp/ja-qb-backup-after.log`,
`/tmp/ja-qb-docker-cache.log`, `/tmp/ja-qb-unit-serial.log`,
`/tmp/ja-qb-locale-final.log`, `/tmp/ja-qb-browser-final.log` y
`/tmp/ja-qb-browser-typefix.log`.
