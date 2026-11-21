# QA de portales y perfiles externos · 21 de noviembre de 2026

La entrada pública `https://app.j-aautomation.com/` redirige a `https://j-aautomation.com/j-aautomation/app/login`, que devuelve HTTP 200. Un intento de inicio con cada una de las dos cuentas históricas de prueba de proveedor (coordinador y técnico) devolvió HTTP 401 y mantuvo la pantalla de acceso. La primera ronda autenticada se ejecutó con Chromium y contextos Playwright aislados en la réplica sintética de la versión desplegada. La segunda ronda verificó ambos perfiles en el dominio público con cuentas QA nuevas y un proyecto sintético de producción. Las rutas abreviadas comienzan bajo `/j-aautomation/app`.

## Cliente

El portal autenticado de cliente está diferido según las líneas 803 y 1055 de `J_A_AUTOMATION_CLIENT_ESSENTIAL_SPEC_2026-08-22.md`. El inventario de permisos, las rutas y la documentación de cuentas tampoco muestran un perfil de cliente habilitado. La ruta dinámica `/clients/[id]` corresponde a las fichas del directorio interno de clientes. El registro de un cliente comercial en esas fichas no crea un acceso externo. La activación de perfiles se realiza mediante invitación individual.

Lo que sí se entrega al cliente es el informe de conformidad de horas/actividad por proyecto y período. La especificación incluye fechas, horas aprobadas, actividad y, opcionalmente, referencias a informes diarios/técnicos. Excluye importes, costes y tarifas confidenciales. El registro interno vincula firmante, fecha, versión y evidencia. El proyecto puede exigir esa conformidad para emitir la factura. El detalle interno pertenece a `/reports/period/[id]`. El código valida el acceso y vincula la evidencia al identificador/versión/hash del informe. Inventariado en código y documentación, sin ejecutar conformidad, emisión ni intercambio externo en esta prueba.

## Proveedor y técnico

| Flujo | Coordinador de proveedor | Técnico externo |
| --- | --- | --- |
| Inicio de sesión local | HTTP 200, aterriza en `/supplier` | HTTP 200, aterriza en `/time` |
| Gestión/personas | Equipo de proveedor, período y proyecto con autorización. Pulsé Personnel y aparecieron los formularios Add technician y Assign existing technician con el listado disponible. La ficha no crea credenciales. | `/supplier` redirige a `/supplier/report`; no se ofrece gestión de plantilla. |
| Registro propio | `/time` HTTP 200. Horas de trabajo, viajes, extras/guardia; guardar borrador/enviar. | Igual, acotado a asignaciones y registros propios. |
| Horas del equipo | `/supplier?workspaceAction=time` HTTP 200. Elegir técnicos, fecha y categoría, horas compartidas/individuales, intervalo inicio/fin o duración, descripción opcional, guardado en borrador. El código contempla actualizar, enviar individualmente/en lote, corregir y descartar borrador. | Sin acciones de horas de proveedor para terceros. `/crew` devuelve 200 con recuperación por falta de delegación en la cuenta probada. |
| Gastos | `/expenses` HTTP 200. Gastos/recibos propios y formulario de alta múltiple. | `/expenses` HTTP 200. Gastos/recibos propios. |
| Informes de campo | `/reports` y `/reports?view=technical` HTTP 200, informes diarios y técnicos/PLC propios. | Las dos rutas HTTP 200, informes propios. |
| Informe operativo | `/supplier/report` HTTP 200, proyecto, período, idioma, entradas, descarga CSV e impresión/guardar PDF desde el navegador. | HTTP 200, consulta de actividad operativa propia, filtros y CSV. |
| Cuenta y ayuda | `/profile` y `/help` HTTP 200; disponibilidad, habilidades, cambio de contraseña, passkeys, autenticador y manual del rol. | Las dos rutas HTTP 200 y manual del técnico externo. |
| Finanzas / cobro | `/finance` HTTP 403. `/my-pay` HTTP 200 informativo, sin datos de remuneración. | Igual. |
| Agenda y captura | `/planning`, `/workflow` y `/workflow/capture` HTTP 403. `/crew` redirige a `/supplier`. | `/planning` HTTP 403. `/workflow` y `/workflow/capture` HTTP 200 desde URL directa, con formularios de borrador de horas, informe y gasto. El menú no ofrece esta entrada. |
| Móvil 390 px | Equipo, horas de equipo e informe operativo con ancho de documento 390 px. Barra inferior Time, Crew hours, Expenses, Supplier team, More. | Time e informe operativo con ancho de documento 390 px. Barra inferior Time, Expenses, Reports, More. |

El Owner da de alta el proveedor, configura el perfil sobre una cuenta habilitada y concede instalación y vigencia. El coordinador opera sobre los técnicos de su proveedor y las instalaciones con permiso activo. El técnico trabaja sobre registros propios y asignaciones vigentes. La revisión de horas de origen proveedor pertenece al Owner. Las entradas canónicas conservan técnico, capturador, trazabilidad y correcciones. El repositorio prevé verificación de permisos vivos, cierre de acceso tras revocar y exclusión de finanzas/compensación. Jefatura de cuadrilla es una delegación de un trabajador estándar, no un perfil de cliente o proveedor. Auditor de solo lectura pertenece al espacio interno. El portal ofrece acceso por roles desde el mismo inicio de sesión, con el menú y las rutas ajustados al perfil.

## Evidencia de flujos

- El informe operativo del coordinador descargó CSV HTTP 200, extensión `.csv` y encabezados de instalación/proyecto, técnico, día, categoría, horas reales, actividad, estado y capturador. No se incluyeron columnas financieras.
- Las fechas invertidas desde el informe en español mostraron el mensaje en la página y junto al campo, marcaron un campo inválido y ocultaron la descarga mientras el filtro fuese inválido.
- La prueba sobre el coordinador introdujo `8:15` como duración en un día del proyecto sintético. El navegador conservó el valor, el POST devolvió HTTP 200 y no mostró alertas. El CSV del 20 de noviembre confirmó una fila de 8,25 h en estado Draft. El fallo histórico F4 de la auditoría anterior no se reprodujo en el formulario del proveedor.
- Las rutas estudiadas no produjeron excepciones Playwright `pageerror` en las dos sesiones de réplica.
- En la primera ronda de producción se comprobó el acceso público y se intentó autenticar una vez cada cuenta histórica. La creación de horas ocurrió solo en la réplica sintética. La segunda ronda se describe a continuación.

## Hallazgo y corrección del manual

El manual vigente del coordinador presentaba Digital workers como entrada a Supplier team. En la réplica `/workflow` y `/workflow/capture` devuelven 403 para este perfil. El manual del técnico presentaba Digital workers como opción del menú. Su menú vigente carece de esa opción, aunque el servidor permitió abrir las dos rutas directamente. Para reproducir, iniciar sesión como cada perfil, revisar la navegación y abrir el PDF de Help antes de la corrección. En ambos perfiles el manual dirigía al usuario fuera de las opciones visibles.

Corregí los originales JSON de los dos cursos ilustrados. El coordinador ahora sigue Supplier team y Crew hours. El técnico usa Time, Expenses y Reports. Ambos encuentran Operational report mediante More. Quité de la edición del técnico los capítulos de captura y ayudas que dependían de la opción ausente del menú. El acceso y los flujos existentes en el servidor conservaron su comportamiento. Comprobé More → Reports en 390 px y la selección de Personnel en escritorio. Los ejercicios y sus capturas históricas conservaron sus fechas.

Regeneré Markdown, HTML, PDF y las entradas de ambos perfiles en el manifiesto en el checkout de trabajo. Cambié la revisión que Ayuda comunica y usa en el nombre del PDF a `2026-11-21` para estos dos manuales. El PDF del coordinador tiene 63 páginas y 26 marcadores. El del técnico tiene 56 páginas y 24 marcadores. El verificador completo de ocho manuales confirmó legibilidad, marcadores, hashes de PDF/capturas y privacidad. Las ocho pruebas de privacidad pasaron. Playwright abrió More → Operational report a 390 px como ambos perfiles, y descargó sus PDF desde Ayuda en español. La respuesta devolvió HTTP 200, formato PDF, idioma EN, revisión y nombre de archivo con la fecha del 21 de noviembre, y el mismo SHA-256 que el archivo local.

## Segunda ronda en el dominio público

El 21 de noviembre preparé el proveedor sintético QA-20261121 y dos cuentas de portal con direcciones operativas de prueba sin buzón. Creé y comprobé ambos perfiles mediante la interfaz oficial. Limité la autorización del coordinador y la asignación del técnico al mismo proyecto ficticio QA con vigencia del 21 de noviembre al 5 de diciembre. Las dos operaciones de preparación devolvieron HTTP 200.

| Comprobación pública | Coordinador | Técnico externo |
| --- | --- | --- |
| Login desde el alias público | 200, `/supplier` | 200, `/time` |
| Informe operativo y CSV del proyecto QA | 200 ambos | 200 ambos |
| Finanzas | 403 | 403 |
| Descarga del manual desde Ayuda en español | 200, PDF inglés, edición desplegada 2026-10-17 | 200, PDF inglés, edición desplegada 2026-10-17 |
| Informe diario propio del proyecto QA | Guardado 200, reabierto 200 en Draft con texto sintético exacto | Guardado 200, reabierto 200 en Draft con texto sintético exacto |
| Archivo de evidencia privado de su informe | Carga 201, descarga posterior 200 y SHA-256 idéntico al original | Carga 201, descarga posterior 200 y SHA-256 idéntico al original |

Los dos borradores permanecieron sin enviar. Cada adjunto contenía únicamente texto sintético. La primera comprobación de la carga recibió 201 y el navegador recargó inmediatamente. La sesión posterior de solo lectura comprobó la presencia de cada adjunto, su recuperación y su SHA-256, sin repetir la carga. Ayuda seguía sirviendo la edición de octubre al finalizar la prueba pública. La edición de noviembre se verificó en el checkout y la réplica local. Las capturas de autenticación y los registros de ejecución se conservan en el directorio de pruebas privado del VPS.

## Fuentes y evidencia local

- `J_A_AUTOMATION_CLIENT_ESSENTIAL_SPEC_2026-08-22.md`, apartados Customer time/activity sign-off report, CORE-13 y exclusiones.
- `docs/SUPPLIER_WORKFORCE_IMPLEMENTATION.md`, `docs/PRODUCTION_TEST_ACCESS_2026-09-09.md`, `docs/manuals/BBS_Supplier_Coordinator_Manual_EN.md` y `docs/manuals/BBS_External_Technician_Manual_EN.md`.
- `apps/portal/src/hooks.server.ts`, `apps/portal/src/lib/portal-navigation.ts`, `apps/portal/src/routes/app/supplier/`, `apps/portal/src/routes/app/reports/period/[id]/+page.server.ts` y `packages/database/src/domains/workforce/supplier-access.ts`.
