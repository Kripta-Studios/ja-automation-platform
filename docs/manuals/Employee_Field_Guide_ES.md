# Guía de campo para empleados — revisión 2026-09-11

**Cuentas externas:** Los responsables de proveedor y técnicos externos tienen acceso solo operativo. My Pay, gastos y procedimientos financieros corresponden a cuentas Worker estándar. Consulta «Proveedores y cuentas sin acceso financiero» para tu flujo.

> Usa solo la dirección del portal y el contacto de soporte admin@j-aautomation.com. Esta guía usa ejemplos sintéticos. No compartas contraseña, código MFA, código de recuperación, recibo ni sesión.

## 1. Inicia sesión con tu invitación

Elige inglés, español o portugués con el selector de idioma del acceso o del portal. El inglés es el idioma por defecto cuando no hay una preferencia guardada. Tu elección se conserva en este navegador al recargar, cerrar sesión y volver a entrar.

Si la invitación está vinculada a un buzón corporativo, ábrela desde ese buzón e inicia sesión con la cuenta indicada en el mensaje. Si eres un trabajador externo, usa el enlace de invitación de un solo uso para crear tu cuenta. No hay registro público. Si necesitas ayuda con el acceso o la contraseña, utiliza admin@j-aautomation.com; no adivines una dirección de correo ni un teléfono.

MFA es opcional. Si decides activarlo, abre **Perfil (Profile)** y selecciona **Activar MFA (Enable MFA)**. Guarda los códigos de recuperación de un solo uso en privado, introduce el código del autenticador y selecciona **Verificar MFA (Verify MFA)**. El trabajo normal en el portal no requiere una solicitud adicional de verificación. Nunca envíes una contraseña, un código ni una sesión a otra persona.

## 2. Hoy (Today) y el proyecto correcto

Empieza en **Hoy (Today)** y elige únicamente el proyecto donde ocurrió el trabajo. Si no aparece, pide a un responsable que revise tu asignación; no registres horas ni gastos en otro proyecto. En un dispositivo compartido, termina con **Cerrar sesión (Sign out)**.

## 3. Registra el trabajo y el viaje reales

En **Tiempo (Time)**, indica la fecha de servicio, la actividad y la duración real, y guarda el borrador. Un mínimo del cliente o una jornada planificada de diez horas nunca cambia el tiempo real que declaras. Registra el viaje por separado cuando el proyecto lo permita; el pago del viaje y la facturación al cliente pueden tener reglas distintas. Revisa fecha, duración y descripción factual antes de enviarlo.

Borrador permite revisar. Enviado espera revisión. Si un revisor lo devuelve, lee el motivo y envía la corrección solicitada. Un registro aprobado permanece en el historial: usa el flujo de corrección con un motivo y deja que el revisor autorizado lo actualice. No borres, dupliques ni sobrescribas horas aprobadas.

## 4. Gastos, carga de recibos y archivos privados

En **Gastos (Expenses)**, selecciona proyecto, fecha de servicio, categoría, importe, moneda y el pagador real. Selecciónate solo si realmente pagaste el gasto. Adjunta un recibo JPEG, PNG o PDF legible y comprueba que se vea completo antes de enviarlo. Conserva el original hasta confirmar la carga.

Si falla la carga, queda pendiente de análisis/cuarentena o se rechaza, lee el mensaje del portal, comprueba el tipo de archivo y la conexión y vuelve a intentarlo desde el mismo borrador. Si el estado no está claro, actualiza **Gastos (Expenses)** y compruébalo antes de volver a cargar; así evitas duplicados. No declares una compra pagada por la empresa como anticipo personal ni subas pruebas alteradas. Los documentos y descargas del proyecto siguen siendo privados y dependen del rol; un enlace no concede acceso.

## 5. Informes (Reports): Diario (Daily) y PLC / Técnico (PLC / Technical)

Usa **Informes (Reports)** para el informe que requiera el trabajo. **Diario (Daily)** registra un resumen factual de campo. **PLC / Técnico (PLC / Technical)** registra el sistema, el trabajo realizado, la validación, los riesgos pendientes y los adjuntos permitidos. Mantén los datos técnicos exactos y no indiques que una prueba funcionó si no fue así. La aceptación del cliente es una acción separada y sin importes; nunca firmes por el cliente.

## 6. Mi pago (My Pay) y el estado del pago

**Mi pago (My Pay)** es tu vista privada y muestra solo tu compensación y tus gastos reembolsables. Un importe **estimado** es un cálculo de trabajo. **Aprobado** significa que la revisión autorizada aceptó el importe. **Programado** significa que hay un pago previsto para la fecha esperada indicada. **Pagado** significa que el registro tiene una fecha real de pago; una fecha programada no demuestra que se haya pagado. Consulta al administrador si no entiendes un estado, una fecha esperada o una fecha real.

Este estado privado no es una nómina ni un documento fiscal. Nunca deduzcas una tarifa del cliente ni la paga de otra persona a partir de él o de una factura del cliente.

## 7. Conexión y captura sin conexión

Usa la captura sin conexión solo si el portal indica que está habilitada. Protege el dispositivo, vuelve a conectarte y confirma que aparece el estado guardado o sincronizado antes de cerrar sesión. Si está deshabilitada, espera conexión y reintenta desde el portal sin crear un registro duplicado.

## 8. Ayuda, bandeja de actividad y límites de acceso

Abre **Ayuda (Help)** para descargar la guía asignada a tu rol. La **Bandeja de actividad (Activity Inbox)** en `/app/notifications` puede enlazar a un registro permitido; leer una notificación no es aprobarla. Los trabajadores usan solo sus proyectos asignados, sus registros, sus archivos y My Pay. Finanzas, Facturación, Contabilidad, Auditoría, seguimiento del personal, Closeout y colas de aprobación no son flujos de Worker; una denegación de acceso es un límite, no un error que debas sortear. El correo no es el registro del sistema: usa el portal y admin@j-aautomation.com.

## Proveedores y cuentas sin acceso financiero

El Owner elige al responsable del proveedor y autoriza cada instalación y sus fechas. Una instalación corresponde a un proyecto de la app. El proveedor no puede darse permisos de administración, finanzas o aprobación.

Para el Owner: entra en **Proveedores**, añade el proveedor, selecciona una cuenta Worker existente y guarda el perfil **Responsable de proveedor** o **Técnico externo**. Autoriza la instalación para el responsable elegido. Cambiar el perfil cierra las sesiones de esa cuenta; la persona debe volver a entrar. Retirar una autorización bloquea el siguiente acceso de ese responsable, incluidas sus propias horas e informes de esa instalación. El Owner gestiona por separado las asignaciones de los técnicos y los permisos de otros responsables.

Para el responsable: abre **Equipo de mi proveedor**, elige la instalación y pulsa **Añadir técnico**. Introduce nombre, correo opcional y fechas de asignación. Se crea una ficha sin contraseña ni envío de invitación. **Asignar técnico existente** permite incorporar a alguien que ya pertenece a tu proveedor. El Owner configura las cuentas existentes que necesitan iniciar sesión.

En **Registrar horas del equipo**, selecciona el técnico e introduce la fecha real, categoría, minutos y trabajo realizado. Guarda el borrador, compruébalo y envíalo a J&A. Las horas pertenecen al técnico; el responsable queda identificado como autor. J&A revisa y aprueba por el flujo habitual. El proveedor no aprueba sus propias horas. Si se devuelven como **needs_changes**, crea un borrador de corrección, edítalo y envíalo, conservando el original. Un registro rechazado requiere un nuevo borrador.

En **Informe operativo**, filtra instalación y fechas, consulta estados, descarga CSV o imprime/guarda PDF desde el navegador. El historial permanece visible; los registros rechazados, anulados o sustituidos no incrementan el total efectivo. El informe no acredita pagos ni aceptación del cliente.

El Técnico externo solo ve sus propias horas e informes operativos. El Responsable de proveedor y el Técnico externo no tienen My Pay, tarifas, gastos, documentos financieros ni exportaciones financieras. Las instrucciones sobre gastos y pagos de esta guía corresponden a cuentas Worker estándar. Los informes del proveedor no incluyen importes. Si falta una instalación o un técnico, pide al Owner que revise la asignación.
