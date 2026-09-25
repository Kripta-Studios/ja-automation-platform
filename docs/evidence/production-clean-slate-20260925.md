# Limpieza de datos de producción — 25 de septiembre de 2026

## Alcance autorizado

Se conservó el cliente IMPC (`client-020-impc`, C-0020) y sus dos proyectos: BBS Mexico (`project-cp020-bbs-mexico`, CP020) y el proyecto `project-cp020-dfw` (CP020-DFW, denominado “Junkers OHIO” en la base actual). Se retiraron los otros tres clientes y cinco proyectos de pruebas, junto con sus datos operativos y financieros. Se conservaron las cuentas, la configuración global y los perfiles de proveedor vinculados a cuentas de prueba para que los roles sigan operativos. Las concesiones de acceso a proyectos eliminados sí se retiraron.

## Procedimiento y respaldo

- Release de aplicación: ZIP SHA-256 `7e09e7d3885256d3564daacedccc22cd93b9d3534ba2e5d3a55e49921976e1d2`; migración de base 65.
- Ensayo preliminar sobre una copia SQLite consistente y otra copia para probar la creación de proyecto. El primer ensayo aplicó la limpieza y la repetición devolvió `already_applied` con los mismos manifiestos.
- Se detuvieron portal, jobs y temporizadores de backup/escritura; se creó una copia en frío de SQLite y archivos. La copia original y el archivo de resultados permanecen en `/home/kripta/ja-clean-slate-cutover-20260925T134051Z/` (modo privado). SHA-256 de la base original en frío: `f3464b572baa8f24b6b1b89f2c6e8af877bd1a859300c61db370233a2717bd8f`.
- El ensayo sobre la copia en frío pasó, incluidos `integrity_check`, `foreign_key_check`, equivalencia de los 430 disparadores, hashes de archivos, manifiestos y conteos. Se promovió la base limpia junto con los archivos retenidos y se reanudaron servicios y watcher ZIP. Log privado: `/var/tmp/ja-clean-slate-cutover-execution.log`.

| Tabla / dato | Antes | Después |
| --- | ---: | ---: |
| Clientes | 4 | 1 |
| Proyectos | 7 | 2 |
| Tiempos | 26 | 0 |
| Gastos | 7 | 0 |
| Facturas | 3 | 0 |
| Reportes diarios | 3 | 0 |
| Documentos | 7 | 0 |
| Usuarios | 123 | 123 |
| Cuentas | 121 | 121 |
| Perfiles de proveedor | 4 | 4 |
| Archivos asociados retirados | 46 | 0 restantes |

## Comprobación funcional

- SQLite en producción: `integrity_check=ok`, `foreign_key_check` sin filas, exactamente los dos ID de proyecto previstos; tiempos, gastos, facturas, reportes técnicos/diarios y documentos a cero.
- En una **copia separada** de la base limpia, `createProject` con el ID heredado `client-020-impc` creó un proyecto UUIDv7 con número `C-0020-P-001`. La prueba no dejó ningún proyecto ficticio en producción.
- Portal y sitio públicos respondieron HTTP 200; los contenedores portal y sitio quedaron `healthy`; jobs y temporizadores activos; caché de compilación Docker: 0 B.
- Navegador real: Finance Administrator inició sesión y vio los dos proyectos retenidos y ningún proyecto QA; Project Manager y Worker 1 iniciaron sesión y no vieron proyectos sin asignación. El panel financiero cargó con importes y horas a cero.

Esta operación limpia datos de pruebas de proyectos y su actividad. Conserva un proveedor de prueba y sus perfiles como datos globales de identidad para mantener el acceso de las cuentas Supplier/Technician; no tiene concesiones a los proyectos eliminados.
