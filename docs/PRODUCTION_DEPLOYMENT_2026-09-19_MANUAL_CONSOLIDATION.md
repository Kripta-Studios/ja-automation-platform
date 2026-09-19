# Producción: tres manuales compartidos — 19/09/2026

Código `1b2eef40247371e0fd88a11a946cfd92a217a471`, publicado en la rama
`codex/v3-production-completion-orchestrated-20260819` y activado el **19/09/2026 a las
11:07:03 UTC (13:07:03 Madrid)**. Sitio y portal saludables; proceso de jobs en ejecución.

El ZIP desplegado tiene SHA-256
`4dde0163be758b969f08740e4a64a00ca6690d6e69c0348783931f6a78e92e17`.
Los **1.976 archivos** extraídos coinciden byte a byte con el ZIP, cuyo comentario identifica
el commit. [Identidad del release](evidence/manuals-consolidation-20260919/release.json).
Los commits posteriores de recibos no modifican el código de aplicación desplegado.

## Manuales y permisos

Las siete referencias individuales se sustituyen en Ayuda por tres familias, cada una en
**inglés y portugués de Brasil**:

| Manual                               | Perfiles                      |
| ------------------------------------ | ----------------------------- |
| Trabajo y proyectos                  | Worker y Project Manager      |
| Operaciones de proveedores           | Coordinador y técnico externo |
| Administración, finanzas y auditoría | Owner, Finance y Auditor      |

Las portadas orientan a cada perfil y enlazan a los capítulos. Cada procedimiento indica quién
puede consultar, crear, aprobar o modificar; cada imagen identifica el perfil autenticado.
Los seis PDF principales tienen 10–12 páginas y 8–10 capturas por PDF, elegidas entre las
90 imágenes del manifiesto actual. Se conservan las tres guías rápidas EN/ES/PT-BR para Worker:
**nueve PDF activos**, todos accesibles desde [Ayuda](https://j-aautomation.com/j-aautomation/app/help).
[Catálogo con enlaces](manuals/README.md).

Owner dispone de la biblioteca de formación; los otros perfiles reciben su familia.
Los siete enlaces antiguos resuelven al manual compartido y pasan la misma autorización
de sesión y perfil persistido. Los PDF individuales anteriores quedan como historial del
repositorio, fuera de Ayuda y del contenedor de producción.

Compartir instrucciones no amplía los permisos de negocio ni permite consultar datos ajenos.
Se mantienen los límites de proyecto/proveedor y My Pay propio. Las horas de proveedores
requieren revisión de Owner; gastos e informes conservan su revisor autorizado. Auditor no
modifica registros de negocio; sus controles propios de Profile siguen disponibles.
Accounting Packs permanece restringido a Owner/Finance y Audit global a Owner/Auditor.
[Decisiones y límites](MANUAL_CONSOLIDATION_2026-09-19.md).

## Verificación

| Comprobación                                                        | Resultado                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Catálogo, aliases, sesión, perfil persistido, idioma y recuperación | 16/16 pruebas focalizadas, 4 archivos                                                 |
| Ayuda y descargas en Chromium                                       | 19 casos correctos; 9 omisiones previstas por proyecto; 0 fallos                      |
| Matriz de perfiles/idiomas                                          | 7 perfiles EN/PT-BR; 60 descargas autorizadas y 48 denegadas entre familias           |
| Tamaños de pantalla                                                 | 360, 390, 768 y 1440 px                                                               |
| Captura de la aplicación                                            | 90 imágenes, 14 pares perfil/idioma, 168 comprobaciones                               |
| PDF                                                                 | 9/9; hashes, texto, fuentes, imágenes, enlaces internos y límites de página correctos |
| Tipos, Svelte, ESLint y formato                                     | PASS; 10 paquetes; Svelte sin errores ni advertencias                                 |
| Producción pública en Chromium                                      | 3/3; login móvil/escritorio y sitio público                                           |
| Artefactos del contenedor                                           | Exactamente 9 PDF; hashes idénticos; ningún PDF histórico adicional                   |
| Descargas públicas sin sesión                                       | 8/8 rechazadas con 401 localizado y `no-store`                                        |
| Operación automática                                                | Dos ciclos posteriores al corte, sin fallos                                           |

Las capturas y las pruebas autenticadas utilizan la aplicación real compilada, Better Auth y
datos sintéticos aislados. No representan sesiones de clientes de producción. En producción
se comprueban identidad, artefactos, fronteras públicas, datos y operación sin crear registros
ficticios. Las suites generales anteriores conservan su atribución histórica y no se presentan
como repetidas en esta consolidación. La repetición desktop para retener el adjunto de la matriz
se registra separadamente y no suma otro caso único al total de 19.

[Pruebas y alcance](evidence/manuals-consolidation-20260919/quality-gates.json),
[navegador](evidence/manuals-consolidation-20260919/browser-verification.json),
[revisión independiente](evidence/manuals-consolidation-20260919/review.json) y
[runtime](evidence/manuals-consolidation-20260919/runtime-verification.json).

La aceptación estricta posterior al despliegue pasa **32/32 pasos** en una ejecución agregada
desktop de 2,9 minutos, sin fallos, reintentos ni cambios de prueba. Usa el contrato operativo
nuevo de este release, vinculado a tenant `jaautomation`, despliegue `production-vps` y la
frontera pública Caddy. El [recibo de aceptación](evidence/manuals-consolidation-20260919/acceptance-32-steps.json)
conserva el hash de la prueba, del contrato y del reporte; los pasos autenticados usan la
aplicación real y el fixture sintético aislado, mientras los pasos operativos verifican producción.

## Datos, copias y recuperación

- Esquema **49 → 49**, integridad SQLite `ok` y cero infracciones FK. Los hashes de las
  36 filas comprobadas de facturas, pagos, documentos y revisiones/snapshots contables no cambian.
- Backup anterior y posterior al corte en esquema 49, con **59 documentos** en ambos.
  La copia anterior se restaura en un directorio aislado usando el código anterior; todos los
  documentos e integridad se verifican. Los temporales se eliminan al finalizar.
- Release anterior e imágenes de recuperación conservados. Un rollback real exige emparejar
  código, datos y documentos y conciliar escrituras posteriores; no se ejecutó sobre producción.
- `docker builder prune -af`: **6,961 GB liberados y 0 B de caché restantes**. Imágenes y
  volúmenes conservados; watchers de despliegue activos y servicio de backup completado.

[Filas conservadas](evidence/manuals-consolidation-20260919/production-after.json),
[backup posterior](evidence/manuals-consolidation-20260919/backup-verification.json),
[restauración aislada](evidence/manuals-consolidation-20260919/precutover-restore.json) y
[contrato operativo](evidence/manuals-consolidation-20260919/operations-evidence.json).

## Pendientes históricos

P04 sigue parcial: **24 snapshots en 11 días UTC**, sin cobertura diaria de 30 días. Se conservan
cuatro jobs agotados y dos PDF históricos bloqueados con sus sustituciones documentadas.
Las aprobaciones fiscal/comercial, legal/privacidad y UAT humana siguen pendientes. La dispensa
offsite conserva su fecha y alcance originales. No se declara `CLIENT READY`.
Se mantienen los calendarios accionables, disponibilidad editable, traducciones y recuperación
de errores de las entregas anteriores. [Estado consolidado](PROJECT_STATUS_2026-09-19.md).
