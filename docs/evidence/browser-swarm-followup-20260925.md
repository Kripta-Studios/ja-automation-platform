# Seguimiento de auditoría funcional y UX — 25/09/2026

## Punto de partida

- Producción: `https://j-aautomation.com/j-aautomation/app`.
- Release activo al iniciar: `7d45f83c55fd9f5295264dfac0b477666eb2ec9667400d43adcc8834ef6b8a88` (`/opt/jaautomation/current`).
- El árbol de trabajo ya contiene 146 rutas modificadas o nuevas. Se preservan esos cambios; este seguimiento no los atribuye a la presente pasada.
- Evidencia histórica: [auditoría del 24/09](production-browser-audit-20260924.md) y [enjambre y despliegues del 25/09](browser-swarm-20260925.md). Sus verificaciones demuestran recorridos concretos, no una certificación exhaustiva de todos los estados posibles.
- Las cuentas de prueba y su alcance están en `docs/manuals/Portal_Test_Accounts.private.md`. No se copian contraseñas ni sesiones aquí.

## Método de esta pasada

Tres agentes recorren la interfaz de producción con sesiones de navegador independientes. Dividen operaciones/proyectos, finanzas/auditoría y proveedor/cuadrilla. Todas las escrituras deben usar datos sintéticos identificables en proyectos QA, con comprobación después de recargar. Los informes detallados son [operaciones](browser-swarm-20260925-ops.md), [finanzas](browser-swarm-20260925-finance.md) y [proveedor](browser-swarm-20260925-supplier.md). Un hallazgo se considera confirmado solo si constan rol, pantalla, pasos, resultado y evidencia.

## Matriz de cobertura y decisiones

| Flujo | Rol origen → siguiente rol | Estado de esta pasada | Evidencia / incidencia |
| --- | --- | --- | --- |
| Cliente, proyecto y equipo | Owner → Project Manager → Worker | En curso | Operaciones |
| Planificación y horas propias | Project Manager → Worker → aprobador | En curso | Operaciones |
| Cuadrilla y técnicos | Owner → jefe/coordinador → técnico → aprobador | En curso | Proveedor |
| Gastos y recibos | Worker/técnico → aprobador → Finance | En curso | Operaciones / Proveedor / Finanzas |
| Informes y adjuntos | Worker/técnico → aprobador → lector | En curso | Operaciones / Proveedor |
| Comercial, facturas, cobros, paquetes | Finance → Auditor | En curso | Finanzas |
| Acceso denegado y privacidad | Todos los roles de prueba | En curso | Los tres informes |
| Móvil y UX | 390 px, casos con controles densos | En curso | Los tres informes |

## Hallazgos nuevos

| ID | Severidad | Resultado de la interfaz en producción | Seguimiento |
| --- | --- | --- | --- |
| UX-01 | Alta | El coordinador envió horas de un técnico QA sin login; Owner las devolvió. La ficha Crew exige que ese técnico cree la corrección, pero no puede iniciar sesión; el coordinador recibe 403 en la ficha normal de Tiempo. El registro queda sin transición visible. | Confirmado; detalle en el informe de proveedor. |
| UX-02 | Alta | En móvil de 390 px, los 12 pasos del asistente de facturas miden 736 px de ancho dentro de una hoja recortada y ocupan 598 px de alto; las etiquetas se cortan y Siguiente queda debajo de la pantalla. | Confirmado dos veces; detalle y captura en finanzas, `FIN-UX-01`. |
| UX-03 | Media | Para un periodo QA de gastos vacío, el paso de preparación dice `Ready` con cero fuentes, pero el paso de guardado sólo dice que se resuelvan problemas del periodo; no explica que faltan registros. | Confirmado dos veces; detalle en finanzas, `FIN-UX-02`. |
| UX-04 | Media | La validación de una hora vacía enumera mensajes genéricos sin nombrar Proyecto, Horas ni Actividad; enfoca el primer campo. | Confirmado; detalle en operaciones. |
| UX-05 | Media | Un Worker abre una hora propia en borrador desde `Open record`: la ficha carece de Edit, Submit y Delete aunque esas acciones existen en la lista. Debe volver para continuar. | Confirmado; detalle en operaciones. |
| UX-06 | Media | Al abrir un gasto relacionado con una hora, el filtro visible de Worker muestra un UUID interno en lugar del nombre. | Confirmado; detalle en operaciones. |
| UX-07 | Baja | La ficha de una hora aprobada muestra las fechas de envío y aprobación como ISO UTC sin formato de lectura. | Confirmado; detalle en operaciones. |
| UX-08 | Por decidir | El formulario de gasto relacionado propone USD en un proyecto cuyos gastos QA visibles son EUR. Es posible que se permitan gastos en divisa distinta; falta confirmar la regla antes de cambiar la moneda inicial. | Observación; detalle en operaciones. |
| UX-09 | Media | Las supuestas pestañas `Overview`, `Collections` y `Lifecycle` de la ficha de factura cambian `aria-selected`, pero no cambian panel ni posición; el usuario ve el mismo cuerpo. | Observado en Finance y confirmado en la vista; corregir la navegación y la semántica. |
| UX-10 | Media | Un periodo de horas con cero fuentes puede figurar `Ready` y permitir pulsar Guardar aunque el servidor rechace un borrador de subtotal cero. Los modelos con tarifa fija positiva son una excepción legítima. | Hallazgo de revisión de código; requiere regla de preparación autoritativa y prueba local. No reproducido aún en navegador de producción. |
| SEC-01 | Alta | Tras revocar y volver a conceder una delegación Crew, la ruta de envío de un borrador previo puede aceptar la nueva concesión aunque la ficha del registro niega acceso por pertenecer a la concesión antigua. | Confirmado por rutas de código; requiere prueba de ejecución y unión exacta a la concesión original. |

Cada corrección se documentará aquí con prueba local, release de producción y repetición del gesto original. Los tres informes de navegador detallan la reproducción y los límites.

## Cobertura real de la primera pasada

- Operaciones: Worker 1 guardó y envió 10 minutos QA; Project Manager aprobó tras recarga. Worker 2, como jefe, creó dos borradores delegados y editó uno. Owner revisó delegaciones. Se abrieron las vistas de Worker 6–8 y se comprobó denegación de Finance. El límite de inicios de sesión impidió un login nuevo de Worker 3–5; no se alteró el limitador.
- Proveedor: Supplier Coordinator guardó, envió y vio devolver tres minutos QA de un técnico sin login. El registro sigue `Needs changes` para retest. Se inspeccionaron 15 vistas de Supplier, Technician, jefe, PM y Auditor sin desbordamiento móvil observado. El texto de Crew impide continuar como se detalla en UX-01.
- Finanzas: Finance abrió Billing, Ledger y Accounting, reprodujo el fallo de la hoja a 390 px y la contradicción del periodo vacío a 390/1440 px. Auditor revisó Billing, Ledger y Accounting con una sesión previamente autorizada y descargó JSON contable por un enlace visible (HTTP 200). No hubo escrituras financieras en esta pasada.
- Las facturas emitidas, cobros y paquetes creados por el recorrido QA anterior constan en [auditoría histórica](production-browser-audit-20260924.md) y [verificación posterior](browser-swarm-20260925.md). Este seguimiento no los repite ni atribuye a la nueva pasada.

## Observaciones que requieren más diseño o evidencia

- El indicador `Ready 0` de Accounting cuenta paquetes en ese estado mientras hay cinco artefactos `Ready` en cada paquete histórico. Puede requerir un nombre más específico.
- El formulario de un gasto relacionado propone USD en el proyecto QA que presenta gastos EUR. El producto permite gastos en divisas distintas; se debe confirmar la moneda inicial apropiada sin impedir esa operación.

## Límites de certificación

La cantidad de estados, fechas, monedas, proyectos, permisos por objeto, dispositivos y secuencias hace imposible certificar literalmente todas las combinaciones mediante una pasada manual. Se registrarán las combinaciones ejecutadas y los huecos; un barrido de rutas o un test de código no sustituye una acción real en la interfaz.

## Publicación y verificación del primer candidato

- El 25/09 se publicó el release `666c3a596d839de059c645016cd3132f071497a18951fd98800940dbe69b9755` con ZIP filtrado. El recibo de despliegue, copia online y comprobaciones de servicios están en [browser-swarm-deployment-20260925.md](browser-swarm-deployment-20260925.md). El archivo excluye manuales privados y evidencia local.
- El agente de proveedor repitió el caso bloqueado desde la UI: el coordinador corrigió la hora devuelta del técnico sin acceso, la envió y Owner la aprobó. La corrección `01a0d874-071c-745f-9e22-4d4e4fc9ab3d` siguió aprobada tras recargar; Finanzas queda pendiente. Informe: [postdeploy Crew](browser-swarm-20260925-postdeploy-crew.md).
- El agente de Finanzas confirmó la explicación del periodo de gastos vacío, el guardado deshabilitado, los saltos de secciones y el acceso de lectura del Auditor. También midió un fallo residual P1: en el asistente de facturas el paso 1 conserva un ancho intrínseco de 736 px en móvil, que recorta texto y selector. Informe: [postdeploy Finanzas](browser-swarm-20260925-postdeploy-finance.md). Una corrección de CSS y su E2E de geometría a 360/390/768/1440 pasaron localmente, pendiente de nueva publicación y navegador real.
- El agente de operaciones reprodujo un bloqueo adicional en flujo real: el formulario de corrección de Time y Expense sólo pide el motivo y crea un borrador vinculado con los mismos datos, que luego es inmutable. Las correcciones QA `01a0d879-d330-756d-b987-cab1f486d125` (Time) y `01a0d87c-acba-741b-b56c-24ab2a7da341` (Expense) quedaron Draft. La ficha Expense tampoco expone Submit. Se exige recopilar los datos revisados antes de crear el vínculo, conservar su inmutabilidad posterior y ofrecer recuperación de borradores atrapados.
- En el selector de horas relacionadas de Expense, el original Needs changes y su corrección Draft tienen etiquetas iguales pese a IDs distintos. Debe distinguirse el estado y excluirse la versión sustituida cuando corresponda.
- En Daily Report devuelto, Worker 2 guardó cambios de la versión 4, pero el registro permaneció Needs changes; el mensaje afirmó que estaba enviado y quedó visible un borrador local de recuperación de versión 3. El envío posterior debe quedar explícito y el borrador local obsoleto no debe ofrecerse para restauración.

Estas incidencias mantienen **abierto** el seguimiento UX. El segundo paquete está retenido hasta que pasen la revisión de código, los tests y la repetición de los gestos originales en producción.

## Privacidad por relación y acceso global de Owner

La petición adicional del 25/09 exige que cada rol no Owner vea sólo proyectos, personas, registros y costes vinculados a sus funciones, mientras Owner disponga de una ruta administrativa global. Tres agentes hicieron una pasada de navegador independiente y sólo de lectura: [operaciones y pagos](browser-swarm-20260925-privacy-ops.md), [proveedor y cuadrilla](browser-swarm-20260925-privacy-crew.md) y [finanzas y artefactos](browser-swarm-20260925-privacy-finance.md).

- Worker 1–3 vieron sólo los proyectos QA asignados, sus datos operativos personales y los recibos compartidos que están enlazados desde un gasto visible. Worker 4–6 mostraron estado vacío para QA no asignado. Project Manager vio los tres proyectos QA de su alcance y los registros operativos de su equipo, pero no BBS, precios, costes, facturas ni economía. Supplier Coordinator, External Technician y Crew Chief quedaron limitados a sus delegaciones activas y objetos propios. Las rutas directas ajenas respondieron 403/404 en las muestras indicadas en los informes.
- Finance y Auditor pudieron leer las cifras y artefactos financieros globales autorizados; Auditor careció de controles de cambio. La factura PDF y el JSON contable descargaron para Owner/Finance/Auditor y fueron 404 para PM/Worker. El CSV del Ledger descargó para Owner/Finance; Auditor no tiene ese export y su URL devolvió 403. Esto se registra como comportamiento observado, sin equiparar automáticamente la lectura con permiso de exportación.
- **Acceso global Owner, incidencia confirmada:** Owner podía consultar costes y liquidaciones, pero `/pay` era 403 y ninguna ruta mostraba el mismo estado actual de compensación que Worker 1 veía en My Pay (€72,92 aprobado) o el estimado pendiente de Worker 2 (€12,50). Se implementa una vista administrativa por persona exclusiva de Owner y se probará que Finance/Auditor/PM/Worker no puedan abrirla ni cambiar de persona mediante URL.
- **UX financiera:** el selector `Finalize compensation` ofrecía alrededor de 110 trabajadores globales al gestionar un proyecto QA con ocho asignados. El repositorio comprueba membresía antes de liquidar, pero el selector induce a error; se ajustará al contexto del proyecto. El aviso genérico de vista de Auditor aparecía también para Finance. La pestaña Team explicaba a PM/Worker que configuraran tarifas en Billing, inaccesible para esos roles. Ninguno de estos mensajes demuestra por sí solo una filtración de datos.
- Una ruta especializada `/crew/time/{id}` respondió 404 para Owner en registros creados por otro recorder, aunque la ficha canónica `/time/{id}` era 200. Se añadirá una salida canónica para Owner sin cambiar la restricción del resto de roles.
- En la validación E2E local del segundo candidato aparecieron dos regresos confusos tras **Submit**: Crew perdía el filtro de proyecto/fecha y podía parecer que la fila había desaparecido; Time guardaba `Submitted` pero llevaba al registro general en lugar de confirmar en la ficha. Se corrigieron las redirecciones; su resultado en producción todavía debe repetirse desde el navegador.
- **SEC-02, alta, candidato aún retenido:** al revocar y volver a conceder una delegación Crew para la misma pareja, `assertRecordedCrewExpenseAccess` aceptaba cualquier concesión actual sin comparar el `grant_id` histórico del gasto. Eso afectaba lectura y acciones sobre el gasto. Además, un `timeEntryId` adivinado del mismo trabajador podía superar la validación genérica de enlace aunque el selector sólo ofreciera horas de la concesión visible. Se está cerrando el acceso con la concesión exacta en servidor y prueba de revocación→nueva concesión e ID ajeno. No se ha observado una fuga real de cliente; el defecto se confirmó en rutas de código y el release no se publicará hasta pasar la prueba.
- **UX/permiso Crew Expense, en análisis:** el jefe de cuadrilla que grabó un gasto delegado puede verlo mientras su concesión está activa, pero su ficha remite la corrección al trabajador y el POST de `createCorrectionDraft` deniega al grabador porque el trabajador titular es otro usuario. Se está evaluando el ciclo completo de corrección bajo la misma concesión exacta, incluida la nueva ficha vinculada y el envío; no se declara corregido todavía.

Estas pruebas usan objetos QA nombrados y sesiones reales de navegador; no prueban todas las combinaciones, el efecto de quitar una asignación durante una sesión ni todos los formatos exportables. Worker 7–8 no se volvieron a autenticar en la pasada de privacidad porque el limitador de acceso respondió después de Worker 7. Los informes anteriores documentan sus comprobaciones previas.
