# Auditoría operativa de navegador — 2026-09-25

## Método y alcance

Chromium headless con contextos independientes, viewport de 390 × 844 salvo donde se indica, sobre `https://j-aautomation.com/j-aautomation/app`. Todas las acciones de negocio se realizaron mediante controles visibles de la web. Los únicos registros nuevos llevan `QA SYNTHETIC`, pertenecen a `C-0040-P-001 QA BROWSER AUDIT 20260924` y no representan trabajo real. Se reutilizaron sesiones privadas de prueba ya autorizadas para Owner, Project Manager, Worker 1/2 y External Technician; también se intentó iniciar sesión por la interfaz con las ocho cuentas Worker recomendadas. No se modificaron clientes reales, facturas emitidas, pagos ni correo. Este informe no certifica combinaciones no ejecutadas.

## Hallazgos nuevos reproducidos

### UX-04 · Errores del formulario de tiempo sin nombre de campo — prioridad media

- **Rol y URL:** Worker 1, `/j-aautomation/app/time`, viewport 390 × 844.
- **Pasos:** pulsar **Log time** y, en la hoja abierta, **Save draft** sin completar los campos.
- **Esperado:** resumen que enumere `Assigned project`, `Actual hours` y `Activity summary` con una indicación concreta para corregirlos.
- **Actual:** el resumen dice `Please correct the following fields: Please select an option. Please complete this field. Please complete this field.` Se muestran errores bajo los tres campos y el foco va al proyecto, pero el resumen no permite identificar qué falta sin volver a recorrer el formulario. El estado vacío permanece hasta corregirlo; no hubo guardado que recargar.
- **Evidencia:** `/home/kripta/production-browser-audit-20260924/ops-worker1-time-validation-20260925.png`.

### UX-05 · La ficha de un borrador de tiempo no permite continuarlo — prioridad media

- **Rol y URL:** Worker 1, `/j-aautomation/app/time/01a0d82d-02e8-756b-b5db-2ab799f22109`, viewport 390 × 844.
- **Pasos:** en `/time`, guardar un borrador de 10 minutos del proyecto QA con resumen `QA SYNTHETIC ops swarm 20260925 worker1 10m; no real work`; recargar; pulsar **Open record** de su tarjeta.
- **Esperado:** en la ficha Draft, acciones **Edit draft** y **Submit** junto al estado y contenido, o un enlace explícito a esas acciones.
- **Actual:** la ficha muestra `Draft`, datos y enlaces **Open project**, **Add related expense**, **View project reports**, sin editar ni enviar. Las acciones **Edit draft**, **Submit** y **Delete** sólo aparecen en la tarjeta de `/time`; el trabajador debe volver y localizarla otra vez. Al volver a la lista se envió el registro; Project Manager lo aprobó desde `/approvals`; la ficha mostró `Approved` tras recargar. La persistencia confirma que el borrador y las transiciones funcionaron y aísla el problema a la navegación de la ficha. La ficha de un borrador delegado en `/crew/time/...` sí permite **Edit draft**, por lo que el patrón resulta inconsistente.
- **Evidencia:** `/home/kripta/production-browser-audit-20260924/ops-worker1-time-saved-20260925.png`; ID del registro arriba; aprobación confirmada mediante recarga en ambos roles.

### UX-06 · Identificador interno del trabajador en un filtro visible — prioridad media

- **Rol y URL:** Worker 1, `/j-aautomation/app/expenses?project=01a0d473-7f31-75cf-98e8-7aaec0a8b8fe&worker=01a0d080-0b0c-779c-88f3-6d2458c4616d&date=2026-09-25&timeEntry=01a0d82d-02e8-756b-b5db-2ab799f22109`, viewport 390 × 844.
- **Pasos:** abrir la ficha aprobada anterior y pulsar **Add related expense**.
- **Esperado:** el filtro activo debería mostrar `Worker: QA Worker 1`, igual que la opción de horas relacionadas, para que el usuario entienda el alcance del listado.
- **Actual:** el chip muestra `Worker: 01a0d080-0b0c-779c-88f3-6d2458c4616d`. La hoja **Record expense** sí abre, y preselecciona correctamente proyecto QA, fecha `2026-09-25` y las 10 min relacionadas. Al recargar la URL, el identificador visible persiste.
- **Evidencia:** `/home/kripta/production-browser-audit-20260924/ops-worker1-related-expense-20260925.png`.

### UX-07 · Fechas de aprobación como ISO UTC crudo — prioridad baja

- **Rol y URL:** Worker 1, `/j-aautomation/app/time/01a0d82d-02e8-756b-b5db-2ab799f22109`.
- **Pasos:** enviar el borrador anterior desde `/time`, aprobarlo como Project Manager desde `/approvals`, volver a la ficha como Worker 1 y recargar.
- **Esperado:** fechas legibles con hora local y zona, coherentes con el proyecto `Europe/Madrid`.
- **Actual:** `SUBMITTED 2026-09-25T10:47:49.894Z` y `APPROVED 2026-09-25T10:48:15.776Z` permanecen en formato técnico. La ficha indica por separado `PROJECT TIMEZONE Europe/Madrid`.

### UX-08 · Gasto relacionado propone USD en el contexto de un proyecto con gastos EUR — prioridad baja, revisar regla de moneda

- **Rol y URL:** Worker 1, destino **Add related expense** desde la ficha anterior.
- **Pasos:** abrir la hoja **Record expense** desde el registro de tiempo de `C-0040-P-001`; inspeccionar `Currency` antes de introducir importe.
- **Actual:** `Currency` aparece preseleccionado como `USD`, mientras los cinco gastos visibles del mismo proyecto en su Overview aparecen en `EUR`. El enlace sí conserva proyecto, fecha y hora relacionada. No se guardó un gasto, por lo que no se ha probado la interpretación financiera. Si la moneda operativa puede diferir de la del proyecto, la UI debería explicar la elección; si se espera la moneda del proyecto, preseleccionarla.
- **Evidencia:** `/home/kripta/production-browser-audit-20260924/ops-worker1-related-expense-20260925.png`.

## Flujos que funcionaron

| Rol | Gesto y resultado después de recargar |
| --- | --- |
| Worker 1 | Guardó borrador de 10 min QA el 25/09; apareció en el registro y timesheet. Lo envió desde la tarjeta; pasó a `Submitted`. |
| Project Manager | `/approvals` pasó de 0 a 1 pendientes; aprobó el registro de Worker 1. Después de recargar, pendientes volvió a 0 y Worker 1 vio `Approved`. |
| Worker 1 | **Add related expense** conservó proyecto, fecha y hora registrada, y abrió el formulario móvil. No se guardó un gasto. |
| Worker 2, Crew Chief | En `/crew` vio únicamente el proyecto QA y sus delegados Worker 1/3. El intento de `0.12` horas para dos personas mostró `Shared hours: use increments of one minute` y no guardó. Con `0.1` horas creó dos borradores de 6 minutos, visibles tras recarga. Abrió el de Worker 3 en `/crew/time/01a0d830-645d-77ab-a1e2-b36a271bde28`, cambió a 9 minutos y el cambio persistió tras recargar. Quedaron dos borradores QA para seguir probando el flujo. |
| External Technician | `/crew` devolvió 200 con estado vacío después de la revocación previa; no mostró delegados activos. `/time` mostró sólo el proyecto QA y sus propias entradas aprobadas. |
| Owner | Su sesión de prueba abrió `/crew`; al seleccionar el proyecto QA vio las delegaciones activas de Worker 2 y Supplier Coordinator y las revocadas del técnico. No se cambió ninguna delegación. |

## Matriz de cuentas Worker recomendadas

Inicio de sesión mediante el formulario `/login` usando la convención documentada. Para las cuentas que entraron se abrió la ruta por navegador y se observó el resultado del servidor; no se hicieron escrituras con ellas salvo Worker 1/2 en los flujos de arriba.

| Cuenta | Login | Proyectos y espacio propio | `/finance` |
| --- | --- | --- | --- |
| Worker 1 | Correcto | 2 proyectos; `/projects`, `/time`, `/expenses`, `/reports`, `/pay` 200; proyecto QA visible | 403 claro |
| Worker 2 | Correcto | 2 proyectos; mismas cinco rutas 200; proyecto QA visible | 403 claro |
| Worker 3 | Bloqueado por `Too many sign-in attempts. Wait a few minutes before trying again.` | No probado en esta sesión | No probado |
| Worker 4 | Igual, límite de intentos | No probado | No probado |
| Worker 5 | Igual, límite de intentos | No probado | No probado |
| Worker 6 | Correcto | Sin proyecto QA visible; cinco rutas propias 200 | 403 claro |
| Worker 7 | Correcto | Sin proyecto QA visible; cinco rutas propias 200 | 403 claro |
| Worker 8 | Correcto | Sin proyecto QA visible; cinco rutas propias 200 | 403 claro |

El límite de acceso apareció tras dos logins sucesivos de prueba y dejó de bloquear antes de Worker 6; no se deduce si la limitación es por IP, sesión, cuenta o ventana temporal. Se evitó forzar más intentos. La sesión previa autorizada de Worker 3 estaba disponible para observar otras pantallas, pero no equivale a un login nuevo de esa cuenta.

## Cobertura pendiente

No se verificaron todos los estados y cruces de rol: Owner no creó proyectos nuevos en esta ronda; el técnico no tuvo delegación activa; Worker 3–5 no superaron el login nuevo; no se emitieron facturas ni se registraron pagos; los dos borradores Crew QA no se enviaron/aprobaron aquí; no se probó el gasto relacionado hasta su guardado. No se usó dispositivo físico ni se ejecutó auditoría completa de accesibilidad. La navegación y los errores se comprobaron principalmente a 390 px; la ficha de proyecto y la vista Owner Crew se inspeccionaron a 1440 px.
