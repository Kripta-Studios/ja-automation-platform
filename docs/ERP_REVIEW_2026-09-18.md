# Revisión funcional y mejoras — 18 de septiembre de 2026

Solicitud: revisar el portal publicado, contrastar ERP/proyectos/finanzas open source, mejorar
informes, facturas y UX por rol, validar, publicar y desplegar. Esta solicitud autoriza la mejora
del producto existente; no cambia las decisiones previas de privacidad, envío consentido de
correo, MFA opcional ni inmutabilidad de documentos emitidos.

## Plan de ejecución y dependencias

| Paquete | Requisitos            | Responsable / rutas                                                                                                            | Dependencias                                     | Criterio de aceptación                                                                              |
| ------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| F       | CORE-09/12/13/15      | Principal: proyección del ledger, filtros compartidos, endpoint de exportación, CollectionsLedgerSection, exportador y pruebas | Revisión de contratos existentes                 | Pantalla/exportación concilian; aging exacto; monedas separadas; permisos conservados               |
| R       | CORE-07/13/14         | Agente: ReportSection.svelte, módulo de ayuda específico, pruebas de generación de informes nuevas                             | DTO existente y alcance de rol                   | Selección técnica ligada a proyecto/periodo/aprobación; contexto claro de destinatarios; responsive |
| O       | CORE-04/06/08/14      | Principal: revisión de gastos/inicio y pruebas relacionadas                                                                    | Auditoría de los registros y permisos existentes | Accesos y filtros orientados a las tareas autorizadas; privacidad                                   |
| V       | CORE-01–17 aplicables | Principal y revisión independiente de solo lectura                                                                             | F, R, O                                          | Tipos, lint, suites pertinentes, build y navegación por roles/resoluciones                          |
| D       | CORE-17               | Principal: git y despliegue existente                                                                                          | V                                                | Backup verificado, commit/push, release saludable, limpieza de caché de construcción                |

No hay propiedad de escritura compartida entre paquetes simultáneos. Las traducciones generales,
esta revisión y el checklist pertenecen al principal. R no modifica lógica económica, autorización,
base de datos, permisos, documentos emitidos ni rutas de otros paquetes. Clasificación de R: B,
implementación acotada en Sol Medium; F y publicación requieren juicio financiero y operativo del
principal. Revisión independiente antes del despliegue de cambios materiales, según AGENTS.md.

Ampliación motivada por la prueba de abonos: paquete C-F (Sol High) mantiene exclusivamente las
consultas de crédito de `v3-repository`, el validador canónico de paquetes y sus regresiones;
paquete C-M (Sol High) mantiene exclusivamente migración 48, registro/hash y pruebas de migración.
Dependencia: C-M → C-F → V → D. El principal integra traducciones, expectativas de esquema y el
ensayo aislado sobre copia de producción. Una revisión independiente verifica ambos paquetes.

## Defectos confirmados durante inspección

1. `masterLedger` consulta `project_id` pero no lo incluye en su resultado. El selector de proyecto
   del ledger depende de ese identificador y la exportación también.
2. La pantalla muestra cobros actuales; la exportación usaba el último día de emisión visible como
   fecha de corte de cobros. Un pago posterior a la emisión podía desaparecer de la exportación.
3. El filtro de búsqueda de la pantalla tomaba el primer identificador disponible, omitiendo los
   nombres de cliente/proyecto si ya tenían número; el endpoint buscaba en ambos.
4. El generador de informes no enlaza su selector de proyecto con `periodProjectId`; ese enlace
   está por error en el formulario diario. La selección de reportes técnicos puede mostrar otro
   alcance y la interfaz no descarta claramente los no aprobados.
5. La búsqueda de gastos y su descarga consultaban campos distintos; ahora comparten un predicado.
6. El directorio de equipo utiliza `base` sin importarlo; se repara la navegación y se amplían los
   enlaces de métricas/estados para poder pulsarlos en móvil. Se corrigen también controles de caja
   y estados de gastos, y la semántica accesible de la zona de exportación para Auditor.
7. La prueba de abonos emitidos descubre dos supuestos positivos inválidos en consultas financieras:
   división del margen por un subtotal negativo y validación de cero cobros frente a total negativo.
   La corrección mantiene el saldo acreedor separado, no inventa pagos ni aplicaciones del abono,
   y muestra margen no aplicable cuando su base es negativa.

## Comparación con alternativas open source

Consulta realizada el 18/09/2026 en documentación oficial. «Mejor» depende del problema: una suite
de contabilidad general puede ser más amplia y, a la vez, menos adecuada para registrar trabajo de
campo con privacidad de remuneración, revisión técnica y firma de cliente. No se incorpora código
de terceros ni se migra el sistema; se aplican patrones de producto al monolito existente.

| Referencia                                                                                                                                                                | Aporta frente a J&A                                                                           | Aplicación de la comparación                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ERPNext](https://docs.frappe.io/erpnext/project-profitability), [repositorio GPL-3.0](https://github.com/frappe/erpnext)                                                 | Relación entre proyecto, ventas, compras y presupuesto; análisis de rentabilidad              | Mantener fuentes trazables y separar facturado, cobrado y coste. Reparar la correspondencia de proyecto y la conciliación de exportaciones. J&A ya tiene reglas de compensación y reportes técnicos específicos. |
| [OpenProject: informes de tiempo/coste](https://www.openproject.org/docs/user-guide/time-and-costs/reporting/), [repositorio GPL-3.0](https://github.com/opf/openproject) | Filtros, agrupaciones y selección del alcance de informes; distingue horas de valor económico | Aplicar el mismo filtro a pantalla y exportación. Seleccionar explícitamente proyecto, periodo y reportes técnicos aprobados. Los permisos determinan qué contenido se puede presentar.                          |
| [Dolibarr: gastos](https://wiki.dolibarr.org/index.php/Module_Expense_Reports), [repositorio](https://github.com/Dolibarr/dolibarr)                                       | ERP modular con clientes, proyectos, facturación y gastos                                     | Hacer visible la calidad de la evidencia del gasto antes de aprobarlo: justificante adjunto, obligatorio pendiente o no exigido. Conservar la separación entre aprobación operativa y tratamiento financiero.    |
| [Firefly III, AGPL-3.0](https://github.com/firefly-iii/firefly-iii)                                                                                                       | Seguimiento de ingresos/gastos, categorías y presupuestos; orientado a finanzas personales    | Referencia de claridad visual para caja y filtros; no es sustituto del flujo industrial multirol ni de la facturación contractual de J&A.                                                                        |

[Invoice Ninja](https://github.com/invoiceninja/invoiceninja) declara Elastic License y
[Akaunting](https://github.com/akaunting/akaunting/blob/master/composer.json) declara BUSL-1.1 en su
fuente actual. Se distinguen de las referencias anteriores; no se etiquetan como equivalentes
open source sin restricciones. No se ha hecho una evaluación jurídica de sus licencias.

## Revisión funcional paso a paso

La inspección abarca rutas, proyecciones de servidor, formularios y pruebas del repositorio. La
web pública responde con redirección autenticada a login. Los recorridos autenticados se ejecutan
con datos sintéticos aislados; no se atribuyen esas pruebas a cuentas reales de producción.

| Paso / función              | Lo que existe y se conserva                                                               | Resultado de la revisión                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1. Acceso                   | Invitación, sesión, recuperación, MFA voluntario, passkeys, perfiles y revocación         | No ampliar permisos para añadir informes. Comprobar denegación de exportación financiera a Worker/PM.                     |
| 2. Clientes                 | Directorio, contactos, identificadores, dirección, moneda, condiciones y archivo          | Ya cubre el registro necesario. Los números no deben impedir buscar por nombre: corrección en cobros.                     |
| 3. Proyectos                | Cliente, fechas, ubicación, responsable, centro de coste, PO, presupuesto, estado         | Restaurar el identificador de proyecto en el ledger para que los enlaces y filtros funcionen.                             |
| 4. Equipo y asignaciones    | Fechas efectivas, activación, suspensión, asignaciones y perfiles externos                | La ayuda de informes debe distinguir personal propio de externos sin My Pay.                                              |
| 5. Proveedores              | Coordinador, técnicos, instalaciones autorizadas, captura por lote y reporte operativo    | Preservar acceso exclusivamente operativo y reintentos seguros. No introducir facturas ni pagos en este perfil.           |
| 6. Planificación            | Turnos, proyectos, trabajador y periodos                                                  | Mantener referencia planificada separada de horas reales; no crear trabajo ficticio.                                      |
| 7. Horas                    | Trabajo/viaje/espera, borrador, envío, revisión y corrección auditada                     | Flujo ya implementado; conservar privacidad y trazabilidad al enriquecer reportes.                                        |
| 8. Gastos                   | Categorías, moneda, quién pagó, justificante, revisión, reembolso y recuperación          | Añadir filtro y señal de justificante pendiente; exportar el mismo alcance; retirar controles de reembolso del PM.        |
| 9. Daily                    | Resumen, tareas, incidencias, acciones, parada, pendientes, siguiente jornada y seguridad | Corregir el estado de proyecto compartido accidentalmente con el generador de periodo.                                    |
| 10. PLC/técnico             | Sistema/equipo, diagnóstico, cambio, prueba/resultado, riesgo, rollback, backups          | El generador ofrece solo registros del proyecto/periodo seleccionados y revisados.                                        |
| 11. Aprobaciones            | Colas, motivo de rechazo, correcciones y revisión técnica                                 | Facilitar evidencia del gasto antes de llegar aquí; conservar validación del servidor.                                    |
| 12. Informe de cliente      | Horas y actividad sin importes, selección técnica opcional, versión y conformidad         | Guía explícita de destinatario, fecha de inicio/fin válida y limpieza de selecciones técnicas obsoletas.                  |
| 13. Informe interno         | Horas, compensación, costes, facturable, WIP, presupuesto, contribución                   | Ya está separado del informe de cliente. No copiar márgenes o tarifas a las vistas operativas.                            |
| 14. My Pay                  | Actividad propia, estimaciones, liquidaciones, reembolsos, fechas previstas/reales        | La guía reconoce el acceso propio del PM y no ofrece esa vista a perfiles externos.                                       |
| 15. Configuración comercial | Tarifas efectivas, mínimos, overtime, travel, gastos y fiscalidad por stream              | Mantener cálculos exactos y configuración comercial fuera de los formularios del trabajador.                              |
| 16. Facturas                | Borrador, revisión, emisión explícita, PDF, cobros, crédito/anulación, envío consentido   | Enriquecer el ledger con servicio, PO, vencimiento, cobro esperado y aging; no modificar PDFs emitidos.                   |
| 17. Cobros y caja           | Pagos parciales, reversos, saldo, fechas previstas y reales                               | Reparar exportación que recortaba pagos posteriores a la emisión; aging independiente de etiqueta de estado y por moneda. |
| 18. Accounting              | Paquetes, versiones congeladas, PDF/XLSX/CSV independientes                               | Preservar estados de generación. Corregir fechas de pagos/reversos en hojas del ledger exportado.                         |
| 19. Documentos/cierre       | Archivos privados, integridad, paquetes de cierre e histórico                             | Conservar las autorizaciones y artefactos inmutables. No reemitir documentos existentes.                                  |
| 20. Ayuda/avisos/auditoría  | Manuales, avisos internos, registro de cambios y consentimiento de correo                 | Añadir ayuda contextual por rol. No enviar mensajes ni facturas automáticamente.                                          |
| 21. Operaciones             | Jobs supervisados, salud, SQLite, backups, releases y rollback                            | Usar el despliegue existente con backup verificado; limpiar únicamente caché de construcción Docker.                      |

## Campos y UX por destinatario

| Rol / documento                        | Campos necesarios ya existentes                                                                                     | Mejoras de esta actualización                                                                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker propio                          | Proyecto, fecha, horas, actividad, estado de revisión, justificante; en My Pay únicamente importes y fechas propios | Evidencia del gasto visible y filtrable; guía hacia el informe apropiado.                                                                                                                                                           |
| Técnico externo / coordinador          | Instalación autorizada, técnico, trabajo real, fecha, autor del registro, aprobación/corrección                     | Ayuda exclusivamente operativa; ninguna sugerencia de acceso a remuneración o finanzas.                                                                                                                                             |
| Project Manager                        | Proyecto/periodo, autor, trabajo, incidencias, próxima acción, seguridad, prueba, aprobación                        | Recibos pendientes como criterio de revisión; desaparecen filtros de reembolso que el servidor no le permite consultar. My Pay continúa limitado a sí mismo.                                                                        |
| Cliente, mediante documento autorizado | Empresa/proyecto, periodo, trabajador, fecha, horas, actividades y versión/conformidad                              | Selección técnica por alcance real y revisado; advertencia clara de que el informe de cliente no contiene importes. No se crea portal público.                                                                                      |
| Finance / Owner, ledger                | Factura, cliente, proyecto, emisión, vencimiento, moneda, base, impuesto, total, coste, pagos, reversos y saldo     | Identificadores de proyecto/cliente, periodo de servicio, PO, fecha prevista de cobro, fecha de referencia del saldo, días vencidos y tramo de antigüedad en exportación; vencimiento/aging visibles también en escritorio y móvil. |
| Auditor                                | Vistas autorizadas de solo lectura y evidencia histórica                                                            | Contexto explícito de lectura; no se otorga autoridad de generación, pago, edición ni exportación restringida.                                                                                                                      |

Los campos de factura fiscal, identidad del emisor, impuestos, numeración y remesa ya forman parte
de las plantillas/configuración. Se mantienen como datos aportados y validados por J&A. Los nuevos
campos de cobro son información de gestión; no alteran el contenido legal congelado de la factura.

UX aplicada: etiquetas persistentes, agrupación por tarea/destinatario, importes de cada moneda
separados, enlaces desde cada tramo al detalle, controles táctiles y tarjetas en móvil, estados
expresados con texto además de color, traducciones EN/ES/PT. Los filtros se preservan en la URL y
la descarga usa el mismo predicado que el registro de cobros.

La inspección visual detectó un segundo filtro local del listado de cobros que no afectaba a
resúmenes ni descargas. Se elimina únicamente esa capa duplicada, incluidos sus valores antiguos
guardados en la sesión; se mantienen ordenación y paginación. Los demás listados conservan su
comportamiento predeterminado. Gastos ya utiliza su única capa de filtros operativos.

## Semántica de los nuevos datos

- Aging: fecha de vencimiento frente al día UTC mostrado. Vence hoy = no vencido. Tramos inclusivos
  1–30, 31–60, 61–90 y >90 días. Un pago parcial conserva el saldo vencido aunque su etiqueta sea
  `partially_paid`. Sin vencimiento válido se muestra como «sin fecha», nunca como cobrado.
- Totales: deuda bruta positiva, saldos acreedores negativos y saldo neto, separados por moneda.
  Una nota de abono emitida es una fila negativa independiente: se conserva junto a la factura
  original para conciliar el neto. Los abonos no se asignan artificialmente a un vencimiento; la
  antigüedad muestra deuda bruta y un tramo separado de créditos. El filtro de saldos pendientes
  incluye ambos signos, excluyendo solo saldos cero y anulaciones. Sin conversión FX implícita.
- Exportación desde el registro: saldo actual, incluidos los pagos posteriores a la emisión.
  Las peticiones explícitas del API con periodo histórico conservan el corte histórico existente.
  La previsión actual de cobro no se añade a una exportación histórica.
- Los abonos negativos conservan su condición de emitidos, no de cobrados; su margen porcentual
  individual o agregado con base negativa se muestra como no aplicable. La fecha efectiva de
  anulación determina si el documento pertenece a un corte histórico. Los paquetes contables
  solo admiten saldos negativos sustentados por abonos con autoridad documental válida y sin
  cobros/reversos; los sobrecobros y los ajustes no acreditados siguen rechazándose.
- Justificante «adjunto» indica presencia de referencia documental autorizada, no una certificación
  de autenticidad ni del estado del análisis del archivo. La descarga mantiene sus validaciones.
- La corrección de paquetes contables acreedores requiere la migración 48: habilitar totales
  firmados en el registro de snapshots sin cambiar ningún valor, documento o hash preexistente.
  Se conservan las identidades, relaciones, ecuaciones de conciliación y controles de inmutabilidad.
  Su aceptación exige actualización poblada desde 47, integridad/FK y ensayo en copia de producción.
- La validación de informes técnicos seleccionados se repite en el servidor: solo aprobados o
  bloqueados, del proyecto y periodo elegidos. El modo interno que incluye toda la actividad
  conserva su visibilidad preexistente de pendientes; el informe de cliente sigue filtrando lo revisado.

## Evidencia y estado

Actualización publicada y desplegada: código `2bb50b2`, 18/09/2026 a las 19:32:45 UTC.
El [recibo de producción](PRODUCTION_DEPLOYMENT_2026-09-18_ERP_REVIEW.md) registra backup,
integridad, conservación de facturas, salud, jobs y limpieza de caché.

- Migración 48: 2/2 pruebas; contrato de migraciones B5: 14/14.
- Ciclo de facturas, autoridad del paquete contable y selección técnica: 57/57 pruebas.
- Ensayo sobre copia aislada de producción, 18:24 UTC: esquema 47 → 48, 163 tablas y 251.006
  filas previas conservadas por comparación de hashes; incluye el snapshot contable real.
  Se conservan 387 triggers; integridad `ok`, cero errores de claves foráneas. No se escribe en
  producción y se elimina la copia temporal al terminar.
- Revisión independiente: ningún bloqueante de código pendiente. La publicación queda
  condicionada a regresiones, compilación, backup y verificación operativa.
- Primera regresión general: 153 archivos, 1.009 casos aprobados y 10 fallos detectados.
  Se corrigen las etiquetas ausentes del catálogo y el ejemplo de duración del proveedor.
  Las expectativas antiguas de esquema, manuales, prioridad y fecha real de pago se actualizan
  contra sus implementaciones existentes, conservando los controles de permisos y dinero exacto.
  Los 22 casos de PDF ya pasan al verificar estados completos en orden de lectura del PDF;
  no se ha cambiado el renderizador ni se han eliminado comprobaciones de traducción.
- Cierre de regresiones: repetición de 66 archivos con 485 casos aprobados y una expectativa
  antigua de etiqueta pendiente; corregida y aprobada en la repetición final de 12/12 casos.
  Los diez fallos de la pasada general quedan resueltos sin exclusiones nuevas.
- Integración completa y artefactos: 69 archivos, 514 casos aprobados y tres contratos antiguos
  detectados; los tres quedan corregidos y pasan dentro de esos 12/12 casos finales. Se conserva
  la distinción entre liquidación y pago, el control de tareas y la unicidad del flujo comercial.
- Typecheck secuencial de todo el workspace y ESLint completos: aprobados. La revisión
  independiente adicional confirma que las correcciones de pruebas no relajan los invariantes.
- Accesibilidad estructural, listado y aislamiento offline entre usuarios: 18/18 casos finales.
- Navegador, compilación final: 61 aprobados y tres contratos antiguos de aceptación corregidos
  y aprobados en repetición dirigida (3/3). Quedan cubiertos los 64 casos aplicables; se conservan
  las 12 exclusiones de viewport preexistentes, sin añadir ninguna. Las 48 comprobaciones de las mejoras
  ERP, filtros, informes por rol y accesibilidad pasan en 360, 390, 768 y 1440 px.
  Las [capturas representativas](evidence/erp-review-20260918/README.md) proceden de datos
  sintéticos aislados, no de registros privados de producción.
- Las tres correcciones de aceptación siguen la identidad de factura tras su cambio de prioridad,
  la clave idempotente que incorpora la selección de contenido del informe y los controles/textos
  actuales de la cuenta Worker. No cambian reglas de negocio ni eliminan comprobaciones de privacidad.
- Producción: esquema 48, integridad correcta, cero errores FK, nueve snapshots emitidos y
  14 registros de factura conservados; backup de 50 documentos verificado, dos ciclos automáticos
  sin fallos nuevos y servicios saludables. Caché Docker final 0 B; 6,917 GB liberados.

Límites: un pago registrado entre la carga de pantalla y la descarga puede cambiar el saldo
actual; no se promete una captura atómica entre dos peticiones. Los estados heredados `credited`
sin fecha efectiva no permiten reconstrucción histórica completa; los abonos emitidos como
ajustes sí conservan su procedencia. No se asignan créditos automáticamente a facturas.

## Ampliación solicitada: QuickBooks

El análisis posterior de QuickBooks y la implementación de planificación de cobros están en
[QuickBooks y mejoras del ERP](QUICKBOOKS_REVIEW_2026-09-18.md), con evidencia y recibo de
producción propios. Esta ampliación conserva las decisiones financieras y de privacidad de
esta revisión; no conecta automáticamente una empresa de Intuit.
