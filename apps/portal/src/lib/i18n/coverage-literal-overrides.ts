/** Natural translations for literals whose source wording is sentence-like. */
export const explicitCoverageLiteralOverrides: Record<string, readonly [string, string]> = {
  'A selected tax profile calculates tax. Without one, the draft adds no tax.': [
    'Si seleccionas un perfil fiscal, se calcula el impuesto. Sin perfil, el borrador no añade impuestos.',
    'Ao selecionar um perfil tributário, o imposto é calculado. Sem ele, o rascunho não adiciona impostos.',
  ],
  'Customer billing address': [
    'Dirección de facturación del cliente',
    'Endereço de faturamento do cliente',
  ],
  'Customer legal entity': ['Entidad jurídica del cliente', 'Entidade jurídica do cliente'],
  'Edit issuer': ['Editar emisor', 'Editar emitente'],
  'Eligible expense subtotal before caps and adjustments': [
    'Subtotal de gastos elegibles antes de límites y ajustes',
    'Subtotal das despesas elegíveis antes de limites e ajustes',
  ],
  'Eligible expenses': ['Gastos elegibles', 'Despesas elegíveis'],
  'Invoice issuer': ['Emisor de la factura', 'Emitente da fatura'],
  'Invoice issuer (J&A Automation)': [
    'Emisor de la factura (J&A Automation)',
    'Emitente da fatura (J&A Automation)',
  ],
  'Invoice issuers (J&A Automation)': [
    'Emisores de facturas (J&A Automation)',
    'Emitentes de faturas (J&A Automation)',
  ],
  'Issuer address and phone': [
    'Dirección y teléfono del emisor',
    'Endereço e telefone do emitente',
  ],
  'New invoice issuer': ['Nuevo emisor de facturas', 'Novo emitente de faturas'],
  'No invoice issuers recorded.': [
    'No hay emisores de facturas registrados.',
    'Não há emitentes de faturas cadastrados.',
  ],
  'No tax profile configured': [
    'Sin perfil fiscal configurado',
    'Nenhum perfil tributário configurado',
  ],
  'Payment terms come from the billing stream. Review payment instructions on the draft before issuing.':
    [
      'Las condiciones de pago proceden del flujo de facturación. Revisa las instrucciones de pago del borrador antes de emitirlo.',
      'As condições de pagamento vêm do fluxo de faturamento. Confira as instruções de pagamento no rascunho antes de emitir a fatura.',
    ],
  'Save issuer': ['Guardar emisor', 'Salvar emitente'],
  'Tax or registration identifier (optional)': [
    'Identificador fiscal o de registro (opcional)',
    'Identificador fiscal ou de registro (opcional)',
  ],
  'The invoice issuer is your company. The customer legal name comes from the client used to create this project.':
    [
      'El emisor de la factura es tu empresa. El nombre legal del cliente procede del cliente con el que se creó este proyecto.',
      'O emitente da fatura é sua empresa. A razão social do cliente vem do cadastro usado para criar este projeto.',
    ],
  'Add a meal expense with these hours': [
    'Añadir un gasto de comida con estas horas',
    'Adicionar uma despesa com refeição junto destas horas',
  ],
  'Add daily hours for one assigned worker and project. Blank days are skipped. The whole batch saves as drafts or nothing saves.':
    [
      'Añade horas diarias para un trabajador asignado y un proyecto. Se omiten los días vacíos. El lote completo se guarda como borradores o no se guarda nada.',
      'Adicione horas diárias para um trabalhador atribuído e um projeto. Dias vazios são ignorados. O lote inteiro é salvo como rascunhos ou nada é salvo.',
    ],
  'Choose a worker and a day to add time or manage editable drafts.': [
    'Elige un trabajador y un día para añadir horas o gestionar borradores editables.',
    'Escolha um trabalhador e um dia para adicionar horas ou gerenciar rascunhos editáveis.',
  ],
  'Enter a week in a table': [
    'Introducir una semana en una tabla',
    'Registrar uma semana em uma tabela',
  ],
  'Enter a worker, assigned project, valid decimal hours and activity for every filled day.': [
    'Indica un trabajador, un proyecto asignado, horas decimales válidas y una actividad para cada día rellenado.',
    'Informe um trabalhador, um projeto atribuído, horas decimais válidas e uma atividade para cada dia preenchido.',
  ],
  'Enter hours and activity for at least one day.': [
    'Indica horas y actividad para al menos un día.',
    'Informe horas e atividade para pelo menos um dia.',
  ],
  'Hours you really recorded.': [
    'Horas que registraste realmente.',
    'Horas que você realmente registrou.',
  ],
  'Log time on this day': ['Registrar horas en este día', 'Registrar horas neste dia'],
  Month: ['Mes', 'Mês'],
  'No time recorded for this day.': [
    'No hay horas registradas para este día.',
    'Não há horas registradas neste dia.',
  ],
  'Select a worker to review this day.': [
    'Selecciona un trabajador para revisar este día.',
    'Selecione um trabalhador para conferir este dia.',
  ],
  'Submit all draft hours for one worker in the displayed week, together with meals added in Log time. Submitted records enter review.':
    [
      'Envía todas las horas en borrador de un trabajador durante la semana mostrada, junto con las comidas añadidas al registrar horas. Los registros enviados pasan a revisión.',
      'Envie todas as horas em rascunho de um trabalhador na semana exibida, junto com as refeições adicionadas ao registrar horas. Os registros enviados passam por revisão.',
    ],
  'Submit this week': ['Enviar esta semana', 'Enviar esta semana'],
  'The daily entries could not be saved. Try again.': [
    'No se pudieron guardar los registros diarios. Inténtalo de nuevo.',
    'Não foi possível salvar os registros diários. Tente novamente.',
  ],
  'The draft could not be deleted. Refresh and try again.': [
    'No se pudo eliminar el borrador. Actualiza la página e inténtalo de nuevo.',
    'Não foi possível excluir o rascunho. Atualize a página e tente novamente.',
  ],
  'The week could not be submitted. Refresh and try again.': [
    'No se pudo enviar la semana. Actualiza la página e inténtalo de nuevo.',
    'Não foi possível enviar a semana. Atualize a página e tente novamente.',
  ],
  'Time calendar': ['Calendario de horas', 'Calendário de horas'],
  'Work completed': ['Trabajo realizado', 'Trabalho concluído'],
  'draft entries ready': ['registros en borrador listos', 'registros em rascunho prontos'],
  'time entries': ['registros de horas', 'registros de horas'],
  'Copies projects, categories and activity labels into zero-hour drafts. It never copies time values.':
    [
      'Copia proyectos, categorías y actividades en borradores con cero horas. Nunca copia los valores de horas.',
      'Copia projetos, categorias e atividades para rascunhos com zero horas. Nunca copia os valores de horas.',
    ],
  'Change the requested operational fields before creating this draft. Review every value: a linked correction cannot be edited after creation. You can withdraw an unsubmitted draft and start again.':
    [
      'Cambia los datos operativos solicitados antes de crear este borrador. Revisa todos los valores: una corrección vinculada no se puede editar después. Puedes retirar un borrador sin enviar y empezar de nuevo.',
      'Altere os dados operacionais solicitados antes de criar este rascunho. Revise todos os valores: uma correção vinculada não pode ser editada depois. Pode retirar um rascunho não enviado e recomeçar.',
    ],
  'Why withdraw this draft?': ['¿Por qué retiras este borrador?', 'Por que retirar este rascunho?'],
  'Withdraw correction draft': ['Retirar borrador de corrección', 'Retirar rascunho de correção'],
  'Keep current linked hours': [
    'Mantener las horas vinculadas actuales',
    'Manter as horas vinculadas atuais',
  ],
  'Changes saved in this report still need an explicit submission for review.': [
    'Los cambios guardados en este informe aún requieren que lo envíes para revisión.',
    'As alterações salvas neste relatório ainda exigem o envio para revisão.',
  ],
  'This local draft belongs to an older report version. Compare it and copy only needed text; it cannot replace the newer record.':
    [
      'Este borrador local pertenece a una versión anterior del informe. Compáralo y copia sólo el texto necesario; no puede sustituir el registro más reciente.',
      'Este rascunho local pertence a uma versão anterior do relatório. Compare e copie apenas o texto necessário; não pode substituir o registo mais recente.',
    ],
  'Submit for review': ['Enviar para revisión', 'Enviar para revisão'],
  'Report actions': ['Acciones del informe', 'Ações do relatório'],
  'Draft actions': ['Acciones del borrador', 'Ações do rascunho'],
  Correction: ['Corrección', 'Correção'],
  'The recorded worker must create a corrected draft from their Expenses register.': [
    'El trabajador registrado debe crear un borrador corregido desde su registro de gastos.',
    'O trabalhador registado deve criar um rascunho corrigido no seu registo de despesas.',
  ],
  'A rejected expense cannot be corrected. Create a new expense if the cost should be recorded.': [
    'Un gasto rechazado no se puede corregir. Crea un gasto nuevo si ese coste debe registrarse.',
    'Uma despesa rejeitada não pode ser corrigida. Crie uma nova despesa se esse custo tiver de ser registado.',
  ],
  'Unpaid reviewed settlements:': [
    'Liquidaciones revisadas pendientes de pago:',
    'Liquidações revistas por pagar:',
  ],
  'Approved reimbursements awaiting payment:': [
    'Reembolsos aprobados pendientes de pago:',
    'Reembolsos aprovados por pagar:',
  ],
  'Estimated compensation awaiting approval:': [
    'Compensación estimada pendiente de aprobación:',
    'Compensação estimada a aguardar aprovação:',
  ],
  'Estimated reimbursements awaiting approval:': [
    'Reembolsos estimados pendientes de aprobación:',
    'Reembolsos estimados a aguardar aprovação:',
  ],
  'Payment still outstanding': ['Pago todavía pendiente', 'Pagamento ainda pendente'],
  'Reviewed compensation and approved expenses that have not been paid yet.': [
    'Compensación revisada y gastos aprobados que todavía no se han pagado.',
    'Compensação revista e despesas aprovadas que ainda não foram pagas.',
  ],
  'No reviewed payments or approved reimbursements are outstanding in this period.': [
    'No hay liquidaciones revisadas ni reembolsos aprobados pendientes de pago en este periodo.',
    'Não há liquidações revistas nem reembolsos aprovados por pagar neste período.',
  ],
  'Registered documents are retained as evidence. Upload a corrected file as a new document; the original stays available in the audit history.':
    [
      'Los documentos registrados se conservan como prueba. Sube el archivo corregido como documento nuevo; el original seguirá disponible en el historial de auditoría.',
      'Os documentos registados são conservados como prova. Carregue o ficheiro corrigido como novo documento; o original continuará disponível no histórico de auditoria.',
    ],
  'A credit note cannot be overdue. Restore its issued status before accounting finalization.': [
    'Una nota de crédito no puede estar vencida. Restaura su estado de emisión antes de finalizar la contabilidad.',
    'Uma nota de crédito não pode estar vencida. Restaure o estado de emissão antes de finalizar a contabilidade.',
  ],
  'Open invoice': ['Abrir factura', 'Abrir fatura'],
  'Restore credit note status': [
    'Restaurar estado de la nota de crédito',
    'Restaurar estado da nota de crédito',
  ],
  'PROJECT RECORDS': ['REGISTROS DEL PROYECTO', 'REGISTOS DO PROJETO'],
  'Review outcome': ['Resultado de la revisión', 'Resultado da revisão'],
  'Delete draft': ['Eliminar borrador', 'Eliminar rascunho'],
  'Delete this draft?': ['¿Eliminar este borrador?', 'Eliminar este rascunho?'],
  'No review reason was recorded.': [
    'No se registró el motivo de la revisión.',
    'Não foi registado o motivo da revisão.',
  ],
  'An existing correction is': ['La corrección existente está', 'A correção existente está'],
  'The recorded worker owns this correction. Ask them to review it from their Time register.': [
    'La corrección pertenece al trabajador registrado. Pídele que la revise desde su registro de horas.',
    'A correção pertence ao trabalhador registado. Peça que a reveja no seu registo de horas.',
  ],
  'Ask the recorded worker to create a corrected draft from their Time register.': [
    'Pide al trabajador registrado que cree un borrador corregido desde su registro de horas.',
    'Peça ao trabalhador registado que crie um rascunho corrigido no seu registo de horas.',
  ],
  'Open the Time register to create a corrected draft': [
    'Abrir el registro de horas para crear un borrador corregido',
    'Abrir o registo de horas para criar um rascunho corrigido',
  ],
  'The recorded worker must create a corrected draft from their Time register.': [
    'El trabajador registrado debe crear un borrador corregido desde su registro de horas.',
    'O trabalhador registado deve criar um rascunho corrigido no seu registo de horas.',
  ],
  'Only worker-paid expenses can reimburse a worker': [
    'Solo los gastos pagados por el trabajador pueden reembolsarse a ese trabajador.',
    'Apenas despesas pagas pelo trabalhador podem ser reembolsadas a esse trabalhador.',
  ],
  'Client-paid expenses require client-direct recovery': [
    'Los gastos pagados por el cliente requieren recuperación directa del cliente.',
    'Despesas pagas pelo cliente exigem recuperação direta do cliente.',
  ],
  'A positive markup percentage is required': [
    'Indica un porcentaje de recargo mayor que cero.',
    'Informe uma percentagem de acréscimo maior que zero.',
  ],
  'Markup is only available with markup recovery': [
    'El recargo solo se puede usar con recuperación del cliente con recargo.',
    'O acréscimo só pode ser usado com recuperação do cliente com acréscimo.',
  ],
  'Choose a labor cadence anchor date': [
    'Elige la fecha de inicio de la periodicidad de horas.',
    'Escolha a data inicial da periodicidade das horas.',
  ],
  'Choose an expense cadence anchor date': [
    'Elige la fecha de inicio de la periodicidad de gastos.',
    'Escolha a data inicial da periodicidade das despesas.',
  ],
  'Use at least two characters for the template name': [
    'Escribe al menos dos caracteres para el nombre de la plantilla.',
    'Use pelo menos dois caracteres no nome do modelo.',
  ],
  'Your account does not have access to this page. Return to a section available to your role.': [
    'Tu cuenta no tiene acceso a esta página. Vuelve a una sección disponible para tu perfil.',
    'Sua conta não tem acesso a esta página. Volte a uma seção disponível para seu perfil.',
  ],
  'Project and billing stream': [
    'Proyecto y flujo de facturación',
    'Projeto e fluxo de faturamento',
  ],
  'Check the selected billing period before saving a draft.': [
    'Comprueba el periodo de facturación elegido antes de guardar el borrador.',
    'Verifique o período de faturamento escolhido antes de salvar o rascunho.',
  ],
  'Choose dates in the Period step to preview this invoice.': [
    'Elige las fechas en el paso Periodo para previsualizar esta factura.',
    'Escolha as datas na etapa Período para visualizar esta fatura.',
  ],
  'Resolve the period readiness issues before saving an invoice draft.': [
    'Resuelve los problemas del periodo antes de guardar el borrador de factura.',
    'Resolva os problemas do período antes de salvar o rascunho da fatura.',
  ],
  'No approved, unbilled expenses are available in this period. Choose another period or approve the expenses first.':
    [
      'No hay gastos aprobados y sin facturar en este periodo. Elige otro periodo o aprueba primero los gastos.',
      'Não há despesas aprovadas e não faturadas neste período. Escolha outro período ou aprove as despesas primeiro.',
    ],
  'The selected dates do not match this stream’s billing cadence. Choose its complete billing period.':
    [
      'Las fechas no coinciden con la periodicidad de este flujo. Elige su periodo de facturación completo.',
      'As datas não correspondem à periodicidade deste fluxo. Escolha o período de faturamento completo.',
    ],
  'The selected billing period is invalid. Check its start and end dates.': [
    'El periodo de facturación no es válido. Revisa las fechas de inicio y fin.',
    'O período de faturamento é inválido. Confira as datas de início e fim.',
  ],
  'This billing stream is inactive. Choose an active stream or configure a new one.': [
    'Este flujo de facturación está inactivo. Elige uno activo o configura otro.',
    'Este fluxo de faturação está inativo. Escolha um fluxo ativo ou configure outro.',
  ],
  'Worker must have an effective project assignment for the planning window': [
    'El trabajador debe estar asignado al proyecto durante todo el turno.',
    'O trabalhador deve estar atribuído ao projeto durante todo o turno.',
  ],
  'Worker already has an overlapping planning assignment': [
    'El trabajador ya tiene un turno planificado que se solapa.',
    'O trabalhador já tem um turno planeado sobreposto.',
  ],
  'Worker is unavailable for this planning window': [
    'El trabajador no está disponible durante este turno.',
    'O trabalhador não está disponível durante este turno.',
  ],
  'Planning end must follow a valid start': [
    'La hora de fin debe ser posterior a una hora de inicio válida.',
    'A hora de fim deve ser posterior a uma hora de início válida.',
  ],
  'Planned minutes must be between 1 and 10080': [
    'La duración planificada debe estar entre 1 minuto y 168 horas.',
    'A duração planeada deve estar entre 1 minuto e 168 horas.',
  ],
  'Billing access is required to check this period.': [
    'Necesitas acceso a facturación para comprobar este periodo.',
    'É necessário acesso ao faturamento para verificar este período.',
  ],
  'Select assigned worker': [
    'Selecciona un trabajador asignado',
    'Selecione um trabalhador atribuído',
  ],
  'No worker is assigned to this project for the selected dates. Assign a worker to the project or choose another date.':
    [
      'No hay trabajadores asignados a este proyecto en las fechas elegidas. Asigna uno al proyecto o cambia la fecha.',
      'Não há trabalhadores atribuídos a este projeto nas datas escolhidas. Atribua um ao projeto ou altere a data.',
    ],
  'Published assignments': ['Asignaciones publicadas', 'Atribuições publicadas'],
  'Save assignment': ['Guardar asignación', 'Salvar atribuição'],
  'Open existing invoice': ['Abrir factura existente', 'Abrir fatura existente'],
  'Classify expenses': ['Clasificar gastos', 'Classificar despesas'],
  'Review documents': ['Revisar documentos', 'Revisar documentos'],
  'Review project economics': ['Revisar economía de proyectos', 'Revisar economia dos projetos'],
  'Generate new version': ['Generar nueva versión', 'Gerar nova versão'],
  'Sources changed after this final version. Keep this historical pack and generate a new version for the same period.':
    [
      'Las fuentes cambiaron después de esta versión final. Conserva el paquete histórico y genera una versión nueva para el mismo periodo.',
      'As fontes mudaram após esta versão final. Mantenha o pacote histórico e gere uma nova versão para o mesmo período.',
    ],
  'An invoice already exists for this stream and period.': [
    'Ya existe una factura para este flujo y periodo.',
    'Já existe uma fatura para este fluxo e período.',
  ],
  'Cancel assignment': ['Cancelar asignación', 'Cancelar atribuição'],
  'Edit draft': ['Editar borrador', 'Editar rascunho'],
  'Save changes': ['Guardar cambios', 'Salvar alterações'],
  Minutes: ['Minutos', 'Minutos'],
  'This draft is linked to another record and cannot be edited or discarded.': [
    'Este borrador está vinculado a otro registro y no puede editarse ni descartarse.',
    'Este rascunho está vinculado a outro registro e não pode ser editado nem descartado.',
  ],
  'Amount: enter a number such as 12.34, with no more than two decimal places.': [
    'Importe: escribe un número como 12.34, con un máximo de dos decimales.',
    'Valor: digite um número como 12.34, com no máximo duas casas decimais.',
  ],
  'Actions for selected day': ['Acciones para el día seleccionado', 'Ações para o dia selecionado'],
  'Open existing correction': ['Abrir corrección existente', 'Abrir correção existente'],
  'Back to project': ['Volver al proyecto', 'Voltar ao projeto'],
  'Archive document': ['Archivar documento', 'Arquivar documento'],
  'Archive reason': ['Motivo del archivo', 'Motivo do arquivamento'],
  'Credit balance': ['Saldo a favor del cliente', 'Saldo a favor do cliente'],
  'Balance (receivable / credit)': ['Saldo (cobro / crédito)', 'Saldo (cobrança / crédito)'],
  'Net receivable / credit': [
    'Saldo neto por cobrar / a favor del cliente',
    'Saldo líquido a receber / a favor do cliente',
  ],
  'This issued credit is a balance owed to the customer. Review its allocation or refund in the ledger; do not record a customer payment.':
    [
      'Este crédito emitido es un saldo a favor del cliente. Revisa su aplicación o devolución en el libro; no registres un cobro del cliente.',
      'Este crédito emitido é um saldo a favor do cliente. Revise sua aplicação ou devolução no livro; não registre um pagamento do cliente.',
    ],
  'A credit balance is not a customer payment. Use the ledger to review it.': [
    'Un saldo a favor del cliente no es un cobro. Revísalo en el libro.',
    'Um saldo a favor do cliente não é um pagamento recebido. Revise-o no livro.',
  ],
  'Review credit in ledger': ['Revisar crédito en el libro', 'Revisar crédito no livro'],
  'Open planning for this day': ['Abrir planificación de este día', 'Abrir planejamento deste dia'],
  'Record time for this day': ['Registrar horas de este día', 'Registrar horas deste dia'],
  'Add expense for this day': ['Añadir gasto de este día', 'Adicionar despesa deste dia'],
  'Configure commercial terms': [
    'Configurar condiciones comerciales',
    'Configurar condições comerciais',
  ],
  'Edit economics inputs': ['Editar datos de economía', 'Editar dados econômicos'],
  'Create or edit milestones': ['Crear o editar hitos', 'Criar ou editar marcos'],
  'Commercial setup needs attention': [
    'Hay condiciones comerciales por resolver',
    'Há condições comerciais a resolver',
  ],
  'Review these people and save the missing or conflicting terms before preparing their records for billing.':
    [
      'Revisa estas personas y guarda las condiciones pendientes o en conflicto antes de preparar sus registros para facturación.',
      'Revise estas pessoas e salve as condições pendentes ou em conflito antes de preparar seus registros para faturamento.',
    ],
  'Set a customer hourly rate effective for this assignment.': [
    'Configura una tarifa por hora al cliente vigente para esta asignación.',
    'Configure uma tarifa horária do cliente válida para esta atribuição.',
  ],
  'Set this person’s compensation method and rate.': [
    'Configura el método y la tarifa de pago de esta persona.',
    'Configure o método e a taxa de pagamento desta pessoa.',
  ],
  'Set who pays expenses, whether the worker is reimbursed, and how the customer is charged.': [
    'Define quién paga los gastos, si se reembolsa al trabajador y cómo se cobran al cliente.',
    'Defina quem paga as despesas, se o trabalhador é reembolsado e como são cobradas do cliente.',
  ],
  'Set an internal cost rule in Finance to complete project economics.': [
    'Configura un coste interno en Finanzas para completar la economía del proyecto.',
    'Configure um custo interno em Finanças para completar a economia do projeto.',
  ],
  'Conflicting assignments or commercial rules overlap on the effective date. Review their dates in Finance.':
    [
      'Hay asignaciones o reglas comerciales solapadas en la fecha de vigencia. Revisa sus fechas en Finanzas.',
      'Há atribuições ou regras comerciais sobrepostas na data de vigência. Revise as datas em Finanças.',
    ],
  'A linked commercial rule is unavailable for this assignment or date. Review its scope and effective dates in Finance.':
    [
      'Una regla comercial vinculada no está disponible para esta asignación o fecha. Revisa su alcance y vigencia en Finanzas.',
      'Uma regra comercial vinculada não está disponível para esta atribuição ou data. Revise seu escopo e vigência em Finanças.',
    ],
  'Review the assignment and commercial rules for the effective date in Finance.': [
    'Revisa la asignación y las reglas comerciales para la fecha de vigencia en Finanzas.',
    'Revise a atribuição e as regras comerciais para a data de vigência em Finanças.',
  ],
  'Entries recorded on {dia}': ['Registros del {dia}', 'Registros de {dia}'],
  'If a worker is not listed, ask the owner to assign them to a project you manage first.': [
    'Si no aparece un trabajador, pide al propietario que primero lo asigne a un proyecto que gestionas.',
    'Se um trabalhador não aparecer, peça ao proprietário que primeiro o atribua a um projeto que você gerencia.',
  ],
  'Legal entities and invoice numbering policies require owner access.': [
    'Las entidades jurídicas y las políticas de numeración de facturas requieren acceso de propietario.',
    'As entidades jurídicas e as políticas de numeração de faturas exigem acesso de proprietário.',
  ],
  'open ended': ['sin fecha de fin', 'sem data de término'],
  person: ['persona', 'pessoa'],
  ' onward': [' en adelante', ' em diante'],
  ' to {dia}': [' hasta {dia}', ' até {dia}'],
  ' · customer markup {percent}%': [
    ' · recargo al cliente del {percent} %',
    ' · acréscimo ao cliente de {percent}%',
  ],
  ' · source {id}': [' · registro {id}', ' · registro {id}'],
  'Approved operational source': ['Registro operativo aprobado', 'Registro operacional aprovado'],
  'Customer rate {clientRate} · worker pay {payMethod} · internal cost {cost}': [
    'Tarifa al cliente {clientRate} · pago al trabajador {payMethod} · coste interno {cost}',
    'Tarifa ao cliente {clientRate} · pagamento ao trabalhador {payMethod} · custo interno {cost}',
  ],
  Excluded: ['Excluido', 'Excluído'],
  'No assignment expense policy selected': [
    'No se ha seleccionado una política de gastos para la asignación',
    'Nenhuma política de despesas foi selecionada para a atribuição',
  ],
  'Pending approval': ['Pendiente de aprobación', 'Pendente de aprovação'],
  'Policy v{version}: worker reimbursement {workerReimbursement} · customer recovery {clientRecovery}{markup} · effective {effectiveFrom}{ending}':
    [
      'Política v{version}: reembolso al trabajador {workerReimbursement} · cobro al cliente {clientRecovery}{markup} · vigente desde {effectiveFrom}{ending}',
      'Política v{version}: reembolso ao trabalhador {workerReimbursement} · cobrança ao cliente {clientRecovery}{markup} · vigente desde {effectiveFrom}{ending}',
    ],
  'Required expense policy is unavailable': [
    'La política de gastos obligatoria no está disponible',
    'A política de despesas obrigatória não está disponível',
  ],
  'Time and expenses together': ['Horas y gastos juntos', 'Horas e despesas juntos'],
  unavailable: ['no disponible', 'indisponível'],
  '. This is expected for a configured fixed or all-in commercial model.': [
    '. Esto es normal con un modelo comercial de precio fijo o todo incluido.',
    '. Isso é esperado em um modelo comercial de preço fixo ou tudo incluído.',
  ],
  '; individual hours let you enter a different amount per person.': [
    '; las horas individuales permiten indicar una cantidad distinta por persona.',
    '; as horas individuais permitem informar uma quantidade diferente por pessoa.',
  ],
  'Add expense for': ['Añadir gasto de', 'Adicionar despesa de'],
  'Allocate exact amount by worker and shift': [
    'Distribuir el importe exacto por trabajador y turno',
    'Distribuir o valor exato por trabalhador e turno',
  ],
  'Allocate one crew receipt': [
    'Distribuir un recibo del equipo',
    'Distribuir um comprovante da equipe',
  ],
  'Amount for': ['Importe de', 'Valor de'],
  'Amounts come from the same saved finance projection used by the project finance workspace. This screen explains its source rows and effective terms; it does not recalculate invoice amounts.':
    [
      'Los importes proceden de la misma proyección financiera guardada que utiliza el espacio financiero del proyecto. Esta pantalla explica los registros de origen y las condiciones vigentes; no recalcula los importes de las facturas.',
      'Os valores vêm da mesma projeção financeira salva usada na área financeira do projeto. Esta tela explica os registros de origem e as condições vigentes; ela não recalcula os valores das faturas.',
    ],
  'Approved milestones are included only while they remain un-invoiced.': [
    'Los hitos aprobados solo se incluyen mientras no estén facturados.',
    'Os marcos aprovados só são incluídos enquanto não estiverem faturados.',
  ],
  'Approved operational sources': [
    'Registros operativos aprobados',
    'Registros operacionais aprovados',
  ],
  'Approved, unbilled': ['Aprobado, sin facturar', 'Aprovado, não faturado'],
  'Assign a crew chief': ['Designar un jefe de equipo', 'Designar um chefe de equipe'],
  'Assign at least two active workers to this project before choosing a chief.': [
    'Asigna al menos dos trabajadores activos a este proyecto antes de elegir un jefe de equipo.',
    'Atribua pelo menos dois trabalhadores ativos a este projeto antes de escolher um chefe de equipe.',
  ],
  'Assign chief': ['Designar jefe de equipo', 'Designar chefe de equipe'],
  'BY PERSON': ['POR PERSONA', 'POR PESSOA'],
  'Billing configuration in this period': [
    'Configuración de facturación de este período',
    'Configuração de faturamento deste período',
  ],
  'Canonical operational revenue': [
    'Ingresos operativos de referencia',
    'Receita operacional de referência',
  ],
  Chief: ['Jefe de equipo', 'Chefe de equipe'],
  'Choose a saved receipt': ['Elige un recibo guardado', 'Escolha um comprovante salvo'],
  'Choose chief': ['Elige un jefe de equipo', 'Escolha um chefe de equipe'],
  'Choose two workers already assigned to the project. The chief can enter their colleague’s hours only while this delegation and both project assignments are active.':
    [
      'Elige dos trabajadores ya asignados al proyecto. El jefe solo puede registrar las horas de su compañero mientras estén vigentes la delegación y ambas asignaciones al proyecto.',
      'Escolha dois trabalhadores já atribuídos ao projeto. O chefe só pode registrar as horas do colega enquanto a delegação e as duas atribuições ao projeto estiverem ativas.',
    ],
  'Choose worker': ['Elige un trabajador', 'Escolha um trabalhador'],
  'Configuration issues': ['Problemas de configuración', 'Problemas de configuração'],
  'Configuration that still needs attention': [
    'Configuración pendiente de revisión',
    'Configuração que ainda precisa de atenção',
  ],
  Cost: ['Coste', 'Custo'],
  'Crew delegations': ['Delegaciones del equipo', 'Delegações da equipe'],
  'Crew time · J&A Automation': [
    'Horas del equipo · J&A Automation',
    'Horas da equipe · J&A Automation',
  ],
  'Daily minimum adjustments': ['Ajustes del mínimo diario', 'Ajustes do mínimo diário'],
  'Different hours for each member': [
    'Horas distintas para cada miembro',
    'Horas diferentes para cada integrante',
  ],
  'Each adjustment applies once per person and project day. It raises billable quantity only; it does not invent actual time.':
    [
      'Cada ajuste se aplica una sola vez por persona y día del proyecto. Solo aumenta la cantidad facturable; no crea horas reales.',
      'Cada ajuste é aplicado uma vez por pessoa e dia do projeto. Ele aumenta apenas a quantidade faturável; não cria horas trabalhadas.',
    ],
  'Effective until (optional)': ['Vigente hasta (opcional)', 'Vigente até (opcional)'],
  'Entries saved as drafts can be submitted later. Submission does not approve your own crew hours.':
    [
      'Los registros guardados como borrador pueden enviarse después. Enviarlos no aprueba tus propias horas de equipo.',
      'Os registros salvos como rascunho podem ser enviados depois. O envio não aprova suas próprias horas da equipe.',
    ],
  'Expense cost': ['Coste de gastos', 'Custo das despesas'],
  'Expense recovery': ['Gastos cobrables al cliente', 'Despesas recuperáveis do cliente'],
  'Expenses and recovery sources (': [
    'Gastos y registros de cobro (',
    'Despesas e registros de cobrança (',
  ],
  'First save a receipt expense for one delegated worker using the “Add expense” link above. Select that expense here and split its amount across at least two crew time rows. The receipt stays':
    [
      'Primero guarda un gasto con recibo para un trabajador delegado mediante el enlace «Añadir gasto» de arriba. Selecciónalo aquí y distribuye el importe entre al menos dos registros de horas del equipo. El recibo sigue siendo',
      'Primeiro salve uma despesa com comprovante para um trabalhador delegado pelo link “Adicionar despesa” acima. Selecione-a aqui e distribua o valor entre pelo menos dois registros de horas da equipe. O comprovante continua sendo',
    ],
  'Hours for': ['Horas de', 'Horas de'],
  'Hours per member': ['Horas por miembro', 'Horas por integrante'],
  'Use exact one-minute increments: 0.1 hours = 6 minutes.': [
    'Usa incrementos exactos de un minuto: 0,1 horas = 6 minutos.',
    'Use incrementos exatos de um minuto: 0,1 horas = 6 minutos.',
  ],
  'How to enter hours': ['Cómo registrar las horas', 'Como registrar as horas'],
  'Internal labor cost': ['Coste interno de mano de obra', 'Custo interno de mão de obra'],
  Interval: ['Intervalo', 'Intervalo'],
  'Log team hours': ['Registrar horas del equipo', 'Registrar horas da equipe'],
  'Milestone sources': ['Registros de hitos', 'Registros de marcos'],
  'Needs review:': ['Requiere revisión:', 'Precisa de revisão:'],
  'No active billing configuration covers this period.': [
    'No hay ninguna configuración de facturación activa para este período.',
    'Nenhuma configuração de faturamento ativa cobre este período.',
  ],
  'No active delegated workers are available for this project and date. Ask the owner to assign your crew.':
    [
      'No hay trabajadores delegados activos para este proyecto y fecha. Pide al propietario que asigne tu equipo.',
      'Não há trabalhadores delegados ativos para este projeto e esta data. Peça ao proprietário para atribuir sua equipe.',
    ],
  'No crew delegations for this project.': [
    'No hay delegaciones de equipo para este proyecto.',
    'Não há delegações de equipe para este projeto.',
  ],
  'No crew hours recorded for this date.': [
    'No hay horas del equipo registradas para esta fecha.',
    'Não há horas da equipe registradas para esta data.',
  ],
  'No expense source in this period.': [
    'No hay registros de gastos en este período.',
    'Não há registros de despesas neste período.',
  ],
  'No time or expense source exists in this period.': [
    'No hay registros de horas ni gastos en este período.',
    'Não há registros de horas nem de despesas neste período.',
  ],
  'No time source in this period.': [
    'No hay registros de horas en este período.',
    'Não há registros de horas neste período.',
  ],
  'Operational source revenue': [
    'Ingresos de registros operativos',
    'Receita dos registros operacionais',
  ],
  'PROJECT FINANCE EXPLANATION': [
    'EXPLICACIÓN FINANCIERA DEL PROYECTO',
    'EXPLICAÇÃO FINANCEIRA DO PROJETO',
  ],
  'Pending WIP': ['Trabajo en curso pendiente', 'Trabalho em andamento pendente'],
  'Period totals': ['Totales del período', 'Totais do período'],
  'Project crew time': ['Horas del equipo del proyecto', 'Horas da equipe do projeto'],
  'Project crew time · J&A Automation': [
    'Horas del equipo del proyecto · J&A Automation',
    'Horas da equipe do projeto · J&A Automation',
  ],
  'Project workforce': ['Equipo del proyecto', 'Equipe do projeto'],
  'Rate-rule IDs and versions are not included in the canonical finance projection yet. Source rows below show the canonical configured/unavailable statuses and pay method; use Project billing setup to review or change future terms.':
    [
      'La proyección financiera de referencia aún no incluye los identificadores ni las versiones de las reglas de tarifas. Los registros de abajo muestran el estado configurado o no disponible y el método de pago; usa la configuración de facturación del proyecto para revisar o cambiar las condiciones futuras.',
      'A projeção financeira de referência ainda não inclui os identificadores e as versões das regras de tarifas. Os registros abaixo mostram os estados configurados ou indisponíveis e a forma de pagamento; use a configuração de faturamento do projeto para revisar ou alterar condições futuras.',
    ],
  'Receipt expense': ['Gasto con recibo', 'Despesa com comprovante'],
  Reconciliation: ['Conciliación', 'Conciliação'],
  'Record actual hours for each delegated person. Each row stays tied to its worker and follows the normal approval process.':
    [
      'Registra las horas reales de cada persona delegada. Cada registro queda asociado a su trabajador y sigue el proceso habitual de aprobación.',
      'Registre as horas reais de cada pessoa delegada. Cada registro permanece vinculado ao trabalhador e segue o processo normal de aprovação.',
    ],
  Recorded: ['Registradas', 'Registradas'],
  'Recorded time and calculation sources (': [
    'Horas registradas y fuentes del cálculo (',
    'Horas registradas e fontes do cálculo (',
  ],
  'Recorded work': ['Trabajo registrado', 'Trabalho registrado'],
  'Recorded work and finance treatment': [
    'Trabajo registrado y tratamiento financiero',
    'Trabalho registrado e tratamento financeiro',
  ],
  'Same hours for each selected member': [
    'Mismas horas para cada miembro seleccionado',
    'Mesmas horas para cada integrante selecionado',
  ],
  'Save a receipt expense and at least two crew time rows for this project and date to allocate a shared receipt.':
    [
      'Guarda un gasto con recibo y al menos dos registros de horas del equipo para este proyecto y fecha antes de distribuir un recibo compartido.',
      'Salve uma despesa com comprovante e pelo menos dois registros de horas da equipe para este projeto e esta data antes de distribuir um comprovante compartilhado.',
    ],
  'Save receipt allocation': [
    'Guardar distribución del recibo',
    'Salvar distribuição do comprovante',
  ],
  'Saved receipt allocations': [
    'Distribuciones de recibos guardadas',
    'Distribuições de comprovantes salvas',
  ],
  'Show project': ['Mostrar proyecto', 'Mostrar projeto'],
  'Source rows reconcile exactly': [
    'Los registros de origen cuadran exactamente',
    'Os registros de origem conciliam exatamente',
  ],
  'Submit for approval now': ['Enviar ahora para aprobación', 'Enviar agora para aprovação'],
  'Team member': ['Miembro del equipo', 'Integrante da equipe'],
  'Team members': ['Miembros del equipo', 'Integrantes da equipe'],
  'The amounts must add up exactly to the selected receipt. Include the worker and shift already linked to it.':
    [
      'Los importes deben sumar exactamente el total del recibo seleccionado. Incluye al trabajador y el turno ya asociados.',
      'Os valores devem somar exatamente o total do comprovante selecionado. Inclua o trabalhador e o turno já vinculados.',
    ],
  'The project billing model changes the customer candidate from operational source revenue by': [
    'El modelo de facturación del proyecto modifica el importe previsto para el cliente respecto a los ingresos de registros operativos en',
    'O modelo de faturamento do projeto altera o valor previsto para o cliente em relação à receita dos registros operacionais em',
  ],
  'These are the canonical project-finance results.': [
    'Estos son los resultados financieros de referencia del proyecto.',
    'Estes são os resultados financeiros de referência do projeto.',
  ],
  'Use one worker for a single entry, or select several. Shared hours apply': [
    'Selecciona un trabajador para un registro individual o varios trabajadores. Las horas compartidas se aplican',
    'Selecione um trabalhador para um registro individual ou vários trabalhadores. As horas compartilhadas se aplicam',
  ],
  'View time': ['Ver horas', 'Ver horas'],
  'Worker pay basis': ['Base de remuneración del trabajador', 'Base de remuneração do trabalhador'],
  'actual ·': ['reales ·', 'trabalhadas ·'],
  'approved operational': ['operativos aprobados', 'operacionais aprovados'],
  'approved ·': ['aprobadas ·', 'aprovadas ·'],
  billable: ['facturables', 'faturáveis'],
  'billable ·': ['facturables ·', 'faturáveis ·'],
  'can record for': ['puede registrar horas de', 'pode registrar horas de'],
  'customer revenue': ['ingresos del cliente', 'receita do cliente'],
  excluded: ['excluidos', 'excluídos'],
  'for billing and reimbursement; the split only records which workers and shifts it covered. Worker reimbursement and customer billing follow the selected expense’s payer and worker policy.':
    [
      'para facturación y reembolso; la distribución solo indica a qué trabajadores y turnos corresponde. El reembolso al trabajador y el cobro al cliente siguen la política del trabajador y de quien pagó el gasto.',
      'para faturamento e reembolso; a distribuição apenas indica a quais trabalhadores e turnos ele corresponde. O reembolso ao trabalhador e a cobrança ao cliente seguem a política do trabalhador e de quem pagou a despesa.',
    ],
  invoiced: ['facturados', 'faturados'],
  'minutes ·': ['minutos ·', 'minutos ·'],
  'one expense': ['un solo gasto', 'uma única despesa'],
  pending: ['pendientes', 'pendentes'],
  people: ['personas', 'pessoas'],
  'to each selected worker': ['a cada trabajador seleccionado', 'a cada trabalhador selecionado'],
  'top-up': ['complemento', 'complemento'],
  '· effective': ['· vigente desde', '· vigente desde'],
  '· milestone': ['· hito', '· marco'],
  '· one expense': ['· un solo gasto', '· uma única despesa'],
  '← Back to crew hours': ['← Volver a las horas del equipo', '← Voltar às horas da equipe'],
  '← Back to project finance': [
    '← Volver a las finanzas del proyecto',
    '← Voltar às finanças do projeto',
  ],
  'Expense budget': ['Presupuesto de gastos', 'Orçamento de despesas'],
  'Expense budget used': ['Presupuesto de gastos utilizado', 'Orçamento de despesas utilizado'],
  'Project billing setup': [
    'Configuración de facturación del proyecto',
    'Configuração de faturamento do projeto',
  ],
  'Set each assigned person’s customer charge, compensation and expense treatment here. Save each person before continuing.':
    [
      'Configura aquí el precio al cliente, la remuneración y los gastos de cada persona asignada. Guarda cada persona antes de continuar.',
      'Configure aqui a cobrança ao cliente, a remuneração e as despesas de cada pessoa atribuída. Salve cada pessoa antes de continuar.',
    ],
  'Check person terms fields': [
    'Revisa los datos comerciales de la persona',
    'Verifique os dados comerciais da pessoa',
  ],
  'Terms effective from': ['Condiciones vigentes desde', 'Condições válidas a partir de'],
  'Customer hourly rate': ['Tarifa por hora al cliente', 'Tarifa por hora ao cliente'],
  'Worker compensation method': [
    'Método de remuneración del trabajador',
    'Método de remuneração do trabalhador',
  ],
  'Worker compensation percentage': [
    'Porcentaje de remuneración del trabajador',
    'Percentual de remuneração do trabalhador',
  ],
  'Worker compensation rate': [
    'Importe de remuneración del trabajador',
    'Valor de remuneração do trabalhador',
  ],
  'Expense payer': ['Quién paga el gasto', 'Quem paga a despesa'],
  'Expense treatment applies to the selected payer only. Policies for other payers remain active.':
    [
      'El tratamiento de gastos se aplica solo a quien paga seleccionado. Las políticas de otros pagadores siguen vigentes.',
      'O tratamento de despesas vale apenas para o pagador selecionado. As políticas de outros pagadores continuam ativas.',
    ],
  'Other active expense payer policies': [
    'Otras políticas de pagadores activas',
    'Outras políticas de pagadores ativas',
  ],
  'To stop reimbursing worker-paid claims, select Worker and No reimbursement.': [
    'Para dejar de reembolsar los gastos pagados por el trabajador, selecciona Trabajador y Sin reembolso.',
    'Para deixar de reembolsar despesas pagas pelo trabalhador, selecione Trabalhador e Sem reembolso.',
  ],
  'Existing terms on the same date are immutable. Choose a later effective date to change them.': [
    'Las condiciones ya vigentes en la misma fecha son inmutables. Elige una fecha posterior para cambiarlas.',
    'As condições já vigentes na mesma data são imutáveis. Escolha uma data posterior para alterá-las.',
  ],
  Worker: ['Trabajador', 'Trabalhador'],
  Client: ['Cliente', 'Cliente'],
  'At cost': ['Al coste', 'Pelo custo'],
  'Reimburse worker': ['Reembolsar al trabajador', 'Reembolsar o trabalhador'],
  'Charge customer for expense': ['Cobrar el gasto al cliente', 'Cobrar a despesa do cliente'],
  'No reimbursement': ['Sin reembolso', 'Sem reembolso'],
  'Cost plus markup': ['Coste más recargo', 'Custo mais acréscimo'],
  'Do not charge customer': ['No cobrar al cliente', 'Não cobrar do cliente'],
  'Client pays directly': ['El cliente paga directamente', 'O cliente paga diretamente'],
  'Expense markup percentage': [
    'Porcentaje de recargo del gasto',
    'Percentual de acréscimo da despesa',
  ],
  'Save person terms': ['Guardar condiciones de la persona', 'Salvar condições da pessoa'],
  'Copy draft terms from': [
    'Copiar condiciones provisionales de',
    'Copiar condições provisórias de',
  ],
  'Apply to selected people': [
    'Aplicar a las personas seleccionadas',
    'Aplicar às pessoas selecionadas',
  ],
  'Save selected people': ['Guardar personas seleccionadas', 'Salvar pessoas selecionadas'],
  'Apply draft defaults to this person': [
    'Aplicar valores provisionales a esta persona',
    'Aplicar valores provisórios a esta pessoa',
  ],
  'This copies unsaved draft values only. Review and save each person separately; existing agreements are unchanged until saved.':
    [
      'Esto solo copia valores aún no guardados. Revisa y guarda a cada persona por separado; los acuerdos existentes no cambian hasta entonces.',
      'Isto copia apenas valores ainda não salvos. Revise e salve cada pessoa separadamente; os acordos existentes não mudam até lá.',
    ],
  'This copies unsaved draft values only. Review selected people, then save them together or individually. Existing agreements are unchanged until saved.':
    [
      'Esto solo copia valores aún no guardados. Revisa a las personas seleccionadas y guárdalas juntas o individualmente. Los acuerdos existentes no cambian hasta guardar.',
      'Isto copia apenas valores ainda não salvos. Revise as pessoas selecionadas e salve-as juntas ou individualmente. Os acordos existentes não mudam até salvar.',
    ],
  'Advanced commercial rules': ['Reglas comerciales avanzadas', 'Regras comerciais avançadas'],
  'Assign people here, then set each person’s customer rate, pay and expense terms in this project’s Billing setup.':
    [
      'Asigna personas aquí y configura su tarifa al cliente, remuneración y gastos en Facturación de este proyecto.',
      'Atribua pessoas aqui e configure a tarifa ao cliente, remuneração e despesas em Faturamento deste projeto.',
    ],
  'Billing setup saved': [
    'Configuración de facturación guardada',
    'Configuração de faturamento salva',
  ],
  'Invoice issuance still needs these prerequisites:': [
    'Para emitir facturas aún faltan estos requisitos:',
    'Para emitir faturas ainda faltam estes requisitos:',
  ],
  'Assign an issuing legal entity revision to this project.': [
    'Asigna a este proyecto una revisión de la entidad legal emisora.',
    'Atribua a este projeto uma revisão da entidade legal emissora.',
  ],
  'Approve an invoice numbering policy for the issuer.': [
    'Aprueba una política de numeración de facturas para el emisor.',
    'Aprove uma política de numeração de faturas para o emissor.',
  ],
  'Choose a tax profile effective for this billing date.': [
    'Elige un perfil fiscal vigente para esta fecha de facturación.',
    'Escolha um perfil tributário válido para esta data de faturamento.',
  ],
  'Complete the project billing setup.': [
    'Completa la configuración de facturación del proyecto.',
    'Conclua a configuração de faturamento do projeto.',
  ],
  'Open finance configuration': ['Abrir configuración financiera', 'Abrir configuração financeira'],
  'Issuing prerequisites are configured. Invoice readiness also checks approved sources and period rules.':
    [
      'Los requisitos de emisión están configurados. La preparación de la factura también comprueba los registros aprobados y las reglas del período.',
      'Os requisitos de emissão estão configurados. A preparação da fatura também verifica os registros aprovados e as regras do período.',
    ],
  'Configure this project’s invoices': [
    'Configurar las facturas de este proyecto',
    'Configurar as faturas deste projeto',
  ],
  'Choose how approved hours and recoverable expenses become customer invoices. Each person’s rates and expense agreement stay separate.':
    [
      'Elige cómo las horas aprobadas y los gastos repercutibles pasan a las facturas del cliente. Las tarifas y los acuerdos de gastos de cada persona se mantienen separados.',
      'Escolha como as horas aprovadas e as despesas recuperáveis entram nas faturas do cliente. As tarifas e os acordos de despesas de cada pessoa permanecem separados.',
    ],
  Step: ['Paso', 'Etapa'],
  '1. Invoice arrangement': ['1. Organización de facturas', '1. Organização das faturas'],
  '2. Billing details': ['2. Datos de facturación', '2. Dados de faturamento'],
  '3. Review each person': ['3. Revisar cada persona', '3. Revisar cada pessoa'],
  '4. Review and save': ['4. Revisar y guardar', '4. Revisar e salvar'],
  'Start from a saved template': [
    'Partir de una plantilla guardada',
    'Começar com um modelo salvo',
  ],
  'Configure from scratch': ['Configurar desde cero', 'Configurar do zero'],
  'A template fills defaults only. Review the project and each person before saving.': [
    'La plantilla solo rellena valores predeterminados. Revisa el proyecto y cada persona antes de guardar.',
    'O modelo preenche apenas valores padrão. Revise o projeto e cada pessoa antes de salvar.',
  ],
  'Current commercial model': ['Modelo comercial actual', 'Modelo comercial atual'],
  'Current PO cap': ['Límite actual de la orden de compra', 'Limite atual do pedido de compra'],
  'Edit project commercial model or cap': [
    'Editar el modelo comercial o el límite del proyecto',
    'Editar o modelo comercial ou o limite do projeto',
  ],
  'One invoice with two sections': ['Una factura con dos secciones', 'Uma fatura com duas seções'],
  'Approved labor and billable expenses appear on the same invoice, with separate section totals.':
    [
      'Las horas aprobadas y los gastos facturables aparecen en la misma factura, con subtotales por sección.',
      'As horas aprovadas e as despesas faturáveis aparecem na mesma fatura, com subtotais por seção.',
    ],
  'Two separate invoices': ['Dos facturas separadas', 'Duas faturas separadas'],
  'Labor and expenses use separate invoice drafts and may use different cadence and tax profiles.':
    [
      'Las horas y los gastos usan borradores de factura separados y pueden tener distinta frecuencia y perfil fiscal.',
      'As horas e as despesas usam rascunhos de fatura separados e podem ter periodicidade e perfil tributário diferentes.',
    ],
  'Configuration effective from': [
    'Configuración vigente desde',
    'Configuração válida a partir de',
  ],
  'Issuing legal entity': ['Entidad legal emisora', 'Entidade legal emissora'],
  'Select entity': ['Seleccionar entidad', 'Selecionar entidade'],
  'Project currency': ['Moneda del proyecto', 'Moeda do projeto'],
  'Labor tax profile': ['Perfil fiscal de horas', 'Perfil tributário de horas'],
  'Expense tax profile': ['Perfil fiscal de gastos', 'Perfil tributário de despesas'],
  'Select tax profile': ['Seleccionar perfil fiscal', 'Selecionar perfil tributário'],
  'Labor billing cadence': [
    'Frecuencia de facturación de horas',
    'Periodicidade de faturamento de horas',
  ],
  'Expense billing cadence': [
    'Frecuencia de facturación de gastos',
    'Periodicidade de faturamento de despesas',
  ],
  'Labor cadence anchor date': ['Fecha de referencia para horas', 'Data de referência para horas'],
  'Expense cadence anchor date': [
    'Fecha de referencia para gastos',
    'Data de referência para despesas',
  ],
  'Invoice layout': ['Diseño de factura', 'Layout da fatura'],
  'Line grouping': ['Agrupación de líneas', 'Agrupamento de linhas'],
  Detailed: ['Detallado', 'Detalhado'],
  Standard: ['Estándar', 'Padrão'],
  'Billing contact': ['Contacto de facturación', 'Contato de faturamento'],
  'Use client default': [
    'Usar el contacto predeterminado del cliente',
    'Usar o contato padrão do cliente',
  ],
  'Automatically prepare drafts for review': [
    'Preparar automáticamente borradores para revisión',
    'Preparar automaticamente rascunhos para revisão',
  ],
  'Invoices are never issued or sent automatically.': [
    'Las facturas nunca se emiten ni se envían automáticamente.',
    'As faturas nunca são emitidas ou enviadas automaticamente.',
  ],
  'An active invoice issuer in the project currency is required before invoices can be configured.':
    [
      'Se necesita un emisor de facturas activo en la moneda del proyecto antes de configurar las facturas.',
      'É necessário um emitente de faturas ativo na moeda do projeto antes de configurar as faturas.',
    ],
  'Configure invoice issuers': [
    'Configurar emisores de facturas',
    'Configurar emitentes de faturas',
  ],
  'Break (decimal hours)': ['Pausa (horas decimales)', 'Pausa (horas decimais)'],
  'Enter a valid break in decimal hours, shorter than 24 hours.': [
    'Indica una pausa válida en horas decimales, inferior a 24 horas.',
    'Informe uma pausa válida em horas decimais, inferior a 24 horas.',
  ],
  'Enter decimal hours, for example 7.5.': [
    'Indica horas decimales, por ejemplo 7,5.',
    'Informe horas decimais, por exemplo 7,5.',
  ],
  'End the cost center with digits. Those digits become the project number suffix (for example, CP020 becomes P-020).':
    [
      'Termina el centro de coste con dígitos. Esos dígitos forman el final del número de proyecto (por ejemplo, CP020 se convierte en P-020).',
      'Termine o centro de custo com dígitos. Eles formam o final do número do projeto (por exemplo, CP020 torna-se P-020).',
    ],
  'Enter decimal hours greater than zero and at most 24.': [
    'Indica horas decimales mayores que cero y de hasta 24.',
    'Informe horas decimais maiores que zero e de até 24.',
  ],
  'These rates and expense policies are configured per assignment. This setup does not change them.':
    [
      'Estas tarifas y políticas de gastos se configuran por asignación. Esta configuración no las modifica.',
      'Estas tarifas e políticas de despesas são configuradas por atribuição. Esta configuração não as altera.',
    ],
  'Customer rate': ['Tarifa al cliente', 'Tarifa do cliente'],
  'Expense policy': ['Política de gastos', 'Política de despesas'],
  Configured: ['Configurado', 'Configurado'],
  'Needs review': ['Necesita revisión', 'Precisa de revisão'],
  'No workers are assigned. Add people before issuing invoices.': [
    'No hay trabajadores asignados. Añade personas antes de emitir facturas.',
    'Não há trabalhadores atribuídos. Adicione pessoas antes de emitir faturas.',
  ],
  'person(s) still need commercial terms before their records can be billed.': [
    'persona(s) aún necesitan condiciones comerciales antes de facturar sus registros.',
    'pessoa(s) ainda precisam de condições comerciais antes de faturar seus registros.',
  ],
  'Edit people and rates': ['Editar personas y tarifas', 'Editar pessoas e tarifas'],
  'Invoice arrangement': ['Organización de facturas', 'Organização das faturas'],
  'People needing terms': ['Personas pendientes de condiciones', 'Pessoas pendentes de condições'],
  'Save these defaults as a reusable template': [
    'Guardar estos valores como plantilla reutilizable',
    'Salvar estes valores como modelo reutilizável',
  ],
  'Template name': ['Nombre de la plantilla', 'Nome do modelo'],
  'Selected template': ['Plantilla seleccionada', 'Modelo selecionado'],
  'Defaults were adjusted for this project; review the choices above.': [
    'Se modificaron los valores predeterminados para este proyecto; revisa las opciones anteriores.',
    'Os valores padrão foram ajustados para este projeto; revise as opções acima.',
  ],
  'Template defaults are unchanged; per-person agreements remain independent.': [
    'Los valores de la plantilla no cambiaron; los acuerdos por persona siguen siendo independientes.',
    'Os valores padrão do modelo não mudaram; os acordos por pessoa continuam independentes.',
  ],
  'Saving changes future invoice preparation. Issued invoices keep their original totals and rules.':
    [
      'Guardar cambia la preparación de facturas futuras. Las facturas emitidas conservan sus importes y reglas originales.',
      'Salvar altera a preparação de faturas futuras. As faturas emitidas mantêm os valores e regras originais.',
    ],
  'Save billing setup': [
    'Guardar configuración de facturación',
    'Salvar configuração de faturamento',
  ],
  'Billing setup is read only for this role.': [
    'La configuración de facturación es de solo lectura para este rol.',
    'A configuração de faturamento é somente leitura para esta função.',
  ],
  'Check billing setup fields': [
    'Revisa los campos de facturación',
    'Revise os campos de faturamento',
  ],
  'Invoices and advanced settings': [
    'Facturas y configuración avanzada',
    'Faturas e configurações avançadas',
  ],
  'Review drafts and issued invoices here. Advanced billing rules remain available for Finance.': [
    'Revisa aquí los borradores y las facturas emitidas. Las reglas avanzadas siguen disponibles para Finanzas.',
    'Revise aqui os rascunhos e as faturas emitidas. As regras avançadas continuam disponíveis para Finanças.',
  ],
  'Add an expense with these hours': [
    'Añadir un gasto junto con estas horas',
    'Adicionar uma despesa junto com estas horas',
  ],
  'Expense for this shift': ['Gasto de este turno', 'Despesa deste turno'],
  'The expense will use the same worker, project and date. Add a receipt from the expense detail after saving if needed.':
    [
      'El gasto usará el mismo trabajador, proyecto y fecha. Si hace falta, añade el recibo desde el detalle del gasto después de guardar.',
      'A despesa usará o mesmo colaborador, projeto e data. Se necessário, adicione o comprovante no detalhe da despesa após salvar.',
    ],
  'Reconnect to save time and expense together. Your entries are still here.': [
    'Vuelve a conectarte para guardar las horas y el gasto juntos. Tus datos siguen aquí.',
    'Reconecte-se para salvar as horas e a despesa juntas. Seus dados continuam aqui.',
  ],
  'Time expense occurred (optional)': [
    'Hora del gasto (opcional)',
    'Horário da despesa (opcional)',
  ],
  'Time expense occurred': ['Hora del gasto', 'Horário da despesa'],
  'Local time at the project site; leave blank if unknown.': [
    'Hora local del proyecto; déjala en blanco si no la sabes.',
    'Horário local do projeto; deixe em branco se não souber.',
  ],
  'Related logged hours (optional)': [
    'Horas registradas relacionadas (opcional)',
    'Horas registradas relacionadas (opcional)',
  ],
  'Related logged hours': ['Horas registradas relacionadas', 'Horas registradas relacionadas'],
  'Expense only / no linked hours': [
    'Solo gasto / sin horas vinculadas',
    'Somente despesa / sem horas vinculadas',
  ],
  'Loading logged hours…': ['Cargando horas registradas…', 'Carregando horas registradas…'],
  'Loading linked hours…': ['Cargando horas vinculadas…', 'Carregando horas vinculadas…'],
  'Only hours for this worker, project and date are shown.': [
    'Solo se muestran horas de este trabajador, proyecto y fecha.',
    'Somente horas deste colaborador, projeto e data são exibidas.',
  ],
  'Current linked hours': ['Horas vinculadas actuales', 'Horas vinculadas atuais'],
  'Open time record': ['Abrir registro de horas', 'Abrir registro de horas'],
  'Logged hours could not be loaded. You can still save an expense without a link.': [
    'No se pudieron cargar las horas. Aún puedes guardar el gasto sin vincularlo.',
    'Não foi possível carregar as horas. Você ainda pode salvar a despesa sem vinculá-la.',
  ],
  'Add related expense': ['Añadir gasto relacionado', 'Adicionar despesa relacionada'],
  'How labor terms are selected': [
    'Cómo se seleccionan las condiciones laborales',
    'Como são selecionadas as condições de mão de obra',
  ],
  'Review each assigned person on a work date. These are selected rules, not a forecast or an invoice total.':
    [
      'Revisa a cada persona asignada en una fecha de trabajo. Estas son las reglas aplicables, no una previsión ni el total de una factura.',
      'Revise cada pessoa alocada em uma data de trabalho. Estas são as regras aplicáveis, não uma previsão nem o total de uma fatura.',
    ],
  'Review terms': ['Revisar condiciones', 'Revisar condições'],
  'Person-specific labor terms': [
    'Condiciones laborales por persona',
    'Condições de mão de obra por pessoa',
  ],
  'Customer charge': ['Cargo al cliente', 'Cobrança ao cliente'],
  'per hour': ['por hora', 'por hora'],
  'Worker pay': ['Pago al trabajador', 'Pagamento ao colaborador'],
  Method: ['Método', 'Método'],
  'Internal cost rate': ['Tarifa de coste interno', 'Taxa de custo interno'],
  'Configuration required': ['Configuración pendiente', 'Configuração necessária'],
  'No active project people on this date.': [
    'No hay personas activas en el proyecto en esta fecha.',
    'Não há pessoas ativas no projeto nesta data.',
  ],
  'No active assignment for this date': [
    'No hay asignación activa en esta fecha',
    'Não há alocação ativa nesta data',
  ],
  'Overlapping active assignments': [
    'Hay asignaciones activas superpuestas',
    'Há alocações ativas sobrepostas',
  ],
  'Customer hourly rate required': [
    'Falta la tarifa por hora del cliente',
    'Falta a taxa por hora do cliente',
  ],
  'Worker compensation rule required': [
    'Falta la regla de remuneración del trabajador',
    'Falta a regra de remuneração do colaborador',
  ],
  'Internal cost rule required': [
    'Falta la regla de coste interno',
    'Falta a regra de custo interno',
  ],
  'Overlapping customer rates': [
    'Hay tarifas del cliente superpuestas',
    'Há taxas do cliente sobrepostas',
  ],
  'Overlapping worker compensation rules': [
    'Hay reglas de remuneración superpuestas',
    'Há regras de remuneração sobrepostas',
  ],
  'Overlapping internal cost rules': [
    'Hay reglas de coste interno superpuestas',
    'Há regras de custo interno sobrepostas',
  ],
  'Customer-rate override does not apply': [
    'La tarifa de cliente de la asignación no se aplica',
    'A taxa de cliente da alocação não se aplica',
  ],
  'Compensation override does not apply': [
    'La remuneración de la asignación no se aplica',
    'A remuneração da alocação não se aplica',
  ],
  'Internal-cost override does not apply': [
    'El coste interno de la asignación no se aplica',
    'O custo interno da alocação não se aplica',
  ],
  'Assignment override': ['Condición de la asignación', 'Condição da alocação'],
  'Person on this project': ['Persona en este proyecto', 'Pessoa neste projeto'],
  'Project default': ['Valor predeterminado del proyecto', 'Padrão do projeto'],
  'Person global fallback': ['Valor general de la persona', 'Valor geral da pessoa'],
  'Create issuing legal entity revision': [
    'Crear revisión de la entidad emisora',
    'Criar revisão da entidade emissora',
  ],
  'Use verified legal and tax details. A revision is permanent evidence for later invoices.': [
    'Usa datos legales y fiscales verificados. La revisión queda como evidencia permanente para facturas posteriores.',
    'Use dados legais e fiscais verificados. A revisão permanece como evidência para faturas futuras.',
  ],
  'Select legal entity': ['Seleccionar entidad legal', 'Selecionar entidade legal'],
  'Effective from': ['Vigente desde', 'Vigente a partir de'],
  'Registered legal name': ['Razón social registrada', 'Razão social registrada'],
  'Tax identifier': ['Identificador fiscal', 'Identificador fiscal'],
  'Registration identifier': ['Número de registro', 'Identificador de registro'],
  'Address line 1': ['Dirección, línea 1', 'Endereço, linha 1'],
  'Address line 2': ['Dirección, línea 2', 'Endereço, linha 2'],
  'City / locality': ['Ciudad / localidad', 'Cidade / localidade'],
  'Country code (2 letters)': ['Código de país (2 letras)', 'Código do país (2 letras)'],
  'Base currency': ['Moneda base', 'Moeda base'],
  'Must match the selected legal entity.': [
    'Debe coincidir con la entidad legal seleccionada.',
    'Deve corresponder à entidade legal selecionada.',
  ],
  'Reason for this revision': ['Motivo de esta revisión', 'Motivo desta revisão'],
  'Save legal entity revision': [
    'Guardar revisión de la entidad legal',
    'Salvar revisão da entidade legal',
  ],
  Work: ['Trabajo', 'Trabalho'],
  Standby: ['Guardia / espera', 'Plantão / espera'],
  'Travel operational detail': ['Detalle operativo del viaje', 'Detalhe operacional da viagem'],
  'The action could not be completed. Try again shortly.': [
    'No se pudo completar la acción. Vuelve a intentarlo en unos instantes.',
    'Não foi possível concluir a ação. Tente novamente em instantes.',
  ],
  'Start time': ['Hora de inicio', 'Hora de início'],
  'End time': ['Hora de fin', 'Hora de término'],
  'Break (minutes)': ['Pausa (minutos)', 'Intervalo (minutos)'],
  "Use the project's local time. Start and end must be on the selected date.": [
    'Usa la hora local del proyecto. El inicio y el fin deben ser del día seleccionado.',
    'Use o horário local do projeto. O início e o fim devem ser na data selecionada.',
  ],
  'Active filters': ['Filtros activos', 'Filtros ativos'],
  'Clear filters to see more records.': [
    'Borra los filtros para ver más registros.',
    'Limpe os filtros para ver mais registros.',
  ],
  'Calculated duration': ['Duración calculada', 'Duração calculada'],
  'Time range': ['Horario', 'Horário'],
  'Add start and end times': [
    'Añadir hora de inicio y fin',
    'Adicionar horários de início e término',
  ],
  'This record has a duration but no recorded start and end times.': [
    'Este registro tiene una duración, pero no tiene horas de inicio y fin registradas.',
    'Este registro tem uma duração, mas não tem horários de início e término registrados.',
  ],
  'The duration is calculated from the start and end times, less any break.': [
    'La duración se calcula entre el inicio y el fin, descontando la pausa.',
    'A duração é calculada entre o início e o término, descontando o intervalo.',
  ],
  'End time must be later on the same day, with a break shorter than the interval.': [
    'La hora de fin debe ser posterior en el mismo día y la pausa debe ser menor que el tramo horario.',
    'O término deve ser posterior no mesmo dia e a pausa deve ser menor que o período.',
  ],
  Calendar: ['Calendario', 'Calendário'],
  'Calendar navigation': ['Navegación del calendario', 'Navegação do calendário'],
  'Previous month': ['Mes anterior', 'Mês anterior'],
  'Next month': ['Mes siguiente', 'Próximo mês'],
  'Select a day to see its agenda.': [
    'Selecciona un día para ver su agenda.',
    'Selecione um dia para ver sua agenda.',
  ],
  'Times shown in UTC.': ['Horas en UTC.', 'Horários em UTC.'],
  Events: ['Eventos', 'Eventos'],
  'No events on this day.': ['No hay eventos este día.', 'Não há eventos neste dia.'],

  'Availability calendar': ['Calendario de disponibilidad', 'Calendário de disponibilidade'],
  'Choose a day to add availability. Open an existing window to edit it. Times are UTC.': [
    'Elige un día para añadir disponibilidad. Abre una ventana existente para editarla. Las horas son UTC.',
    'Escolha um dia para adicionar disponibilidade. Abra um período existente para editar. Os horários são UTC.',
  ],
  'Add availability': ['Añadir disponibilidad', 'Adicionar disponibilidade'],
  'Edit availability': ['Editar disponibilidad', 'Editar disponibilidade'],
  'Showing the latest 200 availability windows for this person.': [
    'Se muestran las últimas 200 ventanas de disponibilidad de esta persona.',
    'São exibidos os últimos 200 períodos de disponibilidade desta pessoa.',
  ],
  'Availability could not be saved. Check the dates or reload if another person changed this window.':
    [
      'No se pudo guardar. Comprueba las fechas o recarga si otra persona modificó esta ventana.',
      'Não foi possível salvar. Verifique as datas ou recarregue se outra pessoa alterou este período.',
    ],
  'Calendar times are shown in UTC. Planning never creates actual hours.': [
    'Las horas del calendario se muestran en UTC. La planificación no genera horas reales.',
    'Os horários do calendário são exibidos em UTC. O planejamento não gera horas reais.',
  ],
  'Project calendar': ['Calendario de proyectos', 'Calendário de projetos'],
  'Open a project from the calendar to review its dates, team and planning.': [
    'Abre un proyecto desde el calendario para consultar sus fechas, equipo y planificación.',
    'Abra um projeto no calendário para consultar datas, equipe e planejamento.',
  ],
  'Saving…': ['Guardando…', 'Salvando…'],

  Pagination: ['Paginación', 'Paginação'],
  Records: ['Registros', 'Registros'],
  'Collection planning': ['Planificación de cobros', 'Planejamento de recebimentos'],
  'Collection views': ['Vistas de cobros', 'Visões de recebimentos'],
  'Customer balances': ['Saldos por cliente', 'Saldos por cliente'],
  'Collection priorities': ['Prioridades de cobro', 'Prioridades de recebimento'],
  'Collection forecast': ['Previsión de cobros', 'Previsão de recebimentos'],
  'Export view CSV': ['Exportar vista CSV', 'Exportar visão CSV'],
  'Open documents': ['Documentos pendientes', 'Documentos pendentes'],
  'Oldest overdue (days)': ['Mayor vencimiento (días)', 'Maior atraso (dias)'],
  'Review invoices': ['Revisar facturas', 'Revisar faturas'],
  'Review invoice': ['Revisar factura', 'Revisar fatura'],
  'Review reason': ['Motivo de revisión', 'Motivo de revisão'],
  'Overdue invoice': ['Factura vencida', 'Fatura vencida'],
  'Collection date passed': ['Fecha de cobro pasada', 'Data de recebimento passada'],
  'Collection date missing': ['Sin fecha de cobro', 'Sem data de recebimento'],
  'Today through 7 days': ['Hoy y próximos 7 días', 'Hoje e próximos 7 dias'],
  '8–30 days ahead': ['Entre 8 y 30 días', 'Entre 8 e 30 dias'],
  '31–60 days ahead': ['Entre 31 y 60 días', 'Entre 31 e 60 dias'],
  '61–90 days ahead': ['Entre 61 y 90 días', 'Entre 61 e 90 dias'],
  'Beyond 90 days': ['Más de 90 días', 'Mais de 90 dias'],
  'Using expected collection date': [
    'Con fecha prevista de cobro',
    'Com data prevista de recebimento',
  ],
  'Using invoice due date': ['Con vencimiento de factura', 'Com vencimento da fatura'],
  'No open items for this view': [
    'No hay pendientes en esta vista',
    'Não há pendências nesta visão',
  ],
  'Internal customer summary across projects and issuers. Credit balances remain separate and are not automatically applied.':
    [
      'Resumen interno por cliente de proyectos y emisores. Los saldos acreedores se mantienen separados y no se aplican automáticamente.',
      'Resumo interno por cliente de projetos e emissores. Os saldos credores permanecem separados e não são aplicados automaticamente.',
    ],
  'Remaining receivables use the expected collection date, or the invoice due date when absent. Past dates and missing dates stay separate. This is not a bank balance or guaranteed cash.':
    [
      'Los saldos pendientes usan la fecha prevista de cobro o, si falta, el vencimiento de la factura. Las fechas pasadas y los saldos sin fecha se separan. No representa saldo bancario ni efectivo garantizado.',
      'Os saldos pendentes usam a data prevista de recebimento ou, na ausência, o vencimento da fatura. Datas passadas e saldos sem data ficam separados. Não representa saldo bancário nem dinheiro garantido.',
    ],
  'Review overdue invoices, passed collection dates and missing due dates. Ordered by currency and oldest overdue first. Opening an invoice does not send a reminder.':
    [
      'Revisa facturas vencidas, fechas previstas pasadas y vencimientos sin registrar. Ordenadas por moneda y mayor atraso. Abrir una factura no envía recordatorios.',
      'Revise faturas vencidas, datas previstas passadas e vencimentos não registrados. Ordenadas por moeda e maior atraso. Abrir uma fatura não envia lembretes.',
    ],
  'UTC time': ['hora UTC', 'horário UTC'],
  'Service period': ['Período de servicio', 'Período de serviço'],
  'Invoice reconciliation details': [
    'Detalle de conciliación de facturas',
    'Detalhes de conciliação de faturas',
  ],
  'Receipt evidence': ['Justificante del gasto', 'Comprovante da despesa'],
  'All receipts': ['Todos los justificantes', 'Todos os comprovantes'],
  'Required receipt missing': [
    'Falta el justificante obligatorio',
    'Falta o comprovante obrigatório',
  ],
  'Receipt attached': ['Justificante adjunto', 'Comprovante anexado'],
  'Receipt not required': ['Justificante no obligatorio', 'Comprovante não obrigatório'],
  'Review supporting evidence before approval': [
    'Revisar la documentación antes de aprobar',
    'Revisar os comprovantes antes de aprovar',
  ],
  'Selected technical reports must be approved or locked': [
    'Los informes técnicos seleccionados deben estar aprobados o bloqueados',
    'Os relatórios técnicos selecionados devem estar aprovados ou bloqueados',
  ],
  'Receivable aging': ['Antigüedad de saldos pendientes', 'Antiguidade dos saldos a receber'],
  'Not yet overdue': ['Sin vencer', 'Ainda não vencido'],
  '1–30 days overdue': ['Vencido de 1 a 30 días', 'Vencido há 1 a 30 dias'],
  '31–60 days overdue': ['Vencido de 31 a 60 días', 'Vencido há 31 a 60 dias'],
  '61–90 days overdue': ['Vencido de 61 a 90 días', 'Vencido há 61 a 90 dias'],
  'Over 90 days overdue': ['Vencido hace más de 90 días', 'Vencido há mais de 90 dias'],
  'No outstanding balance': ['Sin saldo pendiente', 'Sem saldo pendente'],
  'Void invoice': ['Factura anulada', 'Fatura anulada'],
  'Credit balances': ['Saldos acreedores', 'Saldos credores'],
  'Net outstanding': ['Saldo pendiente neto', 'Saldo pendente líquido'],
  'Gross receivables': ['Saldos deudores brutos', 'Saldos devedores brutos'],
  'Aging shows gross receivables. Credit balances are separate, without assumed allocation.': [
    'La antigüedad muestra saldos deudores brutos. Los saldos acreedores se separan, sin presuponer su aplicación.',
    'A antiguidade mostra saldos devedores brutos. Os saldos credores são separados, sem presumir sua aplicação.',
  ],
  'All maturities': ['Todos los vencimientos', 'Todos os vencimentos'],
  'Current balances as of': ['Saldos actuales al', 'Saldos atuais em'],
  'Amounts follow the active filters. Currencies are never combined.': [
    'Los importes corresponden a los filtros activos. Cada moneda se calcula por separado.',
    'Os valores correspondem aos filtros ativos. Cada moeda é calculada separadamente.',
  ],
  'Invoice issue dates': ['Fechas de emisión de las facturas', 'Datas de emissão das faturas'],
  'Access profile': ['Perfil de acceso', 'Perfil de acesso'],
  'Publish a planned shift for an assigned worker. Planning does not create actual time entries; the worker records the work performed separately.':
    [
      'Publica un turno previsto para un trabajador asignado. La planificación no crea horas reales; el trabajador registra por separado el trabajo realizado.',
      'Publique um turno previsto para um trabalhador alocado. O planejamento não cria horas reais; o trabalhador registra separadamente o trabalho realizado.',
    ],
  'ACTUAL TIME': ['HORAS REALES', 'HORAS TRABALHADAS'],
  'Daily report required': ['Informe diario obligatorio', 'Relatório diário obrigatório'],
  'PENDING REPORTS': ['INFORMES PENDIENTES', 'RELATÓRIOS PENDENTES'],
  'PROJECT REPORT': ['INFORME DEL PROYECTO', 'RELATÓRIO DO PROJETO'],
  'WORK PERFORMED BY': ['TRABAJO REALIZADO POR', 'TRABALHO REALIZADO POR'],
  'REPORT CREATED BY': ['REPORTE CREADO POR', 'RELATÓRIO CRIADO POR'],
  'REVIEWED BY': ['REVISADO POR', 'REVISADO POR'],
  'Work performed by': ['Trabajo realizado por', 'Trabalho realizado por'],
  'Report created by': ['Reporte creado por', 'Relatório criado por'],
  'Reviewed by': ['Revisado por', 'Revisado por'],
  'Record expense': ['Registrar gasto', 'Registrar despesa'],
  'Recorded actual time': ['Horas reales registradas', 'Horas trabalhadas registradas'],
  'Save daily report': ['Guardar informe diario', 'Salvar relatório diário'],
  'BILLING PERIOD': ['PERÍODO DE FACTURACIÓN', 'PERÍODO DE FATURAMENTO'],
  'CANONICAL PROJECTION': ['PROYECCIÓN CANÓNICA', 'PROJEÇÃO CANÔNICA'],
  'ALL-IN': ['TODO INCLUIDO', 'TUDO INCLUÍDO'],
  'APPROVED REIMBURSEMENTS': ['REEMBOLSOS APROBADOS', 'REEMBOLSOS APROVADOS'],
  'Active project board': ['Panel de proyectos activos', 'Painel de projetos ativos'],
  'Adjustment reason': ['Motivo del ajuste', 'Motivo do ajuste'],
  'Adjustment type': ['Tipo de ajuste', 'Tipo de ajuste'],
  'All categories': ['Todas las categorías', 'Todas as categorias'],
  'Open details': ['Abrir detalles', 'Abrir detalhes'],
  'Scroll horizontally to review all columns.': [
    'Desplázate horizontalmente para revisar todas las columnas.',
    'Deslize horizontalmente para revisar todas as colunas.',
  ],
  'Travel time': ['Tiempo de viaje', 'Tempo de viagem'],
  'Amount (minor)': ['Importe (unidades menores)', 'Valor (unidades menores)'],
  'Area / line': ['Área / línea', 'Área / linha'],
  'Apply period': ['Aplicar período', 'Aplicar período'],
  'Actual end': ['Fin real', 'Fim real'],
  'Actual hours': ['Horas reales', 'Horas reais'],
  'Approve customer report': ['Aprobar informe del cliente', 'Aprovar relatório do cliente'],
  'Approve milestone': ['Aprobar hito', 'Aprovar marco'],
  'Approve report': ['Aprobar informe', 'Aprovar relatório'],
  'Approved billable labor': ['Trabajo facturable aprobado', 'Mão de obra faturável aprovada'],
  'Assignment budget context': [
    'Contexto de presupuesto de la asignación',
    'Contexto de orçamento da atribuição',
  ],
  'Assignment budget context / internal loaded cost': [
    'Contexto de presupuesto de la asignación / coste interno cargado',
    'Contexto de orçamento da atribuição / custo interno carregado',
  ],
  'Billing model': ['Modelo de facturación', 'Modelo de faturamento'],
  'Billing treatment': ['Tratamiento de facturación', 'Tratamento de faturamento'],
  'Billing-ready financial control': [
    'Control financiero listo para facturar',
    'Controle financeiro pronto para faturamento',
  ],
  'CLIENT TREATMENT': ['TRATAMIENTO DEL CLIENTE', 'TRATAMENTO DO CLIENTE'],
  'COMMERCIAL RECORDS': ['REGISTROS COMERCIALES', 'REGISTROS COMERCIAIS'],
  'Card, transfer, cash': ['Tarjeta, transferencia, efectivo', 'Cartão, transferência, dinheiro'],
  'Client daily minimum minutes': [
    'Minutos mínimos diarios del cliente',
    'Minutos mínimos diários do cliente',
  ],
  'Client labor rates': ['Tarifas de trabajo del cliente', 'Taxas de mão de obra do cliente'],
  'Client minimum minutes': ['Minutos mínimos del cliente', 'Minutos mínimos do cliente'],
  'Client value': ['Valor del cliente', 'Valor do cliente'],
  'Close period end': ['Cerrar el final del período', 'Fechar o fim do período'],
  'Close sources': ['Cerrar orígenes', 'Fechar origens'],
  'Collected eligible labor': ['Trabajo elegible cobrado', 'Mão de obra elegível recebida'],
  'Company identifiers': ['Identificadores de la empresa', 'Identificadores da empresa'],
  'Compare draft': ['Comparar borrador', 'Comparar rascunho'],
  'Compensation rules': ['Reglas de compensación', 'Regras de remuneração'],
  'Compensation settlements': ['Liquidaciones de compensación', 'Liquidações de remuneração'],
  'Compensation statement': ['Estado de compensación', 'Extrato de remuneração'],
  'Compensation statement rules': [
    'Reglas del estado de compensación',
    'Regras do extrato de remuneração',
  ],
  'Compound tax': ['Impuesto compuesto', 'Imposto composto'],
  'Configure Billing Stream': [
    'Configurar flujo de facturación',
    'Configurar fluxo de faturamento',
  ],
  'Cost method': ['Método de coste', 'Método de custo'],
  'Custom approved adjustment': ['Ajuste personalizado aprobado', 'Ajuste personalizado aprovado'],
  'Daily guarantee (minutes)': ['Garantía diaria (minutos)', 'Garantia diária (minutos)'],
  'Discard draft': ['Descartar borrador', 'Descartar rascunho'],
  'Discard local draft': ['Descartar borrador local', 'Descartar rascunho local'],
  'Downtime minutes': ['Minutos de inactividad', 'Minutos de inatividade'],
  'EMPLOYEE PORTAL': ['PORTAL DEL EMPLEADO', 'PORTAL DO COLABORADOR'],
  'Edit all project settings': [
    'Editar todos los ajustes del proyecto',
    'Editar todas as configurações do projeto',
  ],
  'Ends on (optional)': ['Termina el (opcional)', 'Termina em (opcional)'],
  'Expected working schedule': ['Horario de trabajo previsto', 'Horário de trabalho esperado'],
  'Allowed: PDF, ZIP, JPEG, PNG, WebP, HEIC/HEIF, or UTF-8 text. Maximum 50 MB.': [
    'Permitidos: PDF, ZIP, JPEG, PNG, WebP, HEIC/HEIF o texto UTF-8. Máximo: 50 MB.',
    'Permitidos: PDF, ZIP, JPEG, PNG, WebP, HEIC/HEIF ou texto UTF-8. Máximo: 50 MB.',
  ],
  'Expected minutes / day': ['Minutos previstos / día', 'Minutos esperados / dia'],
  'Expected hours / day': ['Horas esperadas / día', 'Horas esperadas / dia'],
  'Client daily minimum hours': ['Mínimo diario cliente (horas)', 'Mínimo diário cliente (horas)'],
  'Client minimum hours': ['Mínimo cliente (horas)', 'Mínimo cliente (horas)'],
  'Fri minutes': ['Minutos del viernes', 'Minutos de sexta-feira'],
  'Filtered view:': ['Vista filtrada:', 'Visão filtrada:'],
  'Finish authenticator setup': [
    'Finalizar configuración del autenticador',
    'Concluir configuração do autenticador',
  ],
  'Hide comparison': ['Ocultar comparación', 'Ocultar comparação'],
  'Hourly cost (minor units)': [
    'Coste por hora (unidades menores)',
    'Custo por hora (unidades menores)',
  ],
  'Fixed per billing period': [
    'Fijo por período de facturación',
    'Fixo por período de faturamento',
  ],
  'Global profile': ['Perfil global', 'Perfil global'],
  'Internal / non-billable': ['Interno / no facturable', 'Interno / não faturável'],
  'Internal cost rules': ['Reglas de coste interno', 'Regras de custo interno'],
  'Internal financial detail': ['Detalle financiero interno', 'Detalhe financeiro interno'],
  'Invoice issue': ['Emisión de factura', 'Emissão de fatura'],
  'Invoice line items': ['Partidas de la factura', 'Itens da fatura'],
  'Issued eligible labor': ['Trabajo elegible facturado', 'Mão de obra elegível faturada'],
  'Legacy budget · minor units': [
    'Presupuesto heredado · unidades menores',
    'Orçamento legado · unidades menores',
  ],
  'Line 4 main conveyor': [
    'Línea 4 · transportador principal',
    'Linha 4 · transportador principal',
  ],
  'Local recovery draft': ['Borrador local de recuperación', 'Rascunho local de recuperação'],
  'Local recovery draft discarded': [
    'Borrador local de recuperación descartado',
    'Rascunho local de recuperação descartado',
  ],
  'Labor budget minutes': [
    'Minutos presupuestados de mano de obra',
    'Minutos orçados de mão de obra',
  ],
  'Log actual time': ['Registrar horas reales', 'Registrar horas trabalhadas'],
  'Mon minutes': ['Minutos del lunes', 'Minutos de segunda-feira'],
  'Master Invoice / Cost / Collection Ledger': [
    'Libro maestro de facturas / costes / cobros',
    'Livro mestre de faturas / custos / cobranças',
  ],
  'Minutes you really recorded.': [
    'Minutos que realmente registraste.',
    'Minutos que você realmente registrou.',
  ],
  'Modify report': ['Modificar informe', 'Modificar relatório'],
  'Network / protocol': ['Red / protocolo', 'Rede / protocolo'],
  'Network protocol': ['Protocolo de red', 'Protocolo de rede'],
  'Open items': ['Partidas abiertas', 'Itens em aberto'],
  'Open risk / issue': ['Riesgo / problema abierto', 'Risco / problema em aberto'],
  'Operations dashboard': ['Panel de operaciones', 'Painel de operações'],
  'OPERATIONS CONTROL': ['CONTROL DE OPERACIONES', 'CONTROLE DE OPERAÇÕES'],
  'Other cost budget · minor units': [
    'Presupuesto de otros costes · unidades menores',
    'Orçamento de outros custos · unidades menores',
  ],
  'Other direct cost': ['Otro coste directo', 'Outro custo direto'],
  'PHISHING-RESISTANT ACCESS': ['ACCESO RESISTENTE AL PHISHING', 'ACESSO RESISTENTE A PHISHING'],
  'PLC backup, engineering report': [
    'Copia de seguridad PLC, informe de ingeniería',
    'Cópia de segurança do PLC, relatório de engenharia',
  ],
  'PRIVATE OPERATIONS PLATFORM': [
    'PLATAFORMA PRIVADA DE OPERACIONES',
    'PLATAFORMA PRIVADA DE OPERAÇÕES',
  ],
  'PROJECT FINANCIAL POSITION': [
    'POSICIÓN FINANCIERA DEL PROYECTO',
    'POSIÇÃO FINANCEIRA DO PROJETO',
  ],
  'Payment method': ['Método de pago', 'Método de pagamento'],
  'Payment terms (days)': ['Condiciones de pago (días)', 'Condições de pagamento (dias)'],
  'Plant / site': ['Planta / sitio', 'Planta / local'],
  'Portal navigation': ['Navegación del portal', 'Navegação do portal'],
  'Planned minutes': ['Minutos planificados', 'Minutos planejados'],
  'Program / project reference': [
    'Referencia de programa / proyecto',
    'Referência de programa / projeto',
  ],
  'Program reference': ['Referencia de programa', 'Referência de programa'],
  'Project Member ID': ['ID de miembro del proyecto', 'ID de membro do projeto'],
  'Project alias': ['Alias del proyecto', 'Apelido do projeto'],
  'Project timezone': ['Zona horaria del proyecto', 'Fuso horário do projeto'],
  'Project period report': ['Informe del período del proyecto', 'Relatório do período do projeto'],
  'Purchase order': ['Orden de compra', 'Pedido de compra'],
  'Recalculate report': ['Recalcular informe', 'Recalcular relatório'],
  'Receipt image or PDF': ['Imagen o PDF del recibo', 'Imagem ou PDF do recibo'],
  'Receipts, PLC backups and project reports are validated, hashed and kept outside the public site.':
    [
      'Los recibos, copias de seguridad PLC e informes de proyecto se validan, reciben un hash y se mantienen fuera del sitio público.',
      'Os recibos, cópias de segurança do PLC e relatórios de projeto são validados, recebem hash e ficam fora da área pública.',
    ],
  'Recommended records': ['Registros recomendados', 'Registros recomendados'],
  'Register a private artifact': [
    'Registrar un artefacto privado',
    'Registrar um artefato privado',
  ],
  'Revenue budget (minor)': [
    'Presupuesto de ingresos (unidades menores)',
    'Orçamento de receita (unidades menores)',
  ],
  'Revenue budget · minor units': [
    'Presupuesto de ingresos · unidades menores',
    'Orçamento de receita · unidades menores',
  ],
  'Save all project settings': [
    'Guardar todos los ajustes del proyecto',
    'Salvar todas as configurações do projeto',
  ],
  'Save superseding cost': ['Guardar coste sustituto', 'Salvar custo substituto'],
  'Save superseding rate': ['Guardar tarifa sustituta', 'Salvar taxa substituta'],
  'Save superseding rule': ['Guardar regla sustituta', 'Salvar regra substituta'],
  'Safety-related change': [
    'Cambio relacionado con la seguridad',
    'Alteração relacionada à segurança',
  ],
  'Sat minutes': ['Minutos del sábado', 'Minutos de sábado'],
  'Saving draft…': ['Guardando borrador…', 'Salvando rascunho…'],
  'Search projects, people, invoices…': [
    'Buscar proyectos, personas, facturas…',
    'Pesquisar projetos, pessoas, faturas…',
  ],
  'Search recommendations': ['Buscar recomendaciones', 'Pesquisar recomendações'],
  'Search results': ['Resultados de búsqueda', 'Resultados da pesquisa'],
  'Site / plant': ['Sitio / planta', 'Local / planta'],
  'Six-digit code': ['Código de seis dígitos', 'Código de seis dígitos'],
  'TIME ENTRY · SOURCE RECORD': [
    'REGISTRO DE TIEMPO · REGISTRO DE ORIGEN',
    'REGISTRO DE TEMPO · REGISTRO DE ORIGEM',
  ],
  'Tax amount (minor units)': [
    'Importe fiscal (unidades menores)',
    'Valor do imposto (unidades menores)',
  ],
  'Third party': ['Tercero', 'Terceiro'],
  'Timesheet table': ['Tabla de registros de horas', 'Tabela de registros de horas'],
  'Travel budget (minor)': [
    'Presupuesto de viajes (unidades menores)',
    'Orçamento de viagens (unidades menores)',
  ],
  'Travel budget · minor units': [
    'Presupuesto de viajes · unidades menores',
    'Orçamento de viagens · unidades menores',
  ],
  'Sun minutes': ['Minutos del domingo', 'Minutos de domingo'],
  'Thu minutes': ['Minutos del jueves', 'Minutos de quinta-feira'],
  'Tue minutes': ['Minutos del martes', 'Minutos de terça-feira'],
  'UPCOMING BILLING': ['FACTURACIÓN PRÓXIMA', 'PRÓXIMO FATURAMENTO'],
  'Validation / risk': ['Validación / riesgo', 'Validação / risco'],
  'Validation performed': ['Validación realizada', 'Validação realizada'],
  'Verifying access…': ['Verificando el acceso…', 'Verificando o acesso…'],
  'Work performed': ['Trabajo realizado', 'Trabalho realizado'],
  'WORKFORCE PROFILE': ['PERFIL DE PERSONAL', 'PERFIL DA EQUIPE'],
  'Wed minutes': ['Minutos del miércoles', 'Minutos de quarta-feira'],
  'approved estimate': ['estimación aprobada', 'estimativa aprovada'],
  'approved minutes': ['minutos aprobados', 'minutos aprovados'],
  'budget used': ['presupuesto utilizado', 'orçamento utilizado'],
  'draft invoice streams': [
    'flujos de facturación en borrador',
    'fluxos de faturamento em rascunho',
  ],
  'regular, overtime, travel': ['ordinario, horas extra, viajes', 'regular, horas extras, viagens'],
  'Activate J&A account': ['Activar la cuenta de J&A', 'Ativar a conta J&A'],
  'Activate account': ['Activar cuenta', 'Ativar conta'],
  'Activate in portal': ['Activar en el portal', 'Ativar no portal'],
  'Activating…': ['Activando…', 'Ativando…'],
  'MFA is optional. Enabling it returns the setup URI and one-time recovery codes; store them in an approved password manager.':
    [
      'MFA es opcional. Al activarlo recibirás el URI de configuración y códigos de recuperación de un solo uso; guárdalos en un gestor de contraseñas aprobado.',
      'A MFA é opcional. Ao ativá-la, você receberá o URI de configuração e códigos de recuperação de uso único; guarde-os em um gerenciador de senhas aprovado.',
    ],
  'Activate your account': ['Activa tu cuenta', 'Ative sua conta'],
  'Add client contact': ['Añadir contacto del cliente', 'Adicionar contato do cliente'],
  'Add expense': ['Añadir gasto', 'Adicionar despesa'],
  'All-in project cost': ['Coste del proyecto todo incluido', 'Custo do projeto tudo incluído'],
  'Assign Skill': ['Asignar competencia', 'Atribuir competência'],
  'Assign worker': ['Asignar trabajador', 'Atribuir colaborador'],
  'Calculated bill candidate': ['Candidato de factura calculado', 'Candidato de fatura calculado'],
  'Close period start': ['Cerrar el inicio del período', 'Fechar o início do período'],
  'Compensation settlement status': [
    'Estado de la liquidación de compensación',
    'Status da liquidação de remuneração',
  ],
  'DEVICE STATUS': ['ESTADO DEL DISPOSITIVO', 'STATUS DO DISPOSITIVO'],
  'EXPECTED FINAL MARGIN': ['MARGEN FINAL PREVISTO', 'MARGEM FINAL ESPERADA'],
  'Keep your own workforce profile current without exposing compensation or client rates.': [
    'Mantén actualizado tu perfil de trabajador sin exponer la compensación ni las tarifas del cliente.',
    'Mantenha seu perfil de colaborador atualizado sem expor remuneração nem tarifas do cliente.',
  ],
  'Legal Entity': ['Entidad jurídica', 'Entidade legal'],
  'Line 4 · first shift': ['Línea 4 · primer turno', 'Linha 4 · primeiro turno'],
  'Modified · owner/admin review required': [
    'Modificado · requiere revisión del propietario o administrador',
    'Alterado · requer revisão do proprietário ou administrador',
  ],
  'Next-day plan': ['Plan del día siguiente', 'Plano do dia seguinte'],
  'No start': ['Sin inicio', 'Sem início'],
  'OWNER ADMIN': ['ADMINISTRADOR PROPIETARIO', 'ADMINISTRADOR PROPRIETÁRIO'],
  'OWNER WORKSPACE': ['ESPACIO DE TRABAJO DEL PROPIETARIO', 'ESPAÇO DE TRABALHO DO PROPRIETÁRIO'],
  'Refresh PDF reports': ['Actualizar informes PDF', 'Atualizar relatórios PDF'],
  'SIGNED IN': ['SESIÓN INICIADA', 'LOGIN REALIZADO'],
  'START / TARGET': ['INICIO / OBJETIVO', 'INÍCIO / META'],
  'Select assignment': ['Seleccionar asignación', 'Selecionar atribuição'],
  'Select project': ['Seleccionar proyecto', 'Selecionar projeto'],
  'Select worker': ['Seleccionar trabajador', 'Selecionar colaborador'],
  'Sign in': ['Iniciar sesión', 'Entrar'],
  'Sign in securely': ['Iniciar sesión de forma segura', 'Entrar com segurança'],
  'TODAY / 10 H EXPECTED': ['HOY / 10 H PREVISTAS', 'HOJE / 10 H ESPERADAS'],
  'stays all-in': ['se mantiene todo incluido', 'permanece tudo incluído'],
  'A draft from this authenticated account is stored on this device. Review it before it can replace the fields on screen.':
    [
      'Se ha guardado en este dispositivo un borrador de esta cuenta autenticada. Revísalo antes de que pueda reemplazar los campos en pantalla.',
      'Um rascunho desta conta autenticada foi salvo neste dispositivo. Revise-o antes que ele possa substituir os campos na tela.',
    ],
  'A local recovery draft is available for review': [
    'Hay un borrador local de recuperación disponible para revisión',
    'Há um rascunho local de recuperação disponível para revisão',
  ],
  'Access is invitation-only. If you need access, contact your J&A workspace administrator.': [
    'El acceso es solo por invitación. Si necesitas acceso, contacta con el administrador de tu espacio de trabajo de J&A.',
    'O acesso é somente por convite. Se precisar de acesso, entre em contato com o administrador do seu espaço de trabalho J&A.',
  ],
  'Account activated. You can sign in now.': [
    'Cuenta activada. Ya puedes iniciar sesión.',
    'Conta ativada. Você já pode entrar.',
  ],
  'Accountant approved at': ['Aprobado por el contable a las', 'Aprovado pelo contador em'],
  'Activity summary': ['Resumen de actividad', 'Resumo da atividade'],
  'Actual time, one week at a glance': [
    'Horas reales de la semana, de un vistazo',
    'Horas trabalhadas na semana, em uma única visão',
  ],
  'Append-only security and finance audit': [
    'Auditoría de seguridad y finanzas de solo anexado',
    'Auditoria de segurança e finanças somente para acréscimos',
  ],
  'Approved and submitted field time': [
    'Tiempo de campo aprobado y enviado',
    'Tempo de campo aprovado e enviado',
  ],
  'Archive Tax Profile': ['Archivar perfil fiscal', 'Arquivar perfil fiscal'],
  'Archive billing rule': ['Archivar regla de facturación', 'Arquivar regra de faturamento'],
  'Archive client': ['Archivar cliente', 'Arquivar cliente'],
  'Archive this billing rule?': [
    '¿Quieres archivar esta regla de facturación?',
    'Deseja arquivar esta regra de faturamento?',
  ],
  'Artifact details': ['Detalles del artefacto', 'Detalhes do artefato'],
  'Assign skills and availability windows for an individual worker. These controls do not expose compensation or client-rate data.':
    [
      'Asigna competencias y ventanas de disponibilidad a un trabajador. Estos controles no muestran datos de compensación ni tarifas del cliente.',
      'Atribua competências e janelas de disponibilidade a um colaborador. Esses controles não exibem dados de remuneração nem tarifas do cliente.',
    ],
  'Auditor (Read Only)': ['Auditor (solo lectura)', 'Auditor (somente leitura)'],
  'Autosave is available for draft reports and reports needing changes': [
    'El guardado automático está disponible para borradores e informes que necesitan cambios',
    'O salvamento automático está disponível para rascunhos e relatórios que precisam de alterações',
  ],
  'Autosave is ready': ['El guardado automático está listo', 'O salvamento automático está pronto'],
  'BILL TO': ['FACTURAR A', 'FATURAR PARA'],
  'Can review': ['Puede revisar', 'Pode revisar'],
  'Client labor after approved discount': [
    'Trabajo del cliente después del descuento aprobado',
    'Mão de obra do cliente após o desconto aprovado',
  ],
  'Client labor before tax': [
    'Trabajo del cliente antes de impuestos',
    'Mão de obra do cliente antes dos impostos',
  ],
  'Compensation, expenses and pay history': [
    'Compensación, gastos e historial de pagos',
    'Remuneração, despesas e histórico de pagamentos',
  ],
  'Confirm with password': ['Confirmar con contraseña', 'Confirmar com senha'],
  'Continue to workspace': [
    'Continuar al espacio de trabajo',
    'Continuar para o espaço de trabalho',
  ],
  'Controls-specific change and validation record': [
    'Registro de cambios y validación específicos de controles',
    'Registro de alteração e validação específico de controles',
  ],
  'Create client': ['Crear cliente', 'Criar cliente'],
  'Create invoice draft': ['Crear borrador de factura', 'Criar rascunho de fatura'],
  'Close sources after the invoice is issued so leftover work cannot be billed twice.': [
    'Cierra los orígenes una vez emitida la factura para que el trabajo restante no se facture dos veces.',
    'Feche as origens após emitir a fatura para que o trabalho restante não seja faturado duas vezes.',
  ],
  'Create invoice draft for this project': [
    'Crear un borrador de factura para este proyecto',
    'Criar um rascunho de fatura para este projeto',
  ],
  'Create milestone': ['Crear hito', 'Criar marco'],
  'Create project': ['Crear proyecto', 'Criar projeto'],
  'Customer and internal summaries are generated after a reviewed billing-period close.': [
    'Los resúmenes para clientes y uso interno se generan después de cerrar el período de facturación revisado.',
    'Os resumos para clientes e uso interno são gerados após o fechamento revisado do período de faturamento.',
  ],
  'Customer private': ['Privado del cliente', 'Privado do cliente'],
  'DAILY FIELD REPORT': ['INFORME DIARIO DE CAMPO', 'RELATÓRIO DIÁRIO DE CAMPO'],
  'Daily and PLC records awaiting review': [
    'Registros diarios y PLC pendientes de revisión',
    'Registros diários e PLC aguardando revisão',
  ],
  'Delete this contact?': ['¿Quieres eliminar este contacto?', 'Deseja excluir este contato?'],
  'Delete this report? This cannot be undone.': [
    '¿Quieres eliminar este informe? Esta acción no se puede deshacer.',
    'Deseja excluir este relatório? Esta ação não pode ser desfeita.',
  ],
  'Describe the technical change and its production impact.': [
    'Describe el cambio técnico y su impacto en producción.',
    'Descreva a alteração técnica e seu impacto na produção.',
  ],
  'Download project finance XLSX': [
    'Descargar finanzas del proyecto en XLSX',
    'Baixar finanças do projeto em XLSX',
  ],
  'Draft could not be autosaved': [
    'No se pudo guardar automáticamente el borrador',
    'Não foi possível salvar o rascunho automaticamente',
  ],
  'Draft, submitted, approved or needs changes.': [
    'Borrador, enviado, aprobado o necesita cambios.',
    'Rascunho, enviado, aprovado ou precisa de alterações.',
  ],
  'Each row reconciles the issued invoice, locked source records, direct cost, collection, outstanding balance, and contribution.':
    [
      'Cada fila concilia la factura emitida, los registros de origen bloqueados, el coste directo, los cobros, el saldo pendiente y la contribución.',
      'Cada linha reconcilia a fatura emitida, os registros de origem bloqueados, o custo direto, as cobranças, o saldo em aberto e a contribuição.',
    ],
  'Eligible for percentage compensation': [
    'Admite compensación porcentual',
    'Elegível para remuneração percentual',
  ],
  'End this session on this device': [
    'Finalizar esta sesión en este dispositivo',
    'Encerrar esta sessão neste dispositivo',
  ],
  'Enter only minutes actually worked.': [
    'Introduce solo los minutos realmente trabajados.',
    'Informe apenas os minutos efetivamente trabalhados.',
  ],
  'Enter the current code from your authenticator app to continue.': [
    'Introduce el código actual de tu aplicación de autenticación para continuar.',
    'Informe o código atual do seu aplicativo autenticador para continuar.',
  ],
  'Expense details': ['Detalles del gasto', 'Detalhes da despesa'],
  'Field operations overview': [
    'Resumen de operaciones de campo',
    'Visão geral das operações de campo',
  ],
  'Field work, time and expenses': [
    'Trabajo de campo, tiempo y gastos',
    'Trabalho de campo, tempo e despesas',
  ],
  'Field workspace': ['Espacio de trabajo de campo', 'Espaço de trabalho de campo'],
  'Finalized compensation events for your own approved work.': [
    'Eventos de compensación finalizados de tu trabajo aprobado.',
    'Eventos de remuneração finalizados do seu trabalho aprovado.',
  ],
  'Finalized source · read-only': [
    'Origen finalizado · solo lectura',
    'Origem finalizada · somente leitura',
  ],
  'Finance configuration': ['Configuración financiera', 'Configuração financeira'],
  'Project issuing authority': ['Autoridad emisora del proyecto', 'Autoridade emissora do projeto'],
  'Choose the reviewed legal-entity revision that will issue invoices for this project. Previous assignments remain visible as immutable history.':
    [
      'Elige la revisión aprobada de la entidad jurídica que emitirá las facturas de este proyecto. Las asignaciones anteriores permanecen visibles como historial inmutable.',
      'Escolha a revisão aprovada da entidade jurídica que emitirá as faturas deste projeto. As atribuições anteriores permanecem visíveis como histórico imutável.',
    ],
  'The assignment applies from the selected effective date.': [
    'La asignación se aplica desde la fecha de vigencia seleccionada.',
    'A atribuição se aplica a partir da data de vigência selecionada.',
  ],
  'Issuing legal entity revision': [
    'Revisión de la entidad jurídica emisora',
    'Revisão da entidade jurídica emissora',
  ],
  'Only reviewed canonical revisions are available for assignment.': [
    'Solo se pueden asignar revisiones canónicas aprobadas.',
    'Somente revisões canônicas aprovadas podem ser atribuídas.',
  ],
  'Select issuing authority': ['Seleccionar autoridad emisora', 'Selecionar autoridade emissora'],
  from: ['desde', 'desde'],
  'Effective to': ['Vigente hasta', 'Vigente até'],
  'Leave blank when this authority remains current.': [
    'Déjalo en blanco si esta autoridad sigue vigente.',
    'Deixe em branco se esta autoridade continuar vigente.',
  ],
  'Record why this project issuing authority was assigned.': [
    'Registra por qué se asignó esta autoridad emisora al proyecto.',
    'Registre por que esta autoridade emissora foi atribuída ao projeto.',
  ],
  'Save issuing authority': ['Guardar autoridad emisora', 'Salvar autoridade emissora'],
  'Issuing authority assignment is restricted to an authorized Finance or Owner administrator.': [
    'La asignación de la autoridad emisora está restringida a un administrador autorizado de Finanzas o Propiedad.',
    'A atribuição da autoridade emissora é restrita a um administrador autorizado de Finanças ou Proprietário.',
  ],
  'Project issuing authority history': [
    'Historial de autoridades emisoras del proyecto',
    'Histórico de autoridades emissoras do projeto',
  ],
  Revision: ['Revisión', 'Revisão'],
  current: ['actual', 'atual'],
  'No project issuing authority assignment is recorded for the selected project.': [
    'No hay ninguna asignación de autoridad emisora registrada para el proyecto seleccionado.',
    'Não há atribuição de autoridade emissora registrada para o projeto selecionado.',
  ],
  'Flag changes that require safety-impact review.': [
    'Marca los cambios que requieren una revisión de su impacto en la seguridad.',
    'Sinalize alterações que exigem revisão do impacto na segurança.',
  ],
  'Forecast and budget control': [
    'Control de previsiones y presupuesto',
    'Controle de previsões e orçamento',
  ],
  'Generate drafts when the stream is due': [
    'Generar borradores cuando venza el flujo',
    'Gerar rascunhos quando o fluxo vencer',
  ],
  'Generate monthly Accounting Pack': [
    'Generar paquete contable mensual',
    'Gerar pacote contábil mensal',
  ],
  'Generate reports': ['Generar informes', 'Gerar relatórios'],
  'How this report was calculated': [
    'Cómo se calculó este informe',
    'Como este relatório foi calculado',
  ],
  'How to read this timesheet': [
    'Cómo leer esta hoja de tiempo',
    'Como ler esta planilha de tempo',
  ],
  'Immutable audit trail for this source record.': [
    'Pista de auditoría inmutable para este registro de origen.',
    'Trilha de auditoria imutável para este registro de origem.',
  ],
  'Included in all-in / fixed price': [
    'Incluido en todo incluido / precio fijo',
    'Incluído em tudo incluído / preço fixo',
  ],
  'Invite/Create Worker': ['Invitar/crear trabajador', 'Convidar/criar colaborador'],
  'Invoice line items and amounts': [
    'Partidas e importes de la factura',
    'Itens e valores da fatura',
  ],
  'Invoice preview': ['Vista previa de la factura', 'Pré-visualização da fatura'],
  'Invoice, bill and project economics': [
    'Economía de facturas, cobros y proyectos',
    'Dados econômicos de faturas, cobranças e projetos',
  ],
  'J&A AUTOMATION · INVOICE PREVIEW': [
    'J&A AUTOMATION · VISTA PREVIA DE FACTURA',
    'J&A AUTOMATION · PRÉ-VISUALIZAÇÃO DA FATURA',
  ],
  'Legal name': ['Nombre legal', 'Nome legal'],
  'Local draft recovered. Review the fields before saving or submitting.': [
    'Borrador local recuperado. Revisa los campos antes de guardarlo o enviarlo.',
    'Rascunho local recuperado. Revise os campos antes de salvá-lo ou enviá-lo.',
  ],
  'New Client': ['Nuevo cliente', 'Novo cliente'],
  'New Project': ['Nuevo proyecto', 'Novo projeto'],
  'No activity summary was recorded.': [
    'No se registró ningún resumen de actividad.',
    'Nenhum resumo de atividade foi registrado.',
  ],
  'No client labor rates are configured for this project.': [
    'No hay tarifas de trabajo del cliente configuradas para este proyecto.',
    'Não há taxas de mão de obra do cliente configuradas para este projeto.',
  ],
  'No compensation rules are configured for this project.': [
    'No hay reglas de compensación configuradas para este proyecto.',
    'Não há regras de remuneração configuradas para este projeto.',
  ],
  'No compensation settlements in this period.': [
    'No hay liquidaciones de compensación en este período.',
    'Não há liquidações de remuneração neste período.',
  ],
  'No internal cost rules are configured for this project.': [
    'No hay reglas de coste interno configuradas para este proyecto.',
    'Não há regras de custo interno configuradas para este projeto.',
  ],
  'No receipt linked': ['No hay ningún recibo vinculado', 'Nenhum recibo está vinculado'],
  'No recommendation matches. Press Enter to search all authorized records.': [
    'Ninguna recomendación coincide. Pulsa Intro para buscar en todos los registros autorizados.',
    'Nenhuma recomendação corresponde. Pressione Enter para pesquisar todos os registros autorizados.',
  ],
  'No safety flag': ['Sin alerta de seguridad', 'Sem sinalização de segurança'],
  'No settlements exist for the selected project yet.': [
    'Todavía no hay liquidaciones para el proyecto seleccionado.',
    'Ainda não há liquidações para o projeto selecionado.',
  ],
  'Nothing is available in this view yet.': [
    'Todavía no hay nada disponible en esta vista.',
    'Ainda não há nada disponível nesta visão.',
  ],
  'OFFLINE REVIEW': ['REVISIÓN SIN CONEXIÓN', 'REVISÃO SEM CONEXÃO'],
  'Offline. Your local recovery draft is preserved.': [
    'Sin conexión. El borrador local de recuperación se conserva.',
    'Sem conexão. O rascunho local de recuperação foi preservado.',
  ],
  'One secure workspace for field operations, project delivery, technical records and finance. Built around the way J&A Automation works.':
    [
      'Un espacio de trabajo seguro para operaciones de campo, entrega de proyectos, registros técnicos y finanzas, diseñado para la forma de trabajar de J&A Automation.',
      'Um espaço de trabalho seguro para operações de campo, entrega de projetos, registros técnicos e finanças, criado para a forma como a J&A Automation trabalha.',
    ],
  'Optional planning context only; actual and approved time remain the source of compensation.': [
    'Solo contexto de planificación opcional; las horas reales aprobadas siguen siendo la fuente de compensación.',
    'Apenas contexto opcional de planejamento; as horas trabalhadas aprovadas continuam sendo a fonte da remuneração.',
  ],
  'PROJECT EXPENSES': ['GASTOS DEL PROYECTO', 'DESPESAS DO PROJETO'],
  'Paid directly by client': [
    'Pagado directamente por el cliente',
    'Pago diretamente pelo cliente',
  ],
  'Percentage (basis points)': ['Porcentaje (puntos básicos)', 'Percentual (pontos-base)'],
  'Percentage basis': ['Base porcentual', 'Base percentual'],
  'Percentage of eligible client labor': [
    'Porcentaje del trabajo elegible del cliente',
    'Percentual da mão de obra elegível do cliente',
  ],
  'Percentage of eligible overtime': [
    'Porcentaje de horas extra elegibles',
    'Percentual de horas extras elegíveis',
  ],
  'Personal details, MFA and availability': [
    'Datos personales, MFA y disponibilidad',
    'Dados pessoais, MFA e disponibilidade',
  ],
  'Planned end date (optional)': [
    'Fecha de finalización prevista (opcional)',
    'Data de término planejada (opcional)',
  ],
  'Private files shared with your workspace': [
    'Archivos privados compartidos con tu espacio de trabajo',
    'Arquivos privados compartilhados com seu espaço de trabalho',
  ],
  'Problem and change performed': ['Problema y cambio realizado', 'Problema e alteração realizada'],
  'Problem / symptom': ['Problema / síntoma', 'Problema / sintoma'],
  'Diagnosis / root cause': ['Diagnóstico / causa raíz', 'Diagnóstico / causa raiz'],
  'Change performed': ['Cambio realizado', 'Alteração realizada'],
  'Process durable finance jobs': [
    'Procesar trabajos financieros persistentes',
    'Processar tarefas financeiras duráveis',
  ],
  'Project currency amount (minor units)': [
    'Importe del proyecto en unidades menores de su moneda',
    'Valor do projeto em unidades menores da moeda',
  ],
  'Project number, client, currency, created history and version remain read-only to protect financial references. Monetary fields use exact database minor units (for USD, cents).':
    [
      'El número de proyecto, cliente, moneda, historial de creación y versión son de solo lectura para proteger las referencias financieras. Los importes usan las unidades menores exactas de la base de datos (centavos para USD).',
      'O número do projeto, cliente, moeda, histórico de criação e versão são somente leitura para proteger as referências financeiras. Os valores usam as unidades menores exatas do banco de dados (centavos para USD).',
    ],
  'Project scope': ['Ámbito del proyecto', 'Escopo do projeto'],
  'Project-currency amount': ['Importe en la moneda del proyecto', 'Valor na moeda do projeto'],
  'Projects, reports and approvals': [
    'Proyectos, informes y aprobaciones',
    'Projetos, relatórios e aprovações',
  ],
  'Publish field assignment': ['Publicar asignación de campo', 'Publicar atribuição de campo'],
  'Read-only review': ['Revisión de solo lectura', 'Revisão somente leitura'],
  'Record the work completed during this shift.': [
    'Registra el trabajo realizado durante este turno.',
    'Registre o trabalho realizado durante este turno.',
  ],
  'Record validation performed, results, open risk, and rollback information.': [
    'Registra la validación realizada, los resultados, los riesgos abiertos y la información de reversión.',
    'Registre a validação realizada, os resultados, os riscos em aberto e as informações de reversão.',
  ],
  'Recorded with the source': ['Registrado con el origen', 'Registrado com a origem'],
  'Refresh customer and internal period summaries from reviewed source records and create the PDF downloads. This does not issue or send an invoice.':
    [
      'Actualiza los resúmenes del período para clientes y uso interno a partir de registros de origen revisados y crea las descargas PDF. No emite ni envía una factura.',
      'Atualize os resumos do período para clientes e uso interno a partir dos registros de origem revisados e crie os arquivos PDF para baixar. Isso não emite nem envia uma fatura.',
    ],
  'Reimbursable at cost': ['Reembolsable al coste', 'Reembolsável pelo custo'],
  'Remove Skill': ['Eliminar competencia', 'Excluir competência'],
  'Report language': ['Idioma del informe', 'Idioma do relatório'],
  'Return to sign in': ['Volver a iniciar sesión', 'Voltar para o login'],
  'Review changes and approval activity': [
    'Revisar cambios y actividad de aprobación',
    'Revisar alterações e atividade de aprovação',
  ],
  'Safety impact: technical lead review, validation and rollback detail required': [
    'Impacto en la seguridad: se requiere revisión del responsable técnico, validación y detalle de reversión',
    'Impacto na segurança: são necessárias revisão técnica, validação e informações de reversão',
  ],
  'Save changes and notify reviewers': [
    'Guardar cambios y notificar a los revisores',
    'Salvar alterações e notificar os revisores',
  ],
  'Secure operational visibility for every project.': [
    'Visibilidad operativa segura para cada proyecto.',
    'Visibilidade operacional segura para cada projeto.',
  ],
  'Server changes need your review': [
    'Los cambios del servidor requieren tu revisión',
    'As alterações do servidor precisam da sua revisão',
  ],
  'Shift summary, blockers and next-day plan': [
    'Resumen del turno, bloqueos y plan del día siguiente',
    'Resumo do turno, bloqueios e plano do dia seguinte',
  ],
  'Sign in with a passkey': [
    'Iniciar sesión con una clave de acceso',
    'Entrar com uma chave de acesso',
  ],
  'Sign-in failed. Check your credentials or contact your administrator.': [
    'No se pudo iniciar sesión. Comprueba tus credenciales o contacta con el administrador.',
    'Falha no login. Verifique suas credenciais ou entre em contato com o administrador.',
  ],
  'Skills and availability': ['Competencias y disponibilidad', 'Competências e disponibilidade'],
  'Start date': ['Fecha de inicio', 'Data de início'],
  'Station / machine': ['Estación / máquina', 'Estação / máquina'],
  'System / machine': ['Sistema / máquina', 'Sistema / máquina'],
  'System name': ['Nombre del sistema', 'Nome do sistema'],
  'TRACEABLE FINANCE OUTPUTS': [
    'RESULTADOS FINANCIEROS TRAZABLES',
    'RESULTADOS FINANCEIROS RASTREÁVEIS',
  ],
  'The Excel export is generated from the current exact database snapshot and includes project margin, employee cost/revenue detail and expense treatment for':
    [
      'La exportación de Excel se genera a partir de la instantánea exacta actual de la base de datos e incluye el margen del proyecto, el detalle de costes e ingresos del empleado y el tratamiento de gastos para',
      'A exportação do Excel é gerada a partir do instantâneo exato atual do banco de dados e inclui a margem do projeto, os detalhes de custo e receita do colaborador e o tratamento de despesas para',
    ],
  'The pack contains invoice register, collections, worker/direct costs, expenses, AR, contribution, source counts, and deterministic PDF/XLSX/CSV/JSON artifacts.':
    [
      'El paquete contiene el registro de facturas, cobros, costes del trabajador y directos, gastos, cuentas por cobrar, contribución, recuentos de origen y artefactos PDF/XLSX/CSV/JSON deterministas.',
      'O pacote contém o registro de faturas, cobranças, custos do colaborador e diretos, despesas, contas a receber, contribuição, contagens de origem e artefatos PDF/XLSX/CSV/JSON determinísticos.',
    ],
  'This updates the report from the current database inputs and regenerates the PDF through the normal report action.':
    [
      'Esto actualiza el informe con los datos actuales de la base de datos y regenera el PDF mediante la acción normal del informe.',
      'Isso atualiza o relatório com os dados atuais do banco de dados e regenera o PDF pela ação normal do relatório.',
    ],
  'Time category': ['Categoría de tiempo', 'Categoria de tempo'],
  'Unsaved changes are protected on this device': [
    'Los cambios sin guardar están protegidos en este dispositivo',
    'As alterações não salvas estão protegidas neste dispositivo',
  ],
  'Update the fields below and submit it again. The owner and admin team can see exactly what changed.':
    [
      'Actualiza los campos siguientes y vuelve a enviarlo. El propietario y el equipo de administración pueden ver exactamente qué ha cambiado.',
      'Atualize os campos abaixo e envie novamente. O proprietário e a equipe de administração podem ver exatamente o que mudou.',
    ],
  'Use the company credentials issued for your J&A workspace.': [
    'Usa las credenciales de empresa emitidas para tu espacio de trabajo de J&A.',
    'Use as credenciais da empresa fornecidas para seu espaço de trabalho J&A.',
  ],
  'Verify and continue': ['Verificar y continuar', 'Verificar e continuar'],
  'Verify your identity': ['Verifica tu identidad', 'Verifique sua identidade'],
  'Weekly actual time and approval status': [
    'Horas reales semanales y estado de aprobación',
    'Horas trabalhadas na semana e status de aprovação',
  ],
  'What this artifact contains and why it is retained': [
    'Qué contiene este artefacto y por qué se conserva',
    'O que este artefato contém e por que é mantido',
  ],
  'Work date': ['Fecha de trabajo', 'Data de trabalho'],
  'Work email': ['Correo electrónico de trabajo', 'E-mail de trabalho'],
  'Worker cost rules remain effective-dated and auditable.': [
    'Las reglas de coste del trabajador mantienen fechas de vigencia y son auditables.',
    'As regras de custo do colaborador têm vigência definida e são auditáveis.',
  ],
  'Worker scope': ['Ámbito del trabajador', 'Escopo do colaborador'],
  'Workspace capabilities': [
    'Capacidades del espacio de trabajo',
    'Capacidades do espaço de trabalho',
  ],
  'Working offline': ['Trabajando sin conexión', 'Trabalhando sem conexão'],
  'Write field report': ['Redactar informe de campo', 'Escrever relatório de campo'],
  'Your local recovery draft is preserved.': [
    'Tu borrador local de recuperación se conserva.',
    'Seu rascunho local de recuperação foi preservado.',
  ],
  'Your offline draft stayed on this device. Compare it with the server record before discarding it.':
    [
      'Tu borrador sin conexión permanece en este dispositivo. Compáralo con el registro del servidor antes de descartarlo.',
      'Seu rascunho sem conexão permaneceu neste dispositivo. Compare-o com o registro do servidor antes de descartá-lo.',
    ],
  'generated this activity for': ['generó esta actividad para', 'gerou esta atividade para'],
  'the workspace': ['el espacio de trabajo', 'o espaço de trabalho'],
  'time record(s) have no matching compensation rule and require Finance review.': [
    'Los registros de horas no tienen una regla de compensación coincidente y requieren revisión de Finanzas.',
    'Os registros de horas não têm uma regra de remuneração correspondente e exigem revisão de Finanças.',
  ],
  'worker paid': ['pagado por el trabajador', 'pago pelo colaborador'],
};

/**
 * Explicit translations for the current extracted portal sections. These
 * entries are intentionally complete phrases/labels; they are not produced
 * by lexical substitution or an English fallback.
 */
export const extractedSectionCoverageOverrides: Record<string, readonly [string, string]> = {
  '0 bps = 0%; 100 bps = 1%.': ['0 pb = 0%; 100 pb = 1%.', '0 pb = 0%; 100 pb = 1%.'],
  'A finalized customer-safe report and a ready PDF are required before customer sign-off can be captured.':
    [
      'Se necesita un informe final seguro para el cliente y un PDF listo antes de registrar su conformidad.',
      'É necessário um relatório final seguro para o cliente e um PDF pronto antes de registrar a conformidade.',
    ],
  'A verified signed PDF copy is required for this exact report version. It contains no financial information.':
    [
      'Se requiere una copia PDF firmada y verificada para esta versión exacta del informe. No contiene información financiera.',
      'Uma cópia em PDF assinada e verificada é obrigatória para esta versão exata do relatório. Ela não contém informações financeiras.',
    ],
  'ACTIVITY REGISTER': ['REGISTRO DE ACTIVIDAD', 'REGISTRO DE ATIVIDADES'],
  Accounting: ['Contabilidad', 'Contabilidade'],
  'Accounting Pack attention summary': [
    'Resumen de atención del paquete contable',
    'Resumo de atenção do pacote contábil',
  ],
  Actions: ['Acciones', 'Ações'],
  Activity: ['Actividad', 'Atividade'],
  'Actual client recovery state': [
    'Estado real de recuperación del cliente',
    'Estado real da recuperação do cliente',
  ],
  'Actual collection': ['Cobro real', 'Recebimento real'],
  'Actual duration (minutes)': ['Duración real (minutos)', 'Duração real (minutos)'],
  'Actual finance metrics': ['Métricas financieras reales', 'Métricas financeiras reais'],
  'Actual issue': ['Emisión real', 'Emissão real'],
  'Actual minutes': ['Minutos reales', 'Minutos reais'],
  'Actual operational activity included in this period. Compensation interpretation remains governed by project rules.':
    [
      'Actividad operativa real incluida en este período. La interpretación de la compensación sigue regida por las reglas del proyecto.',
      'Atividade operacional real incluída neste período. A interpretação da remuneração continua regida pelas regras do projeto.',
    ],
  'Actual payment': ['Pago real', 'Pagamento real'],
  'Actual recorded': ['Registrado real', 'Registrado real'],
  'Actual reimbursement': ['Reembolso real', 'Reembolso real'],
  'Actual settled': ['Liquidado real', 'Liquidado real'],
  'Actual time': ['Horas reales', 'Horas trabalhadas'],
  'Actual values come from approved source records, issued invoices, and append-only payment events.':
    [
      'Los valores reales proceden de registros fuente aprobados, facturas emitidas y eventos de pago de solo anexado.',
      'Os valores reais vêm de registros de origem aprovados, faturas emitidas e eventos de pagamento somente de acréscimo.',
    ],
  'Adjust filters or build a draft from an authorized billing stream.': [
    'Ajusta los filtros o crea un borrador desde un flujo de facturación autorizado.',
    'Ajuste os filtros ou crie um rascunho a partir de um fluxo de faturamento autorizado.',
  ],
  'Advanced reporting and notes': ['Informes avanzados y notas', 'Relatórios avançados e notas'],
  'A billing stream sets cadence, template and tax for one project. Create the draft here. Approve, issue and collect in Invoices.':
    [
      'Un flujo de facturación fija cadencia, plantilla e impuestos de un proyecto. Crea el borrador aquí. Aprueba, emite y cobra en Facturas.',
      'Um fluxo de faturamento define cadência, modelo e imposto de um projeto. Crie o rascunho aqui. Aprove, emita e cobre em Faturas.',
    ],
  'Approve this draft after Finance has reviewed the lines. The client does not receive it yet.': [
    'Aprueba el borrador cuando Finanzas haya revisado las líneas. El cliente todavía no lo recibe.',
    'Aprove o rascunho quando Finanças tiver revisado as linhas. O cliente ainda não o recebe.',
  ],
  Alerts: ['Alertas', 'Alertas'],
  'All invoices': ['Todas las facturas', 'Todas as faturas'],
  'All projects': ['Todos los proyectos', 'Todos os projetos'],
  'All stages': ['Todas las etapas', 'Todas as etapas'],
  'Billing streams': ['Flujos de facturación', 'Fluxos de faturamento'],
  'Source record': ['Registro de origen', 'Registro de origem'],
  'All statuses': ['Todos los estados', 'Todos os status'],
  'Allowed: PDF, ZIP, JPEG, PNG, WebP, HEIC or UTF-8 text. Maximum 50 MB': [
    'Permitidos: PDF, ZIP, JPEG, PNG, WebP, HEIC o texto UTF-8. Máximo 50 MB',
    'Permitidos: PDF, ZIP, JPEG, PNG, WebP, HEIC ou texto UTF-8. Máximo de 50 MB',
  ],
  'Apply filters': ['Aplicar filtros', 'Aplicar filtros'],
  Approval: ['Aprobación', 'Aprovação'],
  'Approval attention summary': [
    'Resumen de atención de aprobaciones',
    'Resumo de atenção das aprovações',
  ],
  'Approval domains': ['Ámbitos de aprobación', 'Domínios de aprovação'],
  'Approval queue count': ['Cantidad en la cola de aprobación', 'Quantidade na fila de aprovação'],
  Approvals: ['Aprobaciones', 'Aprovações'],
  'Approved WIP': ['Trabajo en curso aprobado', 'Trabalho em andamento aprovado'],
  'Approved operationally': ['Aprobado operativamente', 'Aprovado operacionalmente'],
  'Approved source records': ['Registros fuente aprobados', 'Registros de origem aprovados'],
  'Approved time source records': [
    'Registros fuente de tiempo aprobados',
    'Registros de origem de tempo aprovados',
  ],
  'Archive billing stream': ['Archivar flujo de facturación', 'Arquivar fluxo de faturamento'],
  'Archive project': ['Archivar proyecto', 'Arquivar projeto'],
  Archived: ['Archivado', 'Arquivado'],
  'Archived clients remain visible to management for safe restore; workers never receive this list.':
    [
      'Los clientes archivados siguen visibles para la gestión y su restauración segura; los trabajadores nunca reciben esta lista.',
      'Os clientes arquivados continuam visíveis para a gestão e restauração segura; colaboradores nunca recebem esta lista.',
    ],
  'Assigned project': ['Proyecto asignado', 'Projeto atribuído'],
  'Assigned team': ['Equipo asignado', 'Equipe atribuída'],
  'Assigned worker': ['Trabajador asignado', 'Colaborador atribuído'],
  'Assignment history': ['Historial de asignaciones', 'Histórico de atribuições'],
  'Assignments, effective dates and planning only. Commercial rates stay in Finance.': [
    'Asignaciones, fechas de vigencia y planificación únicamente. Las tarifas comerciales permanecen en Finanzas.',
    'Atribuições, datas de vigência e planejamento apenas. As taxas comerciais permanecem em Finanças.',
  ],
  Attachment: ['Adjunto', 'Anexo'],
  'Attachment cancellation failed': [
    'No se pudo cancelar el adjunto',
    'Não foi possível cancelar o anexo',
  ],
  'Attachment cancellation failed. Try again.': [
    'No se pudo cancelar el adjunto. Inténtalo de nuevo.',
    'Não foi possível cancelar o anexo. Tente novamente.',
  ],
  'Attachment upload failed': ['No se pudo cargar el adjunto', 'Não foi possível enviar o anexo'],
  'Attachment upload failed. Check your connection and try again.': [
    'No se pudo cargar el adjunto. Comprueba la conexión e inténtalo de nuevo.',
    'Não foi possível enviar o anexo. Verifique a conexão e tente novamente.',
  ],
  Attachments: ['Adjuntos', 'Anexos'],
  'Auditor access is read only. Finance actions remain unavailable.': [
    'El acceso del auditor es de solo lectura. Las acciones financieras siguen deshabilitadas.',
    'O acesso do auditor é somente leitura. As ações financeiras continuam indisponíveis.',
  ],
  'Auditor view is read-only. Policy changes require an authorized Finance or Owner administrator.':
    [
      'La vista del auditor es de solo lectura. Los cambios de política requieren un administrador autorizado de Finanzas o Propietario.',
      'A visão do auditor é somente leitura. Alterações de política exigem um administrador autorizado de Finanças ou Proprietário.',
    ],
  'Auditor view is read-only; Finance/Admin changes require authorized access.': [
    'La vista del auditor es de solo lectura; los cambios de Finanzas/Administración requieren acceso autorizado.',
    'A visão do auditor é somente leitura; alterações de Finanças/Administração exigem acesso autorizado.',
  ],
  'Authorized Finance / Owner action for reviewed period records.': [
    'Acción autorizada de Finanzas/Propietario para registros de período revisados.',
    'Ação autorizada de Finanças/Proprietário para registros de período revisados.',
  ],
  'Authorized ledger rows': ['Filas de libro autorizadas', 'Linhas do livro autorizadas'],
  'Authorized project sources': [
    'Fuentes de proyecto autorizadas',
    'Fontes de projeto autorizadas',
  ],
  'Authorized projects list': ['Lista de proyectos autorizados', 'Lista de projetos autorizados'],
  'Authorized view': ['Vista autorizada', 'Visão autorizada'],
  'Automatic artifact processing pending': [
    'Procesamiento automático de artefactos pendiente',
    'Processamento automático de artefatos pendente',
  ],
  'Bank return': ['Devolución bancaria', 'Devolução bancária'],
  'Begin close': ['Iniciar cierre', 'Iniciar encerramento'],
  'Billable minutes': ['Minutos facturables', 'Minutos faturáveis'],
  'Billing address is missing on this existing record. Enter the real address before saving; the interface will not invent one.':
    [
      'Falta la dirección de facturación en este registro existente. Introduce la dirección real antes de guardar; la interfaz no inventará ninguna.',
      'O endereço de faturamento está ausente neste registro existente. Informe o endereço real antes de salvar; a interface não inventará um.',
    ],
  'Billing address missing': [
    'Falta la dirección de facturación',
    'Endereço de faturamento ausente',
  ],
  'Billing configuration': ['Configuración de facturación', 'Configuração de faturamento'],
  'Billing contact email': [
    'Correo del contacto de facturación',
    'E-mail do contato de faturamento',
  ],
  'Billing contact name': ['Nombre del contacto de facturación', 'Nome do contato de faturamento'],
  'Billing lifecycle remains in the finance workspace. Issued invoices are immutable snapshots.': [
    'El ciclo de vida de facturación permanece en el espacio financiero. Las facturas emitidas son instantáneas inmutables.',
    'O ciclo de vida do faturamento permanece no espaço financeiro. As faturas emitidas são instantâneos imutáveis.',
  ],
  'Billing stage summary': ['Resumen de etapas de facturación', 'Resumo das etapas de faturamento'],
  'Budget · minor units': ['Presupuesto · unidades menores', 'Orçamento · unidades menores'],
  'Cancel upload': ['Cancelar carga', 'Cancelar envio'],
  'Cancelling attachment…': ['Cancelando adjunto…', 'Cancelando anexo…'],
  'Candidate revenue from approved sources': [
    'Ingresos candidatos de fuentes aprobadas',
    'Receita candidata de fontes aprovadas',
  ],
  'Canonical project finance projection': [
    'Proyección financiera canónica del proyecto',
    'Projeção financeira canônica do projeto',
  ],
  'Canonical project finance value': [
    'Valor financiero canónico del proyecto',
    'Valor financeiro canônico do projeto',
  ],
  'Canonical finance projection incomplete': [
    'La proyección financiera canónica está incompleta',
    'A projeção financeira canônica está incompleta',
  ],
  'Canonical projection loaded': ['Proyección canónica cargada', 'Projeção canônica carregada'],
  'Canonical projection warnings': [
    'Avisos de la proyección canónica',
    'Alertas da projeção canônica',
  ],
  'Some approved source records still need finance projection data. Totals remain visible for traceability but are not complete for final review.':
    [
      'Algunos registros de origen aprobados aún necesitan datos de proyección financiera. Los totales siguen visibles para trazabilidad, pero no están completos para la revisión final.',
      'Alguns registros de origem aprovados ainda precisam de dados de projeção financeira. Os totais continuam visíveis para rastreabilidade, mas não estão completos para a revisão final.',
    ],
  'Projection completeness reasons': [
    'Motivos de integridad de la proyección',
    'Motivos de integridad da projeção',
  ],
  'Client rate is missing for a source record.': [
    'Falta la tarifa del cliente para un registro de origen.',
    'Falta a tarifa do cliente para um registro de origem.',
  ],
  'Internal cost is missing for a source record.': [
    'Falta el coste interno para un registro de origen.',
    'Falta o custo interno para um registro de origem.',
  ],
  'Worker compensation rule is missing for a source record.': [
    'Falta la regla de compensación del trabajador para un registro de origen.',
    'Falta a regra de remuneração do trabalhador para um registro de origem.',
  ],
  'Expense finance projection is missing for a source record.': [
    'Falta la proyección financiera del gasto para un registro de origen.',
    'Falta a projeção financeira da despesa para um registro de origem.',
  ],
  'Expense currency conversion is missing for a source record.': [
    'Falta la conversión de moneda del gasto para un registro de origen.',
    'Falta a conversão de moeda da despesa para um registro de origem.',
  ],
  'A finance source record needs projection review.': [
    'Un registro de origen financiero necesita revisión de la proyección.',
    'Um registro de origem financeira precisa de revisão da projeção.',
  ],
  'Capture actual work': ['Registrar trabajo real', 'Registrar trabalho real'],
  'Capture conformity': ['Registrar conformidad', 'Registrar conformidade'],
  'Capture field activity, technical changes and customer confirmation in one register.': [
    'Registra la actividad de campo, los cambios técnicos y la confirmación del cliente en un único registro.',
    'Registre a atividade de campo, as alterações técnicas e a confirmação do cliente em um único registro.',
  ],
  'Capture the shift': ['Registrar el turno', 'Registrar o turno'],
  'Capture what happened': ['Registrar lo ocurrido', 'Registrar o que aconteceu'],
  'Card, transfer or cash': [
    'Tarjeta, transferencia o efectivo',
    'Cartão, transferência ou dinheiro',
  ],
  'Changes requested before resubmission': [
    'Cambios solicitados antes de volver a enviar',
    'Alterações solicitadas antes do reenvio',
  ],
  'Choose an authorized project to inspect its canonical finance projection.': [
    'Elige un proyecto autorizado para consultar su proyección financiera canónica.',
    'Escolha um projeto autorizado para consultar sua projeção financeira canônica.',
  ],
  Classified: ['Clasificado', 'Classificado'],
  'Remove filter': ['Quitar filtro', 'Remover filtro'],
  'Quick date filters': ['Filtros rápidos de fechas', 'Filtros rápidos de datas'],
  'This week': ['Esta semana', 'Esta semana'],
  'This month': ['Este mes', 'Este mês'],
  'Last month': ['Mes pasado', 'Mês passado'],
  'Previous week': ['Semana anterior', 'Semana anterior'],
  'Next week': ['Semana siguiente', 'Próxima semana'],
  'Go to section': ['Ir a una sección', 'Ir para uma seção'],
  'Find a section': ['Buscar sección', 'Buscar seção'],
  'No matching sections': ['No hay secciones que coincidan', 'Nenhuma seção encontrada'],
  'Search the sections available to your profile.': [
    'Busca entre las secciones disponibles para tu perfil.',
    'Busque entre as seções disponíveis para seu perfil.',
  ],
  'Clear filters': ['Borrar filtros', 'Limpar filtros'],
  'Client Sign-off': ['Conformidad del cliente', 'Conformidade do cliente'],
  'Client billable': ['Facturable al cliente', 'Faturável ao cliente'],
  'Client code (optional)': ['Código del cliente (opcional)', 'Código do cliente (opcional)'],
  'Client minimum': ['Mínimo del cliente', 'Mínimo do cliente'],
  'Client number': ['Número de cliente', 'Número do cliente'],
  'Client receivable': ['Cuenta por cobrar al cliente', 'Valor a receber do cliente'],
  'Client sign-off': ['Conformidad del cliente', 'Conformidade do cliente'],
  'Client sign-off register': [
    'Registro de conformidad del cliente',
    'Registro de conformidade do cliente',
  ],
  Clients: ['Clientes', 'Clientes'],
  'Close edit project': ['Cerrar edición del proyecto', 'Fechar edição do projeto'],
  'Close expense form': ['Cerrar formulario de gasto', 'Fechar formulário de despesa'],
  'Close invoice draft': ['Cerrar borrador de factura', 'Fechar rascunho da fatura'],
  'Close project': ['Cerrar proyecto', 'Encerrar projeto'],
  'Close report form': ['Cerrar formulario de informe', 'Fechar formulário de relatório'],
  'Close time form': ['Cerrar formulario de tiempo', 'Fechar formulário de tempo'],
  Closed: ['Cerrado', 'Fechado'],
  Closing: ['En cierre', 'Em encerramento'],
  'Collected (actual)': ['Cobrado (real)', 'Recebido (real)'],
  'Collection status': ['Estado del cobro', 'Status do recebimento'],
  'Collections / Ledger': ['Cobros / libro', 'Recebimentos / livro'],
  'Collections and reversals': ['Cobros y reversiones', 'Recebimentos e estornos'],
  'Collections attention summary': [
    'Resumen de atención de cobros',
    'Resumo de atenção dos recebimentos',
  ],
  Commercial: ['Comercial', 'Comercial'],
  'Commercial classification is shown only in the Finance view.': [
    'La clasificación comercial solo se muestra en la vista de Finanzas.',
    'A classificação comercial é exibida somente na visão de Finanças.',
  ],
  'Commercial configuration': ['Configuración comercial', 'Configuração comercial'],
  'Commercial configuration only': [
    'Solo configuración comercial',
    'Somente configuração comercial',
  ],
  'Commercial treatment': ['Tratamiento comercial', 'Tratamento comercial'],
  'Compensation settlements table': [
    'Tabla de liquidaciones de compensación',
    'Tabela de liquidações de remuneração',
  ],
  'Configure billing': ['Configurar facturación', 'Configurar faturamento'],
  'Configure effective billing streams and source rules. Configuration does not create actual time or payments.':
    [
      'Configura flujos de facturación y reglas de origen con fecha de vigencia. La configuración no crea horas reales ni pagos.',
      'Configure fluxos de faturamento e regras de origem com vigência. A configuração não cria horas trabalhadas nem pagamentos.',
    ],
  'Configure effective-dated interpretation for eligible time and billing readiness. This is project configuration, not worker data entry.':
    [
      'Configura la interpretación con fecha de vigencia para el tiempo elegible y la preparación de facturación. Es configuración del proyecto, no entrada de datos del trabajador.',
      'Configure a interpretação com vigência para tempo elegível e prontidão de faturamento. Isso é configuração do projeto, não entrada de dados do colaborador.',
    ],
  'Confirm approved hours and activities for the selected period.': [
    'Confirma las horas y actividades aprobadas del período seleccionado.',
    'Confirme as horas e atividades aprovadas do período selecionado.',
  ],
  'Confirm invalidation': ['Confirmar invalidación', 'Confirmar invalidação'],
  'Contribution Margin %': ['Margen de contribución %', 'Margem de contribuição %'],
  'Contribution after approved direct cost': [
    'Contribución después del coste directo aprobado',
    'Contribuição após o custo direto aprovado',
  ],
  'Controls changes, validation performed, production impact and rollback detail.': [
    'Cambios de control, validación realizada, impacto en producción y detalles de reversión.',
    'Alterações de controle, validação realizada, impacto em produção e detalhes de reversão.',
  ],
  'Controls, systems and technical evidence': [
    'Controles, sistemas y evidencia técnica',
    'Controles, sistemas e evidência técnica',
  ],
  'Correction draft': ['Borrador de corrección', 'Rascunho de correção'],
  'Correction reason': ['Motivo de la corrección', 'Motivo da correção'],
  'Recalculation reason': ['Motivo del recálculo', 'Motivo do recálculo'],
  'Recalculate and review draft': [
    'Recalcular y revisar borrador',
    'Recalcular e revisar rascunho',
  ],
  Superseded: ['Sustituida', 'Substituída'],
  'Superseded approved invoice': ['Factura aprobada sustituida', 'Fatura aprovada substituída'],
  'This approved version was replaced. Its amounts and lines remain available for review.': [
    'Esta versión aprobada fue sustituida. Sus importes y líneas siguen disponibles para revisión.',
    'Esta versão aprovada foi substituída. Seus valores e itens continuam disponíveis para revisão.',
  ],
  'Open recent-period calculation explanation': [
    'Abrir la explicación de cálculo del período reciente',
    'Abrir a explicação de cálculo do período recente',
  ],
  'Current customer rate': ['Tarifa actual del cliente', 'Tarifa atual do cliente'],
  'How this project is calculated': [
    'Cómo se calcula este proyecto',
    'Como este projeto é calculado',
  ],
  Continue: ['Continuar', 'Continuar'],
  'Create corrected draft': ['Crear borrador corregido', 'Criar rascunho corrigido'],
  'Review every revised field before creating the correction. The linked draft cannot be edited afterward.':
    [
      'Revisa todos los campos corregidos antes de crear la corrección. Después no podrás editar el borrador vinculado.',
      'Revise todos os campos corrigidos antes de criar a correção. Depois não será possível editar o rascunho vinculado.',
    ],
  'This correction draft is linked to the reviewed record. Check the revised fields and submit it for approval.':
    [
      'Este borrador de corrección está vinculado al registro revisado. Comprueba los campos corregidos y envíalo para aprobación.',
      'Este rascunho de correção está vinculado ao registro revisado. Confira os campos corrigidos e envie para aprovação.',
    ],
  'Cost center': ['Centro de coste', 'Centro de custo'],
  'Cost center code': ['Código del centro de coste', 'Código do centro de custo'],
  'Create a reviewable Accounting Pack and follow each artifact until it is ready, failed or queued for automatic processing.':
    [
      'Crea un paquete contable revisable y sigue cada artefacto hasta que esté listo, falle o quede en cola para procesamiento automático.',
      'Crie um pacote contábil revisável e acompanhe cada artefato até ficar pronto, falhar ou entrar na fila de processamento automático.',
    ],
  'Create an effective-dated stream to prepare an invoice draft.': [
    'Crea un flujo con fecha de vigencia para preparar un borrador de factura.',
    'Crie um fluxo com vigência para preparar um rascunho de fatura.',
  ],
  'Create draft': ['Crear borrador', 'Criar rascunho'],
  'Creating…': ['Creando…', 'Criando…'],
  'Current project assignment(s)': [
    'Asignación(es) actual(es) del proyecto',
    'Atribuição(ões) atual(is) do projeto',
  ],
  'Customer confirmation': ['Confirmación del cliente', 'Confirmação do cliente'],
  'Customer confirmation records will appear here when the period is ready.': [
    'Los registros de confirmación del cliente aparecerán aquí cuando el período esté listo.',
    'Os registros de confirmação do cliente aparecerão aqui quando o período estiver pronto.',
  ],
  'Customer confirmations awaiting signature': [
    'Confirmaciones de clientes pendientes de firma',
    'Confirmações de clientes aguardando assinatura',
  ],
  'Customer conformity is bound to this immutable report version.': [
    'La conformidad del cliente está vinculada a esta versión inmutable del informe.',
    'A conformidade do cliente está vinculada a esta versão imutável do relatório.',
  ],
  'Approve the operational hours and activity in this immutable report snapshot. Customer conformity remains a separate step.':
    [
      'Aprueba las horas operativas y la actividad registrada en esta instantánea inmutable del informe. La conformidad del cliente es un paso independiente.',
      'Aprove as horas operacionais e a atividade registrada neste instantâneo imutável do relatório. A conformidade do cliente é uma etapa separada.',
    ],
  'Customer sign-off': ['Conformidad del cliente', 'Conformidade do cliente'],
  'Customer sign-off and other canonical billing readiness checks remain enforced by the server.': [
    'El servidor sigue imponiendo la conformidad del cliente y las demás comprobaciones canónicas de preparación para facturar.',
    'O servidor continua impondo a conformidade do cliente e as demais verificações canônicas de prontidão para faturamento.',
  ],
  'Customer sign-off before billing': [
    'Conformidad del cliente antes de facturar',
    'Conformidade do cliente antes do faturamento',
  ],
  'Customer sign-off is required before this invoice can be issued.': [
    'Se requiere la conformidad del cliente antes de emitir esta factura.',
    'A conformidade do cliente é necessária antes de emitir esta fatura.',
  ],
  'Customer-safe hours, activities and conformity surface': [
    'Superficie segura para el cliente con horas, actividades y conformidad',
    'Visão segura para o cliente com horas, atividades e conformidade',
  ],
  'Daily and technical records': ['Registros diarios y técnicos', 'Registros diários e técnicos'],
  'Daily and technical reports in scope': [
    'Informes diarios y técnicos incluidos',
    'Relatórios diários e técnicos incluídos',
  ],
  'Daily report attachment': ['Adjunto del informe diario', 'Anexo do relatório diário'],
  'Daily report register': ['Registro de informes diarios', 'Registro de relatórios diários'],
  'Date unavailable': ['Fecha no disponible', 'Data indisponível'],
  'Date, type or record': ['Fecha, tipo o registro', 'Data, tipo ou registro'],
  Default: ['Predeterminado', 'Padrão'],
  'Derive overtime after the threshold': [
    'Derivar horas extra después del umbral',
    'Derivar horas extras após o limite',
  ],
  'Derived from the canonical finance projection': [
    'Derivado de la proyección financiera canónica',
    'Derivado da projeção financeira canônica',
  ],
  'Describe the system, validation result, production impact and rollback detail.': [
    'Describe el sistema, el resultado de la validación, el impacto en producción y los detalles de reversión.',
    'Descreva o sistema, o resultado da validação, o impacto em produção e os detalhes de reversão.',
  ],
  'Direct Project Result': ['Resultado directo del proyecto', 'Resultado direto do projeto'],
  'Document the technical change': [
    'Documentar el cambio técnico',
    'Documentar a alteração técnica',
  ],
  'Download finance export': ['Descargar exportación financiera', 'Baixar exportação financeira'],
  'Download unavailable until this file is clean and ready.': [
    'La descarga no está disponible hasta que el archivo esté limpio y listo.',
    'O download não está disponível até que o arquivo esteja limpo e pronto.',
  ],
  'Download worker statement CSV': [
    'Descargar CSV del estado del trabajador',
    'Baixar CSV do extrato do colaborador',
  ],
  'Download worker statement PDF': [
    'Descargar PDF del estado del trabajador',
    'Baixar PDF do extrato do colaborador',
  ],
  'Download your own activity, compensation, settlement, and reimbursement statement for this period.':
    [
      'Descarga tu propio estado de actividad, compensación, liquidación y reembolso de este período.',
      'Baixe seu próprio extrato de atividade, remuneração, liquidação e reembolso deste período.',
    ],
  Draft: ['Borrador', 'Rascunho'],
  'Draft creation is reviewable. Approval, issue, sending and payment remain explicit finance actions.':
    [
      'La creación del borrador es revisable. La aprobación, emisión, envío y pago siguen siendo acciones financieras explícitas.',
      'A criação do rascunho é revisável. Aprovação, emissão, envio e pagamento continuam sendo ações financeiras explícitas.',
    ],
  'Draft invoice': ['Borrador de factura', 'Rascunho de fatura'],
  'Each card is one bill. Approve, then issue. Record payment after the client pays. Adjustment is a new draft, never an edit of the issued bill.':
    [
      'Cada tarjeta es una factura. Aprueba y después emite. Registra el cobro cuando el cliente pague. El ajuste es un borrador nuevo; la factura emitida no se modifica.',
      'Cada cartão é uma fatura. Aprove e depois emita. Registre o recebimento quando o cliente pagar. O ajuste é um rascunho novo; a fatura emitida não é alterada.',
    ],
  'Draft or returned field reports': [
    'Informes de campo en borrador o devueltos',
    'Relatórios de campo em rascunho ou devolvidos',
  ],
  'Draft or review state': ['Estado de borrador o revisión', 'Estado de rascunho ou revisão'],
  Drafts: ['Borradores', 'Rascunhos'],
  Duplicate: ['Duplicado', 'Duplicado'],
  'EAC direct cost (expected)': ['Coste directo EAC (previsto)', 'Custo direto EAC (esperado)'],
  'ETC direct cost (expected)': ['Coste directo ETC (previsto)', 'Custo direto ETC (esperado)'],
  "Each editor carries the record version it displayed. A stale submission is rejected so another administrator's changes are not overwritten.":
    [
      'Cada editor conserva la versión del registro que mostró. Se rechaza un envío obsoleto para no sobrescribir los cambios de otro administrador.',
      'Cada editor carrega a versão do registro exibida. Um envio desatualizado é rejeitado para não sobrescrever alterações de outro administrador.',
    ],
  Edit: ['Editar', 'Editar'],
  'Edit expense': ['Editar gasto', 'Editar despesa'],
  'Edit project': ['Editar proyecto', 'Editar projeto'],
  'Edit time entry': ['Editar registro de horas', 'Editar registro de horas'],
  'Effective date': ['Fecha de vigencia', 'Data de vigência'],
  'Eligible Work and Commissioning minutes use this configured threshold; Travel and Standby keep their own rules.':
    [
      'Los minutos elegibles de Trabajo y Puesta en marcha usan este umbral configurado; Viaje y Disponibilidad mantienen sus propias reglas.',
      'Os minutos elegíveis de Trabalho e Comissionamento usam este limite configurado; Viagem e Sobreaviso mantêm suas próprias regras.',
    ],
  'End date': ['Fecha de fin', 'Data final'],
  'Engineering record': ['Registro de ingeniería', 'Registro de engenharia'],
  'Enter the customer signer details. The signed-at time is captured by the server.': [
    'Introduce los datos del firmante del cliente. El servidor registra la hora de firma.',
    'Informe os dados do signatário do cliente. O servidor registra o horário da assinatura.',
  ],
  'Enter what happened on site, not its commercial interpretation.': [
    'Introduce lo ocurrido en el sitio, no su interpretación comercial.',
    'Informe o que aconteceu no local, não sua interpretação comercial.',
  ],
  'Entry correction': ['Corrección de registro', 'Correção de registro'],
  'Evidence type': ['Tipo de evidencia', 'Tipo de evidência'],
  'Exact source records': ['Registros fuente exactos', 'Registros de origem exatos'],
  'Expected / actual': ['Previsto / real', 'Esperado / real'],
  'Expected and actual payment dates for your own approved work.': [
    'Fechas previstas y reales de pago de tu propio trabajo aprobado.',
    'Datas esperadas e reais de pagamento do seu próprio trabalho aprovado.',
  ],
  'Expected and actual reimbursement dates for your own approved expenses.': [
    'Fechas previstas y reales de reembolso de tus propios gastos aprobados.',
    'Datas esperadas e reais de reembolso das suas próprias despesas aprovadas.',
  ],
  'Expected client recovery': [
    'Recuperación prevista del cliente',
    'Recuperação esperada do cliente',
  ],
  'Expected collection': ['Cobro previsto', 'Recebimento esperado'],
  'Expected final Contribution Margin': [
    'Margen de contribución final previsto',
    'Margem de contribuição final esperada',
  ],
  'Expected or actual payment follow-up': [
    'Seguimiento de pagos previstos o reales',
    'Acompanhamento de pagamentos esperados ou reais',
  ],
  'Expected or actual reimbursement follow-up': [
    'Seguimiento de reembolsos previstos o reales',
    'Acompanhamento de reembolsos esperados ou reais',
  ],
  'Expected payment': ['Pago previsto', 'Pagamento esperado'],
  'Expected reimbursement': ['Reembolso previsto', 'Reembolso esperado'],
  'Expected worker payment': ['Pago previsto al trabajador', 'Pagamento esperado ao colaborador'],
  'Expected worker payment date': [
    'Fecha prevista de pago al trabajador',
    'Data esperada de pagamento ao colaborador',
  ],
  'Expected worker payment planning': [
    'Planificación del pago previsto al trabajador',
    'Planejamento do pagamento esperado ao colaborador',
  ],
  'Actual worker or supplier payments': [
    'Pagos reales a trabajadores o proveedores',
    'Pagamentos reais a trabalhadores ou fornecedores',
  ],
  'Actual paid': ['Pagado realmente', 'Pago efetivamente'],
  'Actual payment amount': ['Importe del pago real', 'Valor do pagamento real'],
  'Actual payment date': ['Fecha real de pago', 'Data real do pagamento'],
  'Latest actual payment': ['Último pago real', 'Último pagamento real'],
  'Reviewed settlement': ['Liquidación revisada', 'Liquidação revisada'],
  Payee: ['Beneficiario', 'Beneficiário'],
  Person: ['Persona', 'Pessoa'],
  'Register actual payment': ['Registrar pago real', 'Registrar pagamento real'],
  'Payment reversal': ['Reversión de pago', 'Reversão de pagamento'],
  'Reversal date': ['Fecha de reversión', 'Data da reversão'],
  'Reason for reversal': ['Motivo de la reversión', 'Motivo da reversão'],
  'Finalize freezes the reviewed compensation snapshot; it does not mean money was transferred. Record each actual payment separately so partial payments, remaining balance and reversals stay traceable.':
    [
      'Finalizar congela la liquidación de compensación revisada; no significa que el dinero se haya transferido. Registra cada pago real por separado para conservar la trazabilidad de pagos parciales, saldo pendiente y reversiones.',
      'Finalizar congela a liquidação de remuneração revisada; não significa que o dinheiro foi transferido. Registre cada pagamento real separadamente para manter rastreáveis pagamentos parciais, saldo restante e reversões.',
    ],
  'Use this register only after the bank transfer or other real payment occurred. A planned date and a finalized settlement are not payment evidence.':
    [
      'Usa este registro sólo después de realizar la transferencia bancaria u otro pago real. Una fecha prevista y una liquidación finalizada no demuestran el pago.',
      'Use este registro somente após a transferência bancária ou outro pagamento real. Uma data prevista e uma liquidação finalizada não comprovam o pagamento.',
    ],
  'Review and finalize this compensation before recording a real payment.': [
    'Revisa y finaliza esta compensación antes de registrar un pago real.',
    'Revise e finalize esta remuneração antes de registrar um pagamento real.',
  ],
  'This compensation balance is fully paid.': [
    'El saldo de esta compensación está totalmente pagado.',
    'O saldo desta remuneração está totalmente pago.',
  ],
  'Your reviewed compensation, recorded actual payments and remaining balance. Finalizing a settlement is not proof of payment.':
    [
      'Tu compensación revisada, los pagos reales registrados y el saldo pendiente. Finalizar una liquidación no demuestra el pago.',
      'Sua remuneração revisada, os pagamentos reais registrados e o saldo restante. Finalizar uma liquidação não comprova o pagamento.',
    ],
  'Expense attention summary': ['Resumen de atención de gastos', 'Resumo de atenção das despesas'],
  'Expense count': ['Cantidad de gastos', 'Quantidade de despesas'],
  'Expense economics source table': [
    'Tabla fuente de economía de gastos',
    'Tabela de origem da economia de despesas',
  ],
  'Expense planning dates': [
    'Fechas de planificación del gasto',
    'Datas de planejamento da despesa',
  ],
  'Expense review': ['Revisión de gastos', 'Revisão de despesas'],
  'Expense treatment and planning': [
    'Tratamiento y planificación del gasto',
    'Tratamento e planejamento da despesa',
  ],
  'Expense treatment preset': [
    'Preajuste de tratamiento del gasto',
    'Predefinição de tratamento da despesa',
  ],
  'Expenses and reimbursements': ['Gastos y reembolsos', 'Despesas e reembolsos'],
  'Expenses detailed': ['Gastos detallados', 'Despesas detalhadas'],
  'Export CSV': ['Exportar CSV', 'Exportar CSV'],
  'Export XLSX': ['Exportar XLSX', 'Exportar XLSX'],
  'FINANCE / ADMIN': ['FINANZAS / ADMINISTRACIÓN', 'FINANÇAS / ADMINISTRAÇÃO'],
  'FINANCE WORKFLOW': ['FLUJO FINANCIERO', 'FLUXO FINANCEIRO'],
  'Field activity and operational summary': [
    'Actividad de campo y resumen operativo',
    'Atividade de campo e resumo operacional',
  ],
  'Filter approvals': ['Filtrar aprobaciones', 'Filtrar aprovações'],
  'Filter billing': ['Filtrar facturación', 'Filtrar faturamento'],
  'Filter collections ledger': ['Filtrar libro de cobros', 'Filtrar livro de recebimentos'],
  'Filter expenses': ['Filtrar gastos', 'Filtrar despesas'],
  'Filter finance by project': ['Filtrar finanzas por proyecto', 'Filtrar finanças por projeto'],
  'Filter projects': ['Filtrar proyectos', 'Filtrar projetos'],
  'Filter time entries': ['Filtrar registros de horas', 'Filtrar registros de horas'],
  'Finance / Owner action · creates reviewed period files': [
    'Acción de Finanzas/Propietario · crea archivos de período revisados',
    'Ação de Finanças/Proprietário · cria arquivos de período revisados',
  ],
  'Finance alerts': ['Alertas financieros', 'Alertas financeiros'],
  'Finance attention summary': ['Resumen de atención financiera', 'Resumo de atenção financeira'],
  'Finance classification': ['Clasificación financiera', 'Classificação financeira'],
  'Finance control': ['Control financiero', 'Controle financeiro'],
  'Finance data is available only to authorized Finance, Owner, or Auditor roles.': [
    'Los datos financieros solo están disponibles para los roles autorizados de Finanzas, Propietario o Auditor.',
    'Os dados financeiros estão disponíveis apenas para as funções autorizadas de Finanças, Proprietário ou Auditor.',
  ],
  'Finance expense classification and planning': [
    'Clasificación y planificación financiera de gastos',
    'Classificação e planejamento financeiro de despesas',
  ],
  'Finance operations': ['Operaciones financieras', 'Operações financeiras'],
  'Finance overview': ['Resumen financiero', 'Visão financeira'],
  'Finance projection is not available for this role.': [
    'La proyección financiera no está disponible para este rol.',
    'A projeção financeira não está disponível para esta função.',
  ],
  'Finance queue clear.': ['Cola financiera despejada.', 'Fila financeira limpa.'],
  'Finance review': ['Revisión financiera', 'Revisão financeira'],
  'Finance-classified expense source records': [
    'Registros fuente de gastos clasificados por Finanzas',
    'Registros de origem de despesas classificados por Finanças',
  ],
  'Finance-only finalization of approved compensation. Settlements are immutable snapshots and keep expected and actual dates distinct.':
    [
      'Finalización financiera exclusiva de la compensación aprobada. Las liquidaciones son instantáneas inmutables y mantienen separadas las fechas previstas y reales.',
      'Finalização exclusiva de Finanças da remuneração aprovada. As liquidações são instantâneos imutáveis e mantêm distintas as datas esperadas e reais.',
    ],
  'Finance/Admin classify operational expense truth. Expected reimbursement and recovery remain separate from actual states.':
    [
      'Finanzas/Administración clasifica la verdad operativa del gasto. El reembolso y la recuperación previstos siguen separados de los estados reales.',
      'Finanças/Administração classifica a verdade operacional da despesa. O reembolso e a recuperação esperados continuam separados dos estados reais.',
    ],
  'Fixed milestone': ['Hito fijo', 'Marco fixo'],
  'Future changes are recorded as successors; historical policy versions remain immutable.': [
    'Los cambios futuros se registran como sucesores; las versiones históricas de la política permanecen inmutables.',
    'Alterações futuras são registradas como sucessoras; versões históricas da política permanecem imutáveis.',
  ],
  'Generate a period pack when the source records are ready for review.': [
    'Genera un paquete de período cuando los registros fuente estén listos para revisión.',
    'Gere um pacote do período quando os registros de origem estiverem prontos para revisão.',
  ],
  'Generate customer and internal summaries from the canonical reviewed source records.': [
    'Genera resúmenes para el cliente e internos a partir de los registros fuente canónicos revisados.',
    'Gere resumos para o cliente e internos a partir dos registros de origem canônicos revisados.',
  ],
  'Generated period files': ['Archivos de período generados', 'Arquivos de período gerados'],
  'Generated period report register': [
    'Registro de informes de período generados',
    'Registro de relatórios de período gerados',
  ],
  'Historical or billed expense state; planning and classification are locked.': [
    'Estado histórico o facturado del gasto; la planificación y clasificación están bloqueadas.',
    'Estado histórico ou faturado da despesa; planejamento e classificação estão bloqueados.',
  ],
  'Hours consumed': ['Horas consumidas', 'Horas consumidas'],
  'Immutable period registers': [
    'Registros de período inmutables',
    'Registros de período imutáveis',
  ],
  'Immutable reversal history': [
    'Historial inmutable de reversiones',
    'Histórico imutável de estornos',
  ],
  'Immutable version binding': [
    'Vinculación inmutable de versión',
    'Vinculação imutável da versão',
  ],
  'Inactive rows remain available for audit and historical attribution.': [
    'Las filas inactivas siguen disponibles para auditoría y atribución histórica.',
    'As linhas inativas continuam disponíveis para auditoria e atribuição histórica.',
  ],
  'Independent artifact retry may be available': [
    'Puede estar disponible el reintento independiente del artefacto',
    'A retentativa independente do artefato pode estar disponível',
  ],
  'Internal and customer period records available to authorized reviewers.': [
    'Registros de período internos y del cliente disponibles para revisores autorizados.',
    'Registros de período internos e do cliente disponíveis para revisores autorizados.',
  ],
  'Invalid / superseded': ['Inválido / sustituido', 'Inválido / substituído'],
  'Invalidate sign-off': ['Invalidar conformidad', 'Invalidar conformidade'],
  'Invoice issue blocked': ['Emisión de factura bloqueada', 'Emissão da fatura bloqueada'],
  'Invoice issue is blocked until billing readiness is complete.': [
    'La emisión de la factura está bloqueada hasta completar la preparación de facturación.',
    'A emissão da fatura está bloqueada até concluir a prontidão do faturamento.',
  ],
  'Invoice register': ['Registro de facturas', 'Registro de faturas'],
  'Invoice timeline': ['Cronología de la factura', 'Linha do tempo da fatura'],
  'Invoice, client or project': ['Factura, cliente o proyecto', 'Fatura, cliente ou projeto'],
  'Invoice, project or period': ['Factura, proyecto o período', 'Fatura, projeto ou período'],
  Invoiced: ['Facturado', 'Faturado'],
  'Invoiced (actual)': ['Facturado (real)', 'Faturado (real)'],
  'Invoices and reconciled collection history.': [
    'Facturas e historial de cobros conciliado.',
    'Faturas e histórico de recebimentos conciliado.',
  ],
  'Issue date unavailable': ['Fecha de emisión no disponible', 'Data de emissão indisponível'],
  'Issue invoice': ['Emitir factura', 'Emitir fatura'],
  'Issued history is immutable': [
    'El historial emitido es inmutable',
    'O histórico emitido é imutável',
  ],
  'Issued invoices': ['Facturas emitidas', 'Faturas emitidas'],
  'Invoices are the bill: draft, approve, issue, collect. Billing streams only set cadence and template for a project.':
    [
      'Las facturas son la cuenta: borrador, aprobar, emitir, cobrar. Los flujos de facturación solo fijan cadencia y plantilla de un proyecto.',
      'As faturas são a conta: rascunho, aprovar, emitir, cobrar. Os fluxos de faturamento apenas definem cadência e modelo de um projeto.',
    ],
  'Issue to assign the invoice number, lock the snapshot and generate the client PDF.': [
    'Emite para asignar el número de factura, bloquear la instantánea y generar el PDF del cliente.',
    'Emita para atribuir o número da fatura, bloquear o instantâneo e gerar o PDF do cliente.',
  ],
  'JPG, PNG, HEIC or PDF up to 10 MB': [
    'JPG, PNG, HEIC o PDF de hasta 10 MB',
    'JPG, PNG, HEIC ou PDF de até 10 MB',
  ],
  'Keep technical files and PLC backups tied to this exact system and report version.': [
    'Mantén los archivos técnicos y las copias PLC vinculados a este sistema y versión exactos del informe.',
    'Mantenha os arquivos técnicos e os backups PLC vinculados a este sistema e versão exatos do relatório.',
  ],
  'Keep the evidence that supports this daily field report in its private record.': [
    'Conserva la evidencia que respalda este informe diario de campo en su registro privado.',
    'Mantenha a evidência que apoia este relatório diário de campo em seu registro privado.',
  ],
  'Keep this record operational: summary, completed work, blockers and next steps.': [
    'Mantén este registro operativo: resumen, trabajo completado, bloqueos y próximos pasos.',
    'Mantenha este registro operacional: resumo, trabalho concluído, bloqueios e próximos passos.',
  ],
  'Labor detailed': ['Mano de obra detallada', 'Mão de obra detalhada'],
  'Labor summary': ['Resumen de mano de obra', 'Resumo da mão de obra'],
  'Ledger exports': ['Exportaciones del libro', 'Exportações do livro'],
  'Log time': ['Registrar horas', 'Registrar horas'],
  'Manage stream': ['Gestionar flujo', 'Gerenciar fluxo'],
  Milestones: ['Hitos', 'Marcos'],
  More: ['Más', 'Mais'],
  'More actions': ['Más acciones', 'Mais ações'],
  'Next step': ['Siguiente paso', 'Próximo passo'],
  'Move approved sources through draft, issue, collection and correction lifecycles with a reconciled ledger.':
    [
      'Mueve las fuentes aprobadas por los ciclos de borrador, emisión, cobro y corrección con un libro conciliado.',
      'Mova as fontes aprovadas pelos ciclos de rascunho, emissão, recebimento e correção com um livro conciliado.',
    ],
  'Needs Finance classification': [
    'Necesita clasificación de Finanzas',
    'Precisa de classificação de Finanças',
  ],
  'Needs attention': ['Requiere atención', 'Requer atenção'],
  'Needs changes': ['Necesita cambios', 'Precisa de alterações'],
  'Needs report': ['Necesita informe', 'Precisa de relatório'],
  Net: ['Neto', 'Líquido'],
  'Net collected': ['Cobrado neto', 'Recebido líquido'],
  'New billing stream': ['Nuevo flujo de facturación', 'Novo fluxo de faturamento'],
  'New daily report': ['Nuevo informe diario', 'Novo relatório diário'],
  'New legal entity': ['Nueva entidad jurídica', 'Nova entidade legal'],
  'New tax profile': ['Nuevo perfil fiscal', 'Novo perfil fiscal'],
  'New technical report': ['Nuevo informe técnico', 'Novo relatório técnico'],
  No: ['No', 'Não'],
  'No active assignments for this project.': [
    'No hay asignaciones activas para este proyecto.',
    'Não há atribuições ativas para este projeto.',
  ],
  'No active assignments to edit.': [
    'No hay asignaciones activas para editar.',
    'Não há atribuições ativas para editar.',
  ],
  'No active assignments to remove.': [
    'No hay asignaciones activas para eliminar.',
    'Não há atribuições ativas para remover.',
  ],
  'No activity recorded in this period.': [
    'No se registró actividad en este período.',
    'Nenhuma atividade foi registrada neste período.',
  ],
  'No assignments recorded.': [
    'No hay asignaciones registradas.',
    'Nenhuma atribuição registrada.',
  ],
  'No authorized projects': ['No hay proyectos autorizados', 'Nenhum projeto autorizado'],
  'No billing stream is configured for this project.': [
    'No hay un flujo de facturación configurado para este proyecto.',
    'Nenhum fluxo de faturamento está configurado para este projeto.',
  ],
  'No billing stream is configured for this project. Configure one in Billing first.': [
    'No hay un flujo de facturación configurado para este proyecto. Configura uno primero en Facturación.',
    'Nenhum fluxo de faturamento está configurado para este projeto. Configure um primeiro em Faturamento.',
  ],
  'No billing streams configured.': [
    'No hay flujos de facturación configurados.',
    'Nenhum fluxo de faturamento configurado.',
  ],
  'No client number': ['Sin número de cliente', 'Sem número do cliente'],
  'No client sign-off records yet.': [
    'Aún no hay registros de conformidad del cliente.',
    'Ainda não há registros de conformidade do cliente.',
  ],
  'No clients recorded.': ['No hay clientes registrados.', 'Nenhum cliente registrado.'],
  'No daily reports recorded.': [
    'No hay informes diarios registrados.',
    'Nenhum relatório diário registrado.',
  ],
  'No expense source records are available for Finance classification or planning.': [
    'No hay registros fuente de gastos disponibles para clasificación o planificación financiera.',
    'Não há registros de origem de despesas disponíveis para classificação ou planejamento financeiro.',
  ],
  'No expenses recorded for this project.': [
    'No hay gastos registrados para este proyecto.',
    'Nenhuma despesa registrada para este projeto.',
  ],
  'No generated period files yet.': [
    'Aún no hay archivos de período generados.',
    'Ainda não há arquivos de período gerados.',
  ],
  'No invoices match this view.': [
    'Ninguna factura coincide con esta vista.',
    'Nenhuma fatura corresponde a esta visão.',
  ],
  'No ledger row': ['Sin fila del libro', 'Sem linha do livro'],
  'No ledger rows found': [
    'No se encontraron filas del libro',
    'Nenhuma linha do livro encontrada',
  ],
  'No lifecycle action available': [
    'No hay ninguna acción de ciclo de vida disponible',
    'Nenhuma ação de ciclo de vida disponível',
  ],
  'No payment or reversal events recorded.': [
    'No hay eventos de pago o reversión registrados.',
    'Nenhum evento de pagamento ou estorno registrado.',
  ],
  'No payments recorded.': ['No hay pagos registrados.', 'Nenhum pagamento registrado.'],
  'No planning assignments recorded.': [
    'No hay asignaciones de planificación registradas.',
    'Nenhuma atribuição de planejamento registrada.',
  ],
  'No private attachments have been added yet.': [
    'Aún no se han añadido adjuntos privados.',
    'Nenhum anexo privado foi adicionado ainda.',
  ],
  'No project commercial policy is configured for the selected project.': [
    'No hay una política comercial de proyecto configurada para el proyecto seleccionado.',
    'Nenhuma política comercial de projeto está configurada para o projeto selecionado.',
  ],
  'No project number': ['Sin número de proyecto', 'Sem número do projeto'],
  'No project selected': ['No hay proyecto seleccionado', 'Nenhum projeto selecionado'],
  'No projects available.': ['No hay proyectos disponibles.', 'Nenhum projeto disponível.'],
  'No projects found': ['No se encontraron proyectos', 'Nenhum projeto encontrado'],
  'No published schedule is configured.': [
    'No hay un horario publicado configurado.',
    'Nenhum cronograma publicado está configurado.',
  ],
  'No reason recorded': ['No hay motivo registrado', 'Nenhum motivo registrado'],
  'No records match this operational view.': [
    'Ningún registro coincide con esta vista operativa.',
    'Nenhum registro corresponde a esta visão operacional.',
  ],
  'No reference': ['Sin referencia', 'Sem referência'],
  'No reimbursable expenses in this period.': [
    'No hay gastos reembolsables en este período.',
    'Nenhuma despesa reembolsável neste período.',
  ],
  'No reports recorded for this project.': [
    'No hay informes registrados para este proyecto.',
    'Nenhum relatório registrado para este projeto.',
  ],
  'No tax profile': ['Sin perfil fiscal', 'Sem perfil fiscal'],
  'No technical reports recorded.': [
    'No hay informes técnicos registrados.',
    'Nenhum relatório técnico registrado.',
  ],
  'Not assigned': ['Sin asignar', 'Não atribuído'],
  'Not available': ['No disponible', 'Indisponível'],
  'Not classified': ['Sin clasificar', 'Não classificado'],
  'Not client billable': ['No facturable al cliente', 'Não faturável ao cliente'],
  'Not paid yet': ['Aún no pagado', 'Ainda não pago'],
  'Not recorded': ['No registrado', 'Não registrado'],
  'Not reimbursed yet': ['Aún no reembolsado', 'Ainda não reembolsado'],
  'Not required': ['No requerido', 'Não exigido'],
  'Not scheduled': ['No programado', 'Não agendado'],
  Notes: ['Notas', 'Notas'],
  'OPERATIONAL ASSIGNMENTS': ['ASIGNACIONES OPERATIVAS', 'ATRIBUIÇÕES OPERACIONAIS'],
  OPERATIONS: ['OPERACIONES', 'OPERAÇÕES'],
  'Only append-only payment events count as collected': [
    'Solo cuentan como cobrados los eventos de pago de solo anexado',
    'Somente eventos de pagamento de acréscimo contam como recebidos',
  ],
  'Only approved hours and activities are included.': [
    'Solo se incluyen horas y actividades aprobadas.',
    'Somente horas e atividades aprovadas são incluídas.',
  ],
  'Open Billing': ['Abrir facturación', 'Abrir faturamento'],
  'Open Reports': ['Abrir informes', 'Abrir relatórios'],
  'Open assignment': ['Abrir asignación', 'Abrir atribuição'],
  'Open period record →': ['Abrir registro de período →', 'Abrir registro do período →'],
  'Open period refresh': ['Abrir actualización de período', 'Abrir atualização do período'],
  'Open project source': ['Abrir fuente del proyecto', 'Abrir fonte do projeto'],
  'Open project →': ['Abrir proyecto →', 'Abrir projeto →'],
  'Open report →': ['Abrir informe →', 'Abrir relatório →'],
  'Open sign-off': ['Abrir conformidad', 'Abrir conformidade'],
  'Open a credit or debit draft. The issued bill stays unchanged.': [
    'Abre un borrador de crédito o débito. La factura emitida permanece igual.',
    'Abra um rascunho de crédito ou débito. A fatura emitida permanece igual.',
  ],
  'Open sign-off record →': ['Abrir registro de conformidad →', 'Abrir registro de conformidade →'],
  'Open source': ['Abrir fuente', 'Abrir fonte'],
  'Open stage filter': ['Abrir filtro de etapa', 'Abrir filtro de etapa'],
  'Open the project source for the underlying operational and commercial records. Portfolio values remain grouped by currency.':
    [
      'Abre la fuente del proyecto para consultar los registros operativos y comerciales subyacentes. Los valores de cartera siguen agrupados por moneda.',
      'Abra a fonte do projeto para consultar os registros operacionais e comerciais subjacentes. Os valores da carteira continuam agrupados por moeda.',
    ],
  'Operational category': ['Categoría operativa', 'Categoria operacional'],
  'Operational control': ['Control operativo', 'Controle operacional'],
  'Operational detail': ['Detalle operativo', 'Detalhe operacional'],
  'Operational entry only. Commercial rules are applied separately.': [
    'Solo entrada operativa. Las reglas comerciales se aplican por separado.',
    'Somente entrada operacional. As regras comerciais são aplicadas separadamente.',
  ],
  'Operational entry only. Commercial treatment is handled separately.': [
    'Solo entrada operativa. El tratamiento comercial se gestiona por separado.',
    'Somente entrada operacional. O tratamento comercial é gerenciado separadamente.',
  ],
  'Operational expense truth and Finance classification remain separate workflows.': [
    'La verdad operativa del gasto y la clasificación de Finanzas siguen siendo flujos separados.',
    'A verdade operacional da despesa e a classificação de Finanças continuam sendo fluxos separados.',
  ],
  'Operational expenses': ['Gastos operativos', 'Despesas operacionais'],
  'Operational projects': ['Proyectos operativos', 'Projetos operacionais'],
  'Operational record': ['Registro operativo', 'Registro operacional'],
  'Operational report entry. Record what happened in the field.': [
    'Entrada de informe operativo. Registra lo ocurrido en el campo.',
    'Entrada de relatório operacional. Registre o que aconteceu em campo.',
  ],
  'Operational review': ['Revisión operativa', 'Revisão operacional'],
  'Operations / reports': ['Operaciones / informes', 'Operações / relatórios'],
  'Outstanding (actual)': ['Pendiente de cobro (real)', 'Pendente (real)'],
  'Outstanding collection attention': [
    'Atención sobre cobros pendientes',
    'Atenção aos recebimentos pendentes',
  ],
  Overdue: ['Vencido', 'Vencido'],
  'Overtime derivation': ['Derivación de horas extra', 'Derivação de horas extras'],
  'Overtime threshold (minutes)': [
    'Umbral de horas extra (minutos)',
    'Limite de horas extras (minutos)',
  ],
  Overview: ['Resumen', 'Visão geral'],
  'Own activity detail': ['Detalle de actividad propia', 'Detalhe da própria atividade'],
  'Own amount': ['Importe propio', 'Valor próprio'],
  'Owner override': ['Excepción del propietario', 'Substituição do proprietário'],
  'Owner review required': ['Requiere revisión del propietario', 'Requer revisão do proprietário'],
  'PLANNING CONTEXT': ['CONTEXTO DE PLANIFICACIÓN', 'CONTEXTO DE PLANEJAMENTO'],
  'PLC and controls records will appear here after you save them.': [
    'Los registros PLC y de controles aparecerán aquí después de guardarlos.',
    'Os registros PLC e de controles aparecerão aqui depois que você os salvar.',
  ],
  'PLC backup · after': ['Copia PLC · después', 'Backup PLC · depois'],
  'PLC backup · before': ['Copia PLC · antes', 'Backup PLC · antes'],
  'PRIVATE REPORT EVIDENCE': ['EVIDENCIA PRIVADA DEL INFORME', 'EVIDÊNCIA PRIVADA DO RELATÓRIO'],
  'PROJECT CONTEXT': ['CONTEXTO DEL PROYECTO', 'CONTEXTO DO PROJETO'],
  Packs: ['Paquetes', 'Pacotes'],
  'Partially paid': ['Parcialmente pagado', 'Parcialmente pago'],
  Paused: ['En pausa', 'Pausado'],
  'Paused or closing': ['En pausa o en cierre', 'Pausado ou em encerramento'],
  Payment: ['Pago', 'Pagamento'],
  'Payment reference / note': [
    'Referencia / nota del pago',
    'Referência / observação do pagamento',
  ],
  'Payment state': ['Estado del pago', 'Estado do pagamento'],
  'Payment timeline requires review': [
    'La cronología del pago requiere revisión',
    'A linha do tempo do pagamento requer revisão',
  ],
  'Pending or scheduled': ['Pendiente o programado', 'Pendente ou agendado'],
  'Period confirmations in scope': [
    'Confirmaciones de período incluidas',
    'Confirmações de período incluídas',
  ],
  'Plan invoice dates': ['Planificar fechas de factura', 'Planejar datas da fatura'],
  'Planned / Expected': ['Planificado / previsto', 'Planejado / esperado'],
  'Planned vs actual': ['Planificado frente a real', 'Planejado versus realizado'],
  'Planned and expected dates': ['Fechas planificadas y previstas', 'Datas planejadas e esperadas'],
  'Planned and expected finance metrics': [
    'Métricas financieras planificadas y previstas',
    'Métricas financeiras planejadas e esperadas',
  ],
  'Planned issue': ['Emisión planificada', 'Emissão planejada'],
  'Planned reference minutes': [
    'Minutos de referencia planificados',
    'Minutos de referência planejados',
  ],
  'Planned remaining': ['Pendiente planificado', 'Restante planejado'],
  'Planning and expected values are directional controls. They never count as actual time, paid cash, or collected revenue.':
    [
      'Los valores planificados y previstos son controles orientativos. Nunca cuentan como horas reales, efectivo pagado o ingresos cobrados.',
      'Os valores planejados e esperados são controles direcionais. Nunca contam como horas trabalhadas, dinheiro pago ou receita recebida.',
    ],
  'Planning context only; actual time remains independently recorded.': [
    'Solo contexto de planificación; las horas reales se registran de forma independiente.',
    'Somente contexto de planejamento; as horas trabalhadas continuam registradas de forma independente.',
  ],
  'Planning input only; it never creates actual time': [
    'Solo entrada de planificación; nunca crea horas reales',
    'Somente entrada de planejamento; nunca cria horas trabalhadas',
  ],
  'Planning only; actual states remain authoritative': [
    'Solo planificación; los estados reales siguen siendo la autoridad',
    'Somente planejamento; os estados reais continuam sendo a autoridade',
  ],
  'Portfolio finance source drill-down': [
    'Desglose de fuentes financieras de cartera',
    'Detalhamento das fontes financeiras da carteira',
  ],
  'Portfolio finance source table': [
    'Tabla de fuentes financieras de cartera',
    'Tabela de fontes financeiras da carteira',
  ],
  'Portfolio source drill-down': [
    'Desglose de fuentes de cartera',
    'Detalhamento das fontes da carteira',
  ],
  Predecessor: ['Predecesor', 'Antecessor'],
  'Preparing to start': ['Preparándose para comenzar', 'Preparando para iniciar'],
  'Preview customer-safe PDF': [
    'Vista previa del PDF seguro para el cliente',
    'Visualizar PDF seguro para o cliente',
  ],
  'Project / period': ['Proyecto / período', 'Projeto / período'],
  'Project approvals': ['Aprobaciones del proyecto', 'Aprovações do projeto'],
  'Project attention summary': ['Resumen de atención del proyecto', 'Resumo de atenção do projeto'],
  'Project commercial and time policy': [
    'Política comercial y de tiempo del proyecto',
    'Política comercial e de tempo do projeto',
  ],
  'Project commercial policy history': [
    'Historial de la política comercial del proyecto',
    'Histórico da política comercial do projeto',
  ],
  'Project detail sections': ['Secciones de detalle del proyecto', 'Seções de detalhes do projeto'],
  'Project economics': ['Economía del proyecto', 'Economia do projeto'],
  'Project navigation': ['Navegación del proyecto', 'Navegação do projeto'],
  'Project number, client, currency, lifecycle status and actual close date remain read-only to protect historical references.':
    [
      'El número de proyecto, cliente, moneda, estado del ciclo de vida y fecha real de cierre permanecen en solo lectura para proteger las referencias históricas.',
      'O número do projeto, cliente, moeda, estado do ciclo de vida e data real de encerramento permanecem somente leitura para proteger referências históricas.',
    ],
  'Project report register': [
    'Registro de informes del proyecto',
    'Registro de relatórios do projeto',
  ],
  'Project status summary': ['Resumen del estado del proyecto', 'Resumo do status do projeto'],
  'Project workspace': ['Espacio de trabajo del proyecto', 'Espaço de trabalho do projeto'],
  'Project, client or reference': [
    'Proyecto, cliente o referencia',
    'Projeto, cliente ou referência',
  ],
  'Protected project identity': [
    'Identidad protegida del proyecto',
    'Identidade protegida do projeto',
  ],
  'REPORTS & FILES': ['INFORMES Y ARCHIVOS', 'RELATÓRIOS E ARQUIVOS'],
  'Read only': ['Solo lectura', 'Somente leitura'],
  'Ready for signature': ['Listo para firma', 'Pronto para assinatura'],
  'Reason code': ['Código de motivo', 'Código do motivo'],
  'Reason for evidence attachment': [
    'Motivo del adjunto de evidencia',
    'Motivo do anexo de evidência',
  ],
  'Reason for invalidation': ['Motivo de la invalidación', 'Motivo da invalidação'],
  'Receipt preview': ['Vista previa del recibo', 'Pré-visualização do recibo'],
  'Recent time entries': ['Registros de horas recientes', 'Registros de horas recentes'],
  'Reconcile issued invoices, direct costs, collections, outstanding balances and contribution from canonical source rows.':
    [
      'Concilia facturas emitidas, costes directos, cobros, saldos pendientes y contribución desde las filas fuente canónicas.',
      'Concilie faturas emitidas, custos diretos, recebimentos, saldos pendentes e contribuição a partir das linhas de origem canônicas.',
    ],
  'Record Finance review': ['Registrar revisión de Finanzas', 'Registrar revisão de Finanças'],
  'Record actual operational time. Commercial interpretation is applied from configured project rules.':
    [
      'Registra el tiempo operativo real. La interpretación comercial se aplica desde las reglas configuradas del proyecto.',
      'Registre o tempo operacional real. A interpretação comercial é aplicada a partir das regras configuradas do projeto.',
    ],
  'Record customer sign-off': [
    'Registrar conformidad del cliente',
    'Registrar conformidade do cliente',
  ],
  'Capture verified signed-copy evidence': [
    'Registrar evidencia de copia firmada verificada',
    'Registrar evidência de cópia assinada verificada',
  ],
  'Attach verified signed-copy evidence': [
    'Adjuntar evidencia de copia firmada verificada',
    'Anexar evidência de cópia assinada verificada',
  ],
  'Customer signed-copy evidence': [
    'Evidencia de copia firmada del cliente',
    'Evidência de cópia assinada do cliente',
  ],
  'Customer signature date': ['Fecha de firma del cliente', 'Data da assinatura do cliente'],
  'Evidence verified at': ['Evidencia verificada el', 'Evidência verificada em'],
  'Retry after security scan': [
    'Reintentar tras el análisis de seguridad',
    'Tentar novamente após a verificação de segurança',
  ],
  'The uploaded signed PDF is awaiting its security scan. Retry after the scan completes; do not upload it again.':
    [
      'El PDF firmado subido está pendiente del análisis de seguridad. Reinténtalo cuando termine; no vuelvas a subirlo.',
      'O PDF assinado enviado aguarda a verificação de segurança. Tente novamente quando terminar; não envie o arquivo outra vez.',
    ],
  'Exact report binding': ['Vinculación exacta del informe', 'Vínculo exato do relatório'],
  'Open verified signed-copy evidence': [
    'Abrir evidencia de copia firmada verificada',
    'Abrir evidência de cópia assinada verificada',
  ],
  'Record verified signed-copy evidence': [
    'Registrar evidencia de copia firmada verificada',
    'Registrar evidência de cópia assinada verificada',
  ],
  'Report hash': ['Hash del informe', 'Hash do relatório'],
  'Required. Upload the complete signed PDF copy (maximum 20 MB).': [
    'Obligatorio. Carga la copia PDF firmada completa (máximo 20 MB).',
    'Obrigatório. Envie a cópia em PDF assinada completa (máximo de 20 MB).',
  ],
  'Signed PDF copy': ['Copia PDF firmada', 'Cópia em PDF assinada'],
  'Signed-copy evidence unavailable': [
    'Evidencia de copia firmada no disponible',
    'Evidência de cópia assinada indisponível',
  ],
  'This historical conformity has no currently verified signed-copy evidence. It remains in the audit record but cannot support a future invoice issue.':
    [
      'Esta conformidad histórica no tiene evidencia de copia firmada actualmente verificada. Se conserva en el registro de auditoría, pero no puede respaldar una futura emisión de factura.',
      'Esta conformidade histórica não possui evidência de cópia assinada atualmente verificada. Ela permanece no registro de auditoria, mas não pode respaldar uma futura emissão de fatura.',
    ],
  'This preserves the historical conformity and attaches a newly verified private signed PDF to the exact immutable report version.':
    [
      'Esto conserva la conformidad histórica y adjunta un nuevo PDF privado firmado y verificado a la versión exacta e inmutable del informe.',
      'Isso preserva a conformidade histórica e anexa um novo PDF privado assinado e verificado à versão exata e imutável do relatório.',
    ],
  'The original signer details and signed date remain unchanged in the historical record.': [
    'Los datos originales del firmante y la fecha de firma no cambian en el registro histórico.',
    'Os dados originais do signatário e a data de assinatura permanecem inalterados no registro histórico.',
  ],
  'Upload the signed customer PDF for this exact report version and enter the signer details. The server records the verification time.':
    [
      'Carga el PDF firmado por el cliente para esta versión exacta del informe e introduce los datos del firmante. El servidor registra la hora de verificación.',
      'Envie o PDF assinado pelo cliente para esta versão exata do relatório e informe os dados do signatário. O servidor registra a hora da verificação.',
    ],
  'Verified evidence': ['Evidencia verificada', 'Evidência verificada'],
  'Verified signed-copy evidence is bound to this immutable report version.': [
    'La evidencia de copia firmada verificada está vinculada a esta versión inmutable del informe.',
    'A evidência de cópia assinada verificada está vinculada a esta versão imutável do relatório.',
  ],
  'Record the receipt and operational facts. Finance handles later classification.': [
    'Registra el recibo y los hechos operativos. Finanzas gestiona la clasificación posterior.',
    'Registre o recibo e os fatos operacionais. Finanças trata da classificação posterior.',
  ],
  'Recorded operational time': ['Tiempo operativo registrado', 'Tempo operacional registrado'],
  'Reference hours / day': ['Horas de referencia / día', 'Horas de referência / dia'],
  'Refresh customer and internal period summaries from reviewed source records. This does not issue or send an invoice.':
    [
      'Actualiza los resúmenes de período del cliente e internos desde los registros fuente revisados. Esto no emite ni envía una factura.',
      'Atualize os resumos de período do cliente e internos a partir dos registros de origem revisados. Isso não emite nem envia uma fatura.',
    ],
  'Refresh period reports': ['Actualizar informes de período', 'Atualizar relatórios de período'],
  'Refresh reports': ['Actualizar informes', 'Atualizar relatórios'],
  'Refresh reviewed period records': [
    'Actualizar registros de período revisados',
    'Atualizar registros de período revisados',
  ],
  Reimbursement: ['Reembolso', 'Reembolso'],
  Reimbursed: ['Reembolsado', 'Reembolsado'],
  'Reimbursement review': ['Revisión de reembolsos', 'Revisão de reembolsos'],
  'Reimbursement status': ['Estado del reembolso', 'Status do reembolso'],
  'Removal ends the assignment and preserves its historical row. It never hard-deletes project history.':
    [
      'La eliminación termina la asignación y conserva su fila histórica. Nunca borra físicamente el historial del proyecto.',
      'A remoção encerra a atribuição e preserva sua linha histórica. Nunca exclui permanentemente o histórico do projeto.',
    ],
  'Removal reason': ['Motivo de eliminación', 'Motivo da remoção'],
  Report: ['Informe', 'Relatório'],
  'Report attachments': ['Adjuntos del informe', 'Anexos do relatório'],
  'Report attention summary': [
    'Resumen de atención de informes',
    'Resumo de atenção dos relatórios',
  ],
  'Report count': ['Cantidad de informes', 'Quantidade de relatórios'],
  'Report review': ['Revisión de informes', 'Revisão de relatórios'],
  'Report types': ['Tipos de informe', 'Tipos de relatório'],
  'Report version': ['Versión del informe', 'Versão do relatório'],
  'Reported operational amounts and approval state. No commercial treatment is inferred.': [
    'Importes operativos informados y estado de aprobación. No se infiere ningún tratamiento comercial.',
    'Valores operacionais informados e status de aprovação. Nenhum tratamento comercial é inferido.',
  ],
  'Reports & Files': ['Informes y archivos', 'Relatórios e arquivos'],
  Required: ['Obligatorio', 'Obrigatório'],
  'Required. Use the name provided by the customer signer.': [
    'Obligatorio. Usa el nombre proporcionado por el firmante del cliente.',
    'Obrigatório. Use o nome fornecido pelo signatário do cliente.',
  ],
  'Restore client': ['Restaurar cliente', 'Restaurar cliente'],
  'Restore project': ['Restaurar proyecto', 'Restaurar projeto'],
  'Restricted surface': ['Superficie restringida', 'Área restrita'],
  Reversal: ['Reversión', 'Estorno'],
  'Reversal amount': ['Importe de reversión', 'Valor do estorno'],
  Reversals: ['Reversiones', 'Estornos'],
  'Reverse payment': ['Revertir pago', 'Estornar pagamento'],
  Reversed: ['Revertido', 'Estornado'],
  'Review actions': ['Revisar acciones', 'Revisar ações'],
  'Review canonical project economics, source records, planning signals, settlements, and reimbursements in one authorized workspace.':
    [
      'Revisa la economía canónica del proyecto, los registros fuente, las señales de planificación, las liquidaciones y los reembolsos en un espacio autorizado.',
      'Revise a economia canônica do projeto, os registros de origem, os sinais de planejamento, as liquidações e os reembolsos em um espaço autorizado.',
    ],
  'Review project identity, status, schedule and operational scope.': [
    'Revisa la identidad, el estado, el horario y el alcance operativo del proyecto.',
    'Revise a identidade, o status, o cronograma e o escopo operacional do projeto.',
  ],
  'Review source minutes, billing state, canonical rates, and direct cost without recalculating them here.':
    [
      'Revisa los minutos fuente, el estado de facturación, las tarifas canónicas y el coste directo sin recalcularlos aquí.',
      'Revise os minutos de origem, o estado do faturamento, as taxas canônicas e o custo direto sem recalculá-los aqui.',
    ],
  'Review stage': ['Etapa de revisión', 'Etapa de revisão'],
  'Review submitted operational truth before it moves to the next stage.': [
    'Revisa la verdad operativa enviada antes de que pase a la siguiente etapa.',
    'Revise a verdade operacional enviada antes que ela avance para a próxima etapa.',
  ],
  'Rows approved by the workflow': ['Filas aprobadas por el flujo', 'Linhas aprovadas pelo fluxo'],
  'Save Finance classification': [
    'Guardar clasificación financiera',
    'Salvar classificação financeira',
  ],
  'Save expected date': ['Guardar fecha prevista', 'Salvar data esperada'],
  'Save planning dates': ['Guardar fechas de planificación', 'Salvar datas de planejamento'],
  'Save project': ['Guardar proyecto', 'Salvar projeto'],
  'Save project policy': ['Guardar política del proyecto', 'Salvar política do projeto'],
  'Saving…': ['Guardando…', 'Salvando…'],
  Schedule: ['Horario', 'Cronograma'],
  'Search expenses': ['Buscar gastos', 'Buscar despesas'],
  'Search invoices': ['Buscar facturas', 'Buscar faturas'],
  'Search ledger': ['Buscar en el libro', 'Buscar no livro'],
  'Search projects': ['Buscar proyectos', 'Buscar projetos'],
  'Search queue': ['Buscar en la cola', 'Buscar na fila'],
  'Select a period to export': [
    'Selecciona un período para exportar',
    'Selecione um período para exportar',
  ],
  'Select a project': ['Seleccionar un proyecto', 'Selecionar um projeto'],
  'Separate finance queue': ['Cola financiera separada', 'Fila financeira separada'],
  'Set an expected payment date while preserving the actual settled timestamp.': [
    'Establece una fecha de pago prevista conservando la marca de tiempo real de liquidación.',
    'Defina uma data de pagamento esperada preservando o registro de data e hora real da liquidação.',
  ],
  'Settlement review': ['Revisión de liquidaciones', 'Revisão de liquidações'],
  'Shift summary, completed work, blockers and next-day plan.': [
    'Resumen del turno, trabajo completado, bloqueos y plan del día siguiente.',
    'Resumo do turno, trabalho concluído, bloqueios e plano do dia seguinte.',
  ],
  Signed: ['Firmado', 'Assinado'],
  'Signed at': ['Firmado el', 'Assinado em'],
  'Signed record is immutable. Any correction requires a new report version.': [
    'El registro firmado es inmutable. Cualquier corrección requiere una nueva versión del informe.',
    'O registro assinado é imutável. Qualquer correção exige uma nova versão do relatório.',
  ],
  Signer: ['Firmante', 'Signatário'],
  'Signer identity': ['Identidad del firmante', 'Identidade do signatário'],
  'Signer name': ['Nombre del firmante', 'Nome do signatário'],
  'Source unavailable': ['Fuente no disponible', 'Fonte indisponível'],
  Stage: ['Etapa', 'Etapa'],
  'Streams define source cadence and controlled invoice configuration.': [
    'Los flujos definen la cadencia de origen y la configuración controlada de facturas.',
    'Os fluxos definem a cadência da origem e a configuração controlada de faturas.',
  ],
  'Submitted or approved values stay protected by the record lifecycle.': [
    'Los valores enviados o aprobados quedan protegidos por el ciclo de vida del registro.',
    'Os valores enviados ou aprovados permanecem protegidos pelo ciclo de vida do registro.',
  ],
  'Submitted or correction-ready records': [
    'Registros enviados o listos para corrección',
    'Registros enviados ou prontos para correção',
  ],
  'Supersedes (optional)': ['Sustituye a (opcional)', 'Substitui (opcional)'],
  System: ['Sistema', 'Sistema'],
  'Tax (basis points; 0% allowed)': [
    'Impuesto (puntos básicos; se permite 0%)',
    'Imposto (pontos-base; 0% permitido)',
  ],
  Team: ['Equipo', 'Equipe'],
  'Technical / PLC': ['Técnico / PLC', 'Técnico / PLC'],
  'Technical attachment': ['Adjunto técnico', 'Anexo técnico'],
  'Technical report': ['Informe técnico', 'Relatório técnico'],
  'Technical report register': ['Registro de informes técnicos', 'Registro de relatórios técnicos'],
  'The approved report version is ready for customer conformity.': [
    'La versión aprobada del informe está lista para la conformidad del cliente.',
    'A versão aprovada do relatório está pronta para a conformidade do cliente.',
  ],
  'The pack contains invoice register, collections, worker/direct costs, expenses, accounts receivable, contribution, source counts and deterministic artifacts.':
    [
      'El paquete contiene el registro de facturas, cobros, costes de trabajadores/directos, gastos, cuentas por cobrar, contribución, recuentos de fuentes y artefactos deterministas.',
      'O pacote contém o registro de faturas, recebimentos, custos de colaboradores/diretos, despesas, contas a receber, contribuição, contagens de fontes e artefatos determinísticos.',
    ],
  'The previous complete month is filled in. Change the dates only if you need another range.': [
    'El mes completo anterior ya está rellenado. Cambia las fechas únicamente si necesitas otro intervalo.',
    'O mês completo anterior já está preenchido. Altere as datas somente se precisar de outro intervalo.',
  ],
  'Queued artifacts are processed automatically in the background.': [
    'Los artefactos en cola se procesan automáticamente en segundo plano.',
    'Os artefatos na fila são processados automaticamente em segundo plano.',
  ],
  'Record money received from the client. That is the only path that counts as collected.': [
    'Registra el dinero cobrado al cliente. Es la única vía que cuenta como cobrado.',
    'Registre o dinheiro recebido do cliente. É o único caminho que conta como recebido.',
  ],
  'The policy applies to the selected project and supersedes its prior effective policy.': [
    'La política se aplica al proyecto seleccionado y sustituye su política anterior vigente.',
    'A política se aplica ao projeto selecionado e substitui sua política anterior vigente.',
  ],
  'The previous conformity was retained for audit and is no longer the active sign-off for this report version.':
    [
      'La conformidad anterior se conserva para auditoría y ya no es la firma activa de esta versión del informe.',
      'A conformidade anterior foi mantida para auditoria e não é mais a assinatura ativa desta versão do relatório.',
    ],
  'The project and date remain bound to the original entry.': [
    'El proyecto y la fecha siguen vinculados al registro original.',
    'O projeto e a data continuam vinculados ao registro original.',
  ],
  'This confirmation covers approved hours and field activity for this report version. It contains no financial information.':
    [
      'Esta confirmación cubre las horas aprobadas y la actividad de campo de esta versión del informe. No contiene información financiera.',
      'Esta confirmação cobre as horas aprovadas e a atividade de campo desta versão do relatório. Não contém informações financeiras.',
    ],
  'This is a new evidence version': [
    'Esta es una nueva versión de evidencia',
    'Esta é uma nova versão de evidência',
  ],
  'This project policy controls client treatment; workers only record operational Travel truth.': [
    'Esta política del proyecto controla el tratamiento del cliente; los trabajadores solo registran la verdad operativa de Viaje.',
    'Esta política do projeto controla o tratamento do cliente; colaboradores apenas registram a verdade operacional de Viagem.',
  ],
  'This report is approved or finalized. Attachments are immutable; create an audited correction draft before adding replacement evidence.':
    [
      'Este informe está aprobado o finalizado. Los adjuntos son inmutables; crea un borrador de corrección auditado antes de añadir evidencia sustitutiva.',
      'Este relatório está aprovado ou finalizado. Os anexos são imutáveis; crie um rascunho de correção auditado antes de adicionar evidência substituta.',
    ],
  'This separate queue is visible only with an authorized Finance capability.': [
    'Esta cola separada solo es visible con una capacidad financiera autorizada.',
    'Esta fila separada é visível apenas com uma capacidade de Finanças autorizada.',
  ],
  'Time attention summary': ['Resumen de atención del tiempo', 'Resumo de atenção do tempo'],
  'Time economics source table': [
    'Tabla fuente de economía del tiempo',
    'Tabela de origem da economia do tempo',
  ],
  Timeline: ['Cronología', 'Linha do tempo'],
  Today: ['Hoy', 'Hoje'],
  'Travel budget used': ['Presupuesto de viaje utilizado', 'Orçamento de viagem utilizado'],
  'Travel client billability': [
    'Facturabilidad de Viaje al cliente',
    'Faturabilidade de Viagem ao cliente',
  ],
  'Travel client billable': ['Viaje facturable al cliente', 'Viagem faturável ao cliente'],
  'Try another filter or add an authorized project.': [
    'Prueba otro filtro o añade un proyecto autorizado.',
    'Tente outro filtro ou adicione um projeto autorizado.',
  ],
  'Try another filter or period.': [
    'Prueba otro filtro o período.',
    'Tente outro filtro ou período.',
  ],
  'Unapproved WIP': ['Trabajo en curso no aprobado', 'Trabalho em andamento não aprovado'],
  'Unavailable — missing source IDs': [
    'No disponible — faltan identificadores fuente',
    'Indisponível — faltam IDs de origem',
  ],
  Unknown: ['Desconocido', 'Desconhecido'],
  'Unnamed client': ['Cliente sin nombre', 'Cliente sem nome'],
  'Unnamed project': ['Proyecto sin nombre', 'Projeto sem nome'],
  Unpaid: ['No pagado', 'Não pago'],
  'Update actual work': ['Actualizar trabajo real', 'Atualizar trabalho real'],
  'Update operational details': [
    'Actualizar detalles operativos',
    'Atualizar detalhes operacionais',
  ],
  'Update project configuration with optimistic concurrency. Lifecycle status and close date remain protected.':
    [
      'Actualiza la configuración del proyecto con concurrencia optimista. El estado del ciclo de vida y la fecha de cierre siguen protegidos.',
      'Atualize a configuração do projeto com concorrência otimista. O status do ciclo de vida e a data de encerramento continuam protegidos.',
    ],
  'Upload private evidence': ['Cargar evidencia privada', 'Enviar evidência privada'],
  Uploaded: ['Cargado', 'Enviado'],
  Uploader: ['Cargador', 'Remetente'],
  'Uploading attachment…': ['Cargando adjunto…', 'Enviando anexo…'],
  'Use the effective project schedule and enter the threshold in actual minutes.': [
    'Usa el horario vigente del proyecto e introduce el umbral en minutos reales.',
    'Use o cronograma vigente do projeto e informe o limite em minutos reais.',
  ],
  'Use the receipt and operational details you know on site.': [
    'Usa el recibo y los detalles operativos que conoces en el sitio.',
    'Use o recibo e os detalhes operacionais que você conhece no local.',
  ],
  'Use this only when the customer confirmation no longer matches the report. The signed record remains available in the audit history.':
    [
      'Úsalo solo cuando la confirmación del cliente ya no coincida con el informe. El registro firmado permanece disponible en el historial de auditoría.',
      'Use somente quando a confirmação do cliente não corresponder mais ao relatório. O registro assinado permanece disponível no histórico de auditoria.',
    ],
  'Vendor / category': ['Proveedor / categoría', 'Fornecedor / categoria'],
  'Vendor, project or date': ['Proveedor, proyecto o fecha', 'Fornecedor, projeto ou data'],
  Version: ['Versión', 'Versão'],
  'View all expenses': ['Ver todos los gastos', 'Ver todas as despesas'],
  'View timeline': ['Ver cronología', 'Ver linha do tempo'],
  'WIP / Ready': ['Trabajo en curso / listo', 'Trabalho em andamento / pronto'],
  'Weekday minutes': ['Minutos entre semana', 'Minutos dos dias úteis'],
  'What does this file substantiate?': [
    '¿Qué acredita este archivo?',
    'O que este arquivo comprova?',
  ],
  'When enabled, invoice issue remains blocked until the exact report version is signed.': [
    'Cuando está activado, la emisión de la factura permanece bloqueada hasta firmar la versión exacta del informe.',
    'Quando ativada, a emissão da fatura permanece bloqueada até a assinatura da versão exata do relatório.',
  ],
  'Worker economics by source': [
    'Economía del trabajador por fuente',
    'Economia do colaborador por origem',
  ],
  'Worker economics source table': [
    'Tabla fuente de economía del trabajador',
    'Tabela de origem da economia do colaborador',
  ],
  'Worker operations': ['Operaciones del trabajador', 'Operações do colaborador'],
  'Worker reimbursement and client expense recovery are separate from customer billing and invoice collection.':
    [
      'El reembolso del trabajador y la recuperación del gasto del cliente son independientes de la facturación al cliente y el cobro de facturas.',
      'O reembolso do colaborador e a recuperação da despesa do cliente são separados do faturamento do cliente e do recebimento de faturas.',
    ],
  'Worker statement': ['Estado del trabajador', 'Extrato do colaborador'],
  'Workers and PMs record operational truth. Finance configuration determines its commercial interpretation.':
    [
      'Los trabajadores y PM registran la verdad operativa. La configuración financiera determina su interpretación comercial.',
      'Colaboradores e PMs registram a verdade operacional. A configuração de Finanças determina sua interpretação comercial.',
    ],
  Yes: ['Sí', 'Sim'],
  'You have read-only access to this report. Contact the project manager or owner for changes.': [
    'Tienes acceso de solo lectura a este informe. Contacta con el responsable del proyecto o el propietario para realizar cambios.',
    'Você tem acesso somente leitura a este relatório. Contate o gerente do projeto ou proprietário para alterações.',
  ],
  'Your actual time entries will appear here.': [
    'Tus registros de horas reales aparecerán aquí.',
    'Seus registros de horas trabalhadas aparecerão aqui.',
  ],
  'Your field summaries will appear here after you save them.': [
    'Tus resúmenes de campo aparecerán aquí después de guardarlos.',
    'Seus resumos de campo aparecerão aqui depois que você os salvar.',
  ],
  'Your submitted expenses will appear here.': [
    'Tus gastos enviados aparecerán aquí.',
    'Suas despesas enviadas aparecerão aqui.',
  ],
  after: ['después', 'após'],
  disabled: ['deshabilitado', 'desativado'],
  entries: ['registros', 'entradas'],
  filtered: ['filtrado', 'filtrado'],
  min: ['min', 'min'],
  missing: ['faltante', 'ausente'],
  'open-ended': ['sin fecha de fin', 'sem data final'],
  optional: ['opcional', 'opcional'],
  planned: ['planificado', 'planejado'],
  'source records': ['registros fuente', 'registros de origem'],
  'Classify expenses and set commercial policies. Operational hours and project metrics stay on Economic Review.':
    [
      'Clasifica gastos y define políticas comerciales. Las horas operativas y las métricas de proyecto permanecen en Revisión económica.',
      'Classifique despesas e defina políticas comerciais. As horas operacionais e as métricas de projeto permanecem na Revisão econômica.',
    ],
  'Review profitability, budget consumption, and source records for the selected project.': [
    'Revisa rentabilidad, consumo de presupuesto y registros de origen del proyecto seleccionado.',
    'Revise rentabilidade, consumo de orçamento e registros de origem do projeto selecionado.',
  ],
  Dates: ['Fechas', 'Datas'],
  All: ['Todas', 'Todas'],
  Classify: ['Clasificar', 'Classificar'],
  Review: ['Revisar', 'Revisar'],
  'Commercial Configuration': ['Configuración comercial', 'Configuração comercial'],
  'Economic Review': ['Revisión económica', 'Revisão econômica'],
  'Commercial operations': ['Operaciones comerciales', 'Operações comerciais'],
  'Cash and liquidity': ['Caja y liquidez', 'Caixa e liquidez'],
  hrs: ['h', 'h'],
  'Loaded labor': ['Mano de obra cargada', 'Mão de obra carregada'],
  'Estimate to complete': ['Estimación hasta completar', 'Estimativa até concluir'],
  'Source records': ['Registros de origen', 'Registros de origem'],
  Portfolio: ['Portafolio', 'Portfólio'],
  'Worker economics': ['Economía por especialista', 'Economia por especialista'],
  'Time entries': ['Partes de horas', 'Apontamentos de horas'],
  'Expense ledger': ['Libro de gastos', 'Livro de despesas'],
  Settlements: ['Liquidaciones', 'Liquidações'],
  'Expense classification inbox': [
    'Bandeja de clasificación de gastos',
    'Caixa de classificação de despesas',
  ],
  'Classify this expense before Finance review.': [
    'Clasifica este gasto antes de la revisión financiera.',
    'Classifique esta despesa antes da revisão financeira.',
  ],
  'Classify expense in Finance →': [
    'Clasificar gasto en Finanzas →',
    'Classificar despesa em Finanças →',
  ],
  'Set a project issuing authority covering this expense date before classification.': [
    'Configura una entidad emisora del proyecto que cubra la fecha de este gasto antes de clasificarlo.',
    'Configure uma entidade emissora do projeto que cubra a data desta despesa antes de classificá-la.',
  ],
  'Configure project issuing authority →': [
    'Configurar entidad emisora del proyecto →',
    'Configurar entidade emissora do projeto →',
  ],
  'Review project issuing authority →': [
    'Revisar entidad emisora del proyecto →',
    'Revisar entidade emissora do projeto →',
  ],
  'Needs classification': ['Requiere clasificación', 'Requer classificação'],
  'Tax rate': ['Tipo impositivo', 'Alíquota'],
  '0% allowed': ['0% permitido', '0% permitido'],
  'Commercial policies': ['Políticas comerciales', 'Políticas comerciais'],
  'Each row is one bill. Open Manage to approve, issue, collect, or correct. Adjustment is a new draft, never an edit of the issued bill.':
    [
      'Cada fila es una factura. Abre Gestionar para aprobar, emitir, cobrar o corregir. El ajuste es un borrador nuevo, nunca una edición de la factura emitida.',
      'Cada linha é uma fatura. Abra Gerenciar para aprovar, emitir, receber ou corrigir. O ajuste é um rascunho novo, nunca uma edição da fatura emitida.',
    ],
  Manage: ['Gestionar', 'Gerenciar'],
  Collections: ['Cobros', 'Recebimentos'],
  Lifecycle: ['Ciclo de vida', 'Ciclo de vida'],
  'Legal entities': ['Entidades legales', 'Entidades legais'],
  'Tax profiles': ['Perfiles de impuestos', 'Perfis de imposto'],
  'No legal entities recorded.': [
    'No hay entidades legales registradas.',
    'Não há entidades legais registradas.',
  ],
  'No tax profiles recorded.': [
    'No hay perfiles de impuestos registrados.',
    'Não há perfis de imposto registrados.',
  ],
  Previous: ['Anterior', 'Anterior'],
  Next: ['Siguiente', 'Próximo'],
  'Hourly rate': ['Tarifa horaria', 'Tarifa horária'],
  'Hourly cost': ['Coste horario', 'Custo horário'],
  Percentage: ['Porcentaje', 'Percentual'],
  'Overtime multiplier': ['Multiplicador de horas extra', 'Multiplicador de hora extra'],
  'e.g. 55': ['ej. 55', 'ex. 55'],
  'Delete project': ['Eliminar proyecto', 'Excluir projeto'],
  'Delete this project? This will permanently remove it if it has no financial activity.': [
    '¿Eliminar este proyecto? Se quitará definitivamente si no tiene actividad financiera.',
    'Excluir este projeto? Ele será removido definitivamente se não tiver atividade financeira.',
  ],
  '+ Create email account': ['+ Crear cuenta de correo', '+ Criar conta de e-mail'],
  Alias: ['Apodo', 'Apelido'],
  'Alias / username': ['Alias / usuario', 'Alias / usuário'],
  'All mailboxes': ['Todos los buzones', 'Todas as caixas de correio'],
  'Already in Portal': ['Ya está en el portal', 'Já está no portal'],
  'Antonny Luty is the only Owner. This mailbox cannot be re-roled, offboarded or deleted from this screen.':
    [
      'Antonny Luty es el único propietario. Este buzón no puede cambiar de rol, darse de baja ni eliminarse desde esta pantalla.',
      'Antonny Luty é o único proprietário. Esta caixa não pode ter a função alterada, ser desativada nem excluída nesta tela.',
    ],
  'Antonny Luty is the unique Owner. Role changes and portal offboarding are unavailable.': [
    'Antonny Luty es el propietario único. Los cambios de rol y la baja del portal no están disponibles.',
    'Antonny Luty é o proprietário único. Alterações de função e desativação do portal não estão disponíveis.',
  ],
  'Assign role': ['Asignar rol', 'Atribuir função'],
  'Available to provision': ['Disponible para dar de alta', 'Disponível para provisionar'],
  'Change Owner Webmail password': [
    'Cambiar contraseña de Webmail del propietario',
    'Alterar senha do Webmail do proprietário',
  ],
  'Change Webmail password': ['Cambiar contraseña de Webmail', 'Alterar senha do Webmail'],
  'Change portal role': ['Cambiar rol del portal', 'Alterar função no portal'],
  'Close mailbox form': ['Cerrar formulario del buzón', 'Fechar formulário da caixa de correio'],
  'Confirm Owner password': [
    'Confirmar contraseña del propietario',
    'Confirmar senha do proprietário',
  ],
  'Confirming identity…': ['Confirmando la identidad…', 'Confirmando a identidade…'],
  Controls: ['Controles', 'Controles'],
  'Corporate email accounts': ['Cuentas de correo corporativo', 'Contas de e-mail corporativo'],
  'Create a new Stalwart mailbox': [
    'Crear un nuevo buzón de Stalwart',
    'Criar uma nova caixa de correio Stalwart',
  ],
  'Create mailbox': ['Crear buzón', 'Criar caixa de correio'],
  'Creating a mailbox changes the live Stalwart directory. Verify the alias and quota before continuing.':
    [
      'Crear una cuenta modifica el directorio activo de Stalwart. Comprueba el alias y la cuota antes de continuar.',
      'Criar uma conta altera o diretório ativo do Stalwart. Confira o alias e a cota antes de continuar.',
    ],
  'Delete mailbox': ['Eliminar buzón', 'Excluir caixa de correio'],
  'Delete mailbox permanently': [
    'Eliminar buzón definitivamente',
    'Excluir caixa de correio definitivamente',
  ],
  'Deselect all': ['Quitar toda la selección', 'Limpar toda a seleção'],
  'Disk quota': ['Cuota de disco', 'Cota de disco'],
  'Filter accounts': ['Filtrar cuentas', 'Filtrar contas'],
  'Identity confirmation failed.': [
    'La confirmación de identidad ha fallado.',
    'A confirmação de identidade falhou.',
  ],
  'Identity confirmed for protected actions for 10 minutes.': [
    'Identidad confirmada para acciones protegidas durante 10 minutos.',
    'Identidade confirmada para ações protegidas por 10 minutos.',
  ],
  'Initial Webmail password': ['Contraseña inicial de Webmail', 'Senha inicial do Webmail'],
  'Live accounts from Stalwart. Password hashes and credentials are never shown in the portal.': [
    'Cuentas activas de Stalwart. Las contraseñas y credenciales nunca se muestran en el portal.',
    'Contas ativas do Stalwart. Senhas e credenciais nunca são exibidas no portal.',
  ],
  'Live corporate mailbox directory': [
    'Directorio activo de buzones corporativos',
    'Diretório ativo de caixas de correio corporativas',
  ],
  'Loading live mailbox directory': [
    'Cargando el directorio activo de buzones',
    'Carregando o diretório ativo de caixas de correio',
  ],
  'Mailbox / Email': ['Buzón / correo', 'Caixa de correio / e-mail'],
  'Mailbox cards for small screens': [
    'Tarjetas de buzones para pantallas pequeñas',
    'Cartões de caixas de correio para telas pequenas',
  ],
  'Mailbox count': ['Número de buzones', 'Quantidade de caixas de correio'],
  'Mailbox directory': ['Directorio de buzones', 'Diretório de caixas de correio'],
  'Mailbox directory error': [
    'Error del directorio de buzones',
    'Erro no diretório de caixas de correio',
  ],
  'Mailbox directory unavailable': [
    'Directorio de buzones no disponible',
    'Diretório de caixas de correio indisponível',
  ],
  'Mailbox operation completed.': [
    'Operación del buzón completada.',
    'Operação da caixa de correio concluída.',
  ],
  Mailboxes: ['Buzones', 'Caixas de correio'],
  'Manage mailbox': ['Gestionar buzón', 'Gerenciar caixa de correio'],
  'New Webmail password': ['Nueva contraseña de Webmail', 'Nova senha do Webmail'],
  'New role': ['Nuevo rol', 'Nova função'],
  'No email accounts found matching your search.': [
    'No se encontraron cuentas de correo que coincidan con la búsqueda.',
    'Não foram encontradas contas de e-mail correspondentes à busca.',
  ],
  'Owner — protected': ['Propietario — protegido', 'Proprietário — protegido'],
  'Permanent external action.': ['Acción externa permanente.', 'Ação externa permanente.'],
  'Portal role': ['Rol del portal', 'Função no portal'],
  'Portal status': ['Estado del portal', 'Status no portal'],
  'Provision in portal as': ['Dar de alta en el portal como', 'Provisionar no portal como'],
  'Provision selected in portal': [
    'Dar de alta la selección en el portal',
    'Provisionar a seleção no portal',
  ],
  'Provision this mailbox first to manage its portal role.': [
    'Da de alta primero este buzón para gestionar su rol del portal.',
    'Provisione primeiro esta caixa de correio para gerenciar sua função no portal.',
  ],
  'Provisioning…': ['Dando de alta…', 'Provisionando…'],
  'Reading the current Stalwart account list. Please wait.': [
    'Leyendo la lista actual de cuentas de Stalwart. Espera un momento.',
    'Lendo a lista atual de contas do Stalwart. Aguarde um momento.',
  ],
  'Reason for deleting mailbox': [
    'Motivo para eliminar el buzón',
    'Motivo para excluir a caixa de correio',
  ],
  'Reason for password change': [
    'Motivo para cambiar la contraseña',
    'Motivo para alterar a senha',
  ],
  'Reason for removing access': ['Motivo para retirar el acceso', 'Motivo para remover o acesso'],
  'Reason for role change': ['Motivo para cambiar el rol', 'Motivo para alterar a função'],
  'Remove portal access': ['Retirar acceso del portal', 'Remover acesso do portal'],
  'STALWART MAIL SERVER DIRECTORY': [
    'DIRECTORIO DEL SERVIDOR DE CORREO STALWART',
    'DIRETÓRIO DO SERVIDOR DE E-MAIL STALWART',
  ],
  'Save role': ['Guardar rol', 'Salvar função'],
  'Search accounts': ['Buscar cuentas', 'Pesquisar contas'],
  'Search by alias or name': ['Buscar por alias o nombre', 'Pesquisar por alias ou nome'],
  Select: ['Seleccionar', 'Selecionar'],
  'Select all eligible mailboxes': [
    'Seleccionar todos los buzones aptos',
    'Selecionar todas as caixas de correio aptas',
  ],
  'Stalwart account identifier unavailable; protected controls are disabled.': [
    'El identificador de cuenta de Stalwart no está disponible; los controles protegidos están desactivados.',
    'O identificador da conta Stalwart está indisponível; os controles protegidos estão desativados.',
  ],
  'Stalwart did not return a live directory. No account is shown as ready.': [
    'Stalwart no devolvió un directorio activo. No se muestra ninguna cuenta como lista.',
    'Stalwart não retornou um diretório ativo. Nenhuma conta é mostrada como pronta.',
  ],
  'Stalwart validates and stores this password. The portal never stores or displays it.': [
    'Stalwart valida y guarda esta contraseña. El portal nunca la conserva ni la muestra.',
    'Stalwart valida e armazena esta senha. O portal nunca a conserva nem a exibe.',
  ],
  'Synchronize all Stalwart accounts': [
    'Sincronizar todas las cuentas de Stalwart',
    'Sincronizar todas as contas Stalwart',
  ],
  'Team directory views': ['Vistas del directorio del equipo', 'Visões do diretório da equipe'],
  'The account is created in Stalwart first, then optionally provisioned in the portal. Passwords are sent only to Stalwart.':
    [
      'La cuenta se crea primero en Stalwart y después puede darse de alta en el portal. Las contraseñas se envían solo a Stalwart.',
      'A conta é criada primeiro no Stalwart e depois pode ser provisionada no portal. As senhas são enviadas somente ao Stalwart.',
    ],
  'The mailbox operation could not be completed.': [
    'La operación del buzón no se pudo completar.',
    'Não foi possível concluir a operação da caixa de correio.',
  ],
  'The mailbox operation was rejected.': [
    'La operación del buzón fue rechazada.',
    'A operação da caixa de correio foi rejeitada.',
  ],
  'This archives the portal access and revokes the user session. It does not delete the Stalwart mailbox.':
    [
      'Esta acción archiva el acceso al portal y revoca la sesión del usuario. No elimina el buzón de Stalwart.',
      'Esta ação arquiva o acesso ao portal e revoga a sessão do usuário. Ela não exclui a caixa de correio do Stalwart.',
    ],
  'This deletes the Stalwart account and its Webmail data. Portal access is not a substitute for this confirmation.':
    [
      'Esta acción elimina la cuenta de Stalwart y sus datos de Webmail. El acceso al portal no sustituye esta confirmación.',
      'Esta ação exclui a conta Stalwart e seus dados do Webmail. O acesso ao portal não substitui esta confirmação.',
    ],
  'Type the exact email address to confirm.': [
    'Escribe la dirección de correo exacta para confirmar.',
    'Digite o endereço de e-mail exato para confirmar.',
  ],
  'Type the exact email to confirm': [
    'Escribe el correo exacto para confirmar',
    'Digite o e-mail exato para confirmar',
  ],
  'Type DELETE, followed by a space and the exact email shown below, to confirm deletion': [
    'Para confirmar la eliminación, escribe DELETE, un espacio y después el correo exacto que aparece debajo',
    'Para confirmar a exclusão, digite DELETE, um espaço e depois o e-mail exato exibido abaixo',
  ],
  'Unique Owner': ['Propietario único', 'Proprietário único'],
  'Unique Owner — protected': ['Propietario único — protegido', 'Proprietário único — protegido'],
  Unlimited: ['Ilimitado', 'Ilimitado'],
  'Unlock protected actions': ['Desbloquear acciones protegidas', 'Desbloquear ações protegidas'],
  'Updating mailbox directory': [
    'Actualizando el directorio de buzones',
    'Atualizando o diretório de caixas de correio',
  ],
  'Use a unique password of at least 12 characters. It is not retained in this form after submission.':
    [
      'Usa una contraseña única de al menos 12 caracteres. No se conserva en este formulario después del envío.',
      'Use uma senha exclusiva de pelo menos 12 caracteres. Ela não é mantida neste formulário após o envio.',
    ],
  'Worker (default)': ['Trabajador (predeterminado)', 'Colaborador (padrão)'],
  'Working…': ['Trabajando…', 'Processando…'],
  'available accounts selected': [
    'cuentas disponibles seleccionadas',
    'contas disponíveis selecionadas',
  ],
  'Delete client': ['Eliminar cliente', 'Excluir cliente'],
  'Delete this client? This will permanently remove it if it has no associated projects or invoices.':
    [
      '¿Eliminar este cliente? Se quitará definitivamente si no tiene proyectos ni facturas asociadas.',
      'Excluir este cliente? Ele será removido definitivamente se não tiver projetos ou faturas associadas.',
    ],
  'Bank Account Number': ['Número de cuenta bancaria', 'Número da conta bancária'],
  'Bank Name': ['Nombre del banco', 'Nome do banco'],
  'Bank Swift Number': ['Código SWIFT bancario', 'Código SWIFT do banco'],
  Beneficiary: ['Beneficiario', 'Beneficiário'],
  'DUE DATE': ['FECHA DE VENCIMIENTO', 'DATA DE VENCIMENTO'],
  Discount: ['Descuento', 'Desconto'],
  'Discount Amount': ['Importe del descuento', 'Valor do desconto'],
  'Edit Invoice Details (Purchase No., Terms, Company, Discount)': [
    'Editar datos de factura (n.º de compra, condiciones, empresa, descuento)',
    'Editar dados da fatura (n.º de compra, condições, empresa, desconto)',
  ],
  'INVOICE DATE': ['FECHA DE FACTURA', 'DATA DA FATURA'],
  'INVOICE NUMBER': ['NÚMERO DE FACTURA', 'NÚMERO DA FATURA'],
  'PURCHASE NO.': ['N.º DE COMPRA', 'N.º DE COMPRA'],
  'Past Due Notice': ['Aviso de vencimiento', 'Aviso de vencimento'],
  'Purchase No.': ['N.º de compra', 'N.º de compra'],
  'Save Details': ['Guardar datos', 'Salvar dados'],
  'Subtotal Less Discount': ['Subtotal menos descuento', 'Subtotal menos desconto'],
  TOTAL: ['IMPORTE TOTAL', 'VALOR TOTAL'],
  'Terms & Instructions': ['Condiciones e instrucciones', 'Condições e instruções'],
  'UNIT PRICE': ['PRECIO UNITARIO', 'PREÇO UNITÁRIO'],
  'Unit Price': ['Precio unitario', 'Preço unitário'],
  'Client Representative Signature': [
    'Firma del representante del cliente',
    'Assinatura do representante do cliente',
  ],
  'Name & Title': ['Nombre y cargo', 'Nome e cargo'],
  'Generate creates files for reviewing a period. Finalize freezes the reviewed figures as a historical version; later corrections require a new version.':
    [
      'La generación crea archivos para revisar un período. La finalización congela las cifras revisadas como versión histórica; las correcciones posteriores requieren otra versión.',
      'A geração cria arquivos para revisar um período. A finalização congela os valores revisados como versão histórica; correções posteriores exigem outra versão.',
    ],
  'Act on the oldest submitted operational records first. Approved records remain below for audit and correction follow-up.':
    [
      'Actúa primero sobre los registros operativos enviados más antiguos. Los aprobados quedan debajo para auditoría y correcciones.',
      'Atue primeiro sobre os registros operacionais enviados mais antigos. Os aprovados ficam abaixo para auditoria e correções.',
    ],
  'All workers': ['Todos los trabajadores', 'Todos os colaboradores'],
  'Approve submitted project milestones. This is separate from operational record review.': [
    'Aprueba los hitos de proyecto enviados. Es independiente de la revisión operativa.',
    'Aprove os marcos de projeto enviados. É separado da revisão operacional.',
  ],
  'Completed approval pages': [
    'Páginas de aprobaciones completadas',
    'Páginas de aprovações concluídas',
  ],
  'Completed records, if any, remain available below.': [
    'Los registros completados siguen disponibles debajo.',
    'Registros concluídos, se houver, continuam disponíveis abaixo.',
  ],
  'Completed review follow-up': [
    'Seguimiento de revisión completado',
    'Acompanhamento da revisão concluído',
  ],
  'Finance review pages': ['Páginas de revisión financiera', 'Páginas de revisão financeira'],
  'No submitted records match this view.': [
    'No hay registros enviados que coincidan.',
    'Nenhum registro enviado corresponde a esta vista.',
  ],
  'Oldest submitted': ['Enviados más antiguos', 'Enviados mais antigos'],
  Page: ['Página', 'Página'],
  'Project approval pages': [
    'Páginas de aprobación de proyectos',
    'Páginas de aprovação de projetos',
  ],
  'Project, milestone or due date': ['Proyecto, hito o fecha límite', 'Projeto, marco ou prazo'],
  'Project, worker, date or record': [
    'Proyecto, trabajador, fecha o registro',
    'Projeto, colaborador, data ou registro',
  ],
  'Search Finance review': ['Buscar en revisión financiera', 'Buscar na revisão financeira'],
  'Search project approvals': ['Buscar aprobaciones de proyectos', 'Buscar aprovações de projetos'],
  'Submitted approval pages': [
    'Páginas de aprobaciones enviadas',
    'Páginas de aprovações enviadas',
  ],
  'These approved records are immutable operational history. Open a record to inspect it or start the audited correction path where permitted.':
    [
      'Estos registros aprobados son historial operativo inmutable. Abre un registro para revisarlo o inicia la corrección auditada cuando esté permitida.',
      'Estes registros aprovados são histórico operacional imutável. Abra um registro para inspecioná-lo ou inicie a correção auditada quando permitido.',
    ],
  of: ['de', 'de'],
  'Edit client': ['Editar cliente', 'Editar cliente'],
  'Download CSV': ['Descargar CSV', 'Baixar CSV'],
  'Download Excel': ['Descargar Excel', 'Baixar Excel'],
  'Download the filtered operational expenses as PDF, Excel or CSV.': [
    'Descarga los gastos operativos filtrados en PDF, Excel o CSV.',
    'Baixe as despesas operacionais filtradas em PDF, Excel ou CSV.',
  ],
  'Expense register pages': ['Páginas del registro de gastos', 'Páginas do registro de despesas'],
  'Export expense register': ['Exportar registro de gastos', 'Exportar registro de despesas'],
  To: ['Hasta', 'Até'],
  'Choose whether J&A charges this expense to the client, absorbs the cost, or excludes it from billing. Separately, schedule or record repayment to the worker who advanced the money.':
    [
      'Elige si J&A repercute este gasto al cliente, absorbe el coste o lo excluye de la facturación. Programa o registra por separado el reembolso al trabajador.',
      'Escolha se a J&A cobra esta despesa do cliente, absorve o custo ou a exclui do faturamento. Programe ou registre separadamente o reembolso ao colaborador.',
    ],
  'Create report': ['Crear informe', 'Criar relatório'],
  'Daily report pages': ['Páginas de informes diarios', 'Páginas de relatórios diários'],
  'Files appear here only after generation is ready. Open a period record to review its traceable status; PDF is available only when its stored artifact is verified.':
    [
      'Los archivos aparecen cuando la generación está lista. Abre un período para revisar su estado; el PDF solo está disponible cuando el artefacto está verificado.',
      'Os arquivos aparecem quando a geração está pronta. Abra um período para revisar o estado; o PDF só fica disponível quando o artefato é verificado.',
    ],
  'Filter reports': ['Filtrar informes', 'Filtrar relatórios'],
  'Open a ready record to review its exact version and record client sign-off. A signed record remains bound to that immutable report version; a source change requires a replacement report.':
    [
      'Abre un registro listo para revisar su versión exacta y registrar la conformidad del cliente. Un registro firmado queda vinculado a esa versión inmutable; un cambio de origen requiere otro informe.',
      'Abra um registro pronto para revisar a versão exata e registrar a aprovação do cliente. Um registro assinado permanece vinculado à versão imutável; uma alteração de origem exige outro relatório.',
    ],
  'Project, worker or report': [
    'Proyecto, trabajador o informe',
    'Projeto, colaborador ou relatório',
  ],
  'Search register': ['Buscar en el registro', 'Buscar no registro'],
  'Technical report pages': ['Páginas de informes técnicos', 'Páginas de relatórios técnicos'],
  'Access method': ['Método de acceso', 'Método de acesso'],
  'Choose an invitation or set local credentials yourself. Assign project access after creating the account.':
    [
      'Elige una invitación o configura tú las credenciales locales. Asigna el proyecto después de crear la cuenta.',
      'Escolha um convite ou configure as credenciais locais. Atribua o projeto depois de criar a conta.',
    ],
  Company: ['Empresa', 'Empresa'],
  'Contact name': ['Nombre de contacto', 'Nome do contato'],
  'Copy the chosen credentials before saving. This creates portal access without sending an email; assign the person to their authorized projects next.':
    [
      'Copia las credenciales elegidas antes de guardar. Esto crea acceso al portal sin enviar correo; después asigna la persona a sus proyectos autorizados.',
      'Copie as credenciais escolhidas antes de salvar. Isso cria acesso ao portal sem enviar e-mail; depois atribua a pessoa aos projetos autorizados.',
    ],
  'External technician': ['Técnico externo', 'Técnico externo'],
  'Initial password': ['Contraseña inicial', 'Senha inicial'],
  'Invitation link': ['Enlace de invitación', 'Link de convite'],
  'Select supplier': ['Selecciona un proveedor', 'Selecione o fornecedor'],
  'Set email and password': ['Configurar correo y contraseña', 'Definir e-mail e senha'],
  'Show password to copy': ['Mostrar contraseña para copiar', 'Mostrar senha para copiar'],
  Supplier: ['Proveedor', 'Fornecedor'],
  'Supplier coordinator': ['Coordinador del proveedor', 'Coordenador do fornecedor'],
  'Project, activity or date': ['Proyecto, actividad o fecha', 'Projeto, atividade ou data'],
  'Save a draft while details are still changing. Submit time only after the recorded date, duration and activity are accurate; submitted time is reviewed and cannot be silently overwritten.':
    [
      'Guarda un borrador mientras cambian los detalles. Envía las horas cuando fecha, duración y actividad sean correctas; las horas enviadas se revisan y no se sobrescriben.',
      'Salve um rascunho enquanto os detalhes mudam. Envie as horas quando data, duração e atividade estiverem corretas; o envio é revisado e não é sobrescrito silenciosamente.',
    ],
  'Time register pages': ['Páginas del registro de horas', 'Páginas do registro de horas'],
  'Open day entries': ['Abrir registros del día', 'Abrir registros do dia'],
  'Open time entries for': ['Abrir registros de horas de', 'Abrir registros de horas de'],
  'Needs attention first': ['Primero requieren atención', 'Primeiro os que exigem atenção'],
  'Newest first': ['Más recientes primero', 'Mais recentes primeiro'],
  'No matching records.': ['No hay registros coincidentes.', 'Nenhum registro correspondente.'],
  'Oldest first': ['Más antiguos primero', 'Mais antigos primeiro'],
  Pages: ['Páginas', 'Páginas'],
  'Sort by': ['Ordenar por', 'Ordenar por'],
  'Finance prepares the reviewed period PDF after approving the source records. Use Daily or Technical / PLC to submit your own work; customer sign-off confirms the reviewed period.':
    [
      'Finanzas prepara el PDF del período revisado después de aprobar los registros de origen. Usa los informes diarios o técnicos / PLC para enviar tu trabajo; la conformidad del cliente confirma el período.',
      'Finanças prepara o PDF do período revisado após aprovar os registros de origem. Use os relatórios diários ou técnicos / PLC para enviar seu trabalho; a aprovação do cliente confirma o período.',
    ],
  'Worker overtime method': [
    'Método de horas extra del trabajador',
    'Método de hora extra do colaborador',
  ],
  'Worker overtime multiplier': [
    'Multiplicador de horas extra del trabajador',
    'Multiplicador de hora extra do colaborador',
  ],
  'Fixed overtime rate': ['Tarifa fija de horas extra', 'Tarifa fixa de hora extra'],
  'Required when no billing email is provided': [
    'Obligatorio si no se indica un correo de facturación',
    'Obrigatório quando não for informado um e-mail de faturamento',
  ],
  'Review these client fields': [
    'Revisa estos campos del cliente',
    'Revise estes campos do cliente',
  ],
  'Create invoice': ['Crear factura', 'Criar fatura'],
  'Guided invoice workflow': ['Flujo guiado de facturación', 'Fluxo guiado de faturamento'],
  'Invoice steps': ['Pasos de la factura', 'Etapas da fatura'],
  'No billable records': ['Sin registros facturables', 'Sem registros faturáveis'],
  'No positive billable amount': [
    'Sin importe facturable positivo',
    'Sem valor faturável positivo',
  ],
  'No billable labor records are available in this period. Choose another period or review the time and billing setup.':
    [
      'No hay registros de mano de obra facturables en este periodo. Elige otro periodo o revisa las horas y la configuración de facturación.',
      'Não há registros de mão de obra faturáveis neste período. Escolha outro período ou revise as horas e a configuração de faturamento.',
    ],
  'No approved, unbilled milestones are available in this period. Choose another period or approve a milestone first.':
    [
      'No hay hitos aprobados y pendientes de facturar en este periodo. Elige otro periodo o aprueba primero un hito.',
      'Não há marcos aprovados e por faturar neste período. Escolha outro período ou aprove primeiro um marco.',
    ],
  'The eligible records total zero billable amount. Review rates, included hours, milestone amounts, and the billing setup.':
    [
      'Los registros aptos suman un importe facturable de cero. Revisa las tarifas, las horas incluidas, los importes de los hitos y la configuración de facturación.',
      'Os registos elegíveis somam um valor faturável de zero. Reveja as tarifas, as horas incluídas, os valores dos marcos e a configuração de faturação.',
    ],
  'Jump to': ['Ir a', 'Ir para'],
  'Choose the project whose approved source records will be billed.': [
    'Elige el proyecto cuyos registros de origen aprobados se facturarán.',
    'Escolha o projeto cujos registros de origem aprovados serão faturados.',
  ],
  'Labor and reimbursable expenses use independent streams, cadence and tax configuration.': [
    'La mano de obra y los gastos repercutibles usan flujos, frecuencias y configuración fiscal independientes.',
    'Mão de obra e despesas recuperáveis usam fluxos, frequências e configuração fiscal independentes.',
  ],
  'The suggested dates come from this stream’s configured cadence. Manual dates are an explicit change and are never replaced silently.':
    [
      'Las fechas sugeridas proceden de la frecuencia configurada para este flujo. Las fechas manuales son un cambio explícito y nunca se sustituyen silenciosamente.',
      'As datas sugeridas vêm da frequência configurada para este fluxo. Datas manuais são uma alteração explícita e nunca são substituídas silenciosamente.',
    ],
  'Only approved, unbilled records in the selected period are eligible. Pending or missing-rate records block this exact period and are never moved to another invoice automatically.':
    [
      'Sólo son elegibles los registros aprobados y no facturados del período seleccionado. Los registros pendientes o sin tarifa bloquean este período exacto y nunca se trasladan automáticamente a otra factura.',
      'Somente registros aprovados e não faturados do período selecionado são elegíveis. Registros pendentes ou sem tarifa bloqueiam este período exato e nunca são movidos automaticamente para outra fatura.',
    ],
  'Review pending records': ['Revisar registros pendientes', 'Revisar registros pendentes'],
  'Choose another period': ['Elegir otro período', 'Escolher outro período'],
  'Available for review, finalization or download': [
    'Disponible para revisar, finalizar o descargar',
    'Disponível para revisão, finalização ou download',
  ],
  'Review before finalizing': ['Revisar antes de finalizar', 'Revisar antes de finalizar'],
  'Finalize freezes this reviewed version. Later source corrections require a new Accounting Pack version.':
    [
      'Finalizar congela esta versión revisada. Las correcciones posteriores de los datos de origen requieren una nueva versión del paquete contable.',
      'Finalizar congela esta versão revisada. Correções posteriores dos dados de origem exigem uma nova versão do pacote contábil.',
    ],
  'Pending records': ['Registros pendientes', 'Registros pendentes'],
  'Draft and returned records may not appear in the approval queue.': [
    'Los borradores y registros devueltos pueden no aparecer en la cola de aprobación.',
    'Rascunhos e registros devolvidos podem não aparecer na fila de aprovação.',
  ],
  'Unclassified expenses': ['Gastos sin clasificar', 'Despesas não classificadas'],
  'Missing documents': ['Documentos que faltan', 'Documentos ausentes'],
  'Reconciliation issues': ['Problemas de conciliación', 'Problemas de conciliação'],
  'Changes since generation': ['Cambios desde la generación', 'Alterações desde a geração'],
  'Yes — generate a new version': ['Sí — genera una nueva versión', 'Sim — gere uma nova versão'],
  'None detected': ['No se detectaron', 'Nenhuma detectada'],
  'Finalize reviewed version': ['Finalizar versión revisada', 'Finalizar versão revisada'],
  'Resolve processing, source-change or reconciliation issues first.': [
    'Resuelve primero los problemas de procesamiento, cambios de origen o conciliación.',
    'Resolva primeiro os problemas de processamento, alteração de origem ou conciliação.',
  ],
  'Operational access type': ['Tipo de acceso operativo', 'Tipo de acesso operacional'],
  'Portal role controls application permissions. Operational access type links supplier coordinators and external technicians to the same person account without duplicating them.':
    [
      'El rol del portal controla los permisos de la aplicación. El tipo de acceso operativo vincula coordinadores de proveedor y técnicos externos a la misma cuenta personal sin duplicarlos.',
      'A função do portal controla as permissões do aplicativo. O tipo de acesso operacional vincula coordenadores de fornecedor e técnicos externos à mesma conta pessoal sem duplicá-los.',
    ],
  'Standard team member': ['Miembro estándar del equipo', 'Membro padrão da equipe'],
  'Supplier company': ['Empresa proveedora', 'Empresa fornecedora'],
  'Not linked to a supplier': ['No vinculado a un proveedor', 'Não vinculado a um fornecedor'],
  'Save operational access': ['Guardar acceso operativo', 'Salvar acesso operacional'],
  'The draft uses the stream’s legal entity, tax profile, recipient, payment terms and banking details. Edit the stream before creating the draft when those facts are incomplete.':
    [
      'El borrador usa la entidad legal, perfil fiscal, destinatario, condiciones de pago y datos bancarios del flujo. Edita el flujo antes de crear el borrador si faltan esos datos.',
      'O rascunho usa a entidade legal, perfil fiscal, destinatário, condições de pagamento e dados bancários do fluxo. Edite o fluxo antes de criar o rascunho se esses dados estiverem incompletos.',
    ],
  'Correct a wrong source record in Time or Expenses. Add a commercial adjustment only after the draft exists so actual work remains unchanged.':
    [
      'Corrige un registro de origen erróneo en Tiempo o Gastos. Añade un ajuste comercial sólo después de crear el borrador para conservar sin cambios el trabajo real.',
      'Corrija um registro de origem incorreto em Horas ou Despesas. Adicione um ajuste comercial somente após criar o rascunho para manter o trabalho real inalterado.',
    ],
  'Save draft builds a reviewable snapshot. It does not issue, number, send or collect the invoice.':
    [
      'Guardar borrador crea una instantánea revisable. No emite, numera, envía ni cobra la factura.',
      'Salvar rascunho cria uma fotografia revisável. Não emite, numera, envia nem recebe a fatura.',
    ],
  'Save invoice draft': ['Guardar borrador de factura', 'Salvar rascunho de fatura'],
  'Labor / expenses': ['Mano de obra / gastos', 'Mão de obra / despesas'],
  'Included records': ['Registros incluidos', 'Registros incluídos'],
  'Excluded / pending': ['Excluidos / pendientes', 'Excluídos / pendentes'],
  'Banking / payment': ['Datos bancarios / pago', 'Dados bancários / pagamento'],
  'Commercial adjustments': ['Ajustes comerciales', 'Ajustes comerciais'],
  'Save / issue': ['Guardar / emitir', 'Salvar / emitir'],
  Source: ['Origen', 'Origem'],
  'Issuing entity': ['Entidad emisora', 'Entidade emissora'],
  Effective: ['Vigencia', 'Vigência'],
  'Automatic draft enabled': ['Borrador automático activado', 'Rascunho automático ativado'],
  'Automatic draft disabled': ['Borrador automático desactivado', 'Rascunho automático desativado'],
  'Next period': ['Siguiente período', 'Próximo período'],
  'Last run': ['Última ejecución', 'Última execução'],
  'Blocking reason': ['Motivo del bloqueo', 'Motivo do bloqueio'],
  'Automatically prepare draft after period close': [
    'Preparar automáticamente el borrador al cerrar el período',
    'Preparar automaticamente o rascunho após o fechamento do período',
  ],
  'New effective-dated conditions': [
    'Nuevas condiciones con fecha de vigencia',
    'Novas condições com data de vigência',
  ],
  'Cadence and commercial conditions use effective-dated streams. Create a successor for a future change so historic periods are never reinterpreted.':
    [
      'La frecuencia y las condiciones comerciales usan flujos con fecha de vigencia. Crea un sucesor para un cambio futuro y evita reinterpretar períodos históricos.',
      'A frequência e as condições comerciais usam fluxos com data de vigência. Crie um sucessor para uma alteração futura e evite reinterpretar períodos históricos.',
    ],
  'This stream includes one source family only, preventing the same labor or expense from being invoiced twice.':
    [
      'Este flujo incluye una sola familia de datos de origen y evita facturar dos veces la misma mano de obra o gasto.',
      'Este fluxo inclui uma única família de dados de origem e evita faturar duas vezes a mesma mão de obra ou despesa.',
    ],
  'The draft includes approved, eligible and unbilled records from this exact period. The generated draft preserves a source-by-source snapshot for review.':
    [
      'El borrador incluye los registros aprobados, elegibles y no facturados de este período exacto. El borrador generado conserva una instantánea registro por registro para su revisión.',
      'O rascunho inclui os registros aprovados, elegíveis e não faturados deste período exato. O rascunho gerado preserva uma fotografia registro por registro para revisão.',
    ],
  'Eligibility and totals are calculated by the billing engine when the draft is saved; the browser does not duplicate those calculations.':
    [
      'El motor de facturación calcula la elegibilidad y los totales al guardar el borrador; el navegador no duplica esos cálculos.',
      'O motor de faturamento calcula a elegibilidade e os totais ao salvar o rascunho; o navegador não duplica esses cálculos.',
    ],
  'Pending approvals, active corrections, missing rates or required reports block this exact period. The result explains each exclusion and keeps your selected dates.':
    [
      'Las aprobaciones pendientes, correcciones activas, tarifas ausentes o informes obligatorios bloquean este período exacto. El resultado explica cada exclusión y conserva las fechas elegidas.',
      'Aprovações pendentes, correções ativas, tarifas ausentes ou relatórios obrigatórios bloqueiam este período exato. O resultado explica cada exclusão e mantém as datas escolhidas.',
    ],
  'Taxes come from the explicit tax profile assigned to this stream, not from assumptions about labor or expenses.':
    [
      'Los impuestos proceden del perfil fiscal asignado explícitamente a este flujo, no de supuestos sobre mano de obra o gastos.',
      'Os impostos vêm do perfil fiscal atribuído explicitamente a este fluxo, não de suposições sobre mão de obra ou despesas.',
    ],
  'Bank details come from the selected issuing entity and payment terms come from the billing stream. Configure them before creating the draft if they are missing.':
    [
      'Los datos bancarios proceden de la entidad emisora seleccionada y las condiciones de pago del flujo de facturación. Configúralos antes de crear el borrador si faltan.',
      'Os dados bancários vêm da entidade emissora selecionada e as condições de pagamento do fluxo de faturamento. Configure-os antes de criar o rascunho se estiverem ausentes.',
    ],
  'Correct a wrong source record in Time or Expenses. A commercial adjustment changes only what is billed and never overwrites the actual work record.':
    [
      'Corrige un registro erróneo en Tiempo o Gastos. Un ajuste comercial cambia únicamente lo facturado y nunca sobrescribe el registro del trabajo real.',
      'Corrija um registro incorreto em Horas ou Despesas. Um ajuste comercial altera somente o faturado e nunca substitui o registro do trabalho real.',
    ],
  'Manual commercial adjustments are added to the reviewable draft with a reason and audit trail before issue.':
    [
      'Los ajustes comerciales manuales se añaden al borrador revisable con un motivo y trazabilidad antes de emitirlo.',
      'Os ajustes comerciais manuais são adicionados ao rascunho revisável com motivo e trilha de auditoria antes da emissão.',
    ],
  'Save the draft now. Finance can then review lines and adjustments, approve it, issue the immutable numbered version, send it and register collections.':
    [
      'Guarda ahora el borrador. Finanzas podrá revisar las líneas y ajustes, aprobarlo, emitir la versión numerada e inmutable, enviarla y registrar los cobros.',
      'Salve agora o rascunho. Finanças poderá revisar linhas e ajustes, aprová-lo, emitir a versão numerada e imutável, enviá-la e registrar os recebimentos.',
    ],
  'The percentage applies only to the selected eligible client-labor basis. Non-billable work, excluded categories and uncollected amounts are excluded according to that basis; partial client collection produces only the collected eligible share.':
    [
      'El porcentaje se aplica sólo a la base de mano de obra elegible seleccionada. El trabajo no facturable, las categorías excluidas y los importes no cobrados se excluyen según esa base; un cobro parcial del cliente genera únicamente la parte elegible cobrada.',
      'O percentual aplica-se somente à base elegível de mão de obra selecionada. Trabalho não faturável, categorias excluídas e valores não recebidos são excluídos conforme essa base; um recebimento parcial do cliente gera somente a parcela elegível recebida.',
    ],
  'Record expense for': ['Registrar gasto de', 'Registrar despesa de'],
  'my own expense': ['mi propio gasto', 'minha própria despesa'],
  'Loading crew member…': ['Cargando miembro del equipo…', 'Carregando membro da equipe…'],
  'A separate expense is recorded for the selected person.': [
    'Se registra un gasto separado para la persona seleccionada.',
    'Uma despesa separada é registrada para a pessoa selecionada.',
  ],
  'Crew workers could not be loaded. Try again or record your own expense.': [
    'No se pudieron cargar los trabajadores del equipo. Inténtalo de nuevo o registra tu propio gasto.',
    'Não foi possível carregar os trabalhadores da equipe. Tente novamente ou registre sua própria despesa.',
  ],
  'Configure this person': ['Configurar esta persona', 'Configurar esta pessoa'],
  'Customer hourly rule': [
    'Regla de tarifa horaria del cliente',
    'Regra de tarifa horária do cliente',
  ],
  'Worker compensation rule': [
    'Regla de remuneración del trabajador',
    'Regra de remuneração do trabalhador',
  ],
  'Internal cost rule': ['Regla de costo interno', 'Regra de custo interno'],
  'Resolve by project and date': ['Resolver por proyecto y fecha', 'Resolver por projeto e data'],
  'Save person rules': ['Guardar reglas de la persona', 'Salvar regras da pessoa'],
  'Global worker pay fallback': [
    'Usar remuneración general del trabajador si falta una regla del proyecto',
    'Usar remuneração geral do trabalhador se faltar uma regra do projeto',
  ],
  'Global internal cost fallback': [
    'Usar costo interno general si falta una regla del proyecto',
    'Usar custo interno geral se faltar uma regra do projeto',
  ],
  Off: ['Desactivado', 'Desativado'],
  On: ['Activado', 'Ativado'],
  'Save fallback options': ['Guardar opciones alternativas', 'Salvar opções alternativas'],
  'Person expense policies': [
    'Políticas de gastos por persona',
    'Políticas de despesas por pessoa',
  ],
  'Non-billable means the expense is not charged to the customer. Worker reimbursement is separate: J&A can reimburse a worker for a $100 expense while charging the customer $0.':
    [
      'No facturable significa que el gasto no se cobra al cliente. El reembolso al trabajador es independiente: J&A puede reembolsar a un trabajador un gasto de $100 y cobrar $0 al cliente.',
      'Não faturável significa que a despesa não é cobrada ao cliente. O reembolso ao trabalhador é independente: a J&A pode reembolsar uma despesa de US$ 100 ao trabalhador e cobrar US$ 0 ao cliente.',
    ],
  'Not client billable travel time is excluded from the customer labor charge. Worker pay follows separate labor terms; workers still record their actual travel time.':
    [
      'El tiempo de viaje no facturable al cliente queda fuera del cargo de mano de obra. La remuneración sigue condiciones laborales separadas; los trabajadores registran igualmente el tiempo de viaje real.',
      'O tempo de viagem não faturável ao cliente fica fora da cobrança de mão de obra. A remuneração segue condições de trabalho separadas; os trabalhadores continuam a registar o tempo real de viagem.',
    ],
  'Non-billable time is not charged to the customer. Worker compensation follows separate labor terms for approved work.':
    [
      'El tiempo no facturable no se cobra al cliente. La remuneración del trabajador sigue condiciones laborales separadas para el trabajo aprobado.',
      'O tempo não faturável não é cobrado ao cliente. A remuneração do trabalhador segue condições de trabalho separadas para o trabalho aprovado.',
    ],
  'Labor and expenses approved for customer billing use independent streams, cadence and tax configuration. Non-billable expenses are excluded even if J&A reimburses the worker.':
    [
      'La mano de obra y los gastos aprobados para cobrar al cliente usan flujos, frecuencias y configuraciones fiscales independientes. Los gastos no facturables quedan excluidos aunque J&A reembolse al trabajador.',
      'A mão de obra e as despesas aprovadas para cobrança ao cliente usam fluxos, cadências e configurações fiscais independentes. As despesas não faturáveis ficam excluídas mesmo que a J&A reembolse o trabalhador.',
    ],
  'An expense stream invoices only approved expenses marked for customer billing. Non-billable expenses are not charged to the customer; worker reimbursement is configured separately.':
    [
      'Un flujo de gastos factura solo los gastos aprobados y marcados para cobro al cliente. Los gastos no facturables no se cobran al cliente; el reembolso al trabajador se configura por separado.',
      'Um fluxo de despesas fatura apenas despesas aprovadas e marcadas para cobrança ao cliente. As despesas não faturáveis não são cobradas ao cliente; o reembolso ao trabalhador é configurado separadamente.',
    ],
  'Worker reimbursement follows the project default unless this person has an override. Customer billing is a separate expense policy. “Do not bill customer” excludes the expense from the invoice; it does not cancel worker reimbursement.':
    [
      'El reembolso al trabajador sigue el valor predeterminado del proyecto, salvo que esta persona tenga una excepción. La facturación al cliente se configura por separado. «No facturar al cliente» excluye el gasto de la factura, pero no cancela el reembolso al trabajador.',
      'O reembolso ao trabalhador segue o padrão do projeto, salvo se esta pessoa tiver uma exceção. A cobrança ao cliente é configurada separadamente. “Não faturar ao cliente” exclui a despesa da fatura, mas não cancela o reembolso ao trabalhador.',
    ],
  'Project worker reimbursement default': [
    'Reembolso predeterminado a trabajadores del proyecto',
    'Reembolso padrão aos trabalhadores do projeto',
  ],
  'Use existing person policies': [
    'Usar las políticas existentes por persona',
    'Usar as políticas existentes por pessoa',
  ],
  'Reimburse worker at cost': [
    'Reembolsar al trabajador al coste',
    'Reembolsar o trabalhador pelo custo',
  ],
  'Do not reimburse worker': ['No reembolsar al trabajador', 'Não reembolsar o trabalhador'],
  'Save project reimbursement default': [
    'Guardar reembolso predeterminado del proyecto',
    'Salvar reembolso padrão do projeto',
  ],
  'Worker reimbursement overrides': [
    'Excepciones de reembolso por trabajador',
    'Exceções de reembolso por trabalhador',
  ],
  'Worker reimbursement override': [
    'Excepción de reembolso del trabajador',
    'Exceção de reembolso do trabalhador',
  ],
  'Use project default': ['Usar el valor predeterminado del proyecto', 'Usar o padrão do projeto'],
  'Reimburse this worker at cost': [
    'Reembolsar a este trabajador al coste',
    'Reembolsar este trabalhador pelo custo',
  ],
  'Do not reimburse this worker': [
    'No reembolsar a este trabajador',
    'Não reembolsar este trabalhador',
  ],
  'Save worker override': ['Guardar excepción del trabajador', 'Salvar exceção do trabalhador'],
  'Worker reimbursement if no project default': [
    'Reembolso al trabajador si el proyecto no tiene valor predeterminado',
    'Reembolso ao trabalhador se o projeto não tiver padrão',
  ],
  'Do not bill customer (worker may still be reimbursed)': [
    'No facturar al cliente (el trabajador aún puede recibir reembolso)',
    'Não faturar ao cliente (o trabalhador ainda pode ser reembolsado)',
  ],
  'Set who pays expenses and how the customer is charged. Worker reimbursement follows the project default unless Finance sets a person override.':
    [
      'Define quién paga los gastos y cómo se cobran al cliente. El reembolso al trabajador sigue el valor predeterminado del proyecto, salvo que Finanzas configure una excepción por persona.',
      'Defina quem paga as despesas e como são cobradas ao cliente. O reembolso ao trabalhador segue o padrão do projeto, salvo se Finanças configurar uma exceção por pessoa.',
    ],
  'Choose how approved hours and customer-chargeable expenses become invoices. Worker reimbursement follows the project default unless a person override is set in Finance; customer expense charges remain separate.':
    [
      'Elige cómo se facturan las horas aprobadas y los gastos cobrables al cliente. El reembolso al trabajador sigue el valor predeterminado del proyecto, salvo que Finanzas configure una excepción por persona; los cargos al cliente se mantienen por separado.',
      'Escolha como as horas aprovadas e as despesas cobráveis ao cliente entram nas faturas. O reembolso ao trabalhador segue o padrão do projeto, salvo se Finanças configurar uma exceção por pessoa; os encargos ao cliente permanecem separados.',
    ],
  'To stop reimbursing worker-paid claims, set the project default or a person override in Finance.':
    [
      'Para dejar de reembolsar gastos pagados por un trabajador, configura el valor predeterminado del proyecto o una excepción por persona en Finanzas.',
      'Para deixar de reembolsar despesas pagas por um trabalhador, configure o padrão do projeto ou uma exceção por pessoa em Finanças.',
    ],
  'Choose separately whether the worker is reimbursed and whether the customer pays. Rules apply by person, payer, category, and expense date.':
    [
      'Elige por separado si se reembolsa al trabajador y si paga el cliente. Las reglas se aplican por persona, pagador, categoría y fecha del gasto.',
      'Escolha separadamente se o trabalhador é reembolsado e se o cliente paga. As regras se aplicam por pessoa, pagador, categoria e data da despesa.',
    ],
  'Assigned person': ['Persona asignada', 'Pessoa designada'],
  'Select person': ['Seleccionar persona', 'Selecionar pessoa'],
  'Who paid': ['Quién pagó', 'Quem pagou'],
  'Company card': ['Tarjeta de empresa', 'Cartão da empresa'],
  'Company direct': ['Pago directo de la empresa', 'Pagamento direto da empresa'],
  'Third party': ['Tercero', 'Terceiro'],
  'Expense category': ['Categoría del gasto', 'Categoria da despesa'],
  'Leave blank for all categories.': [
    'Déjalo en blanco para todas las categorías.',
    'Deixe em branco para todas as categorias.',
  ],
  'Worker reimbursement': ['Reembolso al trabajador', 'Reembolso ao trabalhador'],
  'Reimburse at cost': ['Reembolsar el coste', 'Reembolsar pelo custo'],
  'Do not reimburse': ['No reembolsar', 'Não reembolsar'],
  'Customer expense recovery': ['Cobro del gasto al cliente', 'Cobrança da despesa ao cliente'],
  'Bill at cost': ['Facturar al coste', 'Faturar pelo custo'],
  'Bill with markup': ['Facturar con recargo', 'Faturar com acréscimo'],
  'Included in labor price': [
    'Incluido en el precio de la mano de obra',
    'Incluído no preço da mão de obra',
  ],
  'Do not bill customer': ['No facturar al cliente', 'Não faturar ao cliente'],
  'Customer paid directly': ['Pagado directamente por el cliente', 'Pago diretamente pelo cliente'],
  'Markup (basis points)': ['Recargo (puntos básicos)', 'Acréscimo (pontos-base)'],
  'Required only for bill with markup; 1000 means 10%.': [
    'Sólo se exige al facturar con recargo; 1000 equivale al 10 %.',
    'Exigido apenas ao faturar com acréscimo; 1000 equivale a 10%.',
  ],
  'Save person expense policy': [
    'Guardar política de gastos de la persona',
    'Salvar política de despesas da pessoa',
  ],
  'Person expense policy history': [
    'Historial de políticas de gastos por persona',
    'Histórico de políticas de despesas por pessoa',
  ],
  'Select a project with an assigned person to configure expense policy.': [
    'Selecciona un proyecto con una persona asignada para configurar la política de gastos.',
    'Selecione um projeto com uma pessoa designada para configurar a política de despesas.',
  ],
  'No person expense policies are configured for this project.': [
    'Este proyecto no tiene políticas de gastos por persona configuradas.',
    'Este projeto não tem políticas de despesas por pessoa configuradas.',
  ],
  'Configured person expense policy': [
    'Política de gastos configurada para la persona',
    'Política de despesas configurada para a pessoa',
  ],
  'Worker amount': ['Importe para el trabajador', 'Valor para o trabalhador'],
  'Customer amount': ['Importe para el cliente', 'Valor para o cliente'],
  'Expense policy configuration required': [
    'Es necesario configurar la política de gastos',
    'É necessário configurar a política de despesas',
  ],
  'No matching policy': ['No hay una política aplicable', 'Não há uma política aplicável'],
  'No project assignment covers this expense date.': [
    'Ninguna asignación al proyecto cubre la fecha de este gasto.',
    'Nenhuma atribuição ao projeto cobre a data desta despesa.',
  ],
  'Multiple project assignments cover this expense date.': [
    'Hay varias asignaciones al proyecto para la fecha de este gasto.',
    'Há várias atribuições ao projeto para a data desta despesa.',
  ],
  'No person expense policy matches this payer, category and expense date.': [
    'Ninguna política de gastos de la persona coincide con el pagador, la categoría y la fecha de este gasto.',
    'Nenhuma política de despesas da pessoa corresponde ao pagador, à categoria e à data desta despesa.',
  ],
  'This expense is no longer available.': [
    'Este gasto ya no está disponible.',
    'Esta despesa já não está disponível.',
  ],
  'Expense currency conversion is required before classification.': [
    'Es necesario convertir la moneda del gasto antes de clasificarlo.',
    'É necessário converter a moeda da despesa antes de classificá-la.',
  ],
  'Expense policy needs review.': [
    'Hay que revisar la política de gastos.',
    'É necessário revisar a política de despesas.',
  ],
  'Configure person expense policy': [
    'Configurar política de gastos de la persona',
    'Configurar política de despesas da pessoa',
  ],
  'Override this expense policy': [
    'Aplicar una excepción a esta política de gastos',
    'Aplicar uma exceção a esta política de despesas',
  ],
  'One-time customer treatment': [
    'Tratamiento excepcional para el cliente',
    'Tratamento excepcional para o cliente',
  ],
  'Allowance per diem': ['Dieta diaria', 'Ajuda de custo diária'],
  'Informational only': ['Sólo informativo', 'Somente informativo'],
  'One-time markup (basis points)': [
    'Recargo excepcional (puntos básicos)',
    'Acréscimo excepcional (pontos-base)',
  ],
};

export const extractedSectionCoverageKeys = Object.keys(extractedSectionCoverageOverrides);
