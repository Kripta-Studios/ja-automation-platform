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
que no debe sobrescribirse. Su recuperación será mediante versiones actuales y PDF nuevos,
manteniendo los originales bloqueados y un vínculo auditado de sustitución.

## Cierre pendiente de esta campaña

Al registrar este candidato, la regresión general y el recorrido de 32 pasos siguen pendientes de
terminar. También quedan su despliegue y las sustituciones de los dos PDF antiguos en producción.
Las pruebas sobre copias aisladas no se presentan como reparaciones productivas. El recibo final
debe identificar SHA desplegado, resultados por paso, jobs de recuperación, hashes y conservación.

Los jobs originales y los dos PDF antiguos seguirán visibles como historial aunque sus reemplazos
funcionen. No se borran ni se renombran como éxitos para llevar los contadores a cero.
