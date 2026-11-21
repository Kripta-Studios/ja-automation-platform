# Navegación y tareas por perfil

Revisión del 21 de noviembre de 2026 sobre `0e140de2`. Las etiquetas de menú reproducen el original inglés para facilitar su localización. La cuadrilla depende de una delegación vigente sobre un proyecto. El cliente figura como entidad comercial y firmante, sin perfil de acceso propio.

## Destinos del menú

| Perfil | Principal | Más, cuenta y accesos globales |
| --- | --- | --- |
| Titular | Home, Approve, Time, Expenses, Projects, Invoices | Clients, Team, Suppliers, Planning, Crew hours, Documents, Reports, Money, Payments, Rates, Accounting, Profile, Data management, Audit, Notifications |
| Otro administrador | Home, Approve, Time, Expenses, Projects, Invoices | Clients, Team, Suppliers, Planning, Crew hours, Documents, Reports, Money, Payments, Rates, Accounting, Profile, Data management, Audit, Notifications |
| Finanzas | Home, Money, Projects, Invoices, Payments | Approve, Accounting, Rates, Documents, Profile, Notifications |
| Responsable de proyecto | Home, Approve, Time, Expenses, Projects | Team, Planning, Reports, Documents, My Pay, Profile, Notifications |
| Operario | Today, Time, Expenses, Reports | Crew hours, My Pay, Profile, Notifications |
| Auditor | Money, Projects, Time, Expenses, Invoices, Payments | Detailed analysis, Accounting, Profile, Audit, Notifications |
| Coordinación de proveedor | Supplier team, Time, Crew hours, Expenses, Reports | Operational report, Profile, Help |
| Técnico externo | Time, Expenses, Reports | Operational report, Profile, Help |

## Catálogo del asistente de navegación

Estas 124 tareas se obtienen de `assistantTasks` y su proyección efectiva con `tasksForContext`. Los permisos para actuar dependen además del proyecto, titularidad del registro, delegación, estado y configuración. La tabla indica descubribilidad desde el asistente. La cobertura en navegador se documenta en el informe de pruebas.

| Tarea | Perfiles a los que se ofrece | Destino |
| --- | --- | --- |
| Completar mi jornada | Operario | `/app/workflow/capture` |
| Trabajo pendiente de tu decisión | Titular, Otro administrador, Finanzas, Responsable de proyecto | `/app/workflow?view=review` |
| Listo para facturar | Titular, Otro administrador, Finanzas | `/app/workflow?view=billing` |
| Seguimiento de evidencias y entrega | Titular, Otro administrador, Finanzas, Responsable de proyecto, Operario | `/app/workflow` |
| Crear un proyecto nuevo | Titular, Otro administrador, Finanzas | `/app/projects?action=new-project#new-project` |
| Ver proyectos | Titular, Otro administrador, Finanzas, Responsable de proyecto | `/app/projects#project-register` |
| Editar un proyecto | Titular, Otro administrador | `/app/projects#project-register` |
| Cambiar estado del proyecto | Titular, Otro administrador, Finanzas | `/app/projects#project-register` |
| Abrir eliminación de proyecto | Titular, Otro administrador, Finanzas | `/app/projects#project-register` |
| Ver equipo del proyecto | Titular, Otro administrador, Finanzas, Responsable de proyecto | `/app/projects#project-register` |
| Asignar persona al proyecto | Titular, Otro administrador | `/app/projects?action=assign-worker` |
| Editar asignación del proyecto | Titular, Otro administrador | `/app/projects?action=update-assignment` |
| Retirar asignación del proyecto | Titular, Otro administrador | `/app/projects?action=remove-assignment` |
| Asignar un trabajador | Responsable de proyecto | `/app/projects?action=assign-worker` |
| Editar asignación de trabajador | Responsable de proyecto | `/app/projects?action=update-assignment` |
| Retirar asignación de trabajador | Responsable de proyecto | `/app/projects?action=remove-assignment` |
| Crear un cliente | Titular, Otro administrador, Finanzas | `/app/projects?view=clients&action=new-client#new-client` |
| Ver directorio de clientes | Titular, Otro administrador, Finanzas | `/app/projects?view=clients#client-directory-list` |
| Editar datos del cliente | Titular, Otro administrador, Finanzas | `/app/projects?view=clients&action=update-client` |
| Abrir estado y eliminación de cliente | Titular, Otro administrador, Finanzas | `/app/projects?view=clients#client-directory-list` |
| Gestionar contactos del cliente | Titular, Otro administrador, Finanzas | `/app/projects#client-contact-create` |
| Buscar especialistas del equipo | Titular, Otro administrador, Responsable de proyecto | `/app/projects?view=team&directory=specialists#team-search` |
| Crear acceso de usuario | Titular | `/app/projects?view=team&directory=specialists&assistantPane=team-create#assistant-team-create` |
| Invitar miembro del equipo | Titular | `/app/projects?view=team&directory=specialists&assistantPane=team-invite#team-create-user-form` |
| Activar o suspender cuenta del equipo | Titular | `/app/projects?view=team&directory=specialists#team-panel-specialists` |
| Editar perfil laboral y proveedor | Titular | `/app/projects?view=team&directory=specialists#team-panel-specialists` |
| Ver buzones de empresa | Titular | `/app/projects?view=team&directory=mailboxes#team-panel-mailboxes` |
| Crear buzón de empresa | Titular | `/app/projects?view=team&directory=mailboxes&assistantPane=mailbox-create#create-mailbox-sheet-form` |
| Habilitar acceso desde buzones | Titular | `/app/projects?view=team&directory=mailboxes#team-panel-mailboxes` |
| Cambiar rol de cuenta de correo | Titular | `/app/projects?view=team&directory=mailboxes#team-panel-mailboxes` |
| Cambiar contraseña del buzón | Titular | `/app/projects?view=team&directory=mailboxes#team-panel-mailboxes` |
| Abrir eliminación de buzón | Titular | `/app/projects?view=team&directory=mailboxes#team-panel-mailboxes` |
| Ver proveedores | Titular, Otro administrador | `/app/supplier?workspaceAction=directory#supplier-workspace` |
| Crear proveedor | Titular, Otro administrador | `/app/supplier?workspaceAction=setup#supplier-workspace` |
| Editar datos y estado del proveedor | Titular, Otro administrador | `/app/supplier?workspaceAction=directory#supplier-workspace` |
| Autorizar proveedor en proyecto | Titular, Otro administrador | `/app/supplier?workspaceAction=authorize#supplier-workspace` |
| Gestionar personal del proveedor | Titular, Otro administrador, Coordinación de proveedor | `/app/supplier?workspaceAction=personnel#supplier-workspace` |
| Registrar horas del proveedor | Titular, Otro administrador, Coordinación de proveedor | `/app/supplier?workspaceAction=time#supplier-workspace` |
| Ver informe operativo del proveedor | Titular, Otro administrador, Coordinación de proveedor | `/app/supplier?workspaceAction=report#supplier-workspace` |
| Ver informe operativo propio del proveedor | Coordinación de proveedor, Técnico externo | `/app/supplier/report#supplier-report` |
| Asignar jefe de equipo | Titular, Otro administrador | `/app/crew#crew-assign` |
| Registrar horas del equipo delegado | Operario | `/app/crew#crew-date` |
| Registrar gastos del equipo delegado | Operario | `/app/crew#crew-project` |
| Registrar horas | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/time?action=log-time` |
| Ver partes de horas | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/time#time-records` |
| Registrar semana de horas en tabla | Titular, Otro administrador | `/app/time?batch=1#time-owner-batch-title` |
| Editar o corregir parte de horas | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/time#time-records` |
| Enviar horas para aprobación | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/time#time-records` |
| Abrir eliminación de borrador de horas | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/time#time-records` |
| Registrar un gasto | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/expenses?action=record-expense` |
| Ver gastos y recibos | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/expenses#expense-records` |
| Registrar o enviar gastos semanales | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/expenses#expense-records` |
| Editar o corregir un gasto | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/expenses#expense-records` |
| Enviar gasto para aprobación | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/expenses#expense-records` |
| Abrir eliminación de borrador de gasto | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/expenses#expense-records` |
| Crear informe diario | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/reports?view=daily#report-panel-daily` |
| Crear informe técnico PLC | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/reports?view=technical#report-panel-technical` |
| Ver informes | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/reports?view=daily#report-panel-daily` |
| Editar o corregir informe | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/reports?view=daily#report-panel-daily` |
| Enviar informe para aprobación | Titular, Otro administrador, Responsable de proyecto, Operario, Coordinación de proveedor, Técnico externo | `/app/reports?view=daily#report-panel-daily` |
| Generar informes de período y firma del cliente | Titular, Otro administrador, Responsable de proyecto | `/app/reports?view=signoff#report-panel-signoff` |
| Abrir controles de firma de informe | Titular, Otro administrador, Responsable de proyecto | `/app/reports?view=signoff#report-panel-signoff` |
| Revisar y aprobar horas | Titular, Otro administrador, Finanzas, Responsable de proyecto | `/app/approvals?tab=time#approval-queue` |
| Revisar y aprobar gastos operativos | Titular, Otro administrador, Finanzas, Responsable de proyecto | `/app/approvals?tab=expenses#approval-queue` |
| Revisar aprobación financiera de horas y gastos | Titular, Otro administrador, Finanzas | `/app/approvals?tab=time#approval-queue` |
| Revisar y aprobar informes | Titular, Otro administrador, Finanzas, Responsable de proyecto | `/app/approvals?tab=reports#approval-queue` |
| Configurar política comercial del proyecto | Titular, Otro administrador, Finanzas | `/app/projects#project-register` |
| Configurar condiciones comerciales por persona | Titular, Otro administrador, Finanzas | `/app/projects#project-register` |
| Configurar facturación del proyecto | Titular, Otro administrador, Finanzas | `/app/projects#project-register` |
| Ver informes y archivos del proyecto | Titular, Otro administrador, Responsable de proyecto | `/app/projects#project-register` |
| Gestionar hitos del proyecto | Titular, Otro administrador | `/app/projects#project-milestone-create` |
| Actualizar calendario del proyecto | Titular, Otro administrador | `/app/projects#project-schedule-update` |
| Abrir cierre del proyecto | Titular, Otro administrador, Finanzas | `/app/projects#project-register` |
| Ver cálculo económico del proyecto | Titular, Otro administrador, Finanzas | `/app/projects#project-register` |
| Configurar emisor del proyecto | Titular, Otro administrador, Finanzas | `/app/finance?view=commercial&task=Project%20issuing%20authority` |
| Configurar política comercial y de horas | Titular, Otro administrador, Finanzas | `/app/finance?view=commercial&task=Project%20commercial%20and%20time%20policy` |
| Configurar políticas de reembolso de gastos | Titular, Otro administrador, Finanzas | `/app/finance?view=commercial&task=Person%20expense%20policies` |
| Crear regla de remuneración | Titular, Otro administrador, Finanzas | `/app/finance?view=commercial&task=Worker%20compensation` |
| Revisar reglas de remuneración | Titular, Otro administrador, Finanzas | `/app/finance?view=commercial&task=Compensation%20statement%20rules` |
| Crear tarifa de mano de obra del cliente | Titular, Otro administrador, Finanzas | `/app/finance?view=commercial&task=Client%20labor%20rate` |
| Revisar tarifas del cliente | Titular, Otro administrador, Finanzas | `/app/finance?view=commercial&task=Client%20labor%20rates` |
| Crear regla de coste interno | Titular, Otro administrador, Finanzas | `/app/finance?view=commercial&task=Internal%20loaded%20cost` |
| Revisar presupuesto y coste interno | Titular, Otro administrador, Finanzas | `/app/finance?view=commercial&task=Assignment%20budget%20context%20%2F%20internal%20loaded%20cost` |
| Liquidar remuneración del trabajador | Titular, Otro administrador, Finanzas | `/app/finance?view=commercial&task=Settlement%20status` |
| Ver previsión financiera y presupuestos | Titular, Otro administrador, Finanzas, Auditor | `/app/finance?view=overview#finance-alerts` |
| Revisar registros económicos de origen | Titular, Otro administrador, Finanzas, Auditor | `/app/finance?view=economic#finance-source-records` |
| Registrar o revertir pago de remuneración | Titular, Otro administrador, Finanzas | `/app/finance?view=economic&source=settlements#worker-payments` |
| Registrar reembolso del trabajador | Titular, Otro administrador, Finanzas | `/app/finance?view=economic&source=expenses#finance-source-records` |
| Crear borrador de factura | Titular, Otro administrador, Finanzas | `/app/billing?view=invoices` |
| Ver facturas | Titular, Otro administrador, Finanzas | `/app/billing?view=invoices` |
| Editar datos del borrador de factura | Titular, Otro administrador, Finanzas | `/app/billing?view=invoices` |
| Aprobar una factura | Titular, Otro administrador, Finanzas | `/app/billing?view=invoices` |
| Emitir una factura | Titular, Otro administrador, Finanzas | `/app/billing?view=invoices` |
| Recalcular factura aprobada | Titular, Otro administrador | `/app/billing?view=invoices` |
| Abrir anulación de factura | Titular, Otro administrador | `/app/billing?view=invoices` |
| Abrir abono o ajuste de factura | Titular, Otro administrador, Finanzas | `/app/billing?view=invoices` |
| Abrir eliminación de borrador de factura | Titular, Otro administrador, Finanzas | `/app/billing?view=invoices` |
| Enviar factura por correo al cliente | Titular, Otro administrador, Finanzas | `/app/billing?view=invoices` |
| Registrar pago de factura del cliente | Titular, Otro administrador, Finanzas | `/app/billing?view=invoices` |
| Revertir pago del cliente | Titular, Otro administrador, Finanzas | `/app/billing?view=invoices` |
| Ver y editar flujos de facturación | Titular, Otro administrador, Finanzas | `/app/billing?view=streams` |
| Crear flujo de facturación | Titular, Otro administrador, Finanzas | `/app/billing?view=setup&setup=stream#billing-setup-workspace` |
| Configurar emisor y documentos de factura | Titular, Otro administrador | `/app/billing?view=setup&setup=entity#billing-setup-workspace` |
| Configurar perfiles fiscales | Titular, Otro administrador, Finanzas | `/app/billing?view=setup&setup=tax#billing-setup-workspace` |
| Configurar numeración de facturas | Titular, Otro administrador | `/app/billing?view=setup&setup=numbering#billing-setup-workspace` |
| Ver cobros y libro mayor | Titular, Otro administrador, Finanzas, Auditor | `/app/ledger#collections-ledger-register` |
| Registrar seguimiento de cobros | Titular, Otro administrador, Finanzas | `/app/ledger#collections-ledger-register` |
| Generar paquete contable mensual | Titular, Otro administrador, Finanzas | `/app/accounting#accounting-generate` |
| Ver y descargar paquetes contables | Titular, Otro administrador, Finanzas, Auditor | `/app/accounting#accounting-register` |
| Finalizar paquete contable y cerrar período | Titular, Otro administrador, Finanzas | `/app/accounting#accounting-register` |
| Ver pagos propios y exportar estado | Responsable de proyecto, Operario | `/app/pay#pay-export-title` |
| Ver estado de reembolsos propios | Responsable de proyecto, Operario | `/app/pay#pay-reimbursements-title` |
| Registrar documento privado | Titular, Otro administrador, Finanzas, Responsable de proyecto | `/app/documents#document-upload` |
| Ver y descargar documentos privados | Titular, Otro administrador, Finanzas, Responsable de proyecto | `/app/documents#document-list` |
| Abrir archivo y eliminación de documentos | Titular, Otro administrador | `/app/documents#document-list` |
| Ver planificación del trabajo | Titular, Otro administrador, Responsable de proyecto | `/app/planning#planning-day-agenda` |
| Publicar asignación de planificación | Titular, Otro administrador, Responsable de proyecto | `/app/planning#planning-create-form` |
| Gestionar competencias de trabajadores | Titular, Otro administrador | `/app/planning#planning-skills` |
| Indicar competencias y disponibilidad propias | Titular, Otro administrador, Responsable de proyecto, Operario | `/app/profile#profile-skills` |
| Abrir perfil y seguridad de cuenta | Titular, Otro administrador, Finanzas, Responsable de proyecto, Operario, Auditor, Coordinación de proveedor, Técnico externo | `/app/profile#account-mfa` |
| Ver y marcar notificaciones personales | Titular, Otro administrador, Finanzas, Responsable de proyecto, Operario, Auditor | `/app/notifications` |
| Abrir ayuda y manuales | Titular, Otro administrador, Finanzas, Responsable de proyecto, Operario, Auditor, Coordinación de proveedor, Técnico externo | `/app/help` |
| Ver historial de auditoría | Titular, Otro administrador, Auditor | `/app/audit` |
| Abrir gestión de datos operativos | Titular, Otro administrador | `/app/manage` |
