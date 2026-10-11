import type { PortalLocale } from '$lib/portal-i18n';

const copy = {
  work: ['Work and invoices', 'Trabajo y facturas', 'Trabalho e faturas'],
  conditions: ['Team and conditions', 'Equipo y condiciones', 'Equipe e condições'],
  records: ['Choose hours and expenses', 'Elige horas y gastos', 'Escolha horas e despesas'],
  intro: [
    'Choose the actual records to invoice. Approve pending records here, review the calculated amount and save your draft.',
    'Elige los registros reales que quieres facturar. Aprueba aquí los pendientes, revisa el importe calculado y guarda el borrador.',
    'Escolha os registros reais a faturar. Aprove aqui os pendentes, confira o valor calculado e salve o rascunho.',
  ],
  stream: ['What to invoice', 'Qué quieres facturar', 'O que faturar'],
  labor: ['Hours', 'Horas', 'Horas'],
  expense: ['Expenses', 'Gastos', 'Despesas'],
  combined: ['Hours and expenses together', 'Horas y gastos juntos', 'Horas e despesas juntas'],
  start: ['From', 'Desde', 'Desde'],
  end: ['Through (included)', 'Hasta (incluido)', 'Até (incluído)'],
  issuerUntil: ['Valid until (optional)', 'Vigente hasta (opcional)', 'Válido até (opcional)'],
  load: ['Show records', 'Mostrar registros', 'Mostrar registros'],
  loading: ['Loading…', 'Cargando…', 'Carregando…'],
  changed: [
    'Dates adjusted to this billing cycle:',
    'Fechas ajustadas al ciclo de facturación:',
    'Datas ajustadas ao ciclo de faturamento:',
  ],
  worker: ['Worker', 'Trabajador', 'Trabalhador'],
  allWorkers: ['All workers', 'Todos los trabajadores', 'Todos os trabalhadores'],
  state: ['Show', 'Mostrar', 'Mostrar'],
  all: ['All records', 'Todos los registros', 'Todos os registros'],
  pending: ['Pending approval', 'Pendientes de aprobación', 'Aprovação pendente'],
  ready: ['Ready to invoice', 'Listos para facturar', 'Prontos para faturar'],
  billed: ['In a draft or invoiced', 'En borrador o facturados', 'Em rascunho ou faturados'],
  linkedInvoices: [
    'Drafts and invoices containing these records',
    'Borradores y facturas que incluyen estos registros',
    'Rascunhos e faturas que incluem estes registros',
  ],
  viewDraft: ['View draft', 'Ver borrador', 'Ver rascunho'],
  draftLabel: ['Draft', 'Borrador', 'Rascunho'],
  invoiceLabel: ['Invoice', 'Factura', 'Fatura'],
  viewInvoice: ['View invoice', 'Ver factura', 'Ver fatura'],
  editDraft: ['Edit draft', 'Editar borrador', 'Editar rascunho'],
  discardDraft: ['Discard draft', 'Eliminar borrador', 'Eliminar rascunho'],
  discardReason: ['Reason for discarding', 'Motivo de la eliminación', 'Motivo da eliminação'],
  discardExplanation: [
    'Discarding this unissued draft releases its records so you can invoice them again. Issued invoices are retained.',
    'Eliminar este borrador sin emitir libera sus registros para que puedas volver a facturarlos. Las facturas emitidas se conservan.',
    'Eliminar este rascunho não emitido libera seus registros para faturá-los novamente. As faturas emitidas são mantidas.',
  ],
  discardConfirm: ['Confirm discard', 'Confirmar eliminación', 'Confirmar eliminação'],
  draftDiscarded: [
    'Draft discarded. Its records are available again.',
    'Borrador eliminado. Sus registros vuelven a estar disponibles.',
    'Rascunho eliminado. Seus registros estão disponíveis novamente.',
  ],
  linkedDraft: ['Included in this draft', 'Incluido en este borrador', 'Incluído neste rascunho'],
  linkedApproved: [
    'Included in this approved draft',
    'Incluido en este borrador aprobado',
    'Incluído neste rascunho aprovado',
  ],
  linkedIssued: ['Included in this invoice', 'Incluido en esta factura', 'Incluído nesta fatura'],
  select: [
    'Select visible records',
    'Seleccionar registros visibles',
    'Selecionar registros visíveis',
  ],
  clear: ['Clear selection', 'Quitar selección', 'Limpar seleção'],
  selected: ['Selected records', 'Registros seleccionados', 'Registros selecionados'],
  approve: [
    'Approve selected pending records',
    'Aprobar los pendientes seleccionados',
    'Aprovar os pendentes selecionados',
  ],
  approveHelp: [
    'Owner approval also accepts the financial review. Finance can review records already approved operationally.',
    'La aprobación del propietario también acepta la revisión financiera. Finanzas puede revisar registros ya aprobados operativamente.',
    'A aprovação do proprietário também aceita a revisão financeira. Finanças pode revisar registros já aprovados operacionalmente.',
  ],
  preview: ['Calculate invoice', 'Calcular factura', 'Calcular fatura'],
  save: ['Save invoice draft', 'Guardar borrador de factura', 'Salvar rascunho da fatura'],
  empty: [
    'No records in these dates. Change the dates or add actual hours or expenses to this project.',
    'No hay registros en estas fechas. Cambia las fechas o añade horas o gastos reales a este proyecto.',
    'Não há registros nestas datas. Altere as datas ou adicione horas ou despesas reais neste projeto.',
  ],
  none: [
    'Select at least one record to continue.',
    'Selecciona al menos un registro para continuar.',
    'Selecione pelo menos um registro para continuar.',
  ],
  noStream: [
    'Configure the project billing conditions first. Your recorded work stays available.',
    'Configura primero las condiciones de facturación del proyecto. Los registros de trabajo se conservan.',
    'Configure primeiro as condições de faturamento do projeto. Os registros de trabalho são preservados.',
  ],
  setup: [
    'Set up project billing',
    'Configurar la facturación del proyecto',
    'Configurar o faturamento do projeto',
  ],
  total: ['Total', 'Total', 'Total'],
  subtotal: ['Before tax', 'Antes de impuestos', 'Antes dos impostos'],
  tax: ['Tax', 'Impuestos', 'Impostos'],
  previewHelp: [
    'Amounts are calculated from the selected records and effective project conditions. Internal costs and worker payments are separate.',
    'Los importes se calculan con los registros seleccionados y las condiciones vigentes. Los costes internos y los pagos a trabajadores son independientes.',
    'Os valores são calculados com os registros selecionados e as condições vigentes. Custos internos e pagamentos aos trabalhadores são independentes.',
  ],
  draft: [
    'Draft saved for this client',
    'Borrador guardado para este cliente',
    'Rascunho salvo para este cliente',
  ],
  open: ['Open and edit invoice', 'Abrir y editar factura', 'Abrir e editar fatura'],
  issue: ['Approve and issue invoice', 'Aprobar y emitir factura', 'Aprovar e emitir fatura'],
  issueHelp: [
    'Issue registers an immutable numbered invoice. The PDF is generated automatically; sending and payments remain explicit actions.',
    'Emitir registra una factura numerada e inmutable. El PDF se genera automáticamente; el envío y los cobros siguen siendo acciones explícitas.',
    'Emitir registra uma fatura numerada e imutável. O PDF é gerado automaticamente; envio e recebimentos continuam sendo ações explícitas.',
  ],
  issued: ['Invoice issued', 'Factura emitida', 'Fatura emitida'],
  pdf: ['Download PDF', 'Descargar PDF', 'Baixar PDF'],
  pdfPending: ['Generating PDF…', 'Generando PDF…', 'Gerando PDF…'],
  pdfFailed: [
    'PDF generation failed. Open Billing to retry.',
    'Ha fallado la generación del PDF. Abre Facturación para reintentar.',
    'A geração do PDF falhou. Abra Faturamento para tentar novamente.',
  ],
  another: ['Prepare another invoice', 'Preparar otra factura', 'Preparar outra fatura'],
  missingIssue: ['Needed to issue', 'Falta para emitir', 'Falta para emitir'],
  missingIssueHelp: [
    'You can save a draft while completing these requirements. They must be resolved before issuing.',
    'Puedes guardar el borrador mientras completas estos requisitos. Deben resolverse antes de emitir.',
    'Você pode salvar o rascunho enquanto completa estes requisitos. Eles devem ser resolvidos antes de emitir.',
  ],
  issuer: [
    'Assign the reviewed issuing company',
    'Asignar el emisor revisado',
    'Atribuir o emissor revisado',
  ],
  revision: ['Reviewed issuing company', 'Emisor revisado', 'Emissor revisado'],
  reason: ['Reason', 'Motivo', 'Motivo'],
  assign: ['Save issuing authority', 'Guardar emisor del proyecto', 'Salvar emissor do projeto'],
  noRevision: [
    'There is no reviewed revision for this issuing company and period. Register its verified legal details in Finance.',
    'No hay una revisión del emisor para este período. Registra sus datos legales verificados en Finanzas.',
    'Não há revisão do emissor para este período. Cadastre seus dados legais verificados em Finanças.',
  ],
  registerIssuer: [
    'Review issuing company details',
    'Revisar datos del emisor',
    'Revisar dados do emissor',
  ],
  numbering: [
    'Register approved invoice numbering',
    'Registrar numeración aprobada',
    'Registrar numeração aprovada',
  ],
  numberingHelp: [
    'Enter the numbering agreed with your accountant and its real approval date. This applies to the issue date.',
    'Indica la numeración acordada con tu contable y su fecha real de aprobación. Su vigencia corresponde a la fecha de emisión.',
    'Informe a numeração acordada com seu contador e a data real de aprovação. A vigência corresponde à data de emissão.',
  ],
  prefix: ['Prefix', 'Prefijo', 'Prefixo'],
  digits: ['Digits', 'Dígitos', 'Dígitos'],
  effective: ['Effective from', 'Vigente desde', 'Vigente desde'],
  accountantDate: [
    'Accountant approved at',
    'Aprobado por el contable el',
    'Aprovado pelo contador em',
  ],
  saveNumber: ['Save numbering', 'Guardar numeración', 'Salvar numeração'],
  ownerNumber: [
    'The owner must register the numbering approved by the accountant.',
    'El propietario debe registrar la numeración aprobada por el contable.',
    'O proprietário deve registrar a numeração aprovada pelo contador.',
  ],
  error: [
    'The operation could not be completed. Your selection is retained. Review the message and try again.',
    'No se pudo completar la operación. Tu selección se conserva. Revisa el mensaje y vuelve a intentarlo.',
    'Não foi possível completar a operação. Sua seleção é preservada. Confira a mensagem e tente novamente.',
  ],
  forbidden: [
    'Sign in with an active Owner or Finance account to prepare invoices.',
    'Accede con una cuenta activa de Propietario o Finanzas para preparar facturas.',
    'Entre com uma conta ativa de Proprietário ou Finanças para preparar faturas.',
  ],
  stale: [
    'A selected record has changed. Reload the records before continuing.',
    'Ha cambiado un registro seleccionado. Vuelve a mostrar los registros antes de continuar.',
    'Um registro selecionado mudou. Atualize os registros antes de continuar.',
  ],
  reference: ['Reference', 'Referencia', 'Referência'],
  done: [
    'Saved. Requirements refreshed.',
    'Guardado. Requisitos actualizados.',
    'Salvo. Requisitos atualizados.',
  ],
  group: [
    'These records are billed together under the daily or weekly conditions.',
    'Estos registros se facturan juntos según las condiciones diarias o semanales.',
    'Estes registros são faturados juntos conforme as condições diárias ou semanais.',
  ],
  groupMissing: [
    'This daily/weekly group includes records outside the displayed period. Expand the dates or review the project conditions.',
    'Este grupo diario/semanal incluye registros fuera del período mostrado. Amplía las fechas o revisa las condiciones del proyecto.',
    'Este grupo diário/semanal inclui registros fora do período exibido. Amplie as datas ou revise as condições do projeto.',
  ],
  source_not_billable: [
    'This record is non-billable or excluded by its expense treatment.',
    'Este registro no es facturable o su tratamiento de gasto lo excluye.',
    'Este registro não é faturável ou seu tratamento de despesa o exclui.',
  ],
  source_already_reserved: [
    'This record is already included in a draft or invoice.',
    'Este registro ya está incluido en un borrador o factura.',
    'Este registro já está incluído em um rascunho ou fatura.',
  ],
  complete_client_billing_group_required: [
    'Select the complete daily/weekly group to avoid partial or duplicate charges.',
    'Selecciona el grupo diario/semanal completo para evitar cargos parciales o duplicados.',
    'Selecione o grupo diário/semanal completo para evitar cobranças parciais ou duplicadas.',
  ],
  selection_requires_whole_period_billing: [
    'This fixed-price project must be invoiced as a complete period. Use whole-period billing.',
    'Este proyecto de precio fijo debe facturarse por período completo. Usa la facturación del período completo.',
    'Este projeto de preço fixo deve ser faturado por período completo. Use o faturamento do período completo.',
  ],
  client_daily_minimum_already_billed: [
    'The daily minimum was already charged in another invoice. Review Billing before continuing.',
    'El mínimo diario ya se cobró en otra factura. Revisa Facturación antes de continuar.',
    'O mínimo diário já foi cobrado em outra fatura. Confira Faturamento antes de continuar.',
  ],
  pending_expense_submission: [
    'This expense must be submitted before approval.',
    'Este gasto debe enviarse antes de aprobarlo.',
    'Esta despesa deve ser enviada antes da aprovação.',
  ],
  addHours: ['Log hours', 'Registrar horas', 'Registrar horas'],
  addExpenses: ['Add expense', 'Añadir gasto', 'Adicionar despesa'],
  reports: [
    'Reports and supporting documents',
    'Informes y justificantes',
    'Relatórios e comprovantes',
  ],
  retry: [
    'Retry saving the same draft',
    'Reintentar el mismo guardado',
    'Tentar salvar o mesmo rascunho novamente',
  ],
  uncertain: [
    'The response was interrupted. The draft may already be saved. Retry the same request to recover it without creating a duplicate.',
    'La respuesta se interrumpió. El borrador puede estar guardado. Reintenta la misma solicitud para recuperarlo sin duplicarlo.',
    'A resposta foi interrompida. O rascunho pode estar salvo. Repita a mesma solicitação para recuperá-lo sem duplicar.',
  ],
  addPeople: ['Add people', 'Añadir personas', 'Adicionar pessoas'],
  type: ['Record type', 'Tipo de registro', 'Tipo de registro'],
  allTypes: ['Hours and expenses', 'Horas y gastos', 'Horas e despesas'],
  hidden: [
    'Selected records outside these filters',
    'Seleccionados fuera de estos filtros',
    'Selecionados fora destes filtros',
  ],
  filteredEmpty: [
    'No records match these filters.',
    'No hay registros que coincidan con estos filtros.',
    'Nenhum registro corresponde a estes filtros.',
  ],
  resetFilters: ['Reset filters', 'Restablecer filtros', 'Redefinir filtros'],
  selectionIncludes: [
    'Selection includes linked daily/weekly records.',
    'La selección incluye los registros diarios/semanales vinculados.',
    'A seleção inclui os registros diários/semanais vinculados.',
  ],
  openIssued: ['Open invoice', 'Abrir factura', 'Abrir fatura'],
  approved: ['Invoice approved', 'Factura aprobada', 'Fatura aprovada'],
  solve: ['Resolve', 'Resolver', 'Resolver'],
  source_requires_remaining_period_billing: [
    'Part of this record was invoiced under the project cap. Invoice its remaining amount using whole-period billing.',
    'Una parte de este registro se facturó dentro del límite del proyecto. Factura el importe restante con la facturación del período completo.',
    'Uma parte deste registro foi faturada dentro do limite do projeto. Fature o valor restante usando o faturamento do período completo.',
  ],
  remaining: ['Remaining to invoice', 'Pendiente de facturar', 'Restante a faturar'],
  applyExpense: [
    'Apply configured expense conditions',
    'Aplicar las condiciones configuradas del gasto',
    'Aplicar as condições configuradas da despesa',
  ],
  clientExpense: ['Customer charge', 'Cargo al cliente', 'Cobrança ao cliente'],
  expenseIssuer: [
    'Assign the reviewed issuing company below before applying expense conditions.',
    'Asigna el emisor revisado más abajo antes de aplicar las condiciones del gasto.',
    'Atribua o emissor revisado abaixo antes de aplicar as condições da despesa.',
  ],
  refresh: ['Recalculate this draft', 'Recalcular este borrador', 'Recalcular este rascunho'],
  payments: [
    'Sending and customer payments',
    'Envío y cobros del cliente',
    'Envio e recebimentos do cliente',
  ],
  wholePeriod: [
    'Whole-period or milestone billing',
    'Facturación por período completo o hito',
    'Faturamento por período completo ou marco',
  ],
  cadenceManual: ['Manual', 'Manual', 'Manual'],
  cadenceWeekly: ['Weekly', 'Semanal', 'Semanal'],
  cadenceEvery14Days: ['Every 14 days', 'Cada 14 días', 'A cada 14 dias'],
  cadenceSemiMonthly: ['Semi-monthly', 'Quincenal', 'Semimensal'],
  cadenceMonthly: ['Monthly', 'Mensual', 'Mensal'],
  cadenceCustom: ['Custom cadence', 'Frecuencia personalizada', 'Frequência personalizada'],
  cadenceMilestone: ['Milestone', 'Hito', 'Marco'],
  milestoneStream: ['Milestone', 'Hito', 'Marco'],
  otherStream: ['Other', 'Otro', 'Outro'],
  effectiveInterval: [
    'Effective for this stream',
    'Vigencia de este flujo',
    'Vigência deste fluxo',
  ],
  inclusivePeriodHelp: [
    'The end date is included. Dates are aligned to the selected stream cadence before records are loaded.',
    'La fecha final está incluida. Las fechas se ajustan a la frecuencia seleccionada antes de cargar los registros.',
    'A data final está incluída. As datas são ajustadas à frequência selecionada antes de carregar os registros.',
  ],
  currentBillingPeriod: [
    'Current billing period',
    'Período de facturación actual',
    'Período de faturamento atual',
  ],
  previousBillingPeriod: [
    'Previous billing period',
    'Período de facturación anterior',
    'Período de faturamento anterior',
  ],
  filters: ['Filters', 'Filtros', 'Filtros'],
  projectContext: ['Project context', 'Contexto del proyecto', 'Contexto do projeto'],
  reviewProjectBilling: [
    'Review project billing setup',
    'Revisar la configuración de facturación del proyecto',
    'Revisar a configuração de faturamento do projeto',
  ],
  noRecordsActions: [
    'Add actual work or review records for this project before creating an invoice.',
    'Añade trabajo real o revisa los registros de este proyecto antes de crear una factura.',
    'Adicione trabalho real ou revise os registros deste projeto antes de criar uma fatura.',
  ],
  reviewRecords: ['Review records', 'Revisar registros', 'Revisar registros'],
  creationMode: ['Creation mode', 'Modo de creación', 'Modo de criação'],
  recordMode: ['Choose records', 'Elegir registros', 'Escolher registros'],
  recordModeHelp: [
    'Select approved hours and expenses for this period and review each source before saving the draft.',
    'Selecciona horas y gastos aprobados de este período y revisa cada fuente antes de guardar el borrador.',
    'Selecione horas e despesas aprovadas deste período e revise cada fonte antes de salvar o rascunho.',
  ],
  wholePeriodMode: [
    'Whole period or milestone',
    'Período completo o hito',
    'Período completo ou marco',
  ],
  wholePeriodModeHelp: [
    'Use the configured project amount or milestone flow when the stream requires a complete period.',
    'Usa el importe configurado del proyecto o el flujo de hitos cuando el flujo exige un período completo.',
    'Use o valor configurado do projeto ou o fluxo de marcos quando o fluxo exige um período completo.',
  ],
  draftsAwaitingIssue: [
    'Drafts / awaiting issue',
    'Borradores / pendientes de emisión',
    'Rascunhos / aguardando emissão',
  ],
  servicePeriod: ['Service period', 'Período de servicio', 'Período de serviço'],
  issueAndDue: ['Issue / due', 'Emisión / vencimiento', 'Emissão / vencimento'],
  openInvoice: ['Open invoice', 'Abrir factura', 'Abrir fatura'],
  openProject: [
    'Open project billing',
    'Abrir facturación del proyecto',
    'Abrir faturamento do projeto',
  ],
  downloadReadyPdf: ['Download ready PDF', 'Descargar PDF listo', 'Baixar PDF pronto'],
} as const;
export type JourneyKey = keyof typeof copy;
export function journeyText(locale: PortalLocale, key: JourneyKey): string {
  return copy[key][locale === 'es' ? 1 : locale === 'pt' ? 2 : 0];
}
export function journeyReason(locale: PortalLocale, code: string): string | null {
  return Object.hasOwn(copy, code) ? journeyText(locale, code as JourneyKey) : null;
}
/** Render exact minor units without converting financial values to floating point. */
export function journeyMoney(minor: string, currency: string, locale: PortalLocale): string {
  try {
    const value = BigInt(minor);
    const absolute = value < 0n ? -value : value;
    const whole = new Intl.NumberFormat(locale).format(absolute / 100n);
    return `${value < 0n ? '−' : ''}${whole}${locale === 'en' ? '.' : ','}${String(absolute % 100n).padStart(2, '0')} ${currency}`;
  } catch {
    return '—';
  }
}
