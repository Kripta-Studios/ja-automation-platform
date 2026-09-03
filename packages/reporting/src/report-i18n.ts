/**
 * Controlled copy for report renderers.
 *
 * Report snapshots contain both controlled values (statuses, metric keys and
 * calculation-basis codes) and source-record content entered by a customer or
 * engineer.  Only the former belongs in this catalog.  The renderers call the
 * helpers below for controlled values and escape/render source text verbatim.
 */

export const REPORT_LOCALES = ['en', 'pt', 'es'] as const;
export type ReportLocale = (typeof REPORT_LOCALES)[number];

export type ReportLocaleInput =
  | ReportLocale
  | 'pt-BR'
  | 'pt-br'
  | 'pt_BR'
  | 'es-ES'
  | 'en-US'
  | string;

export function normalizeReportLocale(value: unknown): ReportLocale {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace('_', '-');
  if (normalized === 'pt' || normalized === 'pt-br') return 'pt';
  if (normalized === 'es' || normalized === 'es-es') return 'es';
  return 'en';
}

export function reportLocaleTag(locale: ReportLocaleInput): 'en-US' | 'es-ES' | 'pt-BR' {
  const normalized = normalizeReportLocale(locale);
  return normalized === 'pt' ? 'pt-BR' : normalized === 'es' ? 'es-ES' : 'en-US';
}

export type ReportCopy = Readonly<{
  accountingPack: string;
  totalsByCurrency: string;
  noTotals: string;
  projectPeriodReport: string;
  dailyReports: string;
  technicalRecords: string;
  operationalRecord: string;
  type: string;
  date: string;
  detail: string;
  noReportRecords: string;
  from: string;
  billTo: string;
  invoiceDetail: string;
  description: string;
  amount: string;
  noInvoiceLines: string;
  subtotal: string;
  tax: string;
  total: string;
  noCurrencyBreakdown: string;
  dailyReport: string;
  technicalReport: string;
  technicalChange: string;
  laborDetailedInvoice: string;
  laborSummaryInvoice: string;
  expenseInvoice: string;
  fixedMilestoneInvoice: string;
  creditAdjustment: string;
  actualHours: string;
  approvedHours: string;
  billableHours: string;
  candidateSubtotal: string;
  operationalCandidate: string;
  invoiced: string;
  paid: string;
  receivable: string;
  directCost: string;
  contribution: string;
  contributionMargin: string;
  calculation: string;
  calculationBasis: string;
  sourceRecords: string;
  sourceDaily: string;
  sourceTechnical: string;
  sourceChanges: string;
  sourceTime: string;
  sourceExpenses: string;
  noCalculation: string;
  template: string;
  status: string;
  safetyRelated: string;
  summary: string;
  project: string;
  client: string;
  worker: string;
  siteShift: string;
  tasksCompleted: string;
  problemsFound: string;
  correctiveActions: string;
  clientDecisions: string;
  openItems: string;
  blockers: string;
  nextDayPlan: string;
  customerContact: string;
  downtimeMinutes: string;
  standbyReason: string;
  invoiceRegister: string;
  workerCosts: string;
  expenses: string;
  collections: string;
  legalEntity: string;
  stream: string;
  hours: string;
  vendor: string;
  invoiceNumber: string;
  system: string;
  systemType: string;
  plcPlatform: string;
  controller: string;
  hmiScada: string;
  networkProtocol: string;
  softwareVersion: string;
  programReference: string;
  site: string;
  area: string;
  station: string;
  changeSummary: string;
  problemSymptom: string;
  diagnosisRootCause: string;
  changePerformed: string;
  productionImpact: string;
  validation: string;
  validationResult: string;
  openRisk: string;
  rollbackPlan: string;
  technicalChanges: string;
  recordId: string;
  yes: string;
  no: string;
  currency: string;
  metric: string;
  value: string;
  noTechnicalChanges: string;
}>;

const en: ReportCopy = {
  accountingPack: 'Accounting Pack',
  totalsByCurrency: 'Totals by currency',
  noTotals: 'No totals recorded.',
  projectPeriodReport: 'Project Period Report',
  dailyReports: 'Daily reports',
  technicalRecords: 'Technical records',
  operationalRecord: 'Operational record',
  type: 'Type',
  date: 'Date',
  detail: 'Detail',
  noReportRecords: 'No report records.',
  from: 'From',
  billTo: 'Bill to',
  invoiceDetail: 'Invoice detail',
  description: 'Description',
  amount: 'Amount',
  noInvoiceLines: 'No invoice lines.',
  subtotal: 'Subtotal',
  tax: 'Tax',
  total: 'Total',
  noCurrencyBreakdown: 'No currency breakdown.',
  dailyReport: 'Daily report',
  technicalReport: 'Technical report',
  technicalChange: 'Technical change',
  laborDetailedInvoice: 'Labor Detailed Invoice',
  laborSummaryInvoice: 'Labor Summary Invoice',
  expenseInvoice: 'Expense Invoice',
  fixedMilestoneInvoice: 'Fixed / Milestone Invoice',
  creditAdjustment: 'Credit / Adjustment',
  actualHours: 'Actual hours',
  approvedHours: 'Approved hours',
  billableHours: 'Billable hours',
  candidateSubtotal: 'Calculated bill candidate',
  operationalCandidate: 'Operational value',
  invoiced: 'Already invoiced',
  paid: 'Paid',
  receivable: 'Receivable',
  directCost: 'Direct cost',
  contribution: 'Contribution',
  contributionMargin: 'Contribution margin',
  calculation: 'Calculation basis',
  calculationBasis: 'Basis',
  sourceRecords: 'Source records',
  sourceDaily: 'daily',
  sourceTechnical: 'technical',
  sourceChanges: 'changes',
  sourceTime: 'time',
  sourceExpenses: 'expenses',
  noCalculation: 'No calculated values are available.',
  template: 'Template',
  status: 'Status',
  safetyRelated: 'Safety-related',
  summary: 'Summary',
  project: 'Project',
  client: 'Client',
  worker: 'Worker',
  siteShift: 'Site / shift',
  tasksCompleted: 'Tasks completed',
  problemsFound: 'Problems found',
  correctiveActions: 'Corrective actions',
  clientDecisions: 'Client decisions',
  openItems: 'Open items',
  blockers: 'Blockers',
  nextDayPlan: 'Next-day plan',
  customerContact: 'Customer contact',
  downtimeMinutes: 'Downtime minutes',
  standbyReason: 'Standby reason',
  invoiceRegister: 'Invoice register',
  workerCosts: 'Worker costs',
  expenses: 'Expenses',
  collections: 'Collections',
  legalEntity: 'Legal entity',
  stream: 'Stream',
  hours: 'Hours',
  vendor: 'Vendor',
  invoiceNumber: 'Invoice',
  system: 'System',
  systemType: 'System type',
  plcPlatform: 'PLC platform',
  controller: 'Controller',
  hmiScada: 'HMI / SCADA',
  networkProtocol: 'Network protocol',
  softwareVersion: 'Software version',
  programReference: 'Program reference',
  site: 'Site',
  area: 'Area / line',
  station: 'Station / machine',
  changeSummary: 'Change summary',
  problemSymptom: 'Problem / symptom',
  diagnosisRootCause: 'Diagnosis / root cause',
  changePerformed: 'Change performed',
  productionImpact: 'Production impact',
  validation: 'Validation',
  validationResult: 'Validation result',
  openRisk: 'Open risk',
  rollbackPlan: 'Rollback plan',
  technicalChanges: 'Technical changes',
  recordId: 'Record ID',
  yes: 'Yes',
  no: 'No',
  currency: 'Currency',
  metric: 'Metric',
  value: 'Value',
  noTechnicalChanges: 'No technical changes recorded.',
};

const pt: ReportCopy = {
  accountingPack: 'Pacote Contábil',
  totalsByCurrency: 'Totais por moeda',
  noTotals: 'Nenhum total registrado.',
  projectPeriodReport: 'Relatório Periódico do Projeto',
  dailyReports: 'Relatórios diários',
  technicalRecords: 'Registros técnicos',
  operationalRecord: 'Registro operacional',
  type: 'Tipo',
  date: 'Data',
  detail: 'Detalhe',
  noReportRecords: 'Nenhum registro de relatório.',
  from: 'De',
  billTo: 'Faturar para',
  invoiceDetail: 'Detalhes da fatura',
  description: 'Descrição',
  amount: 'Valor',
  noInvoiceLines: 'Nenhuma linha de fatura.',
  subtotal: 'Subtotal',
  tax: 'Imposto',
  total: 'Total',
  noCurrencyBreakdown: 'Nenhum detalhamento por moeda.',
  dailyReport: 'Relatório diário',
  technicalReport: 'Relatório técnico',
  technicalChange: 'Alteração técnica',
  laborDetailedInvoice: 'Fatura Detalhada de Mão de Obra',
  laborSummaryInvoice: 'Fatura Resumida de Mão de Obra',
  expenseInvoice: 'Fatura de Despesas',
  fixedMilestoneInvoice: 'Fatura Fixa / por Marco',
  creditAdjustment: 'Crédito / Ajuste',
  actualHours: 'Horas reais',
  approvedHours: 'Horas aprovadas',
  billableHours: 'Horas faturáveis',
  candidateSubtotal: 'Candidato de faturamento calculado',
  operationalCandidate: 'Valor operacional',
  invoiced: 'Já faturado',
  paid: 'Recebido',
  receivable: 'A receber',
  directCost: 'Custo direto',
  contribution: 'Contribuição',
  contributionMargin: 'Margem de contribuição',
  calculation: 'Base de cálculo',
  calculationBasis: 'Base',
  sourceRecords: 'Registros de origem',
  sourceDaily: 'diários',
  sourceTechnical: 'técnicos',
  sourceChanges: 'alterações',
  sourceTime: 'horas',
  sourceExpenses: 'despesas',
  noCalculation: 'Não há valores calculados disponíveis.',
  template: 'Modelo',
  status: 'Status',
  safetyRelated: 'Relacionado à segurança',
  summary: 'Resumo',
  project: 'Projeto',
  client: 'Cliente',
  worker: 'Trabalhador',
  siteShift: 'Planta / turno',
  tasksCompleted: 'Tarefas concluídas',
  problemsFound: 'Problemas encontrados',
  correctiveActions: 'Ações corretivas',
  clientDecisions: 'Decisões do cliente',
  openItems: 'Itens em aberto',
  blockers: 'Bloqueios',
  nextDayPlan: 'Plano do dia seguinte',
  customerContact: 'Contato do cliente',
  downtimeMinutes: 'Minutos de parada',
  standbyReason: 'Motivo de espera',
  invoiceRegister: 'Registro de faturas',
  workerCosts: 'Custos dos colaboradores',
  expenses: 'Despesas',
  collections: 'Cobranças',
  legalEntity: 'Entidade legal',
  stream: 'Fluxo',
  hours: 'Horas',
  vendor: 'Fornecedor',
  invoiceNumber: 'Fatura',
  system: 'Sistema',
  systemType: 'Tipo de sistema',
  plcPlatform: 'Plataforma PLC',
  controller: 'Controlador',
  hmiScada: 'HMI / SCADA',
  networkProtocol: 'Protocolo de rede',
  softwareVersion: 'Versão do software',
  programReference: 'Referência do programa',
  site: 'Planta',
  area: 'Área / linha',
  station: 'Estação / máquina',
  changeSummary: 'Resumo da alteração',
  problemSymptom: 'Problema / sintoma',
  diagnosisRootCause: 'Diagnóstico / causa raiz',
  changePerformed: 'Alteração realizada',
  productionImpact: 'Impacto na produção',
  validation: 'Validação',
  validationResult: 'Resultado da validação',
  openRisk: 'Risco em aberto',
  rollbackPlan: 'Plano de reversão',
  technicalChanges: 'Alterações técnicas',
  recordId: 'ID do registro',
  yes: 'Sim',
  no: 'Não',
  currency: 'Moeda',
  metric: 'Métrica',
  value: 'Valor',
  noTechnicalChanges: 'Nenhuma alteração técnica registrada.',
};

const es: ReportCopy = {
  accountingPack: 'Paquete Contable',
  totalsByCurrency: 'Totales por moneda',
  noTotals: 'No hay totales registrados.',
  projectPeriodReport: 'Informe Periódico del Proyecto',
  dailyReports: 'Informes diarios',
  technicalRecords: 'Registros técnicos',
  operationalRecord: 'Registro operativo',
  type: 'Tipo',
  date: 'Fecha',
  detail: 'Detalle',
  noReportRecords: 'No hay registros de informes.',
  from: 'De',
  billTo: 'Facturar a',
  invoiceDetail: 'Detalle de factura',
  description: 'Descripción',
  amount: 'Importe',
  noInvoiceLines: 'No hay líneas de factura.',
  subtotal: 'Subtotal',
  tax: 'Impuesto',
  total: 'Total',
  noCurrencyBreakdown: 'No hay desglose por moneda.',
  dailyReport: 'Informe diario',
  technicalReport: 'Informe técnico',
  technicalChange: 'Cambio técnico',
  laborDetailedInvoice: 'Factura Detallada de Mano de Obra',
  laborSummaryInvoice: 'Factura Resumida de Mano de Obra',
  expenseInvoice: 'Factura de Gastos',
  fixedMilestoneInvoice: 'Factura Fija / por Hito',
  creditAdjustment: 'Crédito / Ajuste',
  actualHours: 'Horas reales',
  approvedHours: 'Horas aprobadas',
  billableHours: 'Horas facturables',
  candidateSubtotal: 'Candidato de facturación calculado',
  operationalCandidate: 'Valor operativo',
  invoiced: 'Ya facturado',
  paid: 'Cobrado',
  receivable: 'Pendiente de cobro',
  directCost: 'Coste directo',
  contribution: 'Contribución',
  contributionMargin: 'Margen de contribución',
  calculation: 'Base de cálculo',
  calculationBasis: 'Base',
  sourceRecords: 'Registros de origen',
  sourceDaily: 'diarios',
  sourceTechnical: 'técnicos',
  sourceChanges: 'cambios',
  sourceTime: 'tiempo',
  sourceExpenses: 'gastos',
  noCalculation: 'No hay valores calculados disponibles.',
  template: 'Plantilla',
  status: 'Estado',
  safetyRelated: 'Relacionado con la seguridad',
  summary: 'Resumen',
  project: 'Proyecto',
  client: 'Cliente',
  worker: 'Trabajador',
  siteShift: 'Planta / turno',
  tasksCompleted: 'Tareas completadas',
  problemsFound: 'Problemas encontrados',
  correctiveActions: 'Acciones correctivas',
  clientDecisions: 'Decisiones del cliente',
  openItems: 'Partidas abiertas',
  blockers: 'Bloqueos',
  nextDayPlan: 'Plan del día siguiente',
  customerContact: 'Contacto del cliente',
  downtimeMinutes: 'Minutos de parada',
  standbyReason: 'Motivo de espera',
  invoiceRegister: 'Registro de facturas',
  workerCosts: 'Costes de trabajadores',
  expenses: 'Gastos',
  collections: 'Cobros',
  legalEntity: 'Entidad legal',
  stream: 'Flujo',
  hours: 'Horas',
  vendor: 'Proveedor',
  invoiceNumber: 'Factura',
  system: 'Sistema',
  systemType: 'Tipo de sistema',
  plcPlatform: 'Plataforma PLC',
  controller: 'Controlador',
  hmiScada: 'HMI / SCADA',
  networkProtocol: 'Protocolo de red',
  softwareVersion: 'Versión de software',
  programReference: 'Referencia del programa',
  site: 'Planta',
  area: 'Área / línea',
  station: 'Estación / máquina',
  changeSummary: 'Resumen del cambio',
  problemSymptom: 'Problema / síntoma',
  diagnosisRootCause: 'Diagnóstico / causa raíz',
  changePerformed: 'Cambio realizado',
  productionImpact: 'Impacto en producción',
  validation: 'Validación',
  validationResult: 'Resultado de validación',
  openRisk: 'Riesgo abierto',
  rollbackPlan: 'Plan de reversión',
  technicalChanges: 'Cambios técnicos',
  recordId: 'ID del registro',
  yes: 'Sí',
  no: 'No',
  currency: 'Moneda',
  metric: 'Métrica',
  value: 'Valor',
  noTechnicalChanges: 'No hay cambios técnicos registrados.',
};

export const reportCopy: Record<ReportLocale, ReportCopy> = { en, pt, es };

const keyOf = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[×·/()+–—-]/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

const statuses: Record<ReportLocale, Record<string, string>> = {
  en: {
    draft: 'Draft',
    submitted: 'Submitted',
    approved: 'Approved',
    needs_changes: 'Needs changes',
    rejected: 'Rejected',
    locked: 'Locked',
    review: 'In review',
    final: 'Final',
    void: 'Voided',
    queued: 'Queued',
    running: 'Generating',
    ready: 'Ready',
    failed: 'Failed',
  },
  pt: {
    draft: 'Rascunho',
    submitted: 'Enviado',
    approved: 'Aprovado',
    needs_changes: 'Precisa de alterações',
    rejected: 'Rejeitado',
    locked: 'Bloqueado',
    review: 'Em revisão',
    final: 'Finalizado',
    void: 'Anulado',
    queued: 'Na fila',
    running: 'Gerando',
    ready: 'Pronto',
    failed: 'Falhou',
  },
  es: {
    draft: 'Borrador',
    submitted: 'Enviado',
    approved: 'Aprobado',
    needs_changes: 'Requiere cambios',
    rejected: 'Rechazado',
    locked: 'Bloqueado',
    review: 'En revisión',
    final: 'Final',
    void: 'Anulado',
    queued: 'En cola',
    running: 'Generando',
    ready: 'Listo',
    failed: 'Fallido',
  },
};

/** Translate a stored lifecycle/artifact state; unknown values are source data and remain intact. */
export function translateReportStatus(value: unknown, locale: ReportLocaleInput): string {
  const key = keyOf(value);
  return statuses[normalizeReportLocale(locale)][key] ?? String(value ?? '');
}

const metricLabels: Record<ReportLocale, Record<string, string>> = {
  en: {
    revenue_minor: 'Revenue',
    cost_minor: 'Cost',
    direct_cost_minor: 'Direct cost',
    approved_cost_minor: 'Approved direct cost',
    contribution_margin_minor: 'Contribution margin',
    contribution_margin_bps: 'Contribution margin',
    invoiced_minor: 'Invoiced',
    paid_minor: 'Paid',
    receivable_minor: 'Receivable',
    labor_revenue_minor: 'Labor revenue',
    expense_revenue_minor: 'Expense revenue',
    milestone_revenue_minor: 'Milestone revenue',
    operational_revenue_candidate_minor: 'Operational revenue candidate',
    candidate_subtotal_minor: 'Calculated bill candidate',
    approved_unbilled_wip_minor: 'Approved unbilled WIP',
    unapproved_wip_minor: 'Unapproved WIP',
    daily_minimum_top_up_minor: 'Daily minimum top-up',
    actual_minutes: 'Actual minutes',
    approved_minutes: 'Approved minutes',
    billable_minutes: 'Billable minutes',
    invoice_count: 'Invoices',
    expense_count: 'Expenses',
    labor_invoiced_minor: 'Labor invoiced',
    expense_invoiced_minor: 'Expense invoiced',
    milestone_other_invoiced_minor: 'Milestone / other invoiced',
    total_invoiced_minor: 'Total invoiced',
    tax_invoiced_minor: 'Tax invoiced',
    gross_invoiced_minor: 'Gross invoiced',
    collected_minor: 'Collected',
    outstanding_minor: 'Outstanding',
    worker_compensation_minor: 'Worker compensation',
    internal_labor_cost_minor: 'Internal labor cost',
    travel_cost_minor: 'Travel cost',
    other_direct_cost_minor: 'Other direct cost',
    contribution_minor: 'Contribution',
    currency: 'Currency',
  },
  pt: {
    revenue_minor: 'Receita',
    cost_minor: 'Custo',
    direct_cost_minor: 'Custo direto',
    approved_cost_minor: 'Custo direto aprovado',
    contribution_margin_minor: 'Margem de contribuição',
    contribution_margin_bps: 'Margem de contribuição',
    invoiced_minor: 'Faturado',
    paid_minor: 'Recebido',
    receivable_minor: 'A receber',
    labor_revenue_minor: 'Receita de mão de obra',
    expense_revenue_minor: 'Receita de despesas',
    milestone_revenue_minor: 'Receita de marcos',
    operational_revenue_candidate_minor: 'Candidato de receita operacional',
    candidate_subtotal_minor: 'Candidato de faturamento calculado',
    approved_unbilled_wip_minor: 'WIP aprovado não faturado',
    unapproved_wip_minor: 'WIP não aprovado',
    daily_minimum_top_up_minor: 'Complemento do mínimo diário',
    actual_minutes: 'Minutos reais',
    approved_minutes: 'Minutos aprovados',
    billable_minutes: 'Minutos faturáveis',
    invoice_count: 'Faturas',
    expense_count: 'Despesas',
    labor_invoiced_minor: 'Mão de obra faturada',
    expense_invoiced_minor: 'Despesas faturadas',
    milestone_other_invoiced_minor: 'Marcos / outros faturados',
    total_invoiced_minor: 'Total faturado',
    tax_invoiced_minor: 'Impostos faturados',
    gross_invoiced_minor: 'Total bruto faturado',
    collected_minor: 'Recebido',
    outstanding_minor: 'Em aberto',
    worker_compensation_minor: 'Remuneração do trabalhador',
    internal_labor_cost_minor: 'Custo interno de mão de obra',
    travel_cost_minor: 'Custo de viagem',
    other_direct_cost_minor: 'Outro custo direto',
    contribution_minor: 'Contribuição',
    currency: 'Moeda',
  },
  es: {
    revenue_minor: 'Ingresos',
    cost_minor: 'Coste',
    direct_cost_minor: 'Coste directo',
    approved_cost_minor: 'Coste directo aprobado',
    contribution_margin_minor: 'Margen de contribución',
    contribution_margin_bps: 'Margen de contribución',
    invoiced_minor: 'Facturado',
    paid_minor: 'Cobrado',
    receivable_minor: 'Pendiente de cobro',
    labor_revenue_minor: 'Ingresos de mano de obra',
    expense_revenue_minor: 'Ingresos de gastos',
    milestone_revenue_minor: 'Ingresos de hitos',
    operational_revenue_candidate_minor: 'Candidato de ingresos operativos',
    candidate_subtotal_minor: 'Candidato de facturación calculado',
    approved_unbilled_wip_minor: 'WIP aprobado no facturado',
    unapproved_wip_minor: 'WIP no aprobado',
    daily_minimum_top_up_minor: 'Complemento del mínimo diario',
    actual_minutes: 'Minutos reales',
    approved_minutes: 'Minutos aprobados',
    billable_minutes: 'Minutos facturables',
    invoice_count: 'Facturas',
    expense_count: 'Gastos',
    labor_invoiced_minor: 'Mano de obra facturada',
    expense_invoiced_minor: 'Gastos facturados',
    milestone_other_invoiced_minor: 'Hitos / otros facturados',
    total_invoiced_minor: 'Total facturado',
    tax_invoiced_minor: 'Impuestos facturados',
    gross_invoiced_minor: 'Total bruto facturado',
    collected_minor: 'Cobrado',
    outstanding_minor: 'Pendiente',
    worker_compensation_minor: 'Compensación del trabajador',
    internal_labor_cost_minor: 'Coste interno de mano de obra',
    travel_cost_minor: 'Coste de viajes',
    other_direct_cost_minor: 'Otro coste directo',
    contribution_minor: 'Contribución',
    currency: 'Moneda',
  },
};

export function translateReportMetric(value: unknown, locale: ReportLocaleInput): string {
  const key = keyOf(value);
  return metricLabels[normalizeReportLocale(locale)][key] ?? String(value ?? '');
}

const calculationBasis: Record<ReportLocale, Record<string, string>> = {
  en: {
    configured_all_in_project_price: 'Configured all-in project price',
    approved_milestones_eligible_for_this_period_and_not_yet_invoiced:
      'Approved milestones eligible for this period and not yet invoiced',
    approved_billable_minutes_effective_client_labor_rates:
      'Approved billable minutes × effective client labor rates',
    approved_reimbursable_expenses_plus_configured_markup:
      'Approved reimbursable expenses plus configured markup',
    approved_milestones_eligible_for_this_period: 'Approved milestones eligible for this period',
  },
  pt: {
    configured_all_in_project_price: 'Preço de projeto all-in configurado',
    approved_milestones_eligible_for_this_period_and_not_yet_invoiced:
      'Marcos aprovados elegíveis para este período e ainda não faturados',
    approved_billable_minutes_effective_client_labor_rates:
      'Minutos faturáveis aprovados × tarifas efetivas de mão de obra do cliente',
    approved_reimbursable_expenses_plus_configured_markup:
      'Despesas reembolsáveis aprovadas mais margem configurada',
    approved_milestones_eligible_for_this_period: 'Marcos aprovados elegíveis para este período',
  },
  es: {
    configured_all_in_project_price: 'Precio de proyecto all-in configurado',
    approved_milestones_eligible_for_this_period_and_not_yet_invoiced:
      'Hitos aprobados elegibles para este periodo y aún no facturados',
    approved_billable_minutes_effective_client_labor_rates:
      'Minutos facturables aprobados × tarifas efectivas de mano de obra del cliente',
    approved_reimbursable_expenses_plus_configured_markup:
      'Gastos reembolsables aprobados más margen configurado',
    approved_milestones_eligible_for_this_period: 'Hitos aprobados elegibles para este periodo',
  },
};

export function translateCalculationBasis(value: unknown, locale: ReportLocaleInput): string {
  const key = keyOf(value);
  return calculationBasis[normalizeReportLocale(locale)][key] ?? String(value ?? '');
}

const calculationTypes: Record<ReportLocale, Record<string, string>> = {
  en: { labor: 'Labor', expense: 'Expense', milestone: 'Milestone', fixed_price: 'Fixed price' },
  pt: { labor: 'Mão de obra', expense: 'Despesa', milestone: 'Marco', fixed_price: 'Preço fixo' },
  es: { labor: 'Mano de obra', expense: 'Gasto', milestone: 'Hito', fixed_price: 'Precio fijo' },
};

export function translateCalculationType(value: unknown, locale: ReportLocaleInput): string {
  const key = keyOf(value);
  return calculationTypes[normalizeReportLocale(locale)][key] ?? String(value ?? '');
}

export function translateReportBoolean(value: unknown, locale: ReportLocaleInput): string {
  const yes =
    value === true || value === 1 || String(value).toLowerCase() === 'true' || value === 'yes';
  return reportCopy[normalizeReportLocale(locale)][yes ? 'yes' : 'no'];
}

export function formatReportDate(value: unknown, locale: ReportLocaleInput): string {
  const text = String(value ?? '');
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/.exec(text);
  if (!match) return text;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat(reportLocaleTag(locale), {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date);
}

export function formatReportInteger(value: unknown, locale: ReportLocaleInput): string {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return String(value ?? '');
  return new Intl.NumberFormat(reportLocaleTag(locale), { maximumFractionDigits: 0 }).format(
    number,
  );
}
