# Revisión funcional por roles del 21 de noviembre de 2026

El despliegue del VPS de 19 de noviembre y la rama principal de GitHub apuntaban al mismo commit al iniciar la revisión, `0e140de2`. El historial accesible desde esa revisión incluye 111 commits desde el 16 de noviembre, contando las integraciones. La entrada pública de la aplicación redirige al formulario del dominio principal. [Aplicación](https://app.j-aautomation.com/) · [Revisión de partida](https://github.com/Kripta-Studios/ja-automation-platform/commit/0e140de2fc81af1ed6ae50b98e35651733e82f8b)

## Cambios recientes que condicionan la revisión

| Área | Cambios observados en Git | Referencia |
| --- | --- | --- |
| Menú, roles y trabajo pendiente | Inicio de Finanzas, menús por perfil y dispositivo, búsqueda por tareas, panel del propietario, accesos del auditor y cola de aprobación del PM | `0e140de2`, `36fd6a2e`, `30a224d9` |
| Proyectos, equipo y proveedores | Ficha de proyecto, personas y clientes, asignaciones, tarifas heredadas, acceso a cuadrilla y alta de cuentas | `24d0ac88`, `3847e783`, `3af667b0` |
| Horas, dietas e informes | Captura diaria y semanal, duración H:MM, fechas futuras, lotes de justificantes, filtros paginados y retorno tras guardar | `167d3a11`, `2f2f6ddc`, `64f48fdc` |
| Facturación, costes y cobro | Factura desde gastos o hitos, referencia de pedido por asignación, cálculo y redondeo por línea, cambios de impuesto, conversiones, cobros y totales por moneda | `d2a38a59`, `b0bcbbf2`, `176df06a` |
| Datos y volumen | Índices de lectura, carga por vista, búsqueda y paginación en servidor para directorios, horas, gastos y aprobaciones | `81f7ef58`, `b1309e9e`, `2805ba48` |

## Inventario funcional

El catálogo recoge las 124 tareas ofrecidas por el asistente de navegación y muestra a qué perfiles se ofrece cada una. Los informes por área añaden las condiciones para operar en cada pantalla y los recorridos efectivamente probados. [Catálogo y navegación por perfil](catalogo.md) · [Operaciones y pantallas](operaciones.md)

- [Administración, finanzas y auditoría](oficina.md)
- [Trabajo de campo, proyectos y cuadrillas](campo.md)
- [Proveedor, técnico externo y relación con el cliente](portales.md)

## Fichas de uso y evidencia por rol

[Propietario](propietario.md) · [Administración financiera](finanzas.md) · [Auditoría de solo lectura](auditoria.md) · [Responsable de proyecto](proyectos.md) · [Operario interno](operario.md) · [Jefe de cuadrilla](cuadrilla.md) · [Coordinador de proveedor](coordinacion-proveedor.md) · [Técnico externo](tecnico-externo.md)

## Acceso y recuperación de sesión

En Chromium sobre producción, el formulario de acceso cargó en móvil de 360 px y escritorio de 1440 px. El análisis automatizado axe de esa pantalla con las etiquetas WCAG 2 A/AA y 2.1 AA devolvió cero infracciones en ambos tamaños.

La prueba de recuperación de sesión en la instancia aislada reprodujo dos defectos. El primer paso de acceso perdía el destino al pasar a la verificación de segundo factor y el segundo paso volvía siempre a Inicio. Además, al pulsar el botón antes de cargar JavaScript, el navegador enviaba el campo del código como parámetro de la URL. Ahora ambos pasos conservan el destino interno y sus filtros, el botón de verificación espera a que cargue el manejador y el formulario usa POST. La prueba de navegación controla las respuestas de los dos servicios de autenticación y verifica el destino final en el navegador. Una segunda prueba comprueba el formulario sin JavaScript. [Regresión de navegador](../../../tests/e2e/login-return.spec.ts)

## Entornos y alcance

Tres agentes GPT-6.2 Sol con razonamiento medio recorrieron la aplicación en contextos independientes de Chromium. Primero se ensayaron los recorridos en una instancia del mismo commit con base de datos sintética. Después se crearon cuentas de producción identificadas como QA mediante los formularios del portal. Para las altas se utilizó la imagen desplegada en un contenedor auxiliar restringido al VPS, conectado a la base de producción y con acceso temporal de propietario. Las sesiones de trabajo de cada cuenta entraron por el dominio público.

Los recorridos por rol comprueban páginas, mensajes o acciones concretas. Las mutaciones públicas se limitan al conjunto de datos QA. Las pruebas de reparto monetario y segundo factor usan fixtures aisladas. La generación de una factura real, el envío a clientes, el abono de nóminas y el cierre contable quedan fuera de la evidencia de esta revisión.

## Resultado por flujo en producción

Referencia del proyecto reservado a las pruebas: `QAOFF978D182A-QAOF-978D182A`. Para abrir los borradores se necesita una sesión con la asignación correspondiente. [Proyecto QA en el portal](https://j-aautomation.com/j-aautomation/app/projects/01a1fefa-4e4a-738d-8ac0-2bdde437a946)

| Perfil | Acción verificada en Chromium | Evidencia tras la operación |
| --- | --- | --- |
| Propietario | Alta y asignación de cuentas, cliente, proyecto y proveedor QA | Cuentas en el directorio, asignaciones y delegación tras recargar. Cierre de la sesión administrativa confirmado. |
| Finanzas | Abrió 16 vistas y el asistente de factura | El asistente se pudo cerrar sin emitir ni enviar documentos. |
| Auditor | Consultó 14 vistas | Gastos y Facturas mostraban una vista inicial incorrecta en tres enlaces, reproducible sin JavaScript. |
| Responsable de proyecto | Guardó informe técnico de QA | Confirmación de borrador y título en el registro tras recargar. |
| Operario | Guardó 25 minutos y un informe diario | Duración y estado de borrador en Tiempo. Texto del parte verificado al reabrirlo. |
| Jefe de cuadrilla | Registró 35 minutos de espera para el miembro delegado | Una única fila en borrador tras recargar. |
| Coordinador de proveedor | Guardó un informe diario propio, descargó el CSV y adjuntó evidencia | Estado de borrador y SHA-256 de la descarga iguales a lo esperado. |
| Técnico externo | Guardó un informe diario propio, descargó el CSV y adjuntó evidencia | Comprobación independiente de estado, ámbito de proyecto y SHA-256. |

## Correcciones verificadas en el candidato

- **Gastos y facturas del auditor.** El primer HTML muestra la vista que permiten el rol y el enlace. Un enlace de configuración reservado abre el registro de facturas. Al cambiar de pestaña se usa la dirección actual y se retira el parámetro antiguo que podía volver a seleccionar la vista anterior.
- **Reparto de un justificante.** El selector mostraba 15,00 para un gasto de 1.500 JPY. La pantalla, la validación y la escritura transaccional ahora calculan con la moneda del comprobante. El detalle indica que el reparto está bloqueado y evita ofrecer la retirada. La regresión móvil comprueba los resultados guardados en JPY y USD.
- **Ficha de proyecto.** Cuando existen miembros con rol de PM pero falta nombrar un responsable principal, la cabecera identifica el nombramiento pendiente. Se comprobó el texto en el resumen y en Equipo a 768 px.
- **Manuales externos.** El coordinador encontraba un acceso denegado siguiendo su curso y al técnico se le indicaba una opción ausente de su menú. Se actualizaron los originales, las ediciones web y los PDF. Las pruebas comprueban la descarga que corresponde a cada perfil y su huella.
- **Acceso con segundo factor.** Se conserva la página de destino con sus filtros y la verificación espera a que cargue el formulario. Las dos pantallas de acceso leen tanto el plazo HTTP estándar como el que devuelve el proveedor de autenticación para indicar cuándo reintentar.

## Verificación de la entrega

Chromium completó 21 comprobaciones sobre la compilación del portal a 360, 768 y 1440 px, y dos recorridos de reparto a 390 px. La compilación de producción y el chequeo TypeScript del portal terminaron correctamente. También se verificaron los ocho PDF del catálogo y sus ocho pruebas de privacidad. Ninguna credencial forma parte del repositorio.

El lint de los archivos tocados sigue señalando 14 incidencias en los componentes de Gastos y Facturación. Los mismos dos componentes presentaban 15 al partir de `main`. El informe de oficina detalla también los diagnósticos previos de `svelte-check`.

La ronda ampliada cubrió 107 casos distribuidos en diez suites de integración. En la primera ejecución, varias pruebas creaban un trabajador sin la sesión ordinaria que requiere el flujo actual. Se corrigió la preparación de esos casos conservando las aserciones, los ámbitos de proyecto y las pruebas explícitas sin sesión. La verificación final, combinando las suites aprobadas y sus reejecuciones, pasó los 107 casos. Incluye 34 de conformidad del cliente, 17 de aprobación, 17 de proveedores, 10 de adjuntos, 7 de gastos de cuadrilla y 5 de inmutabilidad de informes. Para las pruebas de PDF se indicó la ruta de la versión de Chromium instalada en el VPS.
