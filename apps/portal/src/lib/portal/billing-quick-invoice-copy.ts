import type { PortalLocale } from '$lib/portal-i18n';

type Triple = readonly [en: string, es: string, pt: string];

const copy = {
  newInvoice: ['New invoice', 'Nueva factura', 'Nova fatura'],
  intro: [
    'Pick a project and dates. You see the exact amount before anything is created.',
    'Elige un proyecto y las fechas. Verás el importe exacto antes de crear nada.',
    'Escolha um projeto e as datas. Você vê o valor exato antes de criar qualquer coisa.',
  ],
  stepProject: ['1. Project', '1. Proyecto', '1. Projeto'],
  stepPeriod: ['2. Dates', '2. Fechas', '2. Datas'],
  stepAmount: ['3. Amount', '3. Importe', '3. Valor'],
  searchProject: ['Project or client', 'Proyecto o cliente', 'Projeto ou cliente'],
  searchPlaceholder: [
    'Type a project number, name or client',
    'Escribe número, nombre o cliente',
    'Digite número, nome ou cliente',
  ],
  noProjects: ['No project matches.', 'Ningún proyecto coincide.', 'Nenhum projeto corresponde.'],
  change: ['Change', 'Cambiar', 'Alterar'],
  noBillingSetup: ['No billing set up', 'Sin facturación configurada', 'Sem faturamento configurado'],
  lastPeriod: ['Last billing period', 'Último periodo', 'Último período'],
  currentPeriod: ['Current period', 'Periodo actual', 'Período atual'],
  thisMonth: ['This month', 'Este mes', 'Este mês'],
  sinceLast: ['Since last invoice', 'Desde la última factura', 'Desde a última fatura'],
  unbilled: ['approved, not invoiced', 'aprobadas sin facturar', 'aprovadas não faturadas'],
  lastMonth: ['Last month', 'Mes pasado', 'Mês passado'],
  thisWeek: ['This week', 'Esta semana', 'Esta semana'],
  lastWeek: ['Last week', 'Semana pasada', 'Semana passada'],
  custom: ['Custom dates', 'Otras fechas', 'Outras datas'],
  from: ['From', 'Desde', 'De'],
  to: ['To (included)', 'Hasta (incluido)', 'Até (incluído)'],
  datesUsed: ['Dates used', 'Fechas usadas', 'Datas usadas'],
  cadence_weekly: ['Billed weekly', 'Se factura semanalmente', 'Faturado semanalmente'],
  cadence_every_14_days: ['Billed every 14 days', 'Se factura cada 14 días', 'Faturado a cada 14 dias'],
  cadence_semi_monthly: ['Billed twice a month', 'Se factura dos veces al mes', 'Faturado duas vezes ao mês'],
  cadence_monthly: ['Billed monthly', 'Se factura mensualmente', 'Faturado mensalmente'],
  cadence_manual: ['Billed on demand', 'Se factura a demanda', 'Faturado sob demanda'],
  cadence_custom: ['Billed on demand', 'Se factura a demanda', 'Faturado sob demanda'],
  cadence_milestone: ['Billed by milestone', 'Se factura por hito', 'Faturado por marco'],
  calculating: ['Calculating the amount…', 'Calculando el importe…', 'Calculando o valor…'],
  previewFailed: [
    'The amount could not be calculated. Try again.',
    'No se pudo calcular el importe. Inténtalo de nuevo.',
    'Não foi possível calcular o valor. Tente novamente.',
  ],
  retry: ['Try again', 'Reintentar', 'Tentar novamente'],
  hours: ['Hours', 'Horas', 'Horas'],
  expenses: ['Expenses to re-bill', 'Gastos a refacturar', 'Despesas a refaturar'],
  fees: ['Fees and adjustments', 'Tarifas y ajustes', 'Taxas e ajustes'],
  subtotal: ['Subtotal', 'Subtotal', 'Subtotal'],
  tax: ['Tax', 'Impuestos', 'Impostos'],
  noTax: ['No tax profile', 'Sin perfil de impuestos', 'Sem perfil de impostos'],
  total: ['Total', 'Total', 'Total'],
  due: ['Due', 'Vence', 'Vencimento'],
  days: ['days', 'días', 'dias'],
  po: ['PO', 'Pedido (PO)', 'Pedido (PO)'],
  numberOnIssue: ['Number on issue', 'Número al emitir', 'Número ao emitir'],
  amountHeading: ['Amount of this invoice', 'Importe de esta factura', 'Valor desta fatura'],
  selectionNote: [
    'Only approved records are included. The items listed below are left out and stay available for a later invoice.',
    'Solo se incluyen registros aprobados. Lo indicado abajo queda fuera y se podrá facturar más adelante.',
    'Só registros aprovados entram. Os itens abaixo ficam de fora e podem ser faturados depois.',
  ],
  nothing: [
    'Nothing to bill for these dates.',
    'No hay nada que facturar en estas fechas.',
    'Não há nada a faturar nestas datas.',
  ],
  suggested: [
    'There is approved, unbilled work',
    'Hay trabajo aprobado sin facturar',
    'Há trabalho aprovado não faturado',
  ],
  useDates: ['Use these dates', 'Usar estas fechas', 'Usar estas datas'],
  autoDates: [
    'Dates set to cover the approved work that is not invoiced yet.',
    'Fechas ajustadas para cubrir el trabajo aprobado que aún no está facturado.',
    'Datas ajustadas para cobrir o trabalho aprovado que ainda não foi faturado.',
  ],
  existing: [
    'These dates are already on an invoice.',
    'Estas fechas ya están en una factura.',
    'Estas datas já estão em uma fatura.',
  ],
  openInvoice: ['Open invoice', 'Abrir factura', 'Abrir fatura'],
  blocked: [
    'This invoice can’t be created yet:',
    'Todavía no se puede crear esta factura:',
    'Esta fatura ainda não pode ser criada:',
  ],
  leftOut: ['Left out of this invoice', 'Fuera de esta factura', 'Fora desta fatura'],
  beforeIssue: ['Fix before issuing', 'Corregir antes de emitir', 'Corrigir antes de emitir'],
  notes: ['Good to know', 'Para tener en cuenta', 'Bom saber'],
  create: ['Create invoice', 'Crear factura', 'Criar fatura'],
  creating: ['Creating…', 'Creando…', 'Criando…'],
  createHelp: [
    'Creates a draft with exactly this amount and opens it. Nothing is sent to the client.',
    'Crea un borrador con este importe exacto y lo abre. No se envía nada al cliente.',
    'Cria um rascunho com exatamente este valor e o abre. Nada é enviado ao cliente.',
  ],
  amountChanged: [
    'The amount changed while you were looking (records were updated). Check the new total and press Create invoice again.',
    'El importe cambió mientras mirabas (se actualizaron registros). Revisa el nuevo total y pulsa Crear factura otra vez.',
    'O valor mudou enquanto você olhava (registros foram atualizados). Confira o novo total e clique em Criar fatura novamente.',
  ],
  createFailed: [
    'The invoice could not be created. Nothing was saved.',
    'No se pudo crear la factura. No se guardó nada.',
    'Não foi possível criar a fatura. Nada foi salvo.',
  ],
  openDrafts: [
    'Unissued drafts of this project',
    'Borradores sin emitir de este proyecto',
    'Rascunhos não emitidos deste projeto',
  ],
  advanced: ['Advanced options', 'Opciones avanzadas', 'Opções avançadas'],
  advancedHelp: [
    'The defaults are right for a normal invoice. Use these only for special cases.',
    'Los valores por defecto sirven para una factura normal. Usa esto solo en casos especiales.',
    'Os padrões servem para uma fatura normal. Use isto só em casos especiais.',
  ],
  stream: ['What to invoice', 'Qué facturar', 'O que faturar'],
  streamAuto: ['Automatic (recommended)', 'Automático (recomendado)', 'Automático (recomendado)'],
  stream_labor: ['Hours', 'Horas', 'Horas'],
  stream_expense: ['Expenses', 'Gastos', 'Despesas'],
  stream_milestone: ['Milestones', 'Hitos', 'Marcos'],
  pickRecords: [
    'Pick individual hours and expenses',
    'Elegir horas y gastos uno a uno',
    'Escolher horas e despesas individualmente',
  ],
  streamSettings: ['Project billing settings', 'Ajustes de facturación del proyecto', 'Configurações de faturamento do projeto'],
  draft: ['Draft', 'Borrador', 'Rascunho'],
  approved: ['Approved', 'Aprobada', 'Aprovada'],
  // Fix links
  fix_time: ['Open hours', 'Abrir horas', 'Abrir horas'],
  fix_approvals: ['Approve hours', 'Aprobar horas', 'Aprovar horas'],
  fix_finance_approvals: ['Finance review', 'Revisión financiera', 'Revisão financeira'],
  fix_expenses: ['Approve expenses', 'Aprobar gastos', 'Aprovar despesas'],
  fix_expense_classification: ['Review expenses', 'Revisar gastos', 'Revisar despesas'],
  fix_rates: ['Set rates', 'Definir tarifas', 'Definir tarifas'],
  fix_finance: ['Open Finance', 'Abrir Finanzas', 'Abrir Finanças'],
  fix_issuer_authority: ['Set issuing company', 'Definir empresa emisora', 'Definir empresa emissora'],
  fix_numbering: ['Set up numbering', 'Configurar numeración', 'Configurar numeração'],
  fix_issuer_settings: ['Add bank details', 'Añadir datos bancarios', 'Adicionar dados bancários'],
  fix_project_po: ['Add PO to project', 'Añadir PO al proyecto', 'Adicionar PO ao projeto'],
  fix_billing_setup: ['Set up billing', 'Configurar facturación', 'Configurar faturamento'],
  fix_invoice: ['Open draft', 'Abrir borrador', 'Abrir rascunho'],
  fix_signoff: ['Get client sign-off', 'Obtener firma del cliente', 'Obter assinatura do cliente'],
  // Invoice page
  readyToIssue: ['Ready to issue', 'Lista para emitir', 'Pronta para emitir'],
  issueHelp: [
    'Check the invoice below. Issuing assigns the number and locks it; it can’t be edited afterwards.',
    'Revisa la factura abajo. Al emitirla se asigna el número y queda bloqueada; luego no se puede editar.',
    'Confira a fatura abaixo. Ao emitir, o número é atribuído e ela fica bloqueada; depois não pode ser editada.',
  ],
  issueButton: ['Issue invoice', 'Emitir factura', 'Emitir fatura'],
  confirmTitle: ['Issue this invoice?', '¿Emitir esta factura?', 'Emitir esta fatura?'],
  confirmBody: [
    'After issuing, the invoice gets its final number and can no longer be changed. Corrections are made with a credit note.',
    'Tras emitirla, la factura recibe su número definitivo y ya no se puede cambiar. Las correcciones se hacen con una nota de crédito.',
    'Após emitir, a fatura recebe o número definitivo e não pode mais ser alterada. Correções são feitas com nota de crédito.',
  ],
  confirmIssue: ['Yes, issue invoice', 'Sí, emitir factura', 'Sim, emitir fatura'],
  issuing: ['Issuing…', 'Emitiendo…', 'Emitindo…'],
  cancel: ['Cancel', 'Cancelar', 'Cancelar'],
  client: ['Client', 'Cliente', 'Cliente'],
  period: ['Period', 'Periodo', 'Período'],
  cannotIssue: ['Can’t issue yet', 'Aún no se puede emitir', 'Ainda não é possível emitir'],
  createdNotice: [
    'Invoice draft created. Check it below, then issue it.',
    'Borrador creado. Revísalo abajo y luego emítelo.',
    'Rascunho criado. Confira abaixo e depois emita.',
  ],
  issuedTitle: ['Invoice issued', 'Factura emitida', 'Fatura emitida'],
  issuedHelp: [
    'Download the PDF and send it to the client, then mark it as sent.',
    'Descarga el PDF y envíalo al cliente; después márcala como enviada.',
    'Baixe o PDF e envie ao cliente; depois marque como enviada.',
  ],
  markSent: ['Mark as sent', 'Marcar como enviada', 'Marcar como enviada'],
  markSentWaiting: [
    'You can mark it as sent once the PDF is ready.',
    'Podrás marcarla como enviada cuando el PDF esté listo.',
    'Você poderá marcar como enviada quando o PDF estiver pronto.',
  ],
  payments: ['Payments and corrections', 'Pagos y correcciones', 'Pagamentos e correções'],
  moreActions: ['More actions', 'Más acciones', 'Mais ações'],
  discard: ['Discard this draft', 'Descartar este borrador', 'Descartar este rascunho'],
  discardHelp: [
    'The hours and expenses become available for another invoice. Nothing was sent to the client.',
    'Las horas y gastos quedan disponibles para otra factura. No se envió nada al cliente.',
    'As horas e despesas ficam disponíveis para outra fatura. Nada foi enviado ao cliente.',
  ],
  discardReason: ['Reason', 'Motivo', 'Motivo'],
  issueFailed: [
    'The invoice was not issued. Nothing changed.',
    'La factura no se emitió. No cambió nada.',
    'A fatura não foi emitida. Nada mudou.',
  ],
  landingIntro: [
    'Create an invoice from approved hours and expenses, issue it, then record the payment.',
    'Crea una factura con las horas y gastos aprobados, emítela y registra el cobro.',
    'Crie uma fatura com as horas e despesas aprovadas, emita e registre o pagamento.',
  ],
  tabInvoices: ['Invoices', 'Facturas', 'Faturas'],
  tabStreams: ['Per-project settings', 'Ajustes por proyecto', 'Ajustes por projeto'],
  tabSetup: ['Company and numbering', 'Empresa y numeración', 'Empresa e numeração'],
} satisfies Record<string, Triple>;

export type QuickInvoiceCopyKey = keyof typeof copy;

const index = (locale: PortalLocale) => (locale === 'es' ? 1 : locale === 'pt' ? 2 : 0);

export function quickInvoiceText(locale: PortalLocale, key: QuickInvoiceCopyKey): string {
  return copy[key][index(locale)];
}

type Warning = { code: string; count: number; minutes: number };

const hours = (minutes: number) => {
  const value = Math.round((minutes / 60) * 100) / 100;
  return String(value);
};

/** Plain-language sentence for one warning. Unknown codes fall back to the caller. */
export function quickInvoiceWarningText(locale: PortalLocale, warning: Warning): string | null {
  const n = warning.count;
  const h = warning.minutes ? ` (${hours(warning.minutes)} h)` : '';
  const i = index(locale);
  const messages: Record<string, Triple> = {
    pending_time_submission: [
      `${n} time ${n === 1 ? 'entry is' : 'entries are'} not submitted yet${h}.`,
      `${n} ${n === 1 ? 'registro de horas no está enviado' : 'registros de horas no están enviados'}${h}.`,
      `${n} ${n === 1 ? 'registro de horas não foi enviado' : 'registros de horas não foram enviados'}${h}.`,
    ],
    pending_time_approval: [
      `${n} time ${n === 1 ? 'entry is' : 'entries are'} waiting for approval${h}.`,
      `${n} ${n === 1 ? 'registro de horas espera' : 'registros de horas esperan'} aprobación${h}.`,
      `${n} ${n === 1 ? 'registro de horas aguarda' : 'registros de horas aguardam'} aprovação${h}.`,
    ],
    pending_time_finance_review: [
      `${n} time ${n === 1 ? 'entry needs' : 'entries need'} a finance review${h}.`,
      `${n} ${n === 1 ? 'registro de horas necesita' : 'registros de horas necesitan'} revisión financiera${h}.`,
      `${n} ${n === 1 ? 'registro de horas precisa' : 'registros de horas precisam'} de revisão financeira${h}.`,
    ],
    pending_expense_approval: [
      `${n} ${n === 1 ? 'expense is' : 'expenses are'} waiting for approval.`,
      `${n} ${n === 1 ? 'gasto espera' : 'gastos esperan'} aprobación.`,
      `${n} ${n === 1 ? 'despesa aguarda' : 'despesas aguardam'} aprovação.`,
    ],
    missing_expense_classification: [
      `${n} ${n === 1 ? 'expense needs' : 'expenses need'} to be marked billable or not.`,
      `${n} ${n === 1 ? 'gasto necesita' : 'gastos necesitan'} indicar si se refactura.`,
      `${n} ${n === 1 ? 'despesa precisa' : 'despesas precisam'} indicar se é refaturada.`,
    ],
    missing_expense_currency_conversion: [
      `${n} ${n === 1 ? 'expense needs' : 'expenses need'} a currency conversion.`,
      `${n} ${n === 1 ? 'gasto necesita' : 'gastos necesitan'} conversión de moneda.`,
      `${n} ${n === 1 ? 'despesa precisa' : 'despesas precisam'} de conversão de moeda.`,
    ],
    missing_expense_finance_projection: [
      `${n} ${n === 1 ? 'expense needs' : 'expenses need'} a finance review.`,
      `${n} ${n === 1 ? 'gasto necesita' : 'gastos necesitan'} revisión financiera.`,
      `${n} ${n === 1 ? 'despesa precisa' : 'despesas precisam'} de revisão financeira.`,
    ],
    missing_client_rate: [
      `No client rate for ${n} time ${n === 1 ? 'entry' : 'entries'}${h}.`,
      `Falta la tarifa de cliente para ${n} ${n === 1 ? 'registro' : 'registros'} de horas${h}.`,
      `Falta a tarifa do cliente para ${n} ${n === 1 ? 'registro' : 'registros'} de horas${h}.`,
    ],
    ambiguous_client_rate: [
      `More than one client rate fits ${n} time ${n === 1 ? 'entry' : 'entries'}${h}.`,
      `Hay más de una tarifa posible para ${n} ${n === 1 ? 'registro' : 'registros'}${h}.`,
      `Há mais de uma tarifa possível para ${n} ${n === 1 ? 'registro' : 'registros'}${h}.`,
    ],
    missing_internal_cost: [
      `Internal cost is missing for ${n} time ${n === 1 ? 'entry' : 'entries'}${h}.`,
      `Falta el coste interno de ${n} ${n === 1 ? 'registro' : 'registros'}${h}.`,
      `Falta o custo interno de ${n} ${n === 1 ? 'registro' : 'registros'}${h}.`,
    ],
    missing_compensation_rule: [
      `Worker pay is not set for ${n} time ${n === 1 ? 'entry' : 'entries'}${h}.`,
      `Falta el pago del trabajador para ${n} ${n === 1 ? 'registro' : 'registros'}${h}.`,
      `Falta o pagamento do trabalhador para ${n} ${n === 1 ? 'registro' : 'registros'}${h}.`,
    ],
    source_already_reserved: [
      `${n} ${n === 1 ? 'record is' : 'records are'} already on another unissued invoice${h}.`,
      `${n} ${n === 1 ? 'registro ya está' : 'registros ya están'} en otra factura sin emitir${h}.`,
      `${n} ${n === 1 ? 'registro já está' : 'registros já estão'} em outra fatura não emitida${h}.`,
    ],
    complete_client_billing_group_required: [
      `${n} ${n === 1 ? 'entry belongs' : 'entries belong'} to a day or week that is not fully approved${h}.`,
      `${n} ${n === 1 ? 'registro pertenece' : 'registros pertenecen'} a un día o semana sin aprobar del todo${h}.`,
      `${n} ${n === 1 ? 'registro pertence' : 'registros pertencem'} a um dia ou semana não totalmente aprovado${h}.`,
    ],
    canonical_legal_entity_revision_required: [
      'The issuing company is not set for this project. You can create the draft, but not issue it.',
      'La empresa emisora no está definida para este proyecto. Puedes crear el borrador, pero no emitirlo.',
      'A empresa emissora não está definida para este projeto. Você pode criar o rascunho, mas não emiti-lo.',
    ],
    missing_accountant_approved_number_policy: [
      'Invoice numbering is not set up. You can create the draft, but not issue it.',
      'La numeración de facturas no está configurada. Puedes crear el borrador, pero no emitirlo.',
      'A numeração de faturas não está configurada. Você pode criar o rascunho, mas não emiti-lo.',
    ],
    customer_signoff_required: [
      'The client must sign the period report before this invoice can be issued.',
      'El cliente debe firmar el informe del periodo antes de emitir esta factura.',
      'O cliente precisa assinar o relatório do período antes de emitir esta fatura.',
    ],
    missing_issuer_settings: [
      'Bank details are missing on the invoice document.',
      'Faltan los datos bancarios en el documento de la factura.',
      'Faltam os dados bancários no documento da fatura.',
    ],
    missing_purchase_order: [
      'No PO number: the invoice will be sent without one.',
      'Sin número de PO: la factura saldrá sin él.',
      'Sem número de PO: a fatura sairá sem ele.',
    ],
    missing_billing_stream: [
      'This project has no billing set up (rates, cadence, issuing company).',
      'Este proyecto no tiene facturación configurada (tarifas, frecuencia, empresa emisora).',
      'Este projeto não tem faturamento configurado (tarifas, frequência, empresa emissora).',
    ],
    billing_rule_outside_effective_window: [
      'These dates are outside the project’s billing terms.',
      'Estas fechas están fuera de las condiciones de facturación del proyecto.',
      'Estas datas estão fora das condições de faturamento do projeto.',
    ],
    period_cutoff_mismatch: [
      'These dates don’t match the project’s billing cycle. Pick one of the suggested periods.',
      'Estas fechas no coinciden con el ciclo de facturación. Elige uno de los periodos sugeridos.',
      'Estas datas não coincidem com o ciclo de faturamento. Escolha um dos períodos sugeridos.',
    ],
    updates_existing_draft: [
      'A draft for these dates already exists. Create invoice updates it with the amount above.',
      'Ya existe un borrador para estas fechas. Crear factura lo actualiza con este importe.',
      'Já existe um rascunho para estas datas. Criar fatura o atualiza com este valor.',
    ],
    expenses_separate: [
      'Expenses of this project go on a separate invoice (Advanced options → What to invoice).',
      'Los gastos de este proyecto van en otra factura (Opciones avanzadas → Qué facturar).',
      'As despesas deste projeto vão em outra fatura (Opções avançadas → O que faturar).',
    ],
    cap_exhausted: [
      'The PO cap of this project is used up.',
      'El tope del PO de este proyecto está agotado.',
      'O teto do PO deste projeto está esgotado.',
    ],
  };
  return messages[warning.code]?.[i] ?? null;
}
