# Recuperación histórica y aceptación — 19/09/2026

El usuario autorizó resolver los cuatro jobs históricos y cinco variantes PDF fallidas y repetir
los 32 pasos de aceptación. La fecha del documento corresponde a Madrid; los registros usan UTC.
Esta campaña no sustituye las aprobaciones fiscales, legales o humanas pendientes.

## Correcciones verificadas del candidato

- El refresco y encolado de informes de periodo son una sola transacción autorizada. La identidad
  del renderizado incluye versiones, selección de contenido e idioma; las solicitudes repetidas
  reutilizan trabajos existentes y devuelven su estado real. Un job agotado se conserva y el nuevo
  intento queda enlazado y auditado. Se mantienen sesiones, permisos e inmutabilidad de informes finales.
- Los errores del renderizador PDF persisten códigos controlados. Una colisión con un archivo previo
  ya no introduce una ruta en `failureClass` que impida registrar el fallo. El archivo original no se
  sobrescribe y las protecciones de ejecución y pérdida de lease se conservan.
- El verificador de aceptación conserva la fecha original de la dispensa offsite del Owner. Esa decisión
  no caduca como una medición operativa: el sobre, cada ciclo de jobs, backup, rollback y restauración
  remota cuando aplica sí deben tener evidencia reciente. No se inventa una nueva aprobación.

Validación focalizada: 37/37 pruebas de PDF, repositorio y seguridad; 37/37 de evidencia operativa;
19/19 del refresco/encolado y acciones; 3/3 regresiones seleccionadas de conformidad firmada.
Typecheck del workspace, ESLint de los archivos afectados y Svelte (cero errores/avisos) correctos.
Revisión independiente de integración, finanzas, seguridad y cumplimiento: PASS para el candidato.

## Recuperación y conservación

Antes de modificar producción se creó un backup y se restauró a un directorio aislado: base íntegra,
cero infracciones FK y 50 archivos privados recuperados. El ensayo confirmó tres reintentos canónicos
y, por separado, el refresco del periodo mensual y dos sustituciones de informes semanales antiguos.

A las **22:35 UTC del 18/09 / 00:35 Madrid del 19/09**, el worker automático completó los tres
reintentos canónicos de producción: Daily Report ES/EN y factura EN. Los tres quedaron `ready`,
con archivos PDF de longitud y SHA-256 verificados. Se mantuvieron los snapshots originales,
las decisiones y los intentos anteriores, los cuatro jobs fallidos y los registros financieros.
Se utilizó la autoridad vigente del Owner solicitante original mediante comandos de dominio;
no se leyeron tokens ni se crearon sesiones, y no se enviaron correos.

Los otros dos PDF corresponden a informes semanales antiguos en revisión. El de cliente requiere
un snapshot con las protecciones actuales de privacidad; el interno ya tiene un archivo histórico
que no debe sobrescribirse. Su recuperación se completó a las 01:58 UTC del 19/09 mediante versiones actuales y PDF nuevos,
manteniendo los originales bloqueados y un vínculo auditado de sustitución. Los dos PDF están
`ready` y sus jobs `succeeded`; el lector independiente confirma 2/3 páginas y hashes correctos.
El mensual quedó en versión 3 y el semanal en versión 2, ambos en revisión. El nuevo job mensual
enlaza expresamente el original agotado. Los cuatro jobs originales permanecen como histórico.

## Producción, conservación y continuidad

Código `5db9bfce2ee49afa813f99662e8c9a4774767a31` desplegado el 18/09 a las 22:59:13 UTC
(19/09 00:59 Madrid). ZIP SHA-256:
`d2f871167bc809ec5960c3205ff5284c4e49001c2d8ca68180c275ae5c403d49`.
La corrección posterior del filtro de facturas está desplegada como
`3893245d52c9afdf1653f88032737649cf8af27b` desde el 19/09 a las **06:56:23 UTC / 08:56 Madrid**.
ZIP SHA-256: `e5d9583d2f8a2b7de3266d3841f54264927f3ec32e6b236c71415dcf351ac6bd`.
El recibo [versionado](evidence/recovery-20260919/release.json) identifica este release activo.
Un intento anterior quedó interrumpido antes de la activación; el servicio anterior permaneció
activo y el despliegue se retomó tras el reinicio del servidor.

La [comparación final](evidence/recovery-20260919/production-recovery.json) verifica los 50 archivos
originales byte a byte, todos los intentos antiguos, los cuatro jobs agotados y las dos filas en
cuarentena. Permanecen idénticas las 14 facturas, 6 pagos, 14 documentos, una revisión contable y
su snapshot canónico. Esquema 48, integridad `ok`, cero infracciones FK; sin migración.

El [backup posterior](evidence/recovery-20260919/backup-verification.json) contiene 59 archivos.
La [restauración aislada](evidence/recovery-20260919/isolated-restore.json) recuperó la base y los
59 archivos con hashes verificados e integridad/FK correctos. Son 18 snapshots en 11 días UTC:
la cobertura requerida de 30 días sigue pendiente; no se recrean días perdidos.

Regresión general completada en `5db9bfc`: **155 archivos, 1.050/1.050 pruebas**. La caché de construcción Docker
se limpió tras verificar la salud del despliegue: 7,135 GB recuperados. Las imágenes de rollback y
los volúmenes se conservan.

## Aceptación de 32 pasos

**32/32 PASS en `3893245`**, ejecutados tras activar el release actual: recorrido serial de 2,3 minutos
(3 minutos incluida preparación), sin omisiones ni fallos. [Resultados por paso](evidence/recovery-20260919/acceptance-32-steps.json)
y [operaciones vinculadas](evidence/recovery-20260919/operations-evidence.json). Incluye 360/390/768/1440,
los distintos roles y los pasos 30–32 respaldados por dos ciclos automáticos, backup/rollback y Caddy.
P01 queda cerrado técnicamente para este candidato; P03 queda cerrado para las incidencias identificadas.

Los intentos previos fallidos se conservan en [diagnóstico](evidence/recovery-20260919/acceptance-diagnostics.json).
Se actualizaron selectores/datos de prueba y se reforzó el vínculo causal entre cierre, firma y factura.
La prueba detectó además un defecto real: el listado no incluía `project_id`, por lo que el filtro
por proyecto ocultaba todas las facturas. `3893245` corrige la consulta y el tipo; 8/8 pruebas focalizadas,
typecheck database, ESLint y revisión independiente aprobados. Se mantuvo el filtro estricto del test.

La aceptación verifica el mismo proyecto, periodo, regla, factura y fuente: emisión rechazada antes
del cierre y con informe aprobado pero sin firma; tras registrar la copia sintética firmada, permite
emitir la misma factura y conserva el hash de conformidad. El worker real del fixture genera los PDF
en la base desechable; la ejecución automática productiva se acredita por separado. Las firmas y
facturas sintéticas nunca se escriben en producción y no equivalen a una aceptación humana.

Los jobs originales y los dos PDF antiguos seguirán visibles como historial aunque sus reemplazos
funcionen. No se borran ni se renombran como éxitos para llevar los contadores a cero.

Revisión final independiente Sol-high: **PASS técnico** de esta campaña y del vínculo entre
commit, prueba y operaciones. Veredicto integral Client Essential: **NOT READY**, por los
pendientes externos y la cobertura histórica de backup aún incompleta del [registro actual](PROJECT_STATUS_2026-09-19.md).
