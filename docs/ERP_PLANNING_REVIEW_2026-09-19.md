# ERP: calendarios y disponibilidad — 19/09/2026

Ampliación solicitada sobre la revisión ERP del 18/09 y su recibo de producción. La app conserva
su monolito SvelteKit/SQLite, separación de información por rol y ciclo de trabajo → revisión →
facturación. La prioridad de esta entrega es convertir fechas y disponibilidad en acciones útiles.

## Análisis funcional y comparación

La aplicación ya ofrece clientes, proyectos, asignaciones, horarios, disponibilidad, tiempo real,
gastos, informes técnicos y de cliente, firma, facturas, cobros y cierres. La revisión anterior
mejoró informes y cobros. La navegación de planificación seguía basada principalmente en formularios
fechados y listados; faltaba una vista mensual accionable y edición propia de disponibilidad.

Referencias oficiales consultadas el 19/09/2026:

- [OpenProject Calendar](https://www.openproject.org/docs/user-guide/calendar/): selección de fechas,
  apertura de registros y formularios con fecha preseleccionada. Se aplica ese patrón a turnos y
  disponibilidad, manteniendo permisos y modelos existentes.
- [Frappe Desk](https://docs.frappe.io/framework/user/en/desk): vistas alternativas sobre los mismos
  registros. La agenda complementa las listas, con el mismo alcance de datos autorizado.
- [Odoo Planning](https://www.odoo.com/documentation/17.0/applications/services/planning.html):
  referencia funcional de turnos y disponibilidad. No se presupone que ese módulo pertenezca a la
  edición Community ni se incorpora código o dependencia de Odoo.

## Mejoras implementadas

1. Calendario mensual compartido: anterior/siguiente/hoy, semanas desde lunes, día actual y
   seleccionado, contador de registros y agenda con textos completos y enlaces/acciones.
2. Perfil: pulsar un día abre disponibilidad con fecha; pulsar una ventana abre edición con sus
   valores actuales. Disponible/no disponible/tentativo, nota, guardado y recarga persistentes.
3. La selección de trabajador usa el identificador validado por el servidor. También se corrigen
   los formularios de habilidades que antes enviaban el usuario conectado al inspeccionar a otro.
   El enlace del directorio para PM ahora abre al compañero autorizado, no el perfil propio.
   Worker y PM conservan acceso a su propio perfil sin proyecto vigente y pueden declarar
   habilidades propias como no verificadas; la verificación administrativa sigue separada.
4. Edición de disponibilidad con propiedad del registro, usuario activo, alcance PM efectivo,
   versión optimista y auditoría transaccional antes/después. Worker modifica únicamente lo propio;
   Owner/Finance pueden gestionar el trabajador inspeccionado; PM puede inspeccionar y gestionar
   personal activo de sus proyectos efectivos. Auditor no recibe acciones de escritura.
5. Planificación: pulsar el día prepara inicio/fin y enfoca el formulario. Se respetan los filtros
   de proyecto/trabajador al crear. La agenda abre el editor autorizado del Owner o el proyecto.
6. Calendario de proyectos, accesible en la lista; la pestaña Equipo del detalle también muestra
   turnos del proyecto. Se reutilizan proyecciones autorizadas, sin datos económicos adicionales.
7. Corrección del selector de estado del editor de turnos: conserva `published` y elimina
   `confirmed`, que no era un valor válido en la base de datos.
8. EN/ES/PT, controles de teclado, panel adaptable para editar y horas UTC explícitas. Los turnos
   y disponibilidades con timestamp tienen fin exclusivo; las fechas de proyecto incluyen su último
   día. Un proyecto sin fin muestra su inicio, sin inventar una duración indefinida.

Las horas planificadas no generan horas reales ni pagos. Se mantienen las comprobaciones existentes
que impiden publicar turnos solapados o sobre indisponibilidad. No se añade planificación automática,
envío de correos, integración externa ni cambios de política de aprobación.

## Migración y conservación

La migración 49 registra `worker_availability.update` en el manifiesto cerrado de auditoría y amplía
el registro de metadatos de migraciones. Conserva eventos históricos y protecciones de inmutabilidad.
El ensayo en copia online aislada de producción verificó 163 tablas y 259.034 filas anteriores sin
cambios, integridad `ok`, cero FK y 387 triggers. Véase
[evidencia de actualización](evidence/planning-calendar-20260919/production-copy-upgrade.json).

## Verificación

La revisión independiente resolvió dos defectos antes de entrega: locale de URL sin normalizar y
conversión de datetime-local dependiente de la zona del servidor. El calendario recibe el idioma
validado y el formulario de planificación conserva explícitamente UTC, probado en Europe/Madrid.

Chromium supera 48/48 casos de calendario en cinco roles y cuatro resoluciones. El recorrido de
proveedores pasa en móvil y escritorio (2/2), incluyendo coordinador y técnico externo. Se corrigió
su comprobación de tamaño para medir la etiqueta clicable del checkbox y se verificó que pulsar
su texto activa/restaura la selección, sin cambiar el formulario del producto.

El resultado final de suites y producción se registra en el recibo de esta entrega.
Las capturas usan cuentas/datos sintéticos aislados; no se introducen operaciones de prueba en los
registros reales de clientes.

## Pendientes históricos

Se conserva [el estado consolidado del 19/09](PROJECT_STATUS_2026-09-19.md): P01/P03 ya cerrados
para la evidencia técnica identificada; P04 sigue sin acreditar 30 días históricos. Aprobación
fiscal/comercial, legal/privacidad, UAT humana, evidencia externa de correo, alertas y recuperación
fuera del servidor no se sustituyen por esta mejora. No se conectan Intuit ni QuickBooks.

Límite visible: el perfil muestra las últimas 200 ventanas de disponibilidad por persona. Los
calendarios reflejan registros existentes, no una predicción garantizada de capacidad. La edición
rechaza versiones obsoletas; el formulario mantiene valores y pide revisar/recargar.
