export type ReviewLocale = 'en' | 'es' | 'pt';

export type ReviewCopy = {
  title: string;
  back: string;
  intro: string;
  project: string;
  selectProject: string;
  from: string;
  to: string;
  apply: string;
  choosePeriod: string;
  period: string;
  periodNotAccepted: string;
  noReports: string;
  reportQueue: string;
  reportId: string;
  reportType: string;
  state: string;
  version: string;
  hash: string;
  pdf: string;
  ready: string;
  unavailable: string;
  conformity: string;
  accepted: string;
  signedIssue: string;
  notAccepted: string;
  openReport: string;
  openPdf: string;
  sourceCoverage: string;
  source: string;
  noSources: string;
  followup: string;
  followupForm: string;
  followupHelp: string;
  dispatchHelp: string;
  eventType: string;
  shared: string;
  exported: string;
  awaitingSignatory: string;
  returned: string;
  disputed: string;
  method: string;
  eventDate: string;
  reference: string;
  signatoryName: string;
  reason: string;
  responsible: string;
  nextFollowUp: string;
  retryKey: string;
  latestEvent: string;
  noEvents: string;
  history: string;
  stale: string;
  exactBinding: string;
  record: string;
  recorded: string;
  requiredForDispatch: string;
  requiredForSignatory: string;
  requiredForReturn: string;
  pdfRequired: string;
  dispatchAttestation: string;
  financeReadiness: string;
  financeRestricted: string;
  billingStream: string;
  cadence: string;
  readiness: string;
  readyForBilling: string;
  incomplete: string;
  alreadyClosed: string;
  invoiceDrafts: string;
  noInvoices: string;
  invoice: string;
  sourceReason: string;
  openSource: string;
  cadenceMismatch: string;
  reasonLabels: Record<string, string>;
  followupTypes: Record<string, string>;
  eventDateShort: string;
  noFinanceAmounts: string;
  sourceIdsBelong: string;
};

const en: ReviewCopy = {
  title: 'Period review and customer follow-up',
  back: 'Back to Reports',
  intro:
    'Review customer report versions, source coverage, billing readiness and private operational follow-up for one project period.',
  project: 'Project',
  selectProject: 'Select a project',
  from: 'Period start',
  to: 'Period end',
  apply: 'Review period',
  choosePeriod: 'Choose a project and exact date range to load the review queue.',
  period: 'Project period',
  periodNotAccepted:
    'Acceptance is derived per exact customer report and its signed evidence. This period is not accepted as a whole.',
  noReports: 'No customer reports cover this project period.',
  reportQueue: 'Customer report queue',
  reportId: 'Report ID',
  reportType: 'Report type',
  state: 'Report state',
  version: 'Snapshot version',
  hash: 'Snapshot SHA-256',
  pdf: 'Customer PDF',
  ready: 'Ready',
  unavailable: 'Unavailable',
  conformity: 'Customer conformity',
  accepted: 'Accepted for this report',
  signedIssue: 'Signed evidence needs review',
  notAccepted: 'Not accepted',
  openReport: 'Open report',
  openPdf: 'Open customer PDF',
  sourceCoverage: 'Source coverage',
  source: 'Source',
  noSources: 'No authorized source links are attached to this report.',
  followup: 'Operational follow-up',
  followupForm: 'Record follow-up event',
  followupHelp:
    'Events are append-only, private to staff and bound to the exact report version and hash shown here.',
  dispatchHelp:
    'Shared/exported records are user-attested dispatch records. The app does not send customer email.',
  eventType: 'Event type',
  shared: 'Shared',
  exported: 'Exported',
  awaitingSignatory: 'Awaiting named signatory',
  returned: 'Returned',
  disputed: 'Disputed',
  method: 'Dispatch method',
  eventDate: 'Dispatch date',
  reference: 'Dispatch reference',
  signatoryName: 'Named signatory',
  reason: 'Reason',
  responsible: 'Responsible staff member',
  nextFollowUp: 'Next follow-up date',
  retryKey: 'Retry key',
  latestEvent: 'Latest event',
  noEvents: 'No follow-up events have been recorded.',
  history: 'Full follow-up history',
  stale: 'Stale: this event belongs to an older report version.',
  exactBinding: 'Exact version and hash binding',
  record: 'Record event',
  recorded: 'Follow-up recorded.',
  requiredForDispatch: 'Required for shared or exported events.',
  requiredForSignatory: 'Required when awaiting a named signatory.',
  requiredForReturn: 'Required for returned or disputed events.',
  pdfRequired: 'A current ready customer PDF is required before dispatch or signatory events.',
  dispatchAttestation:
    'This records what staff did. It is not signature evidence and does not grant approval permission.',
  financeReadiness: 'Finance billing readiness',
  financeRestricted: 'No finance amounts or billing details are shown here.',
  billingStream: 'Billing stream',
  cadence: 'Configured cadence',
  readiness: 'Readiness',
  readyForBilling: 'Ready for billing',
  incomplete: 'Blocked by readiness checks',
  alreadyClosed: 'Already closed',
  invoiceDrafts: 'Invoice drafts for this project period',
  noInvoices: 'No invoice drafts cover this project period.',
  invoice: 'Invoice',
  sourceReason: 'Source reason',
  openSource: 'Open source',
  cadenceMismatch: 'The selected dates do not match the configured billing cadence.',
  reasonLabels: {
    missing_tax_profile: 'Tax profile is missing.',
    missing_legal_entity: 'Legal entity is missing.',
    period_cutoff_mismatch: 'Selected period does not match the configured billing cadence.',
    invalid_period_configuration: 'Billing period configuration is invalid.',
    pending_time_approval: 'A time source is still awaiting approval.',
    pending_time_correction: 'A time correction is still open.',
    missing_client_rate: 'A client rate is missing for a source.',
    missing_internal_cost: 'An internal cost is missing for a source.',
    missing_compensation_rule: 'A compensation rule is missing for a source.',
    missing_approved_daily_report: 'An approved daily report is missing.',
    missing_approved_technical_report: 'An approved technical report is missing.',
    pending_expense_approval: 'An expense is still awaiting finance approval.',
    pending_expense_correction: 'An expense correction is still open.',
    missing_receipt: 'A required receipt is missing.',
    missing_expense_currency_conversion: 'Expense currency conversion is missing.',
    missing_fixed_price: 'A fixed price is missing.',
    cap_exhausted: 'The configured billing cap is exhausted.',
  },
  followupTypes: {
    shared: 'Shared',
    exported: 'Exported',
    awaiting_signatory: 'Awaiting named signatory',
    returned: 'Returned',
    disputed: 'Disputed',
  },
  eventDateShort: 'Event date',
  noFinanceAmounts: 'No finance amounts or billing details are shown here.',
  sourceIdsBelong: 'Source IDs and links are restricted to this authorized project.',
};

const es: ReviewCopy = {
  ...en,
  title: 'Revisión del período y seguimiento del cliente',
  back: 'Volver a Informes',
  intro:
    'Revise las versiones del informe del cliente, las fuentes, la preparación de facturación y el seguimiento operativo privado de un período.',
  project: 'Proyecto',
  selectProject: 'Seleccionar proyecto',
  from: 'Inicio del período',
  to: 'Fin del período',
  apply: 'Revisar período',
  choosePeriod: 'Seleccione un proyecto y un intervalo exacto para cargar la cola de revisión.',
  period: 'Período del proyecto',
  periodNotAccepted:
    'La aceptación se deriva para cada informe exacto y su evidencia firmada. Este período no se acepta como un todo.',
  noReports: 'No hay informes de cliente que cubran este período.',
  reportQueue: 'Cola de informes del cliente',
  reportId: 'ID del informe',
  reportType: 'Tipo de informe',
  state: 'Estado del informe',
  version: 'Versión de la instantánea',
  hash: 'SHA-256 de la instantánea',
  pdf: 'PDF del cliente',
  ready: 'Listo',
  unavailable: 'No disponible',
  conformity: 'Conformidad del cliente',
  accepted: 'Aceptado para este informe',
  signedIssue: 'La evidencia firmada necesita revisión',
  notAccepted: 'No aceptado',
  openReport: 'Abrir informe',
  openPdf: 'Abrir PDF del cliente',
  sourceCoverage: 'Cobertura de fuentes',
  source: 'Fuente',
  noSources: 'No hay enlaces de fuentes autorizadas en este informe.',
  followup: 'Seguimiento operativo',
  followupForm: 'Registrar evento de seguimiento',
  followupHelp:
    'Los eventos son de solo adición, privados para el personal y están ligados a la versión y al hash exactos mostrados.',
  dispatchHelp:
    'Compartido/exportado son registros de despacho declarados por el usuario. La aplicación no envía correo al cliente.',
  eventType: 'Tipo de evento',
  shared: 'Compartido',
  exported: 'Exportado',
  awaitingSignatory: 'Esperando firmante nombrado',
  returned: 'Devuelto',
  disputed: 'Disputado',
  method: 'Método de despacho',
  eventDate: 'Fecha de despacho',
  reference: 'Referencia de despacho',
  signatoryName: 'Firmante nombrado',
  reason: 'Motivo',
  responsible: 'Responsable',
  nextFollowUp: 'Próxima fecha de seguimiento',
  retryKey: 'Clave de reintento',
  latestEvent: 'Último evento',
  noEvents: 'No se han registrado eventos de seguimiento.',
  history: 'Historial completo de seguimiento',
  stale: 'Obsoleto: este evento pertenece a una versión anterior del informe.',
  exactBinding: 'Vinculación exacta de versión y hash',
  record: 'Registrar evento',
  recorded: 'Seguimiento registrado.',
  requiredForDispatch: 'Obligatorio para eventos compartidos o exportados.',
  requiredForSignatory: 'Obligatorio al esperar un firmante nombrado.',
  requiredForReturn: 'Obligatorio para eventos devueltos o disputados.',
  pdfRequired: 'Se necesita un PDF actual y listo antes de eventos de despacho o firma.',
  dispatchAttestation:
    'Registra lo que hizo el personal. No es evidencia de firma ni concede permiso de aprobación.',
  financeReadiness: 'Preparación financiera de facturación',
  financeRestricted: 'Aquí no se muestran importes ni detalles de facturación.',
  billingStream: 'Flujo de facturación',
  cadence: 'Frecuencia configurada',
  readiness: 'Preparación',
  readyForBilling: 'Listo para facturar',
  incomplete: 'Bloqueado por comprobaciones de preparación',
  alreadyClosed: 'Ya cerrado',
  invoiceDrafts: 'Borradores de factura del período',
  noInvoices: 'No hay borradores de factura para este período.',
  invoice: 'Factura',
  sourceReason: 'Motivo de fuente',
  openSource: 'Abrir fuente',
  cadenceMismatch: 'Las fechas seleccionadas no coinciden con la frecuencia configurada.',
  eventDateShort: 'Fecha del evento',
  noFinanceAmounts: 'Aquí no se muestran importes ni detalles de facturación.',
  sourceIdsBelong: 'Los ID y enlaces de fuente están limitados a este proyecto autorizado.',
  reasonLabels: {
    ...en.reasonLabels,
    missing_tax_profile: 'Falta el perfil fiscal.',
    missing_legal_entity: 'Falta la entidad legal.',
    period_cutoff_mismatch: 'El período no coincide con la frecuencia de facturación configurada.',
    pending_time_approval: 'Una fuente de tiempo espera aprobación.',
    missing_client_rate: 'Falta la tarifa del cliente para una fuente.',
    missing_internal_cost: 'Falta el coste interno para una fuente.',
    missing_compensation_rule: 'Falta una regla de compensación para una fuente.',
    missing_receipt: 'Falta un recibo obligatorio.',
  },
  followupTypes: {
    shared: 'Compartido',
    exported: 'Exportado',
    awaiting_signatory: 'Esperando firmante nombrado',
    returned: 'Devuelto',
    disputed: 'Disputado',
  },
};

const pt: ReviewCopy = {
  ...en,
  title: 'Revisão do período e acompanhamento do cliente',
  back: 'Voltar aos relatórios',
  intro:
    'Revise versões do relatório do cliente, cobertura de fontes, prontidão de faturamento e acompanhamento operacional privado de um período.',
  project: 'Projeto',
  selectProject: 'Selecionar projeto',
  from: 'Início do período',
  to: 'Fim do período',
  apply: 'Revisar período',
  choosePeriod: 'Escolha um projeto e um intervalo exato para carregar a fila de revisão.',
  period: 'Período do projeto',
  periodNotAccepted:
    'A aceitação é derivada para cada relatório exato e sua evidência assinada. Este período não é aceito como um todo.',
  noReports: 'Nenhum relatório do cliente cobre este período.',
  reportQueue: 'Fila de relatórios do cliente',
  reportId: 'ID do relatório',
  reportType: 'Tipo de relatório',
  state: 'Estado do relatório',
  version: 'Versão do snapshot',
  hash: 'SHA-256 do snapshot',
  pdf: 'PDF do cliente',
  ready: 'Pronto',
  unavailable: 'Indisponível',
  conformity: 'Conformidade do cliente',
  accepted: 'Aceito para este relatório',
  signedIssue: 'A evidência assinada precisa de revisão',
  notAccepted: 'Não aceito',
  openReport: 'Abrir relatório',
  openPdf: 'Abrir PDF do cliente',
  sourceCoverage: 'Cobertura de fontes',
  source: 'Fonte',
  noSources: 'Nenhum link de fonte autorizado está anexado a este relatório.',
  followup: 'Acompanhamento operacional',
  followupForm: 'Registrar evento de acompanhamento',
  followupHelp:
    'Os eventos são somente de acréscimo, privados para a equipe e vinculados à versão e ao hash exatos mostrados.',
  dispatchHelp:
    'Compartilhado/exportado são registros de despacho declarados pelo usuário. O aplicativo não envia e-mail ao cliente.',
  eventType: 'Tipo de evento',
  shared: 'Compartilhado',
  exported: 'Exportado',
  awaitingSignatory: 'Aguardando signatário nomeado',
  returned: 'Devolvido',
  disputed: 'Contestado',
  method: 'Método de despacho',
  eventDate: 'Data do despacho',
  reference: 'Referência do despacho',
  signatoryName: 'Signatário nomeado',
  reason: 'Motivo',
  responsible: 'Responsável',
  nextFollowUp: 'Próxima data de acompanhamento',
  retryKey: 'Chave de tentativa',
  latestEvent: 'Evento mais recente',
  noEvents: 'Nenhum evento de acompanhamento foi registrado.',
  history: 'Histórico completo de acompanhamento',
  stale: 'Desatualizado: este evento pertence a uma versão anterior do relatório.',
  exactBinding: 'Vínculo exato de versão e hash',
  record: 'Registrar evento',
  recorded: 'Acompanhamento registrado.',
  requiredForDispatch: 'Obrigatório para eventos compartilhados ou exportados.',
  requiredForSignatory: 'Obrigatório ao aguardar um signatário nomeado.',
  requiredForReturn: 'Obrigatório para eventos devolvidos ou contestados.',
  pdfRequired: 'Um PDF atual e pronto é obrigatório antes de eventos de despacho ou assinatura.',
  dispatchAttestation:
    'Registra o que a equipe fez. Não é evidência de assinatura nem concede permissão de aprovação.',
  financeReadiness: 'Prontidão financeira para faturamento',
  financeRestricted: 'Nenhum valor ou detalhe de faturamento é mostrado aqui.',
  billingStream: 'Fluxo de faturamento',
  cadence: 'Cadência configurada',
  readiness: 'Prontidão',
  readyForBilling: 'Pronto para faturar',
  incomplete: 'Bloqueado pelas verificações de prontidão',
  alreadyClosed: 'Já fechado',
  invoiceDrafts: 'Rascunhos de fatura do período',
  noInvoices: 'Nenhum rascunho de fatura cobre este período.',
  invoice: 'Fatura',
  sourceReason: 'Motivo da fonte',
  openSource: 'Abrir fonte',
  cadenceMismatch: 'As datas selecionadas não correspondem à cadência de faturamento configurada.',
  eventDateShort: 'Data do evento',
  noFinanceAmounts: 'Nenhum valor ou detalhe de faturamento é mostrado aqui.',
  sourceIdsBelong: 'IDs e links de fontes são restritos a este projeto autorizado.',
  reasonLabels: {
    ...en.reasonLabels,
    missing_tax_profile: 'O perfil fiscal está ausente.',
    missing_legal_entity: 'A entidade legal está ausente.',
    period_cutoff_mismatch: 'O período não corresponde à cadência de faturamento configurada.',
    pending_time_approval: 'Uma fonte de tempo aguarda aprovação.',
    missing_client_rate: 'A tarifa do cliente está ausente para uma fonte.',
    missing_internal_cost: 'O custo interno está ausente para uma fonte.',
    missing_compensation_rule: 'A regra de remuneração está ausente para uma fonte.',
    missing_receipt: 'Um recibo obrigatório está ausente.',
  },
  followupTypes: {
    shared: 'Compartilhado',
    exported: 'Exportado',
    awaiting_signatory: 'Aguardando signatário nomeado',
    returned: 'Devolvido',
    disputed: 'Contestado',
  },
};

export const reviewCopy: Record<ReviewLocale, ReviewCopy> = { en, es, pt };
