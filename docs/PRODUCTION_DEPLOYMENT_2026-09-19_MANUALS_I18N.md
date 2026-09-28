# Producción: manuales, idiomas y recuperación — 19/09/2026

Código `e43c640611bf3f50297056719e2a5a185ed9783f`, publicado en la rama
`codex/v3-production-completion-orchestrated-20260819` y activado el **19/09/2026 a las
10:07:32 UTC (12:07:32 Madrid)**. Sitio y portal saludables; worker de jobs en ejecución.

El ZIP desplegado tiene SHA-256
`6397282be2e6f29976d6ba9386ffbc380dd11e9367a2324392a13286b9edd9f0`.
Los **1.924 archivos** extraídos coinciden byte a byte con el ZIP, cuyo comentario identifica
el commit. [Identidad del release](evidence/manuals-i18n-20260919/release.json).
Los commits posteriores de recibos no modifican el código de aplicación desplegado.

## Cambios entregados

- **14 manuales por perfil**, en inglés y portugués de Brasil: Worker, Project Manager,
  Finance, Owner, Auditor, coordinador de proveedor y técnico externo. Incluyen **90 capturas
  reales de Chromium** y los calendarios de disponibilidad y proyectos. Se añaden tres guías
  rápidas EN/ES/PT-BR. [Catálogo y enlaces](manuals/README.md).
- Descargas desde Ayuda conforme a la sesión y al perfil persistido. Owner dispone de la
  biblioteca de formación; los demás perfiles reciben sus propias guías. El contenedor
  contiene exactamente los 17 PDF revisados, con hashes idénticos.
- Correcciones de traducción EN/ES/PT-BR en navegación, estados, validación, ayuda y mensajes.
  Los formatos monetarios de lectura respetan el idioma sin cambiar los valores canónicos
  enviados al servidor. Las redirecciones de proveedores conservan el idioma seleccionado.
- Recuperación automática y acotada de descargas ante fallos transitorios de red/servicio.
  Una recuperación correcta no genera un aviso de error. Si persiste el problema, la app
  explica si hay que iniciar sesión, solicitar acceso, volver a intentar o contactar con soporte.
- Errores de gestión más precisos para conflictos de versión, solapamientos, indisponibilidad,
  motivos incompletos y restricciones de documentos financieros. Se conservan los valores
  introducidos. Las escrituras y decisiones de negocio no se repiten automáticamente.
- Formularios de disponibilidad legibles en el panel lateral y controles de Ayuda con un
  objetivo táctil mínimo de 44 px, foco visible y funcionamiento móvil.

[Alcance y criterio de recuperación](MANUALS_AND_I18N_2026-09-19.md).
Se mantienen los [calendarios accionables desplegados anteriormente](PRODUCTION_DEPLOYMENT_2026-09-19_PLANNING_CALENDAR.md).

## Verificación

| Comprobación                                     | Resultado                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Suite unitaria general                           | 1.123/1.123, 162 archivos                                                       |
| Cierre de navegación                             | 88/88 pruebas focalizadas                                                       |
| Integración de pagos, gestión y proveedores      | 34/34                                                                           |
| Tipos, Svelte, ESLint y formato                  | PASS; Svelte sin errores ni advertencias                                        |
| Navegación multilingüe en Chromium               | 105 rutas, siete perfiles, EN/ES/PT-BR                                          |
| Descargas autenticadas                           | 26 accesos permitidos, 12 denegados; sesión caducada verificada                 |
| Capturas de manuales                             | 90 imágenes, 14 pares perfil/idioma, 168 comprobaciones                         |
| PDF revisados                                    | 17/17; texto, fuentes, imágenes y hashes verificados                            |
| Editor de disponibilidad y recuperación en Ayuda | 360/390/768/1440 px; controles, valores y contención verificados                |
| Producción pública en Chromium                   | 3/3; login móvil/escritorio y sitio público                                     |
| PDF del contenedor y acceso público              | 17 hashes coincidentes; dos peticiones sin sesión rechazadas con 401 localizado |
| Operación automática                             | Dos ciclos posteriores al despliegue, sin fallos                                |

La suite general precede a los últimos ajustes de etiquetas/CSS; las regresiones focales y
las capturas finales cubren esos cambios. La integración general de 527 pruebas del release
anterior es un antecedente, no una nueva ejecución. [Resultados y alcance](evidence/manuals-i18n-20260919/quality-gates.json).

Las capturas y las pruebas autenticadas usan la aplicación real compilada, Better Auth y datos
sintéticos aislados. No representan sesiones de clientes de producción. En producción se
verifican identidad, archivos del contenedor, fronteras públicas, datos y operación sin crear
registros ficticios. [Recibo del navegador](evidence/manuals-i18n-20260919/browser-verification.json),
[revisión independiente](evidence/manuals-i18n-20260919/review.json) y
[verificación del runtime](evidence/manuals-i18n-20260919/runtime-verification.json).

La aceptación integral posterior al despliegue pasa **32/32 pasos**, una prueba agregada
estricta en 2,7 minutos, con la [evidencia operativa de este release](evidence/manuals-i18n-20260919/operations-evidence.json).
El [recibo de aceptación](evidence/manuals-i18n-20260919/acceptance-32-steps.json) identifica
el código desplegado y el hash de la prueba final. El primer intento recibió SIGTERM sin causa
confirmada. El siguiente pasó 31/32: una aserción seguía buscando el enum interno de compensación
en lugar de su etiqueta legible. Se corrige únicamente la aserción visible, añadiendo el filtro
del trabajador y conservando la consulta que exige el tipo interno y 5.500 puntos básicos (55 %).
La repetición completa pasa; ambos intentos previos se conservan. Este ajuste de prueba no
modifica el runtime, los PDF ni su digest.

## Datos, backups y recuperación

- Esta entrega no modifica el esquema: **49 → 49**, integridad SQLite `ok` y cero infracciones
  de claves foráneas. Los hashes de las 36 filas comprobadas de facturas, pagos, documentos y
  revisiones/snapshots contables permanecen idénticos a la medición previa.
- Backup anterior y posterior al corte en esquema 49, con **59 documentos**. La copia anterior
  se restaura y verifica en un directorio aislado con el código anterior; la copia posterior
  se verifica con su hash, integridad y documentos. Los temporales de restauración se eliminan.
- Se conservan el release anterior y ambas imágenes de rollback. La recuperación exige emparejar
  código/datos/documentos compatibles y conciliar escrituras posteriores. No se ejecuta un
  rollback sobre producción.
- Caché de construcción Docker eliminada con `docker builder prune -af`: **6,976 GB liberados
  y 0 B restantes**. Imágenes de recuperación y volúmenes conservados; watchers reactivados.

[Conservación de filas](evidence/manuals-i18n-20260919/production-after.json),
[backup posterior](evidence/manuals-i18n-20260919/backup-verification.json),
[restauración aislada](evidence/manuals-i18n-20260919/precutover-restore.json) y
[PDF en producción](evidence/manuals-i18n-20260919/production-manual-artifacts.json).

## Pendientes históricos

P04 sigue parcial: **22 snapshots en 11 días UTC**, sin cobertura diaria de 30 días. Se conservan
los cuatro jobs agotados y los dos PDF históricos bloqueados con sus sustituciones documentadas.
Las aprobaciones fiscal/comercial, legal/privacidad y UAT humana siguen pendientes. La dispensa
offsite conserva su fecha y alcance originales. No se declara `CLIENT READY` ni se conecta
Intuit/QuickBooks. [Estado consolidado](PROJECT_STATUS_2026-09-19.md).
