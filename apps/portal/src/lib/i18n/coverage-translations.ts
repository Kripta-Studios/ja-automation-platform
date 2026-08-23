import { explicitCoverageLiterals } from './coverage-literals';

/**
 * User-facing literals that predate the typed catalog are covered here while
 * their components are migrated to semantic keys. Every registered literal is
 * backed by an explicit translation entry (or a deliberate semantic message
 * renderer for action keys); free text never enters this catalog.
 */

const exact: Record<string, readonly [string, string]> = {
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
  'Standby / waiting': ['Disponibilidad / espera', 'Plantão / espera'],
  'Standby reason': ['Motivo de disponibilidad', 'Motivo do plantão'],
  Starts: ['Comienza', 'Começa'],
  State: ['Estado', 'Estado'],
  Status: ['Estado', 'Status'],
  'Status for': ['Estado de', 'Status de'],
  Stream: ['Flujo', 'Fluxo'],
  Submitted: ['Enviado', 'Enviado'],
  Subtotal: ['Importe parcial', 'Subtotal geral'],
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
      'El margen de contribución son los ingresos del proyecto menos el coste aprobado del proyecto. No es el beneficio neto de la empresa.',
      'A margem de contribuição é a receita do projeto menos o custo aprovado do projeto. Não é o lucro líquido da empresa.',
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
  'Production accounts require a second factor. Enabling MFA returns the setup URI and one-time recovery codes; store them in an approved password manager.':
    [
      'Las cuentas de producción requieren un segundo factor. Activar MFA devuelve la URI de configuración y códigos de recuperación de un solo uso; guárdalos en un gestor de contraseñas aprobado.',
      'As contas de produção exigem um segundo fator. Ativar MFA retorna a URI de configuração e códigos de recuperação de uso único; guarde-os em um gerenciador de senhas aprovado.',
    ],
  'Projects cannot be hard-deleted to preserve financial history and audit logs. Use Archived to remove a project from active operational views.':
    [
      'Los proyectos no se pueden eliminar físicamente para conservar el historial financiero y los registros de auditoría. Usa Archivado para quitar un proyecto de las vistas operativas activas.',
      'Projetos não podem ser excluídos permanentemente para preservar o histórico financeiro e os registros de auditoria. Use Arquivado para remover um projeto das visões operacionais ativas.',
    ],
  'Protected by secure sessions, rate limits and multi-factor authentication.': [
    'Protegido por sesiones seguras, límites de frecuencia y autenticación multifactor.',
    'Protegido por sessões seguras, limites de frequência e autenticação multifator.',
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
  Collected: ['Cobrado', 'Recolhido'],
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
    'Gerar retrato da liquidação',
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
  'Markup (basis points)': ['Margen (puntos básicos)', 'Acréscimo (pontos-base)'],
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
  'Recalculate snapshot': ['Recalcular instantánea', 'Recalcular retrato'],
  Receivable: ['Por cobrar', 'A receber'],
  'Received on': ['Recibido el', 'Recebido em'],
  'Recent entries': ['Registros recientes', 'Registros recentes'],
  'Recent expenses': ['Gastos recientes', 'Despesas recentes'],
  'Recipient email': ['Correo del destinatario', 'E-mail do destinatário'],
  Reimbursable: ['Reembolsable', 'Reembolsável'],
  'Reimbursable + markup': ['Reembolsable + margen', 'Reembolsável + acréscimo'],
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
  Subtotal: ['Importe parcial', 'Subtotal geral'],
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
  Auditor: ['Revisor', 'Auditor interno'],
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
  'STEP-UP AUTHENTICATION': ['AUTENTICACIÓN REFORZADA', 'AUTENTICAÇÃO REFORÇADA'],
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

function titleCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

/**
 * Action messages are intentionally semantic. The old implementation split
 * camel-case keys and replaced individual English words, which produced text
 * such as “proyectos proyecto actualizado”. These entries use complete phrases
 * and the validation renderer below supplies the small, stable family of
 * validation messages without exposing an English fallback to users.
 */
const actionExact: Record<string, readonly [string, string]> = {
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
  'action.billing.invoiceAlreadySent': ['La factura ya fue enviada.', 'A fatura já foi enviada.'],
  'action.billing.invoiceApproved': ['Factura aprobada.', 'Fatura aprovada.'],
  'action.billing.invoiceDeleted': ['Factura eliminada.', 'Fatura excluída.'],
  'action.billing.invoiceDraftCreated': [
    'Borrador de factura creado.',
    'Rascunho de fatura criado.',
  ],
  'action.billing.invoiceDraftExisting': [
    'Ya existe un borrador de factura.',
    'Já existe um rascunho de fatura.',
  ],
  'action.billing.invoiceIssued': ['Factura emitida.', 'Fatura emitida.'],
  'action.billing.invoiceNumberPolicySaved': [
    'Política de numeración de facturas guardada.',
    'Política de numeração de faturas salva.',
  ],
  'action.billing.invoiceSent': ['Factura enviada.', 'Fatura enviada.'],
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
  'action.conflict.billingPeriodIncomplete': [
    'El período de facturación está incompleto.',
    'O período de faturamento está incompleto.',
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
  'action.reports.periodReportsRefreshed': [
    'Informes del período actualizados.',
    'Relatórios do período atualizados.',
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
  const suffix = key.slice('action.'.length);
  if (suffix === 'error.invalid') return 'The submitted values are invalid.';
  if (suffix === 'error.forbidden') return 'You do not have permission to perform this action.';
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
  return titleCase(suffix.replace(/^validation\./, 'validation ').replace(/^error\./, 'error '));
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
