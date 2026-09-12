import { explicitCoverageLiterals } from './coverage-literals';

/**
 * User-facing literals that predate the typed catalog are covered here while
 * their components are migrated to semantic keys. Every registered literal is
 * backed by an explicit translation entry (or a deliberate semantic message
 * renderer for action keys); free text never enters this catalog.
 */

const exact: Record<string, readonly [string, string]> = {
  Corrections: ['Correcciones', 'Correções'],
  'No records found': ['No se encontraron registros', 'Nenhum registro encontrado'],
  'Upload document': ['Subir documento', 'Enviar documento'],
  'Send the invitation email to this address?': [
    '¿Enviar el correo de invitación a esta dirección?',
    'Enviar o e-mail de convite para este endereço?',
  ],
  'Send the invoice PDF to this address?': [
    '¿Enviar el PDF de la factura a esta dirección?',
    'Enviar o PDF da fatura para este endereço?',
  ],
  'Choose an option': ['Elige una opción', 'Escolha uma opção'],
  'No, do not send email': ['No, no enviar correo', 'Não, não enviar e-mail'],
  'Yes, send this email': ['Sí, enviar este correo', 'Sim, enviar este e-mail'],
  'action.billing.invoiceEmail.declined': ['Correo no enviado', 'E-mail não enviado'],
  'Email not sent': ['Correo no enviado', 'E-mail não enviado'],

  'PLC report required': ['Informe de PLC obligatorio', 'Relatório de PLC obrigatório'],
  'PLC report': ['Informe de PLC', 'Relatório de PLC'],
  'action.closeout.draftPrepared': [
    'Borrador de cierre preparado.',
    'Rascunho de encerramento preparado.',
  ],
  'action.closeout.draftRefreshed': [
    'Borrador de cierre actualizado; revisa y confirma la nueva instantánea del cliente.',
    'Rascunho de encerramento atualizado; revise e confirme o novo instantâneo do cliente.',
  ],
  'action.closeout.clientSnapshotConfirmed': [
    'Instantánea exacta del cliente confirmada.',
    'Instantâneo exato do cliente confirmado.',
  ],
  'action.closeout.packagesFinalized': [
    'Paquetes de cierre finalizados.',
    'Pacotes de encerramento finalizados.',
  ],
  'action.closeout.reopened': ['Cierre reabierto.', 'Encerramento reaberto.'],
  'action.reports.periodFollowupRecorded': [
    'Seguimiento del período registrado.',
    'Acompanhamento do período registrado.',
  ],
  'action.success': ['Cambios guardados.', 'Alterações salvas.'],
  'PLC / TECHNICAL REPORT': ['PLC / INFORME TÉCNICO', 'PLC / RELATÓRIO TÉCNICO'],
  'PO / PROJECT BUDGET': [
    'ORDEN DE COMPRA / PRESUPUESTO DEL PROYECTO',
    'ORDEM DE COMPRA / ORÇAMENTO DO PROJETO',
  ],
  'action.billing.invoicePlanningDatesSaved': [
    'Fechas previstas de la factura guardadas.',
    'Datas previstas da fatura salvas.',
  ],
  'action.finance.compensationExpectedPaymentSaved': [
    'Fecha prevista de pago al trabajador guardada.',
    'Data prevista de pagamento ao trabalhador salva.',
  ],
  'action.finance.compensationPaymentRecorded': [
    'Pago real de compensación registrado.',
    'Pagamento real de remuneração registrado.',
  ],
  'action.finance.compensationPaymentReversed': [
    'Pago de compensación revertido con trazabilidad.',
    'Pagamento de remuneração revertido com rastreabilidade.',
  ],
  'action.validation.compensationPayment': [
    'Revisa los campos del pago real.',
    'Revise os campos do pagamento real.',
  ],
  'action.validation.compensationPaymentReversal': [
    'Revisa la fecha y el motivo de la reversión.',
    'Revise a data e o motivo da reversão.',
  ],
  'action.finance.expenseClassified': [
    'Clasificación comercial del gasto guardada.',
    'Classificação comercial da despesa salva.',
  ],
  'action.finance.expensePlanningDatesSaved': [
    'Fechas previstas del gasto guardadas.',
    'Datas previstas da despesa salvas.',
  ],
  'action.finance.projectCommercialPolicySaved': [
    'Política comercial del proyecto guardada.',
    'Política comercial do projeto salva.',
  ],
  'action.validation.compensationSettlementPlanning': [
    'Revisa la fecha prevista de pago al trabajador.',
    'Verifique a data prevista de pagamento ao trabalhador.',
  ],
  'action.validation.expenseCommercialClassification': [
    'Revisa los campos de clasificación comercial del gasto.',
    'Verifique os campos de classificação comercial da despesa.',
  ],
  'action.validation.expensePlanningDates': [
    'Revisa las fechas previstas del gasto.',
    'Verifique as datas previstas da despesa.',
  ],
  'action.validation.invoicePlanningDates': [
    'Revisa las fechas previstas de la factura.',
    'Verifique as datas previstas da fatura.',
  ],
  'action.validation.paymentReversal': [
    'Revisa los datos y el motivo de la anulación del pago.',
    'Verifique os dados e o motivo do estorno do pagamento.',
  ],
  'action.validation.projectCommercialPolicy': [
    'Revisa los campos de la política comercial del proyecto.',
    'Verifique os campos da política comercial do projeto.',
  ],
  'ACCOUNT MFA': ['MFA DE LA CUENTA', 'MFA DA CONTA'],
  'ACCOUNT SECURITY': ['SEGURIDAD DE LA CUENTA', 'SEGURANÇA DA CONTA'],
  'ACTIVITY INBOX · NOTIFICATION': [
    'BANDEJA DE ACTIVIDAD · NOTIFICACIÓN',
    'CAIXA DE ATIVIDADES · NOTIFICAÇÃO',
  ],
  'APPROVED COMPENSATION': ['REMUNERACIÓN APROBADA', 'REMUNERAÇÃO APROVADA'],
  'Activity inbox': ['Bandeja de actividad', 'Caixa de atividades'],
  'Adjustment amount': ['Importe del ajuste', 'Valor do ajuste'],
  'Administration notes': ['Notas de administración', 'Notas de administração'],
  'Already invoiced': ['Ya facturado', 'Já faturado'],
  'Artifact type': ['Tipo de archivo generado', 'Tipo de arquivo gerado'],
  'Assignment ID': ['ID de la asignación', 'ID da atribuição'],
  'Authenticator app': ['Aplicación de autenticación', 'Aplicativo autenticador'],
  'Authenticator code': ['Código de autenticación', 'Código do autenticador'],
  'Budget type': ['Tipo de presupuesto', 'Tipo de orçamento'],
  'CONTRIBUTION MARGIN': ['MARGEN DE CONTRIBUCIÓN', 'MARGEM DE CONTRIBUIÇÃO'],
  'Client labor rate': [
    'Tarifa de mano de obra para el cliente',
    'Tarifa de mão de obra para o cliente',
  ],
  'Client payment': ['Pago del cliente', 'Pagamento do cliente'],
  'Close navigation': ['Cerrar navegación', 'Fechar navegação'],
  'Company card': ['Tarjeta de empresa', 'Cartão da empresa'],
  'Company direct': ['Pago directo de la empresa', 'Pagamento direto da empresa'],
  'DIRECT LABOR COST': ['COSTE DIRECTO DE MANO DE OBRA', 'CUSTO DIRETO DE MÃO DE OBRA'],
  'DRAFT INVOICE': ['FACTURA EN BORRADOR', 'RASCUNHO DE FATURA'],
  'Direct cost': ['Coste directo', 'Custo direto'],
  'EXPECTED DAY': ['JORNADA PREVISTA', 'JORNADA PREVISTA'],
  'EXPENSE · SOURCE RECORD': ['GASTO · REGISTRO DE ORIGEN', 'DESPESA · REGISTRO DE ORIGEM'],
  'Edit draft': ['Editar borrador', 'Editar rascunho'],
  'Enter a recovery code': [
    'Introduce un código de recuperación',
    'Digite um código de recuperação',
  ],
  'Enter your password': ['Introduce tu contraseña', 'Digite sua senha'],
  'FORECAST ETC': ['PREVISIÓN DEL COSTE RESTANTE', 'PREVISÃO DO CUSTO RESTANTE'],
  'Fixed project amount': ['Importe fijo del proyecto', 'Valor fixo do projeto'],
  'Internal loaded cost': ['Coste interno con cargas', 'Custo interno com encargos'],
  'Labor cost': ['Coste de mano de obra', 'Custo de mão de obra'],
  'Loaded cost': ['Coste con cargas', 'Custo com encargos'],
  'OPEN PROJECT →': ['ABRIR PROYECTO →', 'ABRIR PROJETO →'],
  'Open / not closed': ['Abierto / sin cerrar', 'Aberto / não encerrado'],
  'Open Accounting Pack': ['Abrir paquete contable', 'Abrir pacote contábil'],
  'Open private receipt': ['Abrir recibo privado', 'Abrir comprovante privado'],
  'Open project': ['Abrir proyecto', 'Abrir projeto'],
  'Open record →': ['Abrir registro →', 'Abrir registro →'],
  'Open source record': ['Abrir registro de origen', 'Abrir registro de origem'],
  'Open target': ['Abrir destino', 'Abrir destino'],
  'Open week': ['Abrir semana', 'Abrir semana'],
  'PLANNED HOURS': ['HORAS PLANIFICADAS', 'HORAS PLANEJADAS'],
  'Percentage compensation': ['Remuneración porcentual', 'Remuneração percentual'],
  'Primary contact': ['Contacto principal', 'Contato principal'],
  'Primary navigation': ['Navegación principal', 'Navegação principal'],
  'Profile & security': ['Perfil y seguridad', 'Perfil e segurança'],
  'Project Administration': ['Administración del proyecto', 'Administração do projeto'],
  'Project number': ['Número del proyecto', 'Número do projeto'],
  'RECORDED HOURS': ['HORAS REGISTRADAS', 'HORAS REGISTRADAS'],
  'Receipt required': ['Recibo obligatorio', 'Comprovante obrigatório'],
  'Recovery code': ['Código de recuperación', 'Código de recuperação'],
  'Registered private receipt': ['Recibo privado registrado', 'Comprovante privado registrado'],
  'Rule type': ['Tipo de regla', 'Tipo de regra'],
  'SOURCE RECORD': ['REGISTRO DE ORIGEN', 'REGISTRO DE ORIGEM'],
  'Save PLC report': ['Guardar informe de PLC', 'Salvar relatório de PLC'],
  'Save client rate': ['Guardar tarifa del cliente', 'Salvar tarifa do cliente'],
  'Save compensation rule': ['Guardar regla de remuneración', 'Salvar regra de remuneração'],
  'Save internal cost': ['Guardar coste interno', 'Salvar custo interno'],
  'Secure company access.': ['Acceso seguro a la empresa.', 'Acesso seguro à empresa.'],
  'Source ID': ['ID del origen', 'ID da origem'],
  'System type': ['Tipo de sistema', 'Tipo de sistema'],
  'Tax profile': ['Perfil fiscal', 'Perfil fiscal'],
  'Technical / PLC records': ['Registros técnicos / de PLC', 'Registros técnicos / de PLC'],
  'Technical reporting required': ['Informe técnico obligatorio', 'Relatório técnico obrigatório'],
  'Toggle navigation': ['Mostrar u ocultar navegación', 'Mostrar ou ocultar navegação'],
  'Travel / expense': ['Viajes / gastos', 'Viagens / despesas'],
  'Update Client': ['Actualizar cliente', 'Atualizar cliente'],
  'Update Tax Profile': ['Actualizar perfil fiscal', 'Atualizar perfil fiscal'],
  'Update assignment': ['Actualizar asignación', 'Atualizar atribuição'],
  'Use a recovery code': ['Usar un código de recuperación', 'Usar um código de recuperação'],
  'Use authenticator code': ['Usar código de autenticación', 'Usar código do autenticador'],
  'Validation result': ['Resultado de la validación', 'Resultado da validação'],
  'WEEKLY TIMESHEET': ['REGISTRO SEMANAL DE HORAS', 'REGISTRO SEMANAL DE HORAS'],
  'Weekly close enabled': ['Cierre semanal activado', 'Fechamento semanal ativado'],
  'Weekly close required': ['Cierre semanal obligatorio', 'Fechamento semanal obrigatório'],
  'Worker compensation': ['Remuneración del trabajador', 'Remuneração do trabalhador'],
  'Workspace activity': ['Actividad del espacio de trabajo', 'Atividade do espaço de trabalho'],
  'Delete Skill': ['Eliminar competencia', 'Excluir competência'],
  'open assignment': ['abrir asignación', 'abrir atribuição'],
  'workspace access': ['acceso al espacio de trabajo', 'acesso ao espaço de trabalho'],
  'Actual recorded': ['Tiempo real registrado', 'Tempo real registrado'],
  'Customer period report': [
    'Informe del período para el cliente',
    'Relatório do período para o cliente',
  ],
  'Customer report': ['Informe del cliente', 'Relatório do cliente'],
  'Technical reference': ['Referencia técnica', 'Referência técnica'],
  'System reference': ['Referencia del sistema', 'Referência do sistema'],
  'Backup reference': ['Referencia de copia de seguridad', 'Referência de cópia de segurança'],
  'Approved customer document': ['Documento del cliente aprobado', 'Documento do cliente aprovado'],
  'Customer private': ['Privado del cliente', 'Privado do cliente'],
  Operational: ['Operativo', 'Operacional'],
  Private: ['Privado', 'Privado'],
  'Project closeout': ['Cierre del proyecto', 'Encerramento do projeto'],
  Required: ['Obligatorio', 'Obrigatório'],
  'Employee portal': ['Portal del trabajador', 'Portal do trabalhador'],
  'J&A Automation portal': ['Portal de J&A Automation', 'Portal da J&A Automation'],
  'first.last': ['nombre.apellido', 'nome.sobrenome'],
  'For example: BBS Mexico': ['Por ejemplo: BBS México', 'Por exemplo: BBS México'],
  'minor units': ['unidades menores', 'unidades menores'],
  'Delivery uncertain; check mail server before retrying': [
    'Entrega incierta; comprueba el servidor de correo antes de reintentar',
    'Entrega incerta; verifique o servidor de e-mail antes de tentar novamente',
  ],
  'action.billing.invoiceEmail.uncertain': [
    'Entrega incierta; comprueba el servidor de correo antes de reintentar. No hay reintento automático.',
    'Entrega incerta; verifique o servidor de e-mail antes de tentar novamente. Não haverá nova tentativa automática.',
  ],
  'Email sending': ['Enviando correo', 'Enviando e-mail'],
  'action.billing.invoiceEmail.sending': ['El envío está en curso.', 'O envio está em andamento.'],
  'Invoice recipient email': [
    'Correo del destinatario de la factura',
    'E-mail do destinatário da fatura',
  ],
  'Send by email': ['Enviar por correo', 'Enviar por e-mail'],
  'Send the issued PDF by email. Queued is not sent; SMTP acceptance does not confirm inbox delivery.':
    [
      'Envía el PDF emitido por correo. En cola no significa enviado; la aceptación SMTP no confirma la entrega en la bandeja de entrada.',
      'Envie o PDF emitido por e-mail. Na fila não significa enviado; a aceitação SMTP não confirma a entrega na caixa de entrada.',
    ],
  'Accepted by SMTP server': ['Aceptado por el servidor SMTP', 'Aceito pelo servidor SMTP'],
  'Email failed; administrator action required': [
    'Error de correo; requiere intervención del administrador',
    'Falha no e-mail; requer ação do administrador',
  ],
  'Email delivery error; automatic retry pending': [
    'Error de envío; reintento automático pendiente',
    'Erro no envio; nova tentativa automática pendente',
  ],
  'Email queued': ['Correo en cola', 'E-mail na fila'],
  'Mark sent records a manual delivery only. It does not send an email.': [
    'Marcar enviada registra únicamente una entrega manual. No envía ningún correo.',
    'Marcar enviada registra apenas uma entrega manual. Não envia nenhum e-mail.',
  ],
  'action.billing.invoiceEmail.queued': [
    'Correo en cola. Todavía no se ha enviado.',
    'E-mail na fila. Ainda não foi enviado.',
  ],
  'action.billing.invoiceEmail.accepted': [
    'El servidor SMTP aceptó el correo. No confirma entrega en la bandeja de entrada.',
    'O servidor SMTP aceitou o e-mail. Não confirma entrega na caixa de entrada.',
  ],
  'action.billing.invoiceEmail.failed': [
    'El envío falló y requiere intervención del administrador.',
    'O envio falhou e requer ação do administrador.',
  ],
  'action.billing.invoiceEmail.retrying': [
    'Error de envío. El sistema reintentará automáticamente.',
    'Erro no envio. O sistema tentará novamente automaticamente.',
  ],
  'Document access': ['Acceso al documento', 'Acesso ao documento'],
  'Project document': ['Documento del proyecto', 'Documento do projeto'],
  'Finance, Owner and Auditor only': [
    'Solo Finanzas, Propietario y Auditor',
    'Somente Financeiro, Proprietário e Auditor',
  ],
  'Access role': ['Rol de acceso', 'Função de acesso'],
  'Choose the email and role. The invited person sets their own name and password securely.': [
    'Elige el correo y el rol. La persona invitada configura su nombre y contraseña de forma segura.',
    'Escolha o e-mail e a função. A pessoa convidada configura o próprio nome e senha com segurança.',
  ],
  Copied: ['Copiado', 'Copiado'],
  'Copy activation link': ['Copiar enlace de activación', 'Copiar link de ativação'],
  'Copy this private activation link and send it to the invited person.': [
    'Copia este enlace privado de activación y envíaselo a la persona invitada.',
    'Copie este link privado de ativação e envie-o à pessoa convidada.',
  ],
  'Create invitation': ['Crear invitación', 'Criar convite'],
  'Create user': ['Crear usuario', 'Criar usuário'],
  'Create user access': ['Crear acceso de usuario', 'Criar acesso de usuário'],
  'Email / company alias': ['Correo / alias corporativo', 'E-mail / alias corporativo'],
  'Invitation expires': ['Caducidad de la invitación', 'Validade do convite'],
  'Invitation ready': ['Invitación preparada', 'Convite pronto'],
  'SECURE USER PROVISIONING': ['ALTA SEGURA DE USUARIOS', 'PROVISIONAMENTO SEGURO DE USUÁRIOS'],
  'Send the link to the invited person through a trusted channel.': [
    'Envía el enlace a la persona invitada mediante un canal de confianza.',
    'Envie o link à pessoa convidada por um canal confiável.',
  ],
  'The portal creates a single-use activation link.': [
    'El portal crea un enlace de activación de un solo uso.',
    'O portal cria um link de ativação de uso único.',
  ],
  'They choose their name and password before the account becomes active.': [
    'La persona elige su nombre y contraseña antes de que la cuenta se active.',
    'A pessoa escolhe o nome e a senha antes que a conta seja ativada.',
  ],
  'What happens next': ['Qué ocurre después', 'O que acontece depois'],
  day: ['día', 'dia'],
  days: ['días', 'dias'],
  'active projects': ['proyectos activos', 'projetos ativos'],
  Address: ['Dirección', 'Endereço'],
  'AUTHORIZED DIRECTORY': ['DIRECTORIO AUTORIZADO', 'DIRETÓRIO AUTORIZADO'],
  'Active specialists, availability and project assignments.': [
    'Especialistas activos, disponibilidad y asignaciones de proyectos.',
    'Especialistas ativos, disponibilidade e atribuições de projetos.',
  ],
  Assignment: ['Asignación', 'Atribuição'],
  Assignments: ['Asignaciones', 'Atribuições'],
  available: ['disponible', 'disponível'],
  'Authorized client contacts, sites and project context.': [
    'Contactos autorizados del cliente, plantas y contexto de proyecto.',
    'Contatos autorizados do cliente, locais e contexto do projeto.',
  ],
  'Authorized project': ['Proyecto autorizado', 'Projeto autorizado'],
  'Company, contact, phone or site': [
    'Empresa, contacto, teléfono o planta',
    'Empresa, contato, telefone ou local',
  ],
  'Commercial model & owners': [
    'Modelo comercial y responsables',
    'Modelo comercial e responsáveis',
  ],
  'COMMERCIAL OWNERSHIP': ['RESPONSABILIDAD COMERCIAL', 'RESPONSABILIDADE COMERCIAL'],
  Contacts: ['Contactos', 'Contatos'],
  'Project management actions': ['Acciones de gestión de proyectos', 'Ações de gestão de projetos'],
  'Choose one action. The portal will show only the fields needed for that task.': [
    'Elige una acción. El portal mostrará solo los campos necesarios para esa tarea.',
    'Escolha uma ação. O portal mostrará apenas os campos necessários para essa tarefa.',
  ],
  'Account status': ['Estado de la cuenta', 'Status da conta'],
  'Delete this contact?': ['¿Eliminar este contacto?', 'Excluir este contato?'],
  'Edit profile': ['Editar perfil', 'Editar perfil'],
  'Edit team member': ['Editar miembro del equipo', 'Editar membro da equipe'],
  'Remove access': ['Retirar acceso', 'Remover acesso'],
  'Restore access': ['Restaurar acceso', 'Restaurar acesso'],
  'Remove this team member access?': [
    '¿Retirar el acceso de este miembro del equipo?',
    'Remover o acesso deste membro da equipe?',
  ],
  'Dismiss notification': ['Cerrar notificación', 'Fechar notificação'],
  'Filter by category': ['Filtrar por categoría', 'Filtrar por categoria'],
  Filter: ['Filtrar', 'Filtrar'],
  'Access profile': ['Perfil de acceso', 'Perfil de acesso'],
  'Publish a planned shift for an assigned worker. Planning does not create actual time entries; the worker records the work performed separately.':
    [
      'Publica un turno previsto para un trabajador asignado. La planificación no crea horas reales; el trabajador registra por separado el trabajo realizado.',
      'Publique um turno previsto para um trabalhador alocado. O planejamento não cria horas reais; o trabalhador registra separadamente o trabalho realizado.',
    ],
  'Filter clients': ['Filtrar clientes', 'Filtrar clientes'],
  'Identification & client': ['Identificación y cliente', 'Identificação e cliente'],
  'Include inactive specialists': [
    'Incluir especialistas inactivos',
    'Incluir especialistas inativos',
  ],
  'Keep the authorized client and project references clear and traceable.': [
    'Mantén claras y trazables las referencias autorizadas de cliente y proyecto.',
    'Mantenha claras e rastreáveis as referências autorizadas de cliente e projeto.',
  ],
  'LOCATION & PLANNING': ['UBICACIÓN Y PLANIFICACIÓN', 'LOCALIZAÇÃO E PLANEJAMENTO'],
  'Location & planning': ['Ubicación y planificación', 'Localização e planejamento'],
  'Name, role or project': ['Nombre, rol o proyecto', 'Nome, função ou projeto'],
  'No active specialists found.': [
    'No se encontraron especialistas activos.',
    'Nenhum especialista ativo encontrado.',
  ],
  'No associated projects recorded.': [
    'No hay proyectos asociados registrados.',
    'Nenhum projeto associado registrado.',
  ],
  'No authorized clients found.': [
    'No se encontraron clientes autorizados.',
    'Nenhum cliente autorizado encontrado.',
  ],
  'No contacts recorded.': ['No hay contactos registrados.', 'Nenhum contato registrado.'],
  'No expenses match this category.': [
    'No hay gastos para esta categoría.',
    'Nenhuma despesa corresponde a esta categoria.',
  ],
  'No project assignments recorded.': [
    'No hay asignaciones de proyecto registradas.',
    'Nenhuma atribuição de projeto registrada.',
  ],
  'Not provided': ['No proporcionado', 'Não informado'],
  'OPERATIONAL DIRECTORY': ['DIRECTORIO OPERATIVO', 'DIRETÓRIO OPERACIONAL'],
  'Planned hours': ['Horas planificadas', 'Horas planejadas'],
  'Project assignments': ['Asignaciones de proyecto', 'Atribuições de projeto'],
  'PROJECT IDENTITY': ['IDENTIDAD DEL PROYECTO', 'IDENTIDADE DO PROJETO'],
  'Projects and sites': ['Proyectos y plantas', 'Projetos e locais'],
  'Review the commercial model, limits and accountable owner.': [
    'Revisa el modelo comercial, los límites y el responsable.',
    'Revise o modelo comercial, os limites e o responsável.',
  ],
  'Search clients': ['Buscar clientes', 'Pesquisar clientes'],
  'Search team': ['Buscar equipo', 'Pesquisar equipe'],
  'Sites / plants': ['Plantas / sitios', 'Locais / plantas'],
  Specialist: ['Especialista', 'Especialista'],
  'Status unavailable': ['Estado no disponible', 'Status indisponível'],
  'Unnamed contact': ['Contacto sin nombre', 'Contato sem nome'],
  'Unnamed specialist': ['Especialista sin nombre', 'Especialista sem nome'],
  'No email': ['Sin correo electrónico', 'Sem e-mail'],
  'Set the operating site, dates and planning assumptions.': [
    'Define la planta operativa, las fechas y las premisas de planificación.',
    'Defina o local operacional, as datas e as premissas de planejamento.',
  ],
  'Run every project with confidence.': [
    'Gestiona cada proyecto con confianza.',
    'Gerencie cada projeto com confiança.',
  ],
  Other: ['Otro', 'Outro'],
  Failed: ['Con errores', 'Com falha'],
  'Failed report': ['Informe con errores', 'Relatório com falha'],
  'Report failed': ['Informe con errores', 'Relatório com falha'],
  'No time economics are available for this project.': [
    'No hay datos económicos del tiempo disponibles para este proyecto.',
    'Não há dados econômicos do tempo disponíveis para este projeto.',
  ],
  'No time economics are available in this period.': [
    'No hay datos económicos del tiempo disponibles en este período.',
    'Não há dados econômicos do tempo disponíveis neste período.',
  ],
  'No time economics in this period.': [
    'No hay datos económicos del tiempo en este período.',
    'Não há dados econômicos do tempo neste período.',
  ],
  'Client user': ['Usuario del cliente', 'Usuário do cliente'],
  'Account Status': ['Estado de la cuenta', 'Status da conta'],
  'Account options': ['Opciones de la cuenta', 'Opções da conta'],
  'Accounting Pack': ['Paquete contable', 'Pacote contábil'],
  'Accounting Pack artifacts': ['Artefactos del paquete contable', 'Artefatos do pacote contábil'],
  'Accounting Pack register': ['Registro de paquetes contables', 'Registro de pacotes contábeis'],
  'Accounting Pack report language': [
    'Idioma del informe del paquete contable',
    'Idioma do relatório do pacote contábil',
  ],
  'Add skill': ['Añadir competencia', 'Adicionar competência'],
  'Add Skill': ['Añadir competencia', 'Adicionar competência'],
  'All assigned workers': ['Todos los trabajadores asignados', 'Todos os colaboradores atribuídos'],
  'All-in': ['Todo incluido', 'Tudo incluído'],
  'All-in and reimbursable combined': [
    'Todo incluido y reembolsable combinados',
    'Tudo incluído e reembolsável combinados',
  ],
  'Approved actual time': ['Tiempo real aprobado', 'Tempo real aprovado'],
  'Approved estimate': ['Estimación aprobada', 'Estimativa aprovada'],
  'Approved hours': ['Horas aprobadas', 'Horas aprovadas'],
  'Approved unbilled WIP': [
    'Trabajo en curso aprobado no facturado',
    'Trabalho em andamento aprovado não faturado',
  ],
  'Assign skill': ['Asignar competencia', 'Atribuir competência'],
  'Assigned workforce': ['Personal asignado', 'Equipe atribuída'],
  Availability: ['Disponibilidad', 'Disponibilidade'],
  Available: ['Disponible', 'Disponível'],
  Basis: ['Base', 'Base'],
  Billable: ['Facturable', 'Faturável'],
  'Billable hours': ['Horas facturables', 'Horas faturáveis'],
  'Billing address': ['Dirección de facturación', 'Endereço de faturamento'],
  'Billing rules': ['Reglas de facturación', 'Regras de faturamento'],
  'Billing stream': ['Flujo de facturación', 'Fluxo de faturamento'],
  Blockers: ['Bloqueos', 'Bloqueios'],
  Break: ['Pausa', 'Intervalo'],
  'Build draft': ['Crear borrador', 'Criar rascunho'],
  'By category': ['Por categoría', 'Por categoria'],
  'By day': ['Por día', 'Por dia'],
  'By worker': ['Por trabajador', 'Por colaborador'],
  Cadence: ['Cadencia', 'Periodicidade'],
  Cancel: ['Cancelar', 'Cancelar'],
  Categories: ['Categorías', 'Categorias'],
  Category: ['Categoría', 'Categoria'],
  Change: ['Cambio', 'Alteração'],
  'Change history': ['Historial de cambios', 'Histórico de alterações'],
  'Change summary': ['Resumen del cambio', 'Resumo da alteração'],
  'Changed fields': ['Campos modificados', 'Campos alterados'],
  'Clear filter': ['Borrar filtro', 'Limpar filtro'],
  'Client / project': ['Cliente / proyecto', 'Cliente / projeto'],
  'Client contacts': ['Contactos del cliente', 'Contatos do cliente'],
  'Client decisions': ['Decisiones del cliente', 'Decisões do cliente'],
  'Client revenue': ['Ingresos del cliente', 'Receita do cliente'],
  'Commercial milestones': ['Hitos comerciales', 'Marcos comerciais'],
  'Commercial model': ['Modelo comercial', 'Modelo comercial'],
  Commissioning: ['Puesta en marcha', 'Comissionamento'],
  Complete: ['Completo', 'Concluído'],
  Configuration: ['Configuración', 'Configuração'],
  Contact: ['Contacto', 'Contato'],
  'Create adjustment': ['Crear ajuste', 'Criar ajuste'],
  'Create Invitation': ['Crear invitación', 'Criar convite'],
  'Create Milestone': ['Crear hito', 'Criar marco'],
  'Customer contact': ['Contacto del cliente', 'Contato do cliente'],
  Daily: ['Diario', 'Diário'],
  'Daily guarantee coverage': ['Cobertura de garantía diaria', 'Cobertura da garantia diária'],
  'Daily reports': ['Informes diarios', 'Relatórios diários'],
  Debit: ['Débito', 'Débito'],
  Delete: ['Eliminar', 'Excluir'],
  'Delete contact': ['Eliminar contacto', 'Excluir contato'],
  'Delete report': ['Eliminar informe', 'Excluir relatório'],
  'Delete skill': ['Eliminar competencia', 'Excluir competência'],
  Detail: ['Detalle', 'Detalhe'],
  'Device name': ['Nombre del dispositivo', 'Nome do dispositivo'],
  Difference: ['Diferencia', 'Diferença'],
  'Disable MFA': ['Desactivar MFA', 'Desativar MFA'],
  Document: ['Documento', 'Documento'],
  Download: ['Descargar', 'Baixar'],
  'Draft saved at': ['Borrador guardado a las', 'Rascunho salvo em'],
  'Due on': ['Vencimiento', 'Vencimento'],
  'Edit billing rule': ['Editar regla de facturación', 'Editar regra de faturamento'],
  'Edit contact': ['Editar contacto', 'Editar contato'],
  'Edit Profile': ['Editar perfil', 'Editar perfil'],
  'Enable MFA': ['Activar MFA', 'Ativar MFA'],
  Enabled: ['Activado', 'Ativado'],
  End: ['Fin', 'Fim'],
  Ends: ['Termina', 'Termina'],
  Equipment: ['Equipamiento', 'Equipamento'],
  'Estimate from approved and pending records': [
    'Estimación a partir de registros aprobados y pendientes',
    'Estimativa a partir de registros aprovados e pendentes',
  ],
  'Expected minutes': ['Minutos previstos', 'Minutos esperados'],
  'Expected Working Schedule': ['Horario de trabajo previsto', 'Horário de trabalho esperado'],
  'Expense economics': ['Datos económicos de gastos', 'Dados econômicos de despesas'],
  'Expense CSV': ['CSV de gastos', 'CSV de despesas'],
  'Expense treatment': ['Tratamiento del gasto', 'Tratamento da despesa'],
  'Expenses included': ['Gastos incluidos', 'Despesas incluídas'],
  'Field & PLC reports': ['Informes de campo y PLC', 'Relatórios de campo e PLC'],
  File: ['Archivo', 'Arquivo'],
  Finalize: ['Finalizar', 'Finalizar'],
  'Finalize compensation': ['Finalizar compensación', 'Finalizar remuneração'],
  'Finance approve': ['Aprobación financiera', 'Aprovação financeira'],
  From: ['Desde', 'De'],
  Fuel: ['Combustible', 'Combustível'],
  'Full name': ['Nombre completo', 'Nome completo'],
  Grouping: ['Agrupación', 'Agrupamento'],
  Hotel: ['Alojamiento (hotel)', 'Hospedagem (hotel)'],
  Hours: ['Horas', 'Horas'],
  'Inspect worker': ['Inspeccionar trabajador', 'Inspecionar colaborador'],
  'Invite new worker': ['Invitar a un trabajador', 'Convidar colaborador'],
  'Invoice numbering policy': [
    'Política de numeración de facturas',
    'Política de numeração de faturas',
  ],
  'Invoice CSV': ['CSV de facturas', 'CSV de faturas'],
  'Invoice report language': ['Idioma del informe de factura', 'Idioma do relatório da fatura'],
  'Invoice template': ['Plantilla de factura', 'Modelo de fatura'],
  'Joined At': ['Fecha de incorporación', 'Data de entrada'],
  'Keep current': ['Mantener actual', 'Manter atual'],
  'Loaded labor cost': ['Coste laboral cargado', 'Custo de mão de obra carregado'],
  'Manage worker': ['Gestionar trabajador', 'Gerenciar colaborador'],
  'Manage worker availability': [
    'Gestionar disponibilidad del trabajador',
    'Gerenciar disponibilidade do colaborador',
  ],
  'Manage worker profiles': [
    'Gestionar perfiles de trabajadores',
    'Gerenciar perfis de colaboradores',
  ],
  'Manage worker skills': [
    'Gestionar competencias de trabajadores',
    'Gerenciar competências de colaboradores',
  ],
  'Mark as read': ['Marcar como leído', 'Marcar como lido'],
  'Mark reimbursed': ['Marcar como reembolsado', 'Marcar como reembolsado'],
  'Mark sent': ['Marcar como enviado', 'Marcar como enviado'],
  Milestone: ['Hito', 'Marco'],
  'Milestones awaiting approval': ['Hitos pendientes de aprobación', 'Marcos aguardando aprovação'],
  'Minor-unit amount': ['Importe en unidades menores', 'Valor em unidades menores'],
  'Mobile navigation': ['Navegación móvil', 'Navegação móvel'],
  Monthly: ['Mensual', 'Mensal'],
  'New Invoice Numbering Policy': [
    'Nueva política de numeración de facturas',
    'Nova política de numeração de faturas',
  ],
  'New Legal Entity': ['Nueva entidad jurídica', 'Nova entidade legal'],
  'New Skill': ['Nueva competencia', 'Nova competência'],
  'New Tax Profile': ['Nuevo perfil fiscal', 'Novo perfil fiscal'],
  'Next steps': ['Próximos pasos', 'Próximos passos'],
  'No approved worker economics are available.': [
    'No hay datos económicos aprobados del trabajador.',
    'Não há dados econômicos aprovados do colaborador.',
  ],
  'No billing stream is configured for this project. Configure one in Billing before creating an invoice draft.':
    [
      'No hay ningún flujo de facturación configurado para este proyecto. Configura uno en Facturación antes de crear un borrador de factura.',
      'Nenhum fluxo de faturamento está configurado para este projeto. Configure um em Faturamento antes de criar um rascunho de fatura.',
    ],
  'No calculated commercial lines.': [
    'No hay líneas comerciales calculadas.',
    'Não há linhas comerciais calculadas.',
  ],
  'No daily reports in this period.': [
    'No hay informes diarios en este período.',
    'Não há relatórios diários neste período.',
  ],
  'No expenses in this period.': [
    'No hay gastos en este período.',
    'Não há despesas neste período.',
  ],
  'No finance projects are available.': [
    'No hay proyectos financieros disponibles.',
    'Não há projetos financeiros disponíveis.',
  ],
  'No invoice drafts.': ['No hay borradores de facturas.', 'Não há rascunhos de faturas.'],
  'No milestones configured.': ['No hay hitos configurados.', 'Nenhum marco está configurado.'],
  'No private documents are available in your access scope.': [
    'No hay documentos privados disponibles en tu ámbito de acceso.',
    'Não há documentos privados disponíveis no seu escopo de acesso.',
  ],
  'No technical records in this period.': [
    'No hay registros técnicos en este período.',
    'Não há registros técnicos neste período.',
  ],
  'No time entries in this period.': [
    'No hay registros de tiempo en este período.',
    'Não há registros de tempo neste período.',
  ],
  'Not approved': ['No aprobado', 'Não aprovado'],
  'Not configured': ['No configurado', 'Não configurado'],
  'Not submitted': ['No enviado', 'Não enviado'],
  Notification: ['Notificación', 'Notificação'],
  Offboard: ['Dar de baja', 'Desativar acesso'],
  'One-time recovery codes': [
    'Códigos de recuperación de un solo uso',
    'Códigos de recuperação de uso único',
  ],
  Outstanding: ['Pendiente de cobro', 'Em aberto'],
  Overtime: ['Horas extra', 'Hora extra'],
  'Overtime method': ['Método de horas extra', 'Método de hora extra'],
  'Owner / Admin': ['Propietario / administrador', 'Proprietário / administrador'],
  'Owner / finance': ['Propietario / finanzas', 'Proprietário / finanças'],
  'Owner access': ['Acceso del propietario', 'Acesso do proprietário'],
  'Payment amount': ['Importe del pago', 'Valor do pagamento'],
  'Payment reference': ['Referencia del pago', 'Referência do pagamento'],
  Pending: ['Pendiente', 'Pendente'],
  'Pending actual time': ['Tiempo real pendiente', 'Tempo real pendente'],
  'Pending estimate': ['Estimación pendiente', 'Estimativa pendente'],
  'Pending pay:': ['Pago pendiente:', 'Pagamento pendente:'],
  'Percentage rule active': ['Regla porcentual activa', 'Regra percentual ativa'],
  Period: ['Período', 'Período'],
  'Period report': ['Informe de período', 'Relatório de período'],
  'Planning basis available': [
    'Base de planificación disponible',
    'Base de planejamento disponível',
  ],
  Planned: ['Planificado', 'Planejado'],
  'Planned end': ['Fin planificado', 'Fim planejado'],
  'Planning target only; it never creates time.': [
    'Solo es un objetivo de planificación; nunca crea tiempo.',
    'É apenas uma meta de planejamento; nunca cria tempo.',
  ],
  'Portfolio views': ['Vistas de cartera', 'Visões do portfólio'],
  Preview: ['Vista previa', 'Pré-visualização'],
  'Print preview': ['Vista previa de impresión', 'Pré-visualização de impressão'],
  'Private project documents': [
    'Documentos privados del proyecto',
    'Documentos privados do projeto',
  ],
  Processing: ['Procesando', 'Processando'],
  Proficiency: ['Competencia', 'Proficiência'],
  'Proficiency (1-5)': ['Competencia (1-5)', 'Proficiência (1-5)'],
  'Proficiency (1–5)': ['Competencia (1–5)', 'Proficiência (1–5)'],
  'Project manager': ['Responsable del proyecto', 'Gerente do projeto'],
  'Projects included': ['Proyectos incluidos', 'Projetos incluídos'],
  'Publish assignment': ['Publicar asignación', 'Publicar atribuição'],
  'Published schedule': ['Calendario publicado', 'Cronograma publicado'],
  Quantity: ['Cantidad', 'Quantidade'],
  'Rate review': ['Revisión de tarifa', 'Revisão de tarifa'],
  'Rate rule active': ['Regla de tarifa activa', 'Regra de tarifa ativa'],
  Ready: ['Listo', 'Pronto'],
  Receipt: ['Recibo', 'Recibo'],
  'Record date': ['Fecha del registro', 'Data do registro'],
  'Record payment': ['Registrar pago', 'Registrar pagamento'],
  'Records requiring review': ['Registros que requieren revisión', 'Registros que exigem revisão'],
  'Recover draft': ['Recuperar borrador', 'Recuperar rascunho'],
  'Register passkey': ['Registrar clave de acceso', 'Registrar chave de acesso'],
  'Remove assignment': ['Quitar asignación', 'Remover atribuição'],
  'Remove skill': ['Quitar competencia', 'Remover competência'],
  'Remove Worker Skill': [
    'Quitar competencia del trabajador',
    'Remover competência do colaborador',
  ],
  'Rental car': ['Coche de alquiler', 'Carro alugado'],
  'Report navigation': ['Navegación de informes', 'Navegação de relatórios'],
  'Report register': ['Registro de informes', 'Registro de relatórios'],
  'Report summary': ['Resumen del informe', 'Resumo do relatório'],
  'Required change': ['Cambio requerido', 'Alteração obrigatória'],
  'Required skill': ['Competencia requerida', 'Competência obrigatória'],
  Return: ['Volver', 'Voltar'],
  'Revenue attributed': ['Ingresos atribuidos', 'Receita atribuída'],
  'Revenue candidate': ['Candidato a ingresos', 'Candidato a receita'],
  'Review required': ['Revisión requerida', 'Revisão necessária'],
  'Safety impact': ['Impacto en la seguridad', 'Impacto na segurança'],
  'Safety-related': ['Relacionado con la seguridad', 'Relacionado à segurança'],
  'Save billing rule': ['Guardar regla de facturación', 'Salvar regra de faturamento'],
  'Save billing stream': ['Guardar flujo de facturación', 'Salvar fluxo de faturamento'],
  'Save contact': ['Guardar contacto', 'Salvar contato'],
  'Save legal entity': ['Guardar entidad jurídica', 'Salvar entidade legal'],
  'Save milestone': ['Guardar hito', 'Salvar marco'],
  'Save numbering policy': ['Guardar política de numeración', 'Salvar política de numeração'],
  'Save profile': ['Guardar perfil', 'Salvar perfil'],
  'Save schedule': ['Guardar calendario', 'Salvar cronograma'],
  'Save skill': ['Guardar competencia', 'Salvar competência'],
  'Save tax profile': ['Guardar perfil fiscal', 'Salvar perfil fiscal'],
  'Save worker availability': [
    'Guardar disponibilidad del trabajador',
    'Salvar disponibilidade do colaborador',
  ],
  'Select entity': ['Seleccionar entidad', 'Selecionar entidade'],
  'Select legal entity': ['Seleccionar entidad jurídica', 'Selecionar entidade legal'],
  'Select skill': ['Seleccionar competencia', 'Selecionar competência'],
  'Select tax profile': ['Seleccionar perfil fiscal', 'Selecionar perfil fiscal'],
  'Semi-monthly': ['Quincenal', 'Quinzenal'],
  'Semi-monthly rule': ['Regla quincenal', 'Regra quinzenal'],
  Sensitive: ['Sensible', 'Sensível'],
  Sensitivity: ['Sensibilidad', 'Sensibilidade'],
  'Separate billing treatment': [
    'Tratamiento de facturación separado',
    'Tratamento de faturamento separado',
  ],
  Shift: ['Turno', 'Turno'],
  'Shift window': ['Ventana del turno', 'Janela do turno'],
  Site: ['Sitio', 'Local'],
  Source: ['Origen', 'Origem'],
  Sources: ['Orígenes', 'Origens'],
  Spanish: ['Español', 'Espanhol'],
  'Standby / waiting': ['Guardia / espera', 'Plantão / espera'],
  'Standby reason': ['Motivo de disponibilidad', 'Motivo do plantão'],
  Starts: ['Comienza', 'Começa'],
  State: ['Estado', 'Estado'],
  Status: ['Estado', 'Status'],
  'Status for': ['Estado de', 'Status de'],
  Stream: ['Flujo', 'Fluxo'],
  Submitted: ['Enviado', 'Enviado'],
  Subtotal: ['Subtotal', 'Subtotal'],
  Suspend: ['Suspender', 'Suspender'],
  'Tax Profile': ['Perfil fiscal', 'Perfil fiscal'],
  'Time by category': ['Tiempo por categoría', 'Tempo por categoria'],
  'Time economics review': [
    'Revisión de datos económicos del tiempo',
    'Revisão dos dados econômicos do tempo',
  ],
  'Time entry': ['Registro de tiempo', 'Registro de tempo'],
  'Time record(s) have no matching compensation rule and require Finance review.': [
    'Hay registros de tiempo sin regla de compensación coincidente que requieren revisión financiera.',
    'Há registros de tempo sem regra de remuneração correspondente que exigem revisão financeira.',
  ],
  'Tools / consumables': ['Herramientas / consumibles', 'Ferramentas / consumíveis'],
  Total: ['Importe total', 'Total geral'],
  Treatment: ['Tratamiento', 'Tratamento'],
  'Travel cost': ['Coste de viaje', 'Custo de viagem'],
  Unassigned: ['Sin asignar', 'Não atribuído'],
  Unavailable: ['No disponible', 'Indisponível'],
  'Update contact': ['Actualizar contacto', 'Atualizar contato'],
  'Update legal entity': ['Actualizar entidad jurídica', 'Atualizar entidade legal'],
  'Update skill': ['Actualizar competencia', 'Atualizar competência'],
  'Update skill matrix': ['Actualizar matriz de competencias', 'Atualizar matriz de competências'],
  'Update status': ['Actualizar estado', 'Atualizar status'],
  'Upload and register hash': ['Cargar y registrar el hash', 'Enviar e registrar o hash'],
  'Use recipient email': ['Usar el correo del destinatario', 'Usar o e-mail do destinatário'],
  Validation: ['Validación', 'Validação'],
  'Verify for protected actions': [
    'Verificar para acciones protegidas',
    'Verificar para ações protegidas',
  ],
  'Verify MFA': ['Verificar MFA', 'Verificar MFA'],
  View: ['Ver', 'Ver'],
  'View worker profile': ['Ver perfil del trabajador', 'Ver perfil do colaborador'],
  'Visa / permit': ['Visado / permiso', 'Visto / autorização'],
  'Void reason': ['Motivo de anulación', 'Motivo do cancelamento'],
  Weekly: ['Semanal', 'Semanal'],
  Window: ['Ventana', 'Janela'],
  WIP: ['Trabajo en curso', 'Trabalho em andamento'],
  'Work laptop': ['Portátil de trabajo', 'Computador de trabalho'],
  'Worker reimbursement queue': [
    'Cola de reembolsos del trabajador',
    'Fila de reembolsos do colaborador',
  ],
  workers: ['trabajadores', 'colaboradores'],
  'Worker paid': ['Pagado por el trabajador', 'Pago pelo colaborador'],
};

const extraExact: Record<string, readonly [string, string]> = {
  'A quick check keeps your workspace secure.': [
    'Una comprobación rápida mantiene seguro tu espacio de trabajo.',
    'Uma verificação rápida mantém seu espaço de trabalho seguro.',
  ],
  'A workspace user': ['Usuario del espacio de trabajo', 'Usuário do espaço de trabalho'],
  'Actual minus expected for the day.': [
    'Real menos previsto para el día.',
    'Real menos esperado para o dia.',
  ],
  'Add this URI to your authenticator, then enter the current six-digit code to confirm the device. Recovery codes are shown once; store them securely.':
    [
      'Añade esta URI a tu autenticador e introduce el código actual de seis dígitos para confirmar el dispositivo. Los códigos de recuperación se muestran una sola vez; guárdalos de forma segura.',
      'Adicione esta URI ao autenticador e informe o código atual de seis dígitos para confirmar o dispositivo. Os códigos de recuperação são exibidos uma única vez; guarde-os com segurança.',
    ],
  'Add this week’s layout': [
    'Añadir la estructura de esta semana',
    'Adicionar o layout desta semana',
  ],
  'Admin/Finance-only aggregates remain grouped by currency and drill back to the selected project economics.':
    [
      'Los agregados exclusivos de administración/finanzas permanecen agrupados por moneda y permiten volver a los datos económicos del proyecto seleccionado.',
      'Os agregados exclusivos de administração/finanças permanecem agrupados por moeda e permitem voltar aos dados econômicos do projeto selecionado.',
    ],
  'Approval queue clear.': [
    'La cola de aprobaciones está vacía.',
    'A fila de aprovações está vazia.',
  ],
  'Archiving a client hides it from active lists but retains historical financial and project data.':
    [
      'Archivar un cliente lo oculta de las listas activas, pero conserva sus datos financieros y de proyecto históricos.',
      'Arquivar um cliente o oculta das listas ativas, mas preserva seus dados financeiros e de projeto históricos.',
    ],
  'Are you sure you want to delete this document?': [
    '¿Seguro que quieres eliminar este documento?',
    'Tem certeza de que deseja excluir este documento?',
  ],
  'Capture problems, corrective action, customer decisions, and blockers.': [
    'Captura los problemas, las acciones correctivas, las decisiones del cliente y los bloqueos.',
    'Registre problemas, ações corretivas, decisões do cliente e bloqueios.',
  ],
  'Changes are versioned and notify the owner/admin review group.': [
    'Los cambios se versionan y notifican al grupo de revisión de propietarios/administradores.',
    'As alterações são versionadas e notificam o grupo de revisão de proprietários/administradores.',
  ],
  'Contribution margin is project revenue less approved project cost. It is not company net profit.':
    [
      'El margen de contribución es la diferencia entre los ingresos y el coste aprobado del proyecto. No es el beneficio neto de la empresa.',
      'A margem de contribuição é a diferença entre a receita e o custo aprovado do projeto. Não é o lucro líquido da empresa.',
    ],
  'Copies projects, categories and activity labels into zero-minute drafts. It never copies time values.':
    [
      'Copia proyectos, categorías y etiquetas de actividad en borradores de cero minutos. Nunca copia valores de tiempo.',
      'Copia projetos, categorias e rótulos de atividade para rascunhos de zero minutos. Nunca copia valores de tempo.',
    ],
  'Current projects, field records, and billing readiness in one view.': [
    'Proyectos actuales, registros de campo y preparación de facturación en una sola vista.',
    'Projetos atuais, registros de campo e preparação de faturamento em uma única visão.',
  ],
  'Deleting removes this draft source record and records the action in the audit trail. Finalized reports cannot be deleted.':
    [
      'Eliminar quita este registro de origen en borrador y registra la acción en la pista de auditoría. Los informes finalizados no se pueden eliminar.',
      'Excluir remove este registro de origem em rascunho e registra a ação na trilha de auditoria. Relatórios finalizados não podem ser excluídos.',
    ],
  'Expected availability is 10 hours Monday through Saturday; Sunday stays at zero.': [
    'La disponibilidad prevista es de 10 horas de lunes a sábado; el domingo permanece en cero.',
    'A disponibilidade esperada é de 10 horas de segunda a sábado; o domingo permanece em zero.',
  ],
  'Existing rules are historical records. Edit by superseding the selected record; deactivate only ends its future applicability.':
    [
      'Las reglas existentes son registros históricos. Edita sustituyendo el registro seleccionado; desactivar solo termina su aplicabilidad futura.',
      'As regras existentes são registros históricos. Edite substituindo o registro selecionado; desativar apenas encerra sua aplicabilidade futura.',
    ],
  'Files are private, hash-verified, and authorized on every download.': [
    'Los archivos son privados, se verifican mediante hash y se autorizan en cada descarga.',
    'Os arquivos são privados, têm o hash verificado e são autorizados a cada download.',
  ],
  'Forecasts use actual records first and only use configured planning data for the remaining work. They never create actual time or billing sources.':
    [
      'Las previsiones usan primero los registros reales y solo utilizan datos de planificación configurados para el trabajo restante. Nunca crean tiempo real ni fuentes de facturación.',
      'As previsões usam primeiro os registros reais e só usam dados de planejamento configurados para o trabalho restante. Nunca criam tempo real nem fontes de faturamento.',
    ],
  'Identify the plant, line, station, and automation equipment involved.': [
    'Identifica la planta, la línea, la estación y el equipo de automatización implicados.',
    'Identifique a planta, linha, estação e equipamento de automação envolvidos.',
  ],
  'Internal loaded cost, worker compensation and margin remain restricted to Finance, Owner and Auditor roles.':
    [
      'El coste interno cargado, la compensación del trabajador y el margen siguen restringidos a los roles de Finanzas, Propietario y Auditor.',
      'O custo interno carregado, a remuneração do colaborador e a margem permanecem restritos aos papéis de Finanças, Proprietário e Auditor.',
    ],
  'Labor and expense streams are configured independently. Draft generation may be automatic; invoice issue and send remain manual.':
    [
      'Los flujos de trabajo y gastos se configuran de forma independiente. La generación de borradores puede ser automática; emitir y enviar facturas sigue siendo manual.',
      'Os fluxos de mão de obra e despesas são configurados de forma independente. A geração de rascunhos pode ser automática; emitir e enviar faturas continua manual.',
    ],
  'Labor and reimbursable expenses use independent streams and configured tax profiles. All-in project expenses remain in project cost and do not appear here.':
    [
      'El trabajo y los gastos reembolsables usan flujos independientes y perfiles fiscales configurados. Los gastos todo incluido del proyecto permanecen en el coste del proyecto y no aparecen aquí.',
      'A mão de obra e as despesas reembolsáveis usam fluxos independentes e perfis fiscais configurados. As despesas tudo incluído do projeto permanecem no custo do projeto e não aparecem aqui.',
    ],
  'Leave the handover context needed for the next shift and review.': [
    'Deja el contexto de entrega necesario para el siguiente turno y la revisión.',
    'Deixe o contexto de passagem necessário para o próximo turno e revisão.',
  ],
  'Only records in your access scope': [
    'Solo registros dentro de tu ámbito de acceso',
    'Somente registros no seu escopo de acesso',
  ],
  'Passkey sign-in was cancelled or is not available on this device.': [
    'El acceso con clave de acceso se canceló o no está disponible en este dispositivo.',
    'O login com chave de acesso foi cancelado ou não está disponível neste dispositivo.',
  ],
  'Passkey sign-in was cancelled or unavailable.': [
    'El acceso con clave de acceso se canceló o no está disponible.',
    'O login com chave de acesso foi cancelado ou está indisponível.',
  ],
  'Projects cannot be hard-deleted to preserve financial history and audit logs. Use Archived to remove a project from active operational views.':
    [
      'Los proyectos no se pueden eliminar físicamente para conservar el historial financiero y los registros de auditoría. Usa Archivado para quitar un proyecto de las vistas operativas activas.',
      'Projetos não podem ser excluídos permanentemente para preservar o histórico financeiro e os registros de auditoria. Use Arquivado para remover um projeto das visões operacionais ativas.',
    ],
  'Protected by secure sessions and rate limits. Optional MFA is available in your profile.': [
    'Protegido por sesiones seguras y límites de frecuencia. MFA opcional está disponible en tu perfil.',
    'Protegido por sessões seguras e limites de frequência. A MFA opcional está disponível no seu perfil.',
  ],
  'Rates are effective-dated and resolved by assignment, category, activity, and project scope.': [
    'Las tarifas tienen fecha de vigencia y se resuelven por asignación, categoría, actividad y ámbito del proyecto.',
    'As tarifas têm data de vigência e são resolvidas por atribuição, categoria, atividade e escopo do projeto.',
  ],
  'Rates are resolved by project, worker, category, and effective date.': [
    'Las tarifas se resuelven por proyecto, trabajador, categoría y fecha de vigencia.',
    'As tarifas são resolvidas por projeto, colaborador, categoria e data de vigência.',
  ],
  'Receipts, PLC backups and project reports are validated, hashed and kept outside the public site.':
    [
      'Los recibos, copias de seguridad PLC e informes de proyecto se validan, tienen hash y se mantienen fuera del sitio público.',
      'Os recibos, cópias de segurança do PLC e relatórios de projeto são validados, recebem hash e ficam fora da área pública.',
    ],
  'Register a device passkey for faster, phishing-resistant sign-in. A passkey never leaves your device.':
    [
      'Registra una clave de acceso del dispositivo para iniciar sesión más rápido y resistir el phishing. La clave nunca sale de tu dispositivo.',
      'Registre uma chave de acesso do dispositivo para login mais rápido e resistente a phishing. A chave nunca sai do seu dispositivo.',
    ],
  'Reimbursements are separate from customer expense billing status.': [
    'Los reembolsos son independientes del estado de facturación de gastos al cliente.',
    'Os reembolsos são separados do status de faturamento de despesas do cliente.',
  ],
  'Review access is limited to operational time.': [
    'El acceso de revisión se limita al tiempo operativo.',
    'O acesso de revisão é limitado ao tempo operacional.',
  ],
  'Review the local draft before continuing.': [
    'Revisa el borrador local antes de continuar.',
    'Revise o rascunho local antes de continuar.',
  ],
  'Runs queued PDF and Accounting Pack artifact jobs with idempotent output registration.': [
    'Ejecuta trabajos de artefactos PDF y paquetes contables en cola con registro de salidas idempotente.',
    'Executa trabalhos de artefatos PDF e pacotes contábeis na fila com registro idempotente das saídas.',
  ],
  'Set the field date and the shift context for this source record.': [
    'Establece la fecha de campo y el contexto del turno para este registro de origen.',
    'Defina a data de campo e o contexto do turno para este registro de origem.',
  ],
  'The code was not accepted.': ['El código no fue aceptado.', 'O código não foi aceito.'],
  'The secure sign-in service is unavailable. Try again shortly.': [
    'El servicio de acceso seguro no está disponible. Inténtalo de nuevo en breve.',
    'O serviço de login seguro está indisponível. Tente novamente em instantes.',
  ],
  'Too many sign-in attempts. Wait a few minutes before trying again.': [
    'Demasiados intentos de acceso. Espera unos minutos antes de intentarlo de nuevo.',
    'Muitas tentativas de login. Aguarde alguns minutos antes de tentar novamente.',
  ],
  'This account no longer has access to the workspace. Contact your administrator.': [
    'Esta cuenta ya no tiene acceso al espacio de trabajo. Contacta con tu administrador.',
    'Esta conta não tem mais acesso ao espaço de trabalho. Entre em contato com o administrador.',
  ],
  'This creates a reviewable draft only. Approval, issue, sending and payment remain explicit finance actions and never happen from Print report.':
    [
      'Esto solo crea un borrador revisable. La aprobación, emisión, entrega y pago siguen siendo acciones financieras explícitas y nunca ocurren desde Imprimir informe.',
      'Isso cria apenas um rascunho revisável. Aprovação, emissão, envio e pagamento continuam sendo ações financeiras explícitas e nunca ocorrem a partir de Imprimir relatório.',
    ],
  'This is planning context; actual time remains independently recorded.': [
    'Este es un contexto de planificación; el tiempo real sigue registrándose de forma independiente.',
    'Este é um contexto de planejamento; o tempo real continua sendo registrado de forma independente.',
  ],
  'This report must be a draft or need changes before it can autosave': [
    'Este informe debe estar en borrador o necesitar cambios antes de poder guardarse automáticamente',
    'Este relatório deve ser um rascunho ou exigir alterações antes de poder ser salvo automaticamente',
  ],
  'This report needs changes before it can be approved.': [
    'Este informe necesita cambios antes de poder aprobarse.',
    'Este relatório precisa de alterações antes de poder ser aprovado.',
  ],
  'This view contains only your own time, reimbursement, and compensation estimate. Client rates, internal cost, margin, and other workers remain restricted.':
    [
      'Esta vista solo contiene tu tiempo, reembolso y estimación de compensación. Las tarifas del cliente, el coste interno, el margen y otros trabajadores siguen restringidos.',
      'Esta visão contém apenas seu tempo, reembolso e estimativa de remuneração. Tarifas do cliente, custo interno, margem e outros colaboradores permanecem restritos.',
    ],
  'Use a password of at least 12 characters. This invitation can be used once.': [
    'Usa una contraseña de al menos 12 caracteres. Esta invitación solo se puede usar una vez.',
    'Use uma senha de pelo menos 12 caracteres. Este convite pode ser usado uma vez.',
  ],
  'Values are recalculated from approved source records, effective client rates, internal cost rules, compensation rules, daily minimums, milestones and expense treatments. Refresh after changing source data.':
    [
      'Los valores se recalculan a partir de registros de origen aprobados, tarifas efectivas del cliente, reglas de coste interno, reglas de compensación, mínimos diarios, hitos y tratamientos de gastos. Actualiza después de cambiar los datos de origen.',
      'Os valores são recalculados a partir de registros de origem aprovados, tarifas efetivas do cliente, regras de custo interno, regras de remuneração, mínimos diários, marcos e tratamentos de despesas. Atualize depois de alterar os dados de origem.',
    ],
  'Your organization requires an authenticator code for this sign-in.': [
    'Tu organización requiere un código de autenticador para este acceso.',
    'Sua organização exige um código autenticador para este login.',
  ],
  'Activating…': ['Activando…', 'Ativando…'],
  'Allowance / per diem': ['Dietas / asignación diaria', 'Ajuda de custo / diária'],
  'Anchor date': ['Fecha ancla', 'Data de referência'],
  Archive: ['Archivar', 'Arquivar'],
  'Archive legal entity': ['Archivar entidad jurídica', 'Arquivar entidade legal'],
  Assign: ['Asignar', 'Atribuir'],
  'BILLABLE VALUE': ['VALOR FACTURABLE', 'VALOR FATURÁVEL'],
  'Base rate multiplier': ['Multiplicador de tarifa base', 'Multiplicador da tarifa base'],
  'COMMERCIAL MODEL': ['MODELO COMERCIAL', 'MODELO COMERCIAL'],
  'Calculation basis': ['Base de cálculo', 'Base de cálculo'],
  'Capped T&M': ['T&M con límite', 'T&M limitado'],
  Captured: ['Capturado', 'Capturado'],
  Changed: ['Modificado', 'Alterado'],
  'Changed:': ['Modificado:', 'Alterado:'],
  Collected: ['Cobrado', 'Recebido'],
  Combined: ['Combinado', 'Combinado'],
  Component: ['Componente', 'Componente'],
  'Connected to J&A': ['Conectado a J&A', 'Conectado à J&A'],
  'Contract number': ['Número de contrato', 'Número do contrato'],
  Controller: ['Controlador', 'Controlador'],
  'Copy previous week layout': [
    'Copiar estructura de la semana anterior',
    'Copiar layout da semana anterior',
  ],
  Correction: ['Corrección', 'Correção'],
  'Corrective actions': ['Acciones correctivas', 'Ações corretivas'],
  Country: ['País', 'País'],
  Credit: ['Crédito', 'Crédito'],
  Custom: ['Personalizado', 'Personalizado'],
  DAILY: ['DIARIO', 'DIÁRIO'],
  Deactivate: ['Desactivar', 'Desativar'],
  Digits: ['Dígitos', 'Dígitos'],
  'Display name': ['Nombre visible', 'Nome de exibição'],
  'Edit / supersede': ['Editar / sustituir', 'Editar / substituir'],
  'Effective from': ['Vigente desde', 'Vigente desde'],
  Email: ['Correo electrónico', 'E-mail'],
  'Ends on': ['Termina el', 'Termina em'],
  English: ['Inglés', 'Inglês'],
  'Estimate only': ['Solo estimación', 'Apenas estimativa'],
  'Every 14 days': ['Cada 14 días', 'A cada 14 dias'],
  'Exact minor units': ['Unidades menores exactas', 'Unidades menores exatas'],
  FROM: ['DESDE', 'DE'],
  'FX rate (basis points)': ['Tipo de cambio (puntos básicos)', 'Taxa de câmbio (pontos-base)'],
  'Fixed addition per hour': ['Suplemento fijo por hora', 'Adicional fixo por hora'],
  'Fixed price · minor units': ['Precio fijo · unidades menores', 'Preço fixo · unidades menores'],
  'Fixed rate': ['Tarifa fija', 'Tarifa fixa'],
  'Generate pack': ['Generar paquete', 'Gerar pacote'],
  'Generate settlement snapshot': [
    'Generar instantánea de liquidación',
    'Gerar instantâneo da liquidação',
  ],
  Gross: ['Bruto', 'Bruto'],
  'HMI / SCADA': ['HMI / SCADA', 'HMI / SCADA'],
  Hotel: ['Alojamiento (hotel)', 'Hospedagem (hotel)'],
  Hourly: ['Por hora', 'Por hora'],
  'Hourly rate (minor units)': [
    'Tarifa por hora (unidades menores)',
    'Tarifa horária (unidades menores)',
  ],
  'INDUSTRIAL AUTOMATION · FIELD SERVICES': [
    'AUTOMATIZACIÓN INDUSTRIAL · SERVICIOS DE CAMPO',
    'AUTOMAÇÃO INDUSTRIAL · SERVIÇOS DE CAMPO',
  ],
  'Informational only': ['Solo informativo', 'Apenas informativo'],
  'Invitation could not be activated.': [
    'No se pudo activar la invitación.',
    'Não foi possível ativar o convite.',
  ],
  'J&A / INVITATION': ['J&A / INVITACIÓN', 'J&A / CONVITE'],
  'Log out': ['Cerrar sesión', 'Sair'],
  'Markup (basis points)': ['Recargo (puntos básicos)', 'Acréscimo (pontos-base)'],
  'Missing rate rules': ['Faltan reglas de tarifas', 'Regras de tarifas ausentes'],
  'My documents': ['Mis documentos', 'Meus documentos'],
  'My pay': ['Mi pago', 'Meu pagamento'],
  Name: ['Nombre', 'Nome'],
  'No audit history recorded.': [
    'No hay historial de auditoría registrado.',
    'Nenhum histórico de auditoria registrado.',
  ],
  'No description was recorded.': [
    'No se registró ninguna descripción.',
    'Nenhuma descrição foi registrada.',
  ],
  'Non-billable': ['No facturable', 'Não faturável'],
  None: ['Ninguno', 'Nenhum'],
  Note: ['Nota', 'Observação'],
  'ONE MORE STEP': ['UN PASO MÁS', 'MAIS UM PASSO'],
  'Operational value': ['Valor operativo', 'Valor operacional'],
  'Overtime multiplier (bps)': [
    'Multiplicador de horas extra (puntos básicos)',
    'Multiplicador de hora extra (pontos-base)',
  ],
  'Owner controls': ['Controles del propietario', 'Controles do proprietário'],
  'PLC platform': ['Plataforma PLC', 'Plataforma PLC'],
  'PO cap (minor)': [
    'Límite de orden de compra (unidades menores)',
    'Limite do pedido de compra (unidades menores)',
  ],
  'PO cap · minor units': [
    'Límite de orden de compra · unidades menores',
    'Limite do pedido de compra · unidades menores',
  ],
  PREVIEW: ['VISTA PREVIA', 'PRÉ-VISUALIZAÇÃO'],
  Passkeys: ['Claves de acceso', 'Chaves de acesso'],
  'Per diem': ['Dieta', 'Diária'],
  Portuguese: ['Portugués', 'Português'],
  QTY: ['CANT.', 'QTD.'],
  'REIMB.': ['REEMB.', 'REEMBOLSO'],
  Rate: ['Tarifa', 'Taxa'],
  'Rate (basis points)': ['Tarifa (puntos básicos)', 'Taxa (pontos-base)'],
  'Rate (minor units)': ['Tarifa (unidades menores)', 'Taxa (unidades menores)'],
  'Rate basis': ['Base de tarifa', 'Base da taxa'],
  Reason: ['Motivo', 'Motivo'],
  'Recalculate snapshot': ['Recalcular instantánea', 'Recalcular instantâneo'],
  Receivable: ['Por cobrar', 'A receber'],
  'Received on': ['Recibido el', 'Recebido em'],
  'Recent entries': ['Registros recientes', 'Registros recentes'],
  'Recent expenses': ['Gastos recientes', 'Despesas recentes'],
  'Recipient email': ['Correo del destinatario', 'E-mail do destinatário'],
  Reimbursable: ['Reembolsable', 'Reembolsável'],
  'Reimbursable + markup': ['Reembolsable + recargo', 'Reembolsável + acréscimo'],
  'Rejection reason': ['Motivo del rechazo', 'Motivo da rejeição'],
  Remaining: ['Restante', 'Restante'],
  'Remote support': ['Asistencia remota', 'Suporte remoto'],
  Revoke: ['Revocar', 'Revogar'],
  Role: ['Rol', 'Função'],
  'Rollback plan': ['Plan de reversión', 'Plano de reversão'],
  'Run due jobs': ['Ejecutar trabajos pendientes', 'Executar trabalhos vencidos'],
  SECONDARY: ['SECUNDARIO', 'SECUNDÁRIO'],
  'Settlement status': ['Estado de liquidación', 'Status da liquidação'],
  'Settlement trigger': ['Activador de liquidación', 'Gatilho da liquidação'],
  'Settlement trigger:': ['Activador de liquidación:', 'Gatilho da liquidação:'],
  'Shift summary': ['Resumen del turno', 'Resumo do turno'],
  Shipping: ['Envío', 'Envio'],
  'Site / shift': ['Sitio / turno', 'Local / turno'],
  'Site timezone': ['Zona horaria del sitio', 'Fuso horário do local'],
  'Skip to main content': ['Saltar al contenido principal', 'Ir para o conteúdo principal'],
  'Software version': ['Versión del software', 'Versão do software'],
  'Starts on': ['Comienza el', 'Começa em'],
  Subtotal: ['Subtotal', 'Subtotal'],
  'T&M · daily minimum': ['T&M · mínimo diario', 'T&M · mínimo diário'],
  'Tasks completed': ['Tareas completadas', 'Tarefas concluídas'],
  Tentative: ['Provisional', 'Provisório'],
  Timezone: ['Zona horaria', 'Fuso horário'],
  Tolls: ['Peajes', 'Pedágios'],
  Total: ['Importe total', 'Total geral'],
  'UNAPPROVED WIP': ['WIP NO APROBADO', 'WIP NÃO APROVADO'],
  VERSION: ['VERSIÓN', 'VERSÃO'],
  Verified: ['Verificado', 'Verificado'],
  Void: ['Anular', 'Cancelar'],
  'Week of': ['Semana del', 'Semana de'],
  'Weekend / holiday': ['Fin de semana / festivo', 'Fim de semana / feriado'],
  'Who paid': ['Quién pagó', 'Quem pagou'],
  'Working offline': ['Trabajando sin conexión', 'Trabalhando sem conexão'],
  'e.g. 5500 = 55%': ['p. ej., 5500 = 55%', 'ex.: 5500 = 55%'],
  'e.g. 9200': ['p. ej., 9200', 'ex.: 9200'],
  'h plan': ['h planificadas', 'h planejadas'],
  'minor units': ['unidades menores', 'unidades menores'],
  'no email': ['sin correo electrónico', 'sem e-mail'],
  'reimbursements.': ['reembolsos.', 'reembolsos.'],
  'self-reported': ['autodeclarado', 'autodeclarado'],
  'Finance Admin': ['Administrador financiero', 'Administrador de finanças'],
  Auditor: ['Auditor', 'Auditor'],
  Locked: ['Bloqueado', 'Bloqueado'],
  Suspended: ['Suspendido', 'Suspenso'],
  Offboarded: ['Baja', 'Desactivado'],
  Paused: ['En pausa', 'Em pausa'],
  Closing: ['En cierre', 'Em encerramento'],
  Restore: ['Restaurar', 'Restaurar'],
  'Partially paid': ['Parcialmente pagada', 'Parcialmente paga'],
  Credited: ['Abonado', 'Creditado'],
  Quarantined: ['En cuarentena', 'Em quarentena'],
  Clean: ['Limpio', 'Limpo'],
  'Technical change': ['Cambio técnico', 'Alteração técnica'],
  'Invoice adjustment': ['Ajuste de factura', 'Ajuste de fatura'],
  Settlement: ['Liquidación', 'Liquidação'],
  Reimbursement: ['Reembolso', 'Reembolso'],
  Labor: ['Trabajo', 'Mão de obra'],
  Expense: ['Gasto', 'Despesa'],
  'Issues / decisions': ['Problemas / decisiones', 'Problemas / decisões'],
  Prefix: ['Prefijo', 'Prefixo'],
  'Privacy boundary': ['Límite de privacidad', 'Limite de privacidade'],
  'Problems found': ['Problemas encontrados', 'Problemas encontrados'],
  'Production impact': ['Impacto en producción', 'Impacto em produção'],
  'Needs changes': ['Necesita cambios', 'Precisa de alterações'],
  Final: ['Finalizado', 'Finalizado'],
  Archived: ['Archivado', 'Arquivado'],
  Voided: ['Anulado', 'Cancelado'],
  Closed: ['Cerrado', 'Fechado'],
  Sent: ['Enviado', 'Enviado'],
  Reimbursed: ['Reembolsado', 'Reembolsado'],
  Internal: ['Interno', 'Interno'],
  Parking: ['Aparcamiento', 'Estacionamento'],
  'Rental car': ['Coche de alquiler', 'Carro alugado'],
  'Train / bus / taxi / rideshare': [
    'Tren / autobús / taxi / transporte con app',
    'Trem / ônibus / táxi / transporte por aplicativo',
  ],
  'Phone / data': ['Teléfono / datos', 'Telefone / dados'],
  'Client treatment': ['Tratamiento para cliente', 'Tratamento do cliente'],
  Daily: ['Diario', 'Diário'],
  'Settlements are immutable financial snapshots. Correct a period by creating a new effective rule or reconciliation record; finalized settlements are never deleted.':
    [
      'Las liquidaciones son instantáneas financieras inmutables. Corrige un período creando una nueva regla con fecha de vigencia o un registro de conciliación; las liquidaciones finalizadas nunca se eliminan.',
      'As liquidações são instantâneos financeiros imutáveis. Corrija um período criando uma nova regra com vigência ou um registro de reconciliação; liquidações finalizadas nunca são excluídas.',
    ],
  'Add Client Contact': ['Añadir contacto del cliente', 'Adicionar contato do cliente'],
  'Archive Client': ['Archivar cliente', 'Arquivar cliente'],
  'Archive Legal Entity': ['Archivar entidad jurídica', 'Arquivar entidade legal'],
  'Archive tax profile': ['Archivar perfil fiscal', 'Arquivar perfil fiscal'],
  'Assign Worker': ['Asignar trabajador', 'Atribuir colaborador'],
  'Configure billing stream': [
    'Configurar flujo de facturación',
    'Configurar fluxo de faturamento',
  ],
  'Expected Working Schedule': ['Horario de trabajo previsto', 'Horário de trabalho esperado'],
  'Legal entity': ['Entidad jurídica', 'Entidade legal'],
  'Owner Admin': ['Propietario administrador', 'Administrador proprietário'],
  'Project Manager': ['Responsable del proyecto', 'Gerente do projeto'],
  'Remove Assignment': ['Eliminar asignación', 'Excluir atribuição'],
  'Remove skill': ['Eliminar competencia', 'Excluir competência'],
  'Remove worker skill': [
    'Eliminar competencia del trabajador',
    'Excluir competência do colaborador',
  ],
  'Tax Profile': ['Perfil fiscal', 'Perfil fiscal'],
  Through: ['Hasta', 'Até'],
  'Update Assignment': ['Actualizar asignación', 'Atualizar atribuição'],
  'Update Legal Entity': ['Actualizar entidad jurídica', 'Atualizar entidade legal'],
  'Update Skill': ['Actualizar competencia', 'Atualizar competência'],
  'Update client': ['Actualizar cliente', 'Atualizar cliente'],
  'Update tax profile': ['Actualizar perfil fiscal', 'Atualizar perfil fiscal'],
  billing: ['facturación', 'faturamento'],
  joined: ['incorporación', 'entrada'],
  minutes: ['minutos', 'minutos'],
  packs: ['paquetes', 'pacotes'],
  verified: ['verificado', 'verificado'],
  DESCRIPTION: ['DESCRIPCIÓN', 'DESCRIÇÃO'],
  INVOICE: ['FACTURA', 'FATURA'],
  PROJECT: ['PROYECTO', 'PROJETO'],
  RATE: ['TARIFA', 'TAXA'],
  SOURCE: ['ORIGEN', 'ORIGEM'],
  STREAM: ['FLUJO', 'FLUXO'],
  CATEGORY: ['CATEGORÍA', 'CATEGORIA'],
  'ACTUAL END': ['FIN REAL', 'FIM REAL'],
  'ACTUAL HOURS': ['HORAS REALES', 'HORAS REAIS'],
  'APPROVED UNBILLED WIP': [
    'TRABAJO EN CURSO APROBADO NO FACTURADO',
    'TRABALHO EM ANDAMENTO APROVADO NÃO FATURADO',
  ],
  'Commercial model': ['Modelo comercial', 'Modelo comercial'],
  'PO / REFERENCE': ['OC / REFERENCIA', 'OC / REFERÊNCIA'],
  SAFETY: ['SEGURIDAD', 'SEGURANÇA'],
  TIMEZONE: ['ZONA HORARIA', 'FUSO HORÁRIO'],
  'TRAVEL / EXPENSE': ['VIAJE / GASTO', 'VIAGEM / DESPESA'],
  'Contribution margin': ['Margen de contribución', 'Margem de contribuição'],
  version: ['versión', 'versão'],
  SITE: ['SITIO', 'LOCAL'],
  advanced: ['avanzado', 'avançado'],
  capable: ['capacitado', 'capaz'],
  committed: ['comprometido', 'comprometido'],
  developing: ['en desarrollo', 'em desenvolvimento'],
  events: ['eventos', 'eventos'],
  expert: ['experto', 'especialista'],
  exposure: ['exposición', 'exposição'],
  files: ['archivos', 'arquivos'],
  invoices: ['facturas', 'faturas'],
  matches: ['coincidencias', 'correspondências'],
  new: ['nuevo', 'novo'],
  through: ['a través de', 'por meio de'],
  to: ['a', 'para'],
};

/*
 * Translation coverage is data-driven by explicitCoverageLiterals. The
 * former lexical word maps were intentionally removed so a new literal
 * cannot silently render as mixed-language copy.
 */
const invariantKeys = new Set([
  'Subtotal',
  'Auditor',
  '0.00',
  'en',
  'en-US',
  'es',
  'es-ES',
  'pt',
  'pt-BR',
  'PDF',
  'XLSX',
  'CSV',
  'JSON',
  'MFA',
  'min',
  'No',
  'SHA-256',
  'TOTP',
  'PLC',
  'HMI',
  'SCADA',
  'FAT',
  'SAT',
  'Rockwell Automation',
  'ControlLogix 5580',
  // Language names and combined technical acronyms are intentional display invariants.
  'Español',
  'Português',
  'Português (BR)',
  'HMI / SCADA',
  'base64url',
  'cache-control',
  'content-length',
  'content-security-policy',
  'cross-origin-opener-policy',
  'ja_offline_identity',
  'permissions-policy',
  'referrer-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-correlation-id',
  'x-frame-options',
  'you@company.com',
]);

export function isCoverageInvariantKey(key: string): boolean {
  return invariantKeys.has(key);
}

/**
 * Action messages are intentionally semantic. The old implementation split
 * camel-case keys and replaced individual English words, which produced text
 * such as “proyectos proyecto actualizado”. These entries use complete phrases
 * and the validation renderer below supplies the small, stable family of
 * validation messages without exposing an English fallback to users.
 */
const actionExact: Record<string, readonly [string, string]> = {
  'action.access.localAccount.provisioned': [
    'Acceso local al portal creado.',
    'Acesso local ao portal criado.',
  ],
  'action.access.mailbox.aliasExists': [
    'Ese alias de correo ya existe en Stalwart.',
    'Esse alias de e-mail já existe no Stalwart.',
  ],
  'action.access.mailbox.created': ['Buzón creado.', 'Caixa de correio criada.'],
  'action.access.mailbox.createdLinkPending': [
    'El buzón se creó en Stalwart, pero falta vincularlo al portal. Repite la misma creación para completar el vínculo; no se creará otro buzón.',
    'A caixa de correio foi criada no Stalwart, mas falta vinculá-la ao portal. Repita a mesma criação para concluir o vínculo; outra caixa não será criada.',
  ],
  'action.access.mailbox.destroyed': ['Buzón eliminado.', 'Caixa de correio excluída.'],
  'action.access.mailbox.identityCollision': [
    'Este buzón entra en conflicto con una identidad existente del portal y no se vinculó.',
    'Esta caixa de correio entra em conflito com uma identidade existente do portal e não foi vinculada.',
  ],
  'action.access.mailbox.invalidAlias': [
    'Usa un alias de 2 a 64 letras minúsculas, números, puntos, guiones bajos o guiones.',
    'Use um alias de 2 a 64 letras minúsculas, números, pontos, sublinhados ou hífens.',
  ],
  'action.access.mailbox.invalidPassword': [
    'Usa una contraseña de 12 a 128 caracteres sin saltos de línea.',
    'Use uma senha de 12 a 128 caracteres sem quebras de linha.',
  ],
  'action.access.mailbox.invalidQuota': [
    'Introduce una cuota de buzón válida.',
    'Informe uma cota de caixa de correio válida.',
  ],
  'action.access.mailbox.passwordUpdated': [
    'Contraseña de Webmail actualizada.',
    'Senha do Webmail atualizada.',
  ],
  'action.access.mailbox.passwordRejected': [
    'Stalwart rechazó la contraseña. Usa una contraseña única y fuerte de al menos 16 caracteres.',
    'O Stalwart rejeitou a senha. Use uma senha exclusiva e forte com pelo menos 16 caracteres.',
  ],
  'action.access.mailbox.permissionDenied': [
    'La clave de servicio del portal no puede crear esta cuenta de Stalwart o conceder sus permisos de buzón.',
    'A chave de serviço do portal não pode criar esta conta do Stalwart ou conceder suas permissões de caixa de correio.',
  ],
  'action.access.mailbox.rejected': [
    'Stalwart rechazó la creación de la cuenta.',
    'O Stalwart rejeitou a criação da conta.',
  ],
  'action.access.mailbox.relinkRequired': [
    'Este correo estaba vinculado a otra cuenta de Stalwart. Se necesita una revinculación explícita.',
    'Este e-mail estava vinculado a outra conta do Stalwart. É necessária uma revinculação explícita.',
  ],
  'action.access.mailbox.userInactive': [
    'Ya existe un usuario archivado con este correo. Restáuralo explícitamente antes de vincular el buzón.',
    'Já existe um usuário arquivado com este e-mail. Restaure-o explicitamente antes de vincular a caixa.',
  ],
  'action.access.mailboxes.provisioned': [
    'Buzones incorporados al portal.',
    'Caixas de correio provisionadas no portal.',
  ],
  'action.validation.localProvision': [
    'Revisa los datos de acceso local y el proveedor seleccionado.',
    'Revise os dados de acesso local e o fornecedor selecionado.',
  ],
  'action.access.accountStatus.updated': [
    'Estado de la cuenta actualizado.',
    'Status da conta atualizado.',
  ],
  'action.access.invitation.created': ['Invitación creada.', 'Convite criado.'],
  'action.access.workerProfile.updated': [
    'Perfil del trabajador actualizado.',
    'Perfil do colaborador atualizado.',
  ],
  'action.approval.decisionRecorded': [
    'Decisión de aprobación registrada.',
    'Decisão de aprovação registrada.',
  ],
  'action.approval.financeReviewRecorded': [
    'Revisión financiera registrada.',
    'Revisão financeira registrada.',
  ],
  'action.approvals.milestoneReviewRecorded': [
    'Revisión del hito registrada.',
    'Revisão do marco registrada.',
  ],
  'action.approvals.reportReviewRecorded': [
    'Revisión del informe registrada.',
    'Revisão do relatório registrada.',
  ],
  'action.approvals.technicalChangeReviewRecorded': [
    'Revisión del cambio técnico registrada.',
    'Revisão da alteração técnica registrada.',
  ],
  'action.error.invalid': ['Los datos no son válidos.', 'Os dados são inválidos.'],
  'action.error.forbidden': [
    'No tienes permiso para realizar esta acción.',
    'Você não tem permissão para realizar esta ação.',
  ],
  'action.error.unauthenticated': [
    'Vuelve a iniciar sesión para continuar.',
    'Entre novamente para continuar.',
  ],
  'action.error.conflict': [
    'La acción entra en conflicto con el estado actual del registro.',
    'A ação entra em conflito com o estado atual do registro.',
  ],
  'action.error.unavailable': [
    'La acción no se pudo completar. Inténtalo de nuevo.',
    'Não foi possível concluir a ação. Tente novamente.',
  ],
  'action.error.financeRoleRequired': [
    'Se requiere el rol de Finanzas.',
    'É necessária a função de Finanças.',
  ],
  'action.error.reportEditAccess': [
    'Se requiere acceso de edición del informe.',
    'É necessário acesso para editar o relatório.',
  ],
  'action.billing.accountingPackFinalized': [
    'Paquete contable finalizado.',
    'Pacote contábil finalizado.',
  ],
  'action.billing.invoiceAdjustmentCreated': [
    'Borrador de ajuste de factura creado.',
    'Rascunho de ajuste da fatura criado.',
  ],
  'action.billing.invoiceAlreadySent': [
    'La factura ya está marcada como enviada.',
    'A fatura já está marcada como enviada.',
  ],
  'action.billing.invoiceApproved': ['Factura aprobada.', 'Fatura aprovada.'],
  'action.billing.invoiceDeleted': ['Factura eliminada.', 'Fatura excluída.'],
  'action.billing.invoiceDraftCreated': [
    'Borrador de factura creado.',
    'Rascunho de fatura criado.',
  ],
  'action.billing.invoiceDraftCreatedForPeriod': [
    'Borrador de factura creado para {periodStart} → {periodEnd}, el último período completo con trabajo facturable aprobado.',
    'Rascunho de fatura criado para {periodStart} → {periodEnd}, o último período completo com trabalho faturável aprovado.',
  ],
  'action.billing.invoiceDraftExisting': [
    'Ya existe un borrador de factura.',
    'Já existe um rascunho de fatura.',
  ],
  'action.billing.invoiceDraftExistingForPeriod': [
    'Se devolvió el borrador existente para {periodStart} → {periodEnd}.',
    'O rascunho existente foi devolvido para {periodStart} → {periodEnd}.',
  ],
  'action.billing.invoiceIssued': ['Factura emitida.', 'Fatura emitida.'],
  'action.billing.invoiceNumberPolicySaved': [
    'Política de numeración de facturas guardada.',
    'Política de numeração de faturas salva.',
  ],
  'action.billing.invoiceSent': [
    'Factura marcada como enviada manualmente.',
    'Fatura marcada como enviada manualmente.',
  ],
  'action.billing.invoiceUpdated': ['Factura actualizada.', 'Fatura atualizada.'],
  'action.billing.invoiceVoided': [
    'Factura anulada y registrada en la auditoría.',
    'Fatura anulada e registrada na auditoria.',
  ],
  'action.billing.jobsProcessed': [
    'Trabajos de facturación procesados.',
    'Tarefas de faturamento processadas.',
  ],
  'action.billing.legalEntityArchived': [
    'Entidad jurídica archivada.',
    'Entidade legal arquivada.',
  ],
  'action.billing.legalEntitySaved': ['Entidad jurídica guardada.', 'Entidade legal salva.'],
  'action.billing.legalEntityUpdated': [
    'Entidad jurídica actualizada.',
    'Entidade legal atualizada.',
  ],
  'action.billing.paymentRecorded': ['Pago registrado.', 'Pagamento registrado.'],
  'action.billing.paymentReversed': [
    'Reversión del pago registrada.',
    'Estorno do pagamento registrado.',
  ],
  'action.billing.periodClosed': [
    'Período de facturación cerrado.',
    'Período de faturamento fechado.',
  ],
  'action.billing.ruleArchived': [
    'Regla de facturación archivada.',
    'Regra de faturamento arquivada.',
  ],
  'action.billing.ruleUpdated': [
    'Regla de facturación actualizada.',
    'Regra de faturamento atualizada.',
  ],
  'action.billing.streamSaved': ['Flujo de facturación guardado.', 'Fluxo de faturamento salvo.'],
  'action.billing.taxProfileArchived': ['Perfil fiscal archivado.', 'Perfil fiscal arquivado.'],
  'action.billing.taxProfileSaved': ['Perfil fiscal guardado.', 'Perfil fiscal salvo.'],
  'action.billing.taxProfileUpdated': ['Perfil fiscal actualizado.', 'Perfil fiscal atualizado.'],
  'action.billing.readiness.noBillableSources': [
    'El período seleccionado no tiene horas ni gastos facturables aprobados. Revisa sus registros pendientes o elige otro período explícitamente; la aplicación no cambiará las fechas por ti.',
    'O período selecionado não tem horas nem despesas faturáveis aprovadas. Revise os registros pendentes ou escolha outro período explicitamente; o aplicativo não mudará as datas por você.',
  ],
  'action.billing.readiness.periodCutoffMismatch': [
    'Las fechas no coinciden con la cadencia de este flujo (por ejemplo, semanal es lunes a domingo). Elige el período correcto; la aplicación no lo sustituirá automáticamente.',
    'As datas não coincidem com a cadência deste fluxo (por exemplo, semanal é segunda a domingo). Escolha o período correto; o aplicativo não o substituirá automaticamente.',
  ],
  'action.billing.readiness.pendingTimeApproval': [
    'Hay registros de tiempo de este período pendientes de aprobación. Apruébalos o recházalos en Aprobaciones y vuelve a crear el borrador.',
    'Há registros de tempo deste período pendentes de aprovação. Aprove ou rejeite-os em Aprovações e crie o rascunho novamente.',
  ],
  'action.billing.readiness.pendingExpenseApproval': [
    'Hay gastos de este período pendientes de aprobación. Apruébalos o recházalos en Aprobaciones y vuelve a crear el borrador.',
    'Há despesas deste período pendentes de aprovação. Aprove ou rejeite-as em Aprovações e crie o rascunho novamente.',
  ],
  'action.billing.readiness.missingTaxProfile': [
    'Este flujo de facturación no tiene perfil fiscal. Añádelo en Configuración financiera y vuelve a crear el borrador.',
    'Este fluxo de faturamento não tem perfil fiscal. Adicione-o em Configuração financeira e crie o rascunho novamente.',
  ],
  'action.billing.readiness.inactiveTaxProfile': [
    'El perfil fiscal de este flujo no está activo. Actívalo o asígnale uno activo en Configuración financiera.',
    'O perfil fiscal deste fluxo não está ativo. Ative-o ou atribua um ativo em Configuração financeira.',
  ],
  'action.billing.readiness.missingLegalEntity': [
    'Este flujo de facturación no tiene entidad jurídica. Asígnale una en Configuración financiera.',
    'Este fluxo de faturamento não tem entidade legal. Atribua uma em Configuração financeira.',
  ],
  'action.billing.readiness.archivedLegalEntity': [
    'La entidad jurídica de este flujo está archivada. Restaúrala o asígnale una activa en Configuración financiera.',
    'A entidade legal deste fluxo está arquivada. Restaure-a ou atribua uma ativa em Configuração financeira.',
  ],
  'action.billing.readiness.legalEntityCurrencyMismatch': [
    'La moneda de la entidad jurídica no coincide con la del flujo. Corrígela en Configuración financiera.',
    'A moeda da entidade legal não coincide com a do fluxo. Corrija em Configuração financeira.',
  ],
  'action.billing.readiness.taxProfileCurrencyMismatch': [
    'La moneda del perfil fiscal no coincide con la del flujo. Corrígela en Configuración financiera.',
    'A moeda do perfil fiscal não coincide com a do fluxo. Corrija em Configuração financeira.',
  ],
  'action.billing.readiness.taxProfileLegalEntityMismatch': [
    'El perfil fiscal no pertenece a la entidad jurídica de este flujo. Reasígnalo en Configuración financiera.',
    'O perfil fiscal não pertence à entidade legal deste fluxo. Reatribua em Configuração financeira.',
  ],
  'action.billing.readiness.invalidPeriod': [
    'La fecha de fin es anterior a la de inicio. Elige un período válido.',
    'A data final é anterior à de início. Escolha um período válido.',
  ],
  'action.billing.readiness.invalidPeriodConfiguration': [
    'La cadencia de este flujo no puede calcular el período. Revisa la fecha de ancla o el día de corte en el flujo de facturación.',
    'A cadência deste fluxo não consegue calcular o período. Revise a data âncora ou o dia de corte no fluxo de faturamento.',
  ],
  'action.billing.readiness.missingFixedPrice': [
    'Este flujo de mano de obra con todo incluido no tiene precio fijo. Configúralo en el proyecto o en el flujo de facturación.',
    'Este fluxo de mão de obra com tudo incluído não tem preço fixo. Configure-o no projeto ou no fluxo de faturamento.',
  ],
  'action.billing.readiness.capExhausted': [
    'El tope de pedido de este proyecto ya se consumió. Ajusta el tope o factura otro flujo.',
    'O teto do pedido deste projeto já foi consumido. Ajuste o teto ou fatura outro fluxo.',
  ],
  'action.billing.readiness.missingClientRate': [
    'Hay horas aprobadas sin tarifa de cliente. Añade la tarifa laboral del cliente en Finanzas y vuelve a crear el borrador.',
    'Há horas aprovadas sem tarifa do cliente. Adicione a tarifa de mão de obra do cliente em Finanças e crie o rascunho novamente.',
  ],
  'action.billing.readiness.missingExpenseCurrencyConversion': [
    'Hay gastos en otra moneda sin conversión a la de facturación. Completa la conversión en Finanzas.',
    'Há despesas em outra moeda sem conversão para a de faturamento. Conclua a conversão em Finanças.',
  ],
  'action.billing.readiness.missingExpenseFinanceProjection': [
    'Hay gastos clasificados sin proyección financiera. Completa la clasificación comercial en Finanzas.',
    'Há despesas classificadas sem projeção financeira. Conclua a classificação comercial em Finanças.',
  ],
  'action.billing.readiness.customerSignoffRequired': [
    'Falta la conformidad del cliente para este período. Captúrala en el informe periódico del proyecto y vuelve a emitir.',
    'Falta a conformidade do cliente para este período. Capture-a no relatório periódico do projeto e emita novamente.',
  ],
  'action.billing.readiness.canonicalLegalEntityRevisionRequired': [
    'Este proyecto no tiene una revisión de entidad jurídica revisada para emitir. Asígnela en Configuración financiera.',
    'Este projeto não tem uma revisão de entidade legal revisada para emitir. Atribua-a em Configuração financeira.',
  ],
  'action.billing.readiness.missingInvoiceNumberPolicy': [
    'Falta la política de numeración de facturas aprobada. Configúrala en Facturación antes de emitir.',
    'Falta a política de numeração de faturas aprovada. Configure-a em Faturamento antes de emitir.',
  ],
  'action.billing.readiness.inactiveBillingConfiguration': [
    'El flujo de facturación o su configuración legal/fiscal no está activo. Revísalo en Configuración financiera.',
    'O fluxo de faturamento ou a configuração legal/fiscal não está ativo. Revise em Configuração financeira.',
  ],
  'action.conflict.billingPeriodIncomplete': [
    'Este período de facturación no está listo para un borrador. Revisa las causas abajo y corrígelas en Aprobaciones o Configuración financiera.',
    'Este período de faturamento não está pronto para um rascunho. Revise as causas abaixo e corrija-as em Aprovações ou Configuração financeira.',
  ],
  'action.conflict.reportNotEditable': [
    'El informe no se puede editar.',
    'O relatório não pode ser editado.',
  ],
  'action.documents.deleted': ['Documento eliminado.', 'Documento excluído.'],
  'action.documents.uploaded': ['Documento cargado.', 'Documento enviado.'],
  'action.expense.draftSaved': ['Borrador de gasto guardado.', 'Rascunho de despesa salvo.'],
  'action.expense.removedOrVoided': [
    'Registro de gasto eliminado o anulado.',
    'Registro de despesa excluído ou anulado.',
  ],
  'action.expense.submitted': ['Gasto enviado.', 'Despesa enviada.'],
  'action.finance.assignmentRateOverrideSaved': [
    'Excepción de tarifa de asignación guardada.',
    'Substituição da tarifa da atribuição salva.',
  ],
  'action.finance.clientLaborRateDeactivated': [
    'Tarifa laboral del cliente desactivada.',
    'Taxa de mão de obra do cliente desativada.',
  ],
  'action.finance.clientLaborRateSaved': [
    'Tarifa laboral del cliente guardada.',
    'Taxa de mão de obra do cliente salva.',
  ],
  'action.finance.clientLaborRateSuperseded': [
    'Tarifa laboral del cliente sustituida.',
    'Taxa de mão de obra do cliente substituída.',
  ],
  'action.finance.compensationRuleDeactivated': [
    'Regla de compensación desactivada.',
    'Regra de remuneração desativada.',
  ],
  'action.finance.compensationRuleSaved': [
    'Regla de compensación guardada.',
    'Regra de remuneração salva.',
  ],
  'action.finance.compensationRuleSuperseded': [
    'Regla de compensación sustituida.',
    'Regra de remuneração substituída.',
  ],
  'action.finance.compensationSettled': ['Compensación liquidada.', 'Remuneração liquidada.'],
  'action.finance.internalCostRuleDeactivated': [
    'Regla de coste interno desactivada.',
    'Regra de custo interno desativada.',
  ],
  'action.finance.internalCostRuleSaved': [
    'Regla de coste interno guardada.',
    'Regra de custo interno salva.',
  ],
  'action.finance.internalCostRuleSuperseded': [
    'Regla de coste interno sustituida.',
    'Regra de custo interno substituída.',
  ],
  'action.finance.projectLegalEntityAssigned': [
    'Autoridad emisora del proyecto guardada.',
    'Autoridade emissora do projeto salva.',
  ],
  'action.validation.projectLegalEntityAssignment': [
    'La asignación de la autoridad emisora del proyecto no es válida.',
    'A atribuição da autoridade emissora do projeto é inválida.',
  ],
  'action.validation.invalid': ['Revisa los datos enviados.', 'Revise os dados enviados.'],
  'action.validation.invalidForm': [
    'Revisa los campos del formulario.',
    'Revise os campos do formulário.',
  ],
  'action.validation.invoiceIdRequired': [
    'Se requiere el identificador de la factura.',
    'O identificador da fatura é obrigatório.',
  ],
  'action.validation.missingEmails': [
    'Añade al menos una dirección de correo.',
    'Adicione pelo menos um endereço de e-mail.',
  ],
  'action.validation.missingUsername': ['Añade un alias de cuenta.', 'Adicione um alias de conta.'],
  'action.finance.reimbursementRecorded': ['Reembolso registrado.', 'Reembolso registrado.'],
  'action.navigation.wrongSection': ['Sección incorrecta.', 'Seção incorreta.'],
  'action.notifications.markedRead': [
    'Notificación marcada como leída.',
    'Notificação marcada como lida.',
  ],
  'action.planning.assignmentPublished': ['Asignación publicada.', 'Atribuição publicada.'],
  'action.planning.availabilitySaved': ['Disponibilidad guardada.', 'Disponibilidade salva.'],
  'action.planning.skillDeleted': ['Competencia eliminada.', 'Competência excluída.'],
  'action.planning.skillSaved': ['Competencia guardada.', 'Competência salva.'],
  'action.planning.skillUpdated': ['Competencia actualizada.', 'Competência atualizada.'],
  'action.planning.workerSkillDeleted': [
    'Competencia del trabajador eliminada.',
    'Competência do colaborador excluída.',
  ],
  'action.planning.workerSkillUpdated': [
    'Competencia del trabajador actualizada.',
    'Competência do colaborador atualizada.',
  ],
  'action.projects.assignmentCreated': ['Asignación creada.', 'Atribuição criada.'],
  'action.projects.assignmentDeleted': ['Asignación eliminada.', 'Atribuição excluída.'],
  'action.projects.assignmentUpdated': ['Asignación actualizada.', 'Atribuição atualizada.'],
  'action.projects.clientArchived': ['Cliente archivado.', 'Cliente arquivado.'],
  'action.projects.clientContactDeleted': [
    'Contacto del cliente eliminado.',
    'Contato do cliente excluído.',
  ],
  'action.projects.clientContactSaved': [
    'Contacto del cliente guardado.',
    'Contato do cliente salvo.',
  ],
  'action.projects.clientContactUpdated': [
    'Contacto del cliente actualizado.',
    'Contato do cliente atualizado.',
  ],
  'action.projects.clientCreated': ['Cliente creado.', 'Cliente criado.'],
  'action.projects.clientUpdated': ['Cliente actualizado.', 'Cliente atualizado.'],
  'action.projects.milestoneDraftSaved': ['Borrador de hito guardado.', 'Rascunho de marco salvo.'],
  'action.projects.milestoneSubmitted': ['Hito enviado.', 'Marco enviado.'],
  'action.projects.projectCreated': ['Proyecto creado.', 'Projeto criado.'],
  'action.projects.clientDeleted': ['Cliente eliminado.', 'Cliente excluído.'],
  'action.projects.projectDeleted': ['Proyecto eliminado.', 'Projeto excluído.'],
  'action.projects.projectUpdated': ['Proyecto actualizado.', 'Projeto atualizado.'],
  'action.projects.scheduleSaved': ['Calendario guardado.', 'Cronograma salvo.'],
  'action.reports.autosaved': [
    'Informe guardado automáticamente.',
    'Relatório salvo automaticamente.',
  ],
  'action.reports.correctionDraftCreated': [
    'Borrador de corrección creado.',
    'Rascunho de correção criado.',
  ],
  'action.reports.dailyDraftSaved': [
    'Borrador de informe diario guardado.',
    'Rascunho de relatório diário salvo.',
  ],
  'action.reports.draftDeleted': [
    'Borrador de informe eliminado.',
    'Rascunho de relatório excluído.',
  ],
  'action.reports.periodReportAlreadyApproved': [
    'El informe del período ya está aprobado.',
    'O relatório do período já está aprovado.',
  ],
  'action.reports.periodReportApproved': [
    'Informe del período aprobado.',
    'Relatório do período aprovado.',
  ],
  'action.reports.periodReportsRefreshed': [
    'Informes del período actualizados.',
    'Relatórios do período atualizados.',
  ],
  'action.reports.customerSignoffInvalidated': [
    'Conformidad del cliente invalidada.',
    'Conformidade do cliente invalidada.',
  ],
  'action.reports.customerSignoffRecorded': [
    'Conformidad del cliente registrada.',
    'Conformidade do cliente registrada.',
  ],
  'action.reports.customerSignoffEvidenceAttached': [
    'Evidencia de copia firmada adjuntada a la conformidad histórica.',
    'Evidência de cópia assinada anexada à conformidade histórica.',
  ],
  'action.validation.periodReportApproval': [
    'Se requiere una vinculación válida con la instantánea del informe del período.',
    'É necessário um vínculo válido com o instantâneo do relatório do período.',
  ],
  'action.validation.customerSignoff': [
    'Completa los datos de conformidad del cliente.',
    'Preencha os dados de conformidade do cliente.',
  ],
  'action.validation.customerSignoffInvalidation': [
    'Indica la conformidad y el motivo de invalidación.',
    'Informe a conformidade e o motivo da invalidação.',
  ],
  'action.reports.submitted': ['Informe enviado para revisión.', 'Relatório enviado para revisão.'],
  'action.reports.technicalChangeDraftSaved': [
    'Borrador de cambio técnico guardado.',
    'Rascunho de alteração técnica salvo.',
  ],
  'action.reports.technicalChangeSubmitted': [
    'Cambio técnico enviado para revisión.',
    'Alteração técnica enviada para revisão.',
  ],
  'action.reports.technicalDraftSaved': [
    'Borrador de informe PLC guardado.',
    'Rascunho de relatório PLC salvo.',
  ],
  'action.time.draftSaved': ['Borrador de tiempo guardado.', 'Rascunho de tempo salvo.'],
  'action.time.draftUpdated': ['Borrador de tiempo actualizado.', 'Rascunho de tempo atualizado.'],
  'action.time.layoutCopied': ['Estructura de tiempo copiada.', 'Layout de tempo copiado.'],
  'action.time.removedOrVoided': [
    'Registro de tiempo eliminado o anulado.',
    'Registro de tempo excluído ou anulado.',
  ],
  'action.time.submitted': ['Registro de tiempo enviado.', 'Registro de tempo enviado.'],
};

const validationEntities: Record<string, readonly [string, string]> = {
  accountStatus: ['el estado de la cuenta', 'o status da conta'],
  accountingPeriod: ['el período contable', 'o período contábil'],
  approvalDecision: ['la decisión de aprobación', 'a decisão de aprovação'],
  assignmentFields: ['la asignación', 'a atribuição'],
  assignmentIdRequired: ['la asignación', 'a atribuição'],
  assignmentOverride: ['la excepción de tarifa', 'a substituição da tarifa'],
  availabilityFields: ['la disponibilidad', 'a disponibilidade'],
  billingPeriod: ['el período de facturación', 'o período de faturamento'],
  billingRuleIdRequired: ['la regla de facturación', 'a regra de faturamento'],
  billingStream: ['el flujo de facturación', 'o fluxo de faturamento'],
  clientFields: ['el cliente', 'o cliente'],
  clientIdRequired: ['el cliente', 'o cliente'],
  clientLaborRate: ['la tarifa laboral del cliente', 'a taxa de mão de obra do cliente'],
  clientLaborRateId: ['la tarifa laboral del cliente', 'a taxa de mão de obra do cliente'],
  compensationRule: ['la regla de compensación', 'a regra de remuneração'],
  compensationRuleId: ['la regla de compensación', 'a regra de remuneração'],
  contactFields: ['el contacto', 'o contato'],
  contactIdRequired: ['el contacto', 'o contato'],
  correctionDraft: ['el borrador de corrección', 'o rascunho de correção'],
  dailyReportFields: ['el informe diario', 'o relatório diário'],
  documentContent: ['el documento', 'o documento'],
  documentIdRequired: ['el documento', 'o documento'],
  documentMetadata: ['los metadatos del documento', 'os metadados do documento'],
  documentPath: ['el documento', 'o documento'],
  documentRequired: ['el documento', 'o documento'],
  documentSensitivity: ['la sensibilidad del documento', 'a sensibilidade do documento'],
  documentTypeOrSize: ['el documento', 'o documento'],
  draftDelete: ['la eliminación del borrador', 'a exclusão do rascunho'],
  expenseFields: ['el gasto', 'a despesa'],
  expenseRecord: ['el registro de gasto', 'o registro de despesa'],
  financeDecision: ['la decisión financiera', 'a decisão financeira'],
  fixedAmount: ['el importe fijo', 'o valor fixo'],
  internalCostRule: ['la regla de coste interno', 'a regra de custo interno'],
  internalCostRuleId: ['la regla de coste interno', 'a regra de custo interno'],
  invitation: ['la invitación', 'o convite'],
  invoice: ['la factura', 'a fatura'],
  invoiceAdjustment: ['el ajuste de factura', 'o ajuste da fatura'],
  invoiceNumberPolicyFields: ['la política de numeración', 'a política de numeração'],
  invoiceSend: ['el envío de la factura', 'o envio da fatura'],
  invoiceVoid: ['la anulación de la factura', 'a anulação da fatura'],
  legalEntityFields: ['la entidad jurídica', 'a entidade legal'],
  legalEntityIdRequired: ['la entidad jurídica', 'a entidade legal'],
  lifecycleFields: ['el cambio de estado', 'a mudança de estado'],
  milestoneDecision: ['la decisión del hito', 'a decisão do marco'],
  milestoneDecisionType: ['el tipo de decisión', 'o tipo de decisão'],
  milestoneFields: ['el hito', 'o marco'],
  milestoneRecord: ['el registro del hito', 'o registro do marco'],
  notificationIdRequired: ['la notificación', 'a notificação'],
  payment: ['el pago', 'o pagamento'],
  planningFields: ['la planificación', 'o planejamento'],
  projectFields: ['el proyecto', 'o projeto'],
  projectIdRequired: ['el proyecto', 'o projeto'],
  projectReportingPeriod: [
    'el período de informes del proyecto',
    'o período de relatórios do projeto',
  ],
  receiptContent: ['el recibo', 'o recibo'],
  receiptPath: ['el recibo', 'o recibo'],
  receiptTypeOrSize: ['el recibo', 'o recibo'],
  reimbursement: ['el reembolso', 'o reembolso'],
  replacementClientLaborRate: ['la tarifa laboral sustituta', 'a taxa de mão de obra substituta'],
  replacementCompensationRule: [
    'la regla de compensación sustituta',
    'a regra de remuneração substituta',
  ],
  replacementInternalCostRule: [
    'la regla de coste interno sustituta',
    'a regra de custo interno substituta',
  ],
  report: ['el informe', 'o relatório'],
  reportAutosaveRequest: [
    'la solicitud de guardado automático',
    'a solicitação de salvamento automático',
  ],
  reportDecision: ['la decisión del informe', 'a decisão do relatório'],
  scheduleFields: ['el calendario', 'o cronograma'],
  settlementPeriod: ['el período de liquidación', 'o período de liquidação'],
  skillFields: ['la competencia', 'a competência'],
  skillIdRequired: ['la competencia', 'a competência'],
  taxProfileFields: ['el perfil fiscal', 'o perfil fiscal'],
  taxProfileIdRequired: ['el perfil fiscal', 'o perfil fiscal'],
  technicalChange: ['el cambio técnico', 'a alteração técnica'],
  technicalChangeDecision: ['la decisión del cambio técnico', 'a decisão da alteração técnica'],
  technicalChangeFields: ['el cambio técnico', 'a alteração técnica'],
  technicalReportFields: ['el informe técnico', 'o relatório técnico'],
  timeFields: ['el registro de tiempo', 'o registro de tempo'],
  timeRecord: ['el registro de tiempo', 'o registro de tempo'],
  timeSourceWeekDifferent: ['la semana del registro de tiempo', 'a semana do registro de tempo'],
  workerProfile: ['el perfil del trabajador', 'o perfil do colaborador'],
  workerSkillFields: ['la competencia del trabajador', 'a competência do colaborador'],
  workerSkillIdsRequired: ['las competencias del trabajador', 'as competências do colaborador'],
};

function validationMessage(locale: 'es' | 'pt', suffix: string): string {
  const entity = validationEntities[suffix];
  if (!entity) {
    return locale === 'es'
      ? 'No se pudo validar la solicitud.'
      : 'Não foi possível validar a solicitação.';
  }
  const label = entity[locale === 'es' ? 0 : 1];
  const withPreposition =
    locale === 'es'
      ? label
          .replace(/^el /, 'del ')
          .replace(/^la /, 'de la ')
          .replace(/^los /, 'de los ')
          .replace(/^las /, 'de las ')
      : label
          .replace(/^o /, 'do ')
          .replace(/^a /, 'da ')
          .replace(/^os /, 'dos ')
          .replace(/^as /, 'das ');
  if (suffix.endsWith('IdRequired')) {
    return locale === 'es'
      ? `Se requiere el identificador ${withPreposition}.`
      : `O identificador ${withPreposition} é obrigatório.`;
  }
  if (suffix.endsWith('Fields')) {
    return locale === 'es'
      ? `Completa los campos ${withPreposition}.`
      : `Preencha os campos ${withPreposition}.`;
  }
  if (suffix.endsWith('TypeOrSize')) {
    return locale === 'es'
      ? `El tipo o tamaño ${withPreposition} no es válido.`
      : `O tipo ou tamanho ${withPreposition} não é válido.`;
  }
  if (suffix.endsWith('Content')) {
    return locale === 'es'
      ? `El contenido ${withPreposition} no es válido.`
      : `O conteúdo ${withPreposition} não é válido.`;
  }
  if (suffix.endsWith('Path')) {
    return locale === 'es'
      ? `La ruta ${withPreposition} no es válida.`
      : `O caminho ${withPreposition} não é válido.`;
  }
  if (suffix === 'accountingPeriod') {
    return locale === 'es'
      ? 'Indica una fecha de inicio igual o anterior a la de fin. Si dejas las fechas vacías, se usa el mes completo anterior.'
      : 'Informe uma data inicial igual ou anterior à final. Se deixar as datas vazias, usa-se o mês completo anterior.';
  }
  if (suffix === 'timeSourceWeekDifferent') {
    return locale === 'es'
      ? 'La semana del registro de tiempo debe coincidir con la semana seleccionada.'
      : 'A semana do registro de tempo deve coincidir com a semana selecionada.';
  }
  if (suffix === 'milestoneDecisionType') {
    return locale === 'es'
      ? 'Selecciona el tipo de decisión del hito.'
      : 'Selecione o tipo de decisão do marco.';
  }
  return locale === 'es'
    ? `Revisa los datos ${withPreposition}.`
    : `Revise os dados ${withPreposition}.`;
}

function actionMessage(locale: 'es' | 'pt', key: string): string {
  const direct = actionExact[key]?.[locale === 'es' ? 0 : 1];
  if (direct) return direct;
  const suffix = key.slice('action.'.length);
  if (suffix.startsWith('billing.accountingPack.')) {
    const state = suffix.split('.').at(-1) ?? 'queued';
    const stateText =
      locale === 'es'
        ? ({ failed: 'con errores', processing: 'procesando', queued: 'en cola', ready: 'listo' }[
            state
          ] ?? 'en cola')
        : ({ failed: 'com falha', processing: 'processando', queued: 'na fila', ready: 'pronto' }[
            state
          ] ?? 'na fila');
    return locale === 'es'
      ? `Paquete contable {packId} ${stateText}.`
      : `Pacote contábil {packId} ${stateText}.`;
  }
  if (suffix.startsWith('validation.'))
    return validationMessage(locale, suffix.slice('validation.'.length));
  return locale === 'es' ? 'La acción no se pudo completar.' : 'Não foi possível concluir a ação.';
}

function englishActionMessage(key: string): string {
  const emailMessages: Record<string, string> = {
    'action.billing.invoiceEmail.uncertain':
      'Delivery uncertain; check mail server before retrying. No automatic retry.',
    'action.billing.invoiceEmail.declined': 'Email not sent',
    'action.billing.invoiceEmail.sending': 'Email delivery is in progress.',
    'action.billing.invoiceEmail.queued': 'Invoice email queued. It has not been sent yet.',
    'action.billing.invoiceEmail.accepted':
      'SMTP server accepted the email. Inbox delivery is not confirmed.',
    'action.billing.invoiceEmail.failed': 'Email failed; administrator action required.',
    'action.billing.invoiceEmail.retrying': 'Email delivery error; automatic retry pending.',
    'action.billing.invoiceSent': 'Invoice marked as sent manually.',
    'action.billing.invoiceAlreadySent': 'Invoice already marked as sent.',
  };
  if (emailMessages[key]) return emailMessages[key];
  const suffix = key.slice('action.'.length);
  const exactEnglish: Record<string, string> = {
    'action.success': 'Changes saved.',
    'action.error.unauthenticated': 'Sign in again to continue.',
    'action.error.forbidden': 'Owner administration required.',
    'action.navigation.wrongSection': 'This action is not available in this section.',
    'action.validation.invitation': 'Invalid invitation.',
    'action.validation.accountStatus': 'Invalid account status change.',
    'action.validation.workerProfile': 'Invalid worker profile data.',
    'action.error.conflict': 'Antonny Luty is the only owner.',
    'action.access.workerProfile.updated': 'Worker profile updated.',
    'action.validation.invalidForm': 'Invalid form.',
    'action.validation.missingEmails': 'No email accounts selected.',
    'action.validation.invalid': 'Check the submitted values.',
    'action.validation.missingUsername': 'Username is required.',
    'action.access.localAccount.provisioned': 'Local portal access created.',
    'action.validation.localProvision': 'Check local access and supplier fields.',
    'action.access.mailbox.createdLinkPending':
      'The mailbox was created in Stalwart, but its portal link is pending. Retry the same creation to finish linking it; a second mailbox will not be created.',
    'action.access.mailboxes.provisioned': 'Mailbox directory synchronized.',
    'action.access.accountStatus.updated': 'Account status updated.',
    'action.access.mailbox.passwordUpdated': 'Mailbox password updated.',
    'action.access.mailbox.destroyed': 'Mailbox deleted; portal account preserved.',
    'action.validation.approvalDecision': 'Invalid approval decision.',
    'action.approval.decisionRecorded': 'Decision recorded.',
    'action.validation.financeDecision': 'Invalid finance decision.',
    'action.approval.financeReviewRecorded': 'Finance review recorded.',
    'action.validation.billingStream': 'Invalid billing stream.',
    'action.billing.streamSaved': 'Billing stream saved.',
    'action.validation.legalEntityFields': 'Check legal entity fields.',
    'action.billing.legalEntitySaved': 'Legal entity saved.',
    'action.validation.invoiceNumberPolicyFields': 'Check invoice-number policy fields.',
    'action.billing.invoiceNumberPolicySaved': 'Invoice-number policy saved.',
    'action.validation.taxProfileFields': 'Check tax profile fields.',
    'action.billing.taxProfileSaved': 'Tax profile saved.',
    'action.validation.billingRuleIdRequired': 'Billing Rule ID required.',
    'action.validation.fixedAmount': 'Fixed amount must be a non-negative exact amount.',
    'action.billing.ruleUpdated': 'Billing rule updated.',
    'action.billing.ruleArchived': 'Billing rule archived.',
    'action.validation.legalEntityIdRequired': 'Legal Entity ID required.',
    'action.billing.legalEntityUpdated': 'Legal entity updated.',
    'action.billing.legalEntityArchived': 'Legal entity archived.',
    'action.validation.taxProfileIdRequired': 'Tax Profile ID required.',
    'action.billing.taxProfileUpdated': 'Tax profile updated.',
    'action.billing.taxProfileArchived': 'Tax profile archived.',
    'action.validation.billingPeriod': 'Invalid billing period.',
    'action.validation.invoiceAdjustment': 'Invalid invoice adjustment.',
    'action.billing.invoiceAdjustmentCreated': 'Adjustment draft created.',
    'action.validation.invoice': 'Invalid invoice.',
    'action.billing.invoiceApproved': 'Invoice approved.',
    'action.billing.invoiceDeleted': 'Invoice deleted.',
    'action.validation.payment': 'Invalid payment.',
    'action.billing.paymentRecorded': 'Payment recorded.',
    'action.billing.periodClosed': 'Billing period closed and sources locked.',
    'action.validation.invoiceVoid': 'Invalid void request.',
    'action.billing.invoiceVoided': 'Invoice voided with audit trail.',
    'action.validation.invoiceSend': 'Invalid send request.',
    'action.billing.accountingPackFinalized': 'Accounting Pack marked final.',
    'action.validation.invoiceIdRequired': 'Invoice ID required.',
    'action.billing.invoiceUpdated': 'Invoice draft details updated.',
    'action.validation.documentSensitivity': 'Document classification is invalid.',
    'action.validation.documentRequired': 'Choose a private document to upload.',
    'action.validation.documentMetadata': 'Project, artifact type and description are required.',
    'action.validation.documentTypeOrSize': 'Unsupported document type or size over 50 MB.',
    'action.validation.documentContent':
      'Document filename or content does not match its declared type.',
    'action.error.financeRoleRequired': 'Finance document access required.',
    'action.validation.documentPath': 'Invalid private document path.',
    'action.documents.uploaded': 'Private document uploaded and hash-registered.',
    'action.validation.documentIdRequired': 'Document ID required.',
    'action.documents.deleted': 'Document deleted.',
    'action.validation.expenseFields': 'Check expense fields.',
    'action.validation.receiptTypeOrSize': 'Receipt must be JPG, PNG or PDF under 10 MB.',
    'action.validation.receiptContent':
      'Receipt filename or content does not match its declared file type.',
    'action.validation.receiptPath': 'Invalid receipt path.',
    'action.expense.draftSaved': 'Expense draft saved.',
    'action.validation.expenseRecord': 'Invalid expense record.',
    'action.expense.submitted': 'Expense submitted.',
    'action.reports.draftDeleted': 'Draft deleted.',
    'action.validation.compensationRule': 'Invalid compensation rule.',
    'action.finance.compensationRuleSaved': 'Worker compensation rule saved.',
    'action.validation.compensationRuleId': 'Compensation rule ID is invalid.',
    'action.validation.replacementCompensationRule': 'Invalid replacement compensation rule.',
    'action.finance.compensationRuleSuperseded': 'Compensation rule superseded.',
    'action.finance.compensationRuleDeactivated': 'Compensation rule deactivated.',
    'action.validation.settlementPeriod': 'Invalid settlement period.',
    'action.validation.reimbursement': 'Invalid reimbursement.',
    'action.validation.clientLaborRate': 'Invalid client rate.',
    'action.finance.clientLaborRateSaved': 'Client labor rate saved.',
    'action.validation.clientLaborRateId': 'Client labor rate ID is invalid.',
    'action.validation.replacementClientLaborRate': 'Invalid replacement client rate.',
    'action.finance.clientLaborRateSuperseded': 'Client labor rate superseded.',
    'action.finance.clientLaborRateDeactivated': 'Client labor rate deactivated.',
    'action.validation.internalCostRule': 'Invalid internal cost rule.',
    'action.finance.internalCostRuleSaved': 'Internal cost rule saved.',
    'action.validation.internalCostRuleId': 'Internal cost rule ID is invalid.',
    'action.validation.replacementInternalCostRule': 'Invalid replacement internal cost rule.',
    'action.finance.internalCostRuleSuperseded': 'Internal cost rule superseded.',
    'action.finance.internalCostRuleDeactivated': 'Internal cost rule deactivated.',
    'action.validation.assignmentOverride': 'Invalid assignment override.',
    'action.finance.assignmentRateOverrideSaved': 'Assignment rate override saved.',
    'action.validation.notificationIdRequired': 'Notification is required.',
    'action.notifications.markedRead': 'Notification marked as read.',
    'action.validation.reportAutosaveRequest': 'Invalid report autosave request.',
    'action.error.reportEditAccess': 'Report edit access required.',
    'action.conflict.reportNotEditable':
      'Autosave is available only for draft reports or reports needing changes.',
    'action.reports.autosaved': 'Report draft autosaved.',
    'action.validation.draftDelete': 'Invalid draft deletion.',
    'action.validation.correctionDraft': 'Invalid correction request.',
    'action.reports.correctionDraftCreated': 'Correction draft created.',
    'action.validation.projectReportingPeriod': 'Check project and reporting period.',
    'action.validation.dailyReportFields': 'Check the daily report fields.',
    'action.validation.technicalReportFields': 'Check the PLC report fields.',
    'action.reports.technicalDraftSaved': 'PLC report draft saved.',
    'action.validation.technicalChangeFields': 'Check technical change fields.',
    'action.reports.technicalChangeDraftSaved': 'Technical change draft saved.',
    'action.validation.report': 'Invalid report.',
    'action.reports.submitted': 'Report submitted for review.',
    'action.validation.technicalChange': 'Invalid technical change.',
    'action.reports.technicalChangeSubmitted': 'Technical change submitted for review.',
    'action.validation.planningFields': 'Check planning fields.',
    'action.planning.assignmentPublished': 'Assignment published.',
    'action.validation.skillFields': 'Check skill fields.',
    'action.planning.skillSaved': 'Skill saved.',
    'action.validation.workerSkillFields': 'Check worker skill fields.',
    'action.planning.workerSkillUpdated': 'Worker skill updated.',
    'action.validation.skillIdRequired': 'Skill ID required.',
    'action.planning.skillUpdated': 'Skill updated.',
    'action.planning.skillDeleted': 'Skill deleted.',
    'action.validation.workerSkillIdsRequired': 'Worker ID and Skill ID required.',
    'action.planning.workerSkillDeleted': 'Worker skill deleted.',
    'action.validation.availabilityFields': 'Check availability fields.',
    'action.planning.availabilitySaved': 'Availability saved.',
    'action.validation.reportDecision': 'Invalid report decision.',
    'action.approvals.reportReviewRecorded': 'Report review recorded.',
    'action.validation.technicalChangeDecision': 'Invalid technical change decision.',
    'action.approvals.technicalChangeReviewRecorded': 'Technical change review recorded.',
    'action.validation.milestoneDecision': 'Invalid milestone decision.',
    'action.validation.milestoneDecisionType': 'Milestones must be approved or rejected.',
    'action.approvals.milestoneReviewRecorded': 'Milestone review recorded.',
    'action.validation.clientFields': 'Check client fields.',
    'action.validation.contactFields': 'Check contact fields.',
    'action.projects.clientContactSaved': 'Client contact saved.',
    'action.validation.projectIdRequired': 'Project ID required.',
    'action.validation.lifecycleFields': 'Project version is required.',
    'action.projects.projectUpdated': 'Project updated.',
    'action.validation.projectFields': 'Check project fields.',
    'action.validation.milestoneFields': 'Check milestone fields.',
    'action.projects.milestoneDraftSaved': 'Milestone draft saved.',
    'action.validation.milestoneRecord': 'Invalid milestone record.',
    'action.projects.milestoneSubmitted': 'Milestone submitted for review.',
    'action.validation.scheduleFields': 'Check schedule fields.',
    'action.projects.scheduleSaved': 'Expected schedule saved.',
    'action.validation.assignmentFields': 'Check assignment fields.',
    'action.projects.assignmentCreated': 'Assignment created.',
    'action.projects.clientUpdated': 'Client updated.',
    'action.projects.clientArchived': 'Client archived.',
    'action.validation.clientIdRequired': 'Client ID required.',
    'action.projects.clientDeleted': 'Client deleted.',
    'action.projects.projectDeleted': 'Project deleted.',
    'action.validation.contactIdRequired': 'Contact ID required.',
    'action.projects.clientContactUpdated': 'Client contact updated.',
    'action.projects.clientContactDeleted': 'Client contact deleted.',
    'action.validation.assignmentIdRequired': 'Assignment ID required.',
    'action.projects.assignmentUpdated': 'Assignment updated.',
    'action.projects.assignmentDeleted': 'Assignment removed.',
    'action.validation.timeFields': 'Check time fields.',
    'action.time.draftSaved': 'Time draft saved.',
    'action.validation.timeSourceWeekDifferent': 'Choose a different source week.',
    'action.time.draftUpdated': 'Time draft updated.',
    'action.validation.timeRecord': 'Invalid time record.',
    'action.time.submitted': 'Time submitted.',
    'action.time.removedOrVoided': 'Time entry removed/voided.',
    'action.error.invalid': 'The period report was not found.',
    'action.reports.periodFollowupRecorded': 'Period follow-up recorded.',
    'action.closeout.draftPrepared': 'Closeout draft prepared.',
    'action.closeout.draftRefreshed':
      'Closeout draft refreshed; review and confirm the new client snapshot.',
    'action.closeout.clientSnapshotConfirmed': 'Exact client snapshot confirmed.',
    'action.closeout.packagesFinalized': 'Closeout packages finalized.',
    'action.closeout.reopened': 'Closeout reopened.',
    'action.access.invitation.created': 'Invitation created.',
    'action.billing.invoiceDraftCreated': 'Invoice draft created.',
    'action.billing.invoiceDraftExisting': 'Existing invoice draft returned.',
    'action.billing.invoiceIssued': 'Invoice issued.',
    'action.billing.jobsProcessed': 'Background jobs processed.',
    'action.expense.removedOrVoided': 'Expense removed or voided.',
    'action.finance.compensationSettled': 'Worker compensation settlement recorded.',
    'action.finance.reimbursementRecorded': 'Expense reimbursement recorded.',
    'action.projects.clientCreated': 'Client created.',
    'action.projects.projectCreated': 'Project created.',
    'action.reports.periodReportsRefreshed': 'Period reports refreshed.',
    'action.time.layoutCopied': 'Weekly time layout copied.',
    'action.access.mailbox.created': 'Mailbox created.',
    'action.access.mailbox.aliasExists': 'This mailbox alias already exists.',
    'action.access.mailbox.identityCollision':
      'This mailbox conflicts with an existing portal identity.',
    'action.access.mailbox.invalidAlias':
      'Use an alias of 2–64 lowercase letters, numbers, dots, underscores or hyphens.',
    'action.access.mailbox.invalidPassword':
      'Use a password of 12–128 characters without line breaks.',
    'action.access.mailbox.invalidQuota': 'The mailbox quota is invalid.',
    'action.access.mailbox.passwordRejected': 'The mail server rejected the password.',
    'action.access.mailbox.permissionDenied': 'The mail server did not authorize this operation.',
    'action.access.mailbox.rejected': 'The mail server rejected this operation.',
    'action.access.mailbox.relinkRequired':
      'This mailbox requires an explicit portal account relink.',
    'action.access.mailbox.userInactive':
      'Restore this archived portal user before linking the mailbox.',
    'action.billing.invoicePlanningDatesSaved': 'Invoice planning dates saved.',
    'action.finance.compensationExpectedPaymentSaved': 'Expected worker payment date saved.',
    'action.finance.compensationPaymentRecorded': 'Actual compensation payment recorded.',
    'action.finance.compensationPaymentReversed':
      'Compensation payment reversed with an audit event.',
    'action.finance.expenseClassified': 'Expense commercial classification saved.',
    'action.finance.expensePlanningDatesSaved': 'Expense planning dates saved.',
    'action.finance.projectCommercialPolicySaved': 'Project commercial policy saved.',
    'action.validation.compensationSettlementPlanning': 'Check the expected worker payment date.',
    'action.validation.compensationPayment': 'Check the actual payment fields.',
    'action.validation.compensationPaymentReversal': 'Check the payment reversal fields.',
    'action.validation.expenseCommercialClassification':
      'Check the expense commercial classification fields.',
    'action.validation.expensePlanningDates': 'Check the expense planning dates.',
    'action.validation.invoicePlanningDates': 'Check the invoice planning dates.',
    'action.validation.paymentReversal': 'Check the payment reversal details and reason.',
    'action.validation.projectCommercialPolicy': 'Check the project commercial policy fields.',
    'action.billing.paymentReversed': 'Payment reversal recorded.',
    'action.billing.invoiceDraftCreatedForPeriod':
      'Invoice draft created for {periodStart} → {periodEnd}, the last complete period with approved billable work.',
    'action.billing.invoiceDraftExistingForPeriod':
      'Existing invoice draft returned for {periodStart} → {periodEnd}.',
    'action.conflict.billingPeriodIncomplete':
      'This billing period is not ready for a draft. Review the causes below and fix them in Approvals or Finance configuration.',
    'action.billing.readiness.noBillableSources':
      'The selected period has no approved billable hours or expenses. Review its pending records or explicitly choose another period; the app will not change the dates for you.',
    'action.billing.readiness.periodCutoffMismatch':
      'These dates do not match this billing stream’s cadence (for example a weekly stream needs a Monday–Sunday week). Choose the correct period; the app will not replace it automatically.',
    'action.billing.readiness.pendingTimeApproval':
      'Time entries in this period are still waiting for approval. Approve or reject them in Approvals, then create the draft again.',
    'action.billing.readiness.pendingExpenseApproval':
      'Expenses in this period are still waiting for approval. Approve or reject them in Approvals, then create the draft again.',
    'action.billing.readiness.missingTaxProfile':
      'This billing stream has no tax profile. Add one in Finance configuration, then create the draft again.',
    'action.billing.readiness.inactiveTaxProfile':
      'This stream’s tax profile is not active. Activate it or assign an active profile in Finance configuration.',
    'action.billing.readiness.missingLegalEntity':
      'This billing stream has no legal entity. Assign one in Finance configuration.',
    'action.billing.readiness.archivedLegalEntity':
      'This stream’s legal entity is archived. Restore it or assign an active entity in Finance configuration.',
    'action.billing.readiness.legalEntityCurrencyMismatch':
      'The legal entity currency does not match this billing stream. Correct it in Finance configuration.',
    'action.billing.readiness.taxProfileCurrencyMismatch':
      'The tax profile currency does not match this billing stream. Correct it in Finance configuration.',
    'action.billing.readiness.taxProfileLegalEntityMismatch':
      'The tax profile does not belong to this stream’s legal entity. Reassign it in Finance configuration.',
    'action.billing.readiness.invalidPeriod':
      'The period end is before the start date. Choose a valid period.',
    'action.billing.readiness.invalidPeriodConfiguration':
      'This stream’s cadence cannot calculate the period. Check the anchor date or monthly cutoff on the billing stream.',
    'action.billing.readiness.missingFixedPrice':
      'This all-in labor stream has no fixed price. Configure it on the project or billing stream.',
    'action.billing.readiness.capExhausted':
      'This project’s purchase-order cap is already consumed. Increase the cap or invoice another stream.',
    'action.billing.readiness.missingClientRate':
      'Approved hours are missing a client labor rate. Add the client rate in Finance, then create the draft again.',
    'action.billing.readiness.missingExpenseCurrencyConversion':
      'Expenses in another currency are missing conversion into the billing currency. Complete the conversion in Finance.',
    'action.billing.readiness.missingExpenseFinanceProjection':
      'Classified expenses are missing a finance projection. Complete commercial classification in Finance.',
    'action.billing.readiness.customerSignoffRequired':
      'Customer conformity is still required for this period. Capture it on the project period report, then issue again.',
    'action.billing.readiness.canonicalLegalEntityRevisionRequired':
      'This project has no reviewed legal-entity revision for issuing. Assign it in Finance configuration.',
    'action.billing.readiness.missingInvoiceNumberPolicy':
      'The approved invoice numbering policy is missing. Configure it in Billing before issuing.',
    'action.billing.readiness.inactiveBillingConfiguration':
      'This billing stream or its legal/tax configuration is not active. Review it in Finance configuration.',
    'action.reports.dailyDraftSaved': 'Daily report draft saved.',
    'action.reports.periodReportApproved': 'Period report approved.',
    'action.reports.periodReportAlreadyApproved': 'Period report was already approved.',
    'action.reports.customerSignoffRecorded': 'Customer conformity recorded.',
    'action.reports.customerSignoffEvidenceAttached':
      'Signed-copy evidence attached to the historical conformity.',
    'action.reports.customerSignoffInvalidated': 'Customer conformity invalidated.',
    'action.validation.periodReportApproval': 'A valid period report snapshot binding is required.',
    'action.validation.customerSignoff': 'Customer conformity details are required.',
    'action.validation.customerSignoffInvalidation':
      'Conformity and invalidation reason are required.',
    'action.validation.projectLegalEntityAssignment':
      'The project issuing-authority assignment is invalid.',
    'action.finance.projectLegalEntityAssigned': 'Project issuing authority saved.',
    'action.validation.accountingPeriod':
      'Choose a start date on or before the end date. Empty dates use the previous complete month.',
  };
  if (exactEnglish[key]) return exactEnglish[key];
  if (suffix === 'error.invalid') return 'The submitted values are invalid.';
  if (suffix === 'error.forbidden') return 'You do not have permission to perform this action.';
  if (suffix === 'error.unauthenticated') return 'Sign in again to continue.';
  if (suffix === 'error.conflict') return 'This action conflicts with the current record state.';
  if (suffix === 'error.unavailable')
    return 'The action could not be completed. Try again shortly.';
  if (suffix.startsWith('billing.accountingPack.')) {
    const state = suffix.split('.').at(-1) ?? 'queued';
    const stateText =
      { failed: 'failed', processing: 'processing', queued: 'queued', ready: 'ready' }[state] ??
      state;
    return `Accounting pack {packId} ${stateText}.`;
  }
  return 'The action could not be completed.';
}

export function englishCoverageKey(key: string): string {
  return key.startsWith('action.') ? englishActionMessage(key) : key;
}

export function translateCoverageKey(locale: 'es' | 'pt', key: string): string {
  const direct = (exact[key] ?? extraExact[key])?.[locale === 'es' ? 0 : 1];
  if (direct) return direct;
  if (key.startsWith('action.')) return actionMessage(locale, key);
  if (isCoverageInvariantKey(key)) return key;
  const explicit = explicitCoverageLiterals[key]?.[locale === 'es' ? 0 : 1];
  if (explicit) return explicit;
  throw new Error(`Missing explicit ${locale} coverage translation: ${key}`);
}

/**
 * Coverage audit primitive. A key is explicit when it is a technical display
 * invariant, has a complete literal entry, or is rendered by the semantic
 * action message templates above. This deliberately does not inspect the
 * translated output, so a mechanical word fallback cannot pass the audit.
 */
export function isExplicitCoverageTranslation(_locale: 'es' | 'pt', key: string): boolean {
  return (
    isCoverageInvariantKey(key) ||
    key.startsWith('action.') ||
    Boolean(exact[key] ?? extraExact[key] ?? explicitCoverageLiterals[key])
  );
}

export function coverageInvariantKeys(): ReadonlySet<string> {
  return invariantKeys;
}
