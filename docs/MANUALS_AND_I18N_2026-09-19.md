# Manuales por perfil, idiomas y recuperación de errores — 19/09/2026

Entrega publicada en Git y desplegada como `e43c640` el 19/09/2026 a las 10:07:32 UTC,
posterior al release de calendarios `7b36959`. El [recibo de producción](PRODUCTION_DEPLOYMENT_2026-09-19_MANUALS_I18N.md)
vincula el código, los PDF, la operación, los backups y la limpieza de caché.

## Alcance confirmado

El usuario solicita documentación PDF en inglés y **portugués de Brasil**, ilustrada con
capturas reales del navegador, y una revisión de los idiomas de la aplicación. También pide
resolver automáticamente los fallos recuperables y explicar con precisión los que requieren
intervención humana.

La documentación separa siete perfiles: trabajador, gestor de proyectos, administración
financiera, administrador propietario, auditor de solo lectura, coordinador de proveedor y
técnico externo. Cada uno tiene su referencia EN/PT-BR. El administrador propietario puede
consultar todas las guías como biblioteca de formación; los demás reciben las de su perfil.
La selección de un perfil de proveedor se comprueba en el servidor tanto al listar como al
descargar, junto con la vigencia de la sesión.

## Dependencias y revisión

La entrega sigue esta secuencia: traducciones, validación y formatos de lectura → cierre del
runtime → captura autenticada de siete perfiles en EN/PT-BR → generación de catorce referencias
y tres guías rápidas → comprobación de PDF, autorización y recuperación → publicación y
verificación de producción. Una revisión independiente comprueba permisos, conservación de
valores y dinero exacto. Ningún cambio de visualización modifica importes canónicos de entrada,
permisos de negocio, base de datos ni documentos financieros emitidos.

El formato de lectura respeta EN/ES/PT-BR en inicio, remuneración, caja, cobros y configuración
financiera. Los valores enviados al servidor conservan su representación decimal canónica.
La guía de planificación distingue la publicación permitida a Owner y PM en su ámbito de la
edición de turnos publicados, reservada al Owner; Finance no publica turnos.

## Problemas identificados

Las referencias anteriores, de 14/09, mezclaban funciones de roles diferentes y no incluían los
nuevos calendarios. Las capturas debían renovarse y las guías de proveedor evitar instrucciones
sobre compensación personal que no forman parte de su acceso.

La revisión lingüística encontró fallos en estados dinámicos de planificación/disponibilidad,
la traducción portuguesa de «No», errores nativos que seguían el idioma del navegador, ayuda
con nombres ingleses de botones, códigos internos de flujos de facturación y formatos de
importes que ignoraban el idioma seleccionado. También había mensajes genéricos en inglés
que atribuían causas incorrectas a los errores. La revisión visual final detectó además
`Help` y `Finance Overview` sin traducción en navegación, y códigos internos ingleses en las
cabeceras; se corrigen y se añade cobertura de todas las etiquetas de los siete perfiles.

La matriz de navegador encontró además que la redirección de la portada de coordinadores y
técnicos externos descartaba el idioma solicitado. Se conserva ahora el idioma canónico al
redirigir al destino fijo de cada perfil. Las capturas preliminares se invalidan y la captura
final comprueba explícitamente el atributo `lang` y registra la ruta final real.

## Criterio de recuperación y mensajes

- Recuperar automáticamente una descarga ante fallos transitorios de red o servicio, con
  reintentos limitados y estado de progreso. Informar solo cuando no se haya podido recuperar.
- Pedir inicio de sesión o explicar el acceso necesario cuando esa sea la causa del fallo.
- Conservar los valores de formularios rechazados y distinguir conflictos de versión,
  solapamientos de turnos, indisponibilidad y restricciones de documentos financieros.
- Describir el campo y la acción necesaria en el idioma de la app, aunque el navegador tenga
  otro idioma. No repetir automáticamente escrituras ni sobrescribir decisiones de negocio.

## Capturas y verificación

Las capturas autenticadas se toman de la aplicación real en ejecución con cuentas y datos
sintéticos aislados. Se registran persona, idioma, ruta, fecha, tamaño y hash de cada imagen,
y su vínculo con el código de la interfaz. Las pantallas públicas pueden verificarse en
producción; los flujos de documentación no crean registros ficticios de clientes reales.

Se ha verificado autorización de descargas, navegación y mensajes por perfil en EN/ES/PT-BR,
texto extraíble, imágenes incrustadas, fuentes y revisión visual de los PDF. La publicación y
las comprobaciones operativas quedan registradas en el recibo de producción posterior.

La revisión visual del PDF reveló un fallo adicional del editor de disponibilidad: la rejilla
global de cuatro columnas recortaba fechas y estados dentro del panel lateral. El editor usa
ahora una columna y controles de ancho completo. Las cuatro pruebas de valores, etiquetas, anchura
y contención del formulario en 360/390/768/1440 px pasan y las capturas se han renovado.

La suite general pasa **1.123/1.123** pruebas en 162 archivos; el cierre de navegación pasa
**88/88** pruebas focalizadas. Integración de pagos, gestión y proveedores: **34/34**. Los
[resultados y alcance temporal de cada ejecución](evidence/manuals-i18n-20260919/quality-gates.json)
distinguen las pasadas generales de los ajustes finales. Las [guías por perfil](manuals/README.md)
incluyen enlaces directos y las instrucciones para regenerarlas.

Se entregan **14 referencias por perfil** y **3 guías rápidas**. El manifiesto final contiene
**90 capturas reales, 14 pares perfil/idioma y 168 comprobaciones**. La matriz multilingüe
comprueba 105 rutas; las descargas tienen 26 accesos permitidos y 12 denegaciones verificadas.
Los reintentos GET, mensajes de fallo persistente, sesión caducada y objetivos táctiles se
comprueban en navegador. El [recibo del navegador](evidence/manuals-i18n-20260919/browser-verification.json)
y la [validación PDF](manuals/validation/pdf-quality.json) detallan versiones, hashes y alcance.
