/** Copy for the 2026-11 billing/finance fixes (G3): invoices, credit notes, settlements, pay (EN/ES/PT). */
const en = {
  convertCurrency: 'Open Currency conversions',
  classifyExpense: 'Classify the expense',
  companyWideTitle: 'Bank, payee and company contact',
  companyWideHelp:
    'These details print on every invoice of this issuing company, so they are not changed on one draft.',
  companyWideOwnerLink: 'Change in Billing setup › Issuer settings',
  companyWideFinanceNote:
    'Only the owner can change the bank and payee details. You can change the company contact details there.',
  payeeOwnerOnlyNote:
    'Bank and payee details: only the owner can change them. Every change is recorded in the audit log and the owner is notified.',
  payeeReadOnlyNote: 'Only the owner can change the bank and payee details.',
  issuerPayeeNotificationTitle: 'Invoice bank details changed',
  purchaseNoPlaceholder: 'For example: 4500012345',
  plannedIssueDate: 'Planned issue date',
  plannedIssueDateHelp: 'Planned date. The invoice gets the actual date when it is issued.',
  creditNoteTitle: 'Credit note',
  creditNoteFor: 'Credit note for invoice {number}',
  creditNoteBadge: 'Credit note',
  internalPaidViaCompensation: 'Internal – paid via compensation',
  internalPaidViaCompensationHelp:
    'J&A workers are paid through their compensation in Detailed analysis › Settlements. They are not paid here.',
  openCompensationSettlements: 'Open compensation settlements',
  overtimeRateMissing: 'Overtime rate missing',
  overtimeRateMissingHelp:
    '{hours} h of overtime have no overtime client rate, so they would be billed at $0. Set the overtime rate first.',
  setOvertimeRate: 'Set the overtime rate',
  nothingToBill: 'Nothing to bill',
  nothingToBillHelp: 'There are no approved hours or expenses ready to invoice for this period.',
  excludedTitle: 'Approved but not on this invoice',
  excludedHelp: 'These approved records are not billed yet. Fix the reason to include them.',
  excludedReason_pending_correction: 'A correction is waiting for approval',
  excludedReason_missing_internal_cost: 'Internal cost missing',
  excludedReason_missing_client_rate: 'Client rate missing',
  excludedReason_expense_unclassified: 'Expense not classified yet',
  excludedReason_other: 'Not ready to invoice',
  fixLink: 'Fix',
  preparing: 'Preparing…',
  confirmRecordPayment: 'Record this payment of {amount}?',
  confirmYes: 'Yes, record it',
  collectionBeforeIssue: 'The expected collection date must be on or after the planned issue date.',
  discountWhere: 'Set a discount in the billing stream terms',
  marginNegative: 'We charge less than this person costs',
  upcomingRate: 'From {date}: {rate}',
  validUntil: 'until {date}',
  classifyAll: 'Save all {count} as chosen',
  classifyAllHelp: 'Saves the client treatment shown in each row below.',
  settlementState_reviewed: 'Finalized, not paid yet',
  settlementState_scheduled: 'Payment scheduled',
  settlementBasis_APPROVED_TIME: 'Approved hours',
  settlementBasis_COLLECTED_ELIGIBLE_LABOR: 'Collected labour',
  confirmFinalizeCompensation: 'Finalize the compensation of {name} for {from} → {to}? The amount is fixed from the approved records.',
  confirmRegisterSettlementPayment: 'Record the payment of {amount} to {name} on {date}?',
  hoursRecorded: 'recorded',
  hoursPlanned: 'planned',
  hoursNotPlanned: 'No hours planned for this project.',
  packCountOne: '1 accounting pack',
  statusIncomplete: 'Incomplete',
  financeDiscardOwnerOnly:
    'Only the owner can discard a draft that already has invoice lines. Ask the owner, or approve and correct it with a credit note after issue.',
  packReadyAuditor: 'Available for review or download',
};

type BillingFixCopyKey = keyof typeof en;

const es: Record<BillingFixCopyKey, string> = {
  convertCurrency: 'Abrir Conversiones de moneda',
  classifyExpense: 'Clasificar el gasto',
  companyWideTitle: 'Banco, beneficiario y contacto de la empresa',
  companyWideHelp:
    'Estos datos se imprimen en todas las facturas de esta empresa emisora, por eso no se cambian en un borrador.',
  companyWideOwnerLink: 'Cambiar en Configuración de facturación › Datos del emisor',
  companyWideFinanceNote:
    'Solo el propietario puede cambiar los datos bancarios y de beneficiario. Allí puedes cambiar los datos de contacto de la empresa.',
  payeeOwnerOnlyNote:
    'Datos bancarios y de beneficiario: solo el propietario puede cambiarlos. Cada cambio queda en el registro de auditoría y se avisa al propietario.',
  payeeReadOnlyNote: 'Solo el propietario puede cambiar los datos bancarios y de beneficiario.',
  issuerPayeeNotificationTitle: 'Cambiaron los datos bancarios de las facturas',
  purchaseNoPlaceholder: 'Por ejemplo: 4500012345',
  plannedIssueDate: 'Fecha de emisión prevista',
  plannedIssueDateHelp: 'Fecha prevista. La factura recibe la fecha real al emitirse.',
  creditNoteTitle: 'Nota de crédito',
  creditNoteFor: 'Nota de crédito de la factura {number}',
  creditNoteBadge: 'Nota de crédito',
  internalPaidViaCompensation: 'Interno – se paga por compensación',
  internalPaidViaCompensationHelp:
    'Los trabajadores de J&A se pagan con su compensación en Análisis detallado › Liquidaciones. Aquí no se pagan.',
  openCompensationSettlements: 'Abrir liquidaciones de compensación',
  overtimeRateMissing: 'Falta la tarifa de horas extra',
  overtimeRateMissingHelp:
    '{hours} h de horas extra no tienen tarifa de cliente para horas extra y se facturarían a $0. Define primero la tarifa de horas extra.',
  setOvertimeRate: 'Definir la tarifa de horas extra',
  nothingToBill: 'Nada que facturar',
  nothingToBillHelp: 'No hay horas ni gastos aprobados listos para facturar en este periodo.',
  excludedTitle: 'Aprobado pero fuera de esta factura',
  excludedHelp: 'Estos registros aprobados aún no se facturan. Corrige el motivo para incluirlos.',
  excludedReason_pending_correction: 'Hay una corrección pendiente de aprobación',
  excludedReason_missing_internal_cost: 'Falta el costo interno',
  excludedReason_missing_client_rate: 'Falta la tarifa del cliente',
  excludedReason_expense_unclassified: 'Gasto aún sin clasificar',
  excludedReason_other: 'No está listo para facturar',
  fixLink: 'Corregir',
  preparing: 'Preparando…',
  confirmRecordPayment: '¿Registrar este pago de {amount}?',
  confirmYes: 'Sí, registrarlo',
  collectionBeforeIssue:
    'La fecha de cobro esperada debe ser igual o posterior a la fecha de emisión prevista.',
  discountWhere: 'Define un descuento en las condiciones del flujo de facturación',
  marginNegative: 'Cobramos menos de lo que cuesta esta persona',
  upcomingRate: 'Desde {date}: {rate}',
  validUntil: 'hasta {date}',
  classifyAll: 'Guardar los {count} como están elegidos',
  classifyAllHelp: 'Guarda el tratamiento para el cliente que muestra cada fila de abajo.',
  settlementState_reviewed: 'Finalizada, aún sin pagar',
  settlementState_scheduled: 'Pago programado',
  settlementBasis_APPROVED_TIME: 'Horas aprobadas',
  settlementBasis_COLLECTED_ELIGIBLE_LABOR: 'Mano de obra cobrada',
  confirmFinalizeCompensation: '¿Finalizar la compensación de {name} del {from} al {to}? El importe queda fijado con los registros aprobados.',
  confirmRegisterSettlementPayment: '¿Registrar el pago de {amount} a {name} el {date}?',
  hoursRecorded: 'registradas',
  hoursPlanned: 'previstas',
  hoursNotPlanned: 'Este proyecto no tiene horas previstas.',
  packCountOne: '1 paquete contable',
  statusIncomplete: 'Incompleto',
  financeDiscardOwnerOnly:
    'Solo el propietario puede descartar un borrador que ya tiene líneas de factura. Pídeselo al propietario o, tras emitirla, corrígela con una nota de crédito.',
  packReadyAuditor: 'Disponible para revisar o descargar',
};

const pt: Record<BillingFixCopyKey, string> = {
  convertCurrency: 'Abrir Conversões de moeda',
  classifyExpense: 'Classificar a despesa',
  companyWideTitle: 'Banco, beneficiário e contato da empresa',
  companyWideHelp:
    'Estes dados são impressos em todas as faturas desta empresa emissora, por isso não são alterados em um rascunho.',
  companyWideOwnerLink: 'Alterar em Configuração de faturamento › Dados do emissor',
  companyWideFinanceNote:
    'Somente o proprietário pode alterar os dados bancários e de beneficiário. Lá você pode alterar os dados de contato da empresa.',
  payeeOwnerOnlyNote:
    'Dados bancários e de beneficiário: somente o proprietário pode alterá-los. Cada alteração fica no registro de auditoria e o proprietário é avisado.',
  payeeReadOnlyNote: 'Somente o proprietário pode alterar os dados bancários e de beneficiário.',
  issuerPayeeNotificationTitle: 'Os dados bancários das faturas foram alterados',
  purchaseNoPlaceholder: 'Por exemplo: 4500012345',
  plannedIssueDate: 'Data de emissão prevista',
  plannedIssueDateHelp: 'Data prevista. A fatura recebe a data real ao ser emitida.',
  creditNoteTitle: 'Nota de crédito',
  creditNoteFor: 'Nota de crédito da fatura {number}',
  creditNoteBadge: 'Nota de crédito',
  internalPaidViaCompensation: 'Interno – pago por compensação',
  internalPaidViaCompensationHelp:
    'Os trabalhadores da J&A são pagos pela compensação em Análise detalhada › Liquidações. Não são pagos aqui.',
  openCompensationSettlements: 'Abrir liquidações de compensação',
  overtimeRateMissing: 'Falta a tarifa de hora extra',
  overtimeRateMissingHelp:
    '{hours} h de hora extra não têm tarifa de cliente para hora extra e seriam faturadas a $0. Defina primeiro a tarifa de hora extra.',
  setOvertimeRate: 'Definir a tarifa de hora extra',
  nothingToBill: 'Nada a faturar',
  nothingToBillHelp: 'Não há horas nem despesas aprovadas prontas para faturar neste período.',
  excludedTitle: 'Aprovado, mas fora desta fatura',
  excludedHelp:
    'Estes registros aprovados ainda não foram faturados. Corrija o motivo para incluí-los.',
  excludedReason_pending_correction: 'Há uma correção aguardando aprovação',
  excludedReason_missing_internal_cost: 'Falta o custo interno',
  excludedReason_missing_client_rate: 'Falta a tarifa do cliente',
  excludedReason_expense_unclassified: 'Despesa ainda não classificada',
  excludedReason_other: 'Não está pronto para faturar',
  fixLink: 'Corrigir',
  preparing: 'Preparando…',
  confirmRecordPayment: 'Registrar este pagamento de {amount}?',
  confirmYes: 'Sim, registrar',
  collectionBeforeIssue:
    'A data de recebimento prevista deve ser igual ou posterior à data de emissão prevista.',
  discountWhere: 'Defina um desconto nas condições do fluxo de faturamento',
  marginNegative: 'Cobramos menos do que esta pessoa custa',
  upcomingRate: 'A partir de {date}: {rate}',
  validUntil: 'até {date}',
  classifyAll: 'Salvar as {count} como escolhidas',
  classifyAllHelp: 'Salva o tratamento para o cliente mostrado em cada linha abaixo.',
  settlementState_reviewed: 'Finalizada, ainda não paga',
  settlementState_scheduled: 'Pagamento agendado',
  settlementBasis_APPROVED_TIME: 'Horas aprovadas',
  settlementBasis_COLLECTED_ELIGIBLE_LABOR: 'Mão de obra recebida',
  confirmFinalizeCompensation: 'Finalizar a compensação de {name} de {from} a {to}? O valor fica fixado com os registros aprovados.',
  confirmRegisterSettlementPayment: 'Registrar o pagamento de {amount} para {name} em {date}?',
  hoursRecorded: 'registradas',
  hoursPlanned: 'previstas',
  hoursNotPlanned: 'Este projeto não tem horas previstas.',
  packCountOne: '1 pacote contábil',
  statusIncomplete: 'Incompleto',
  financeDiscardOwnerOnly:
    'Somente o proprietário pode descartar um rascunho que já tem linhas de fatura. Peça ao proprietário ou, depois de emitida, corrija com uma nota de crédito.',
  packReadyAuditor: 'Disponível para revisar ou baixar',
};

const catalogs = { en, es, pt } as const;

export function billingFixText(
  locale: string | undefined,
  key: BillingFixCopyKey,
  params: Record<string, string | number> = {},
): string {
  const catalog: Record<BillingFixCopyKey, string> =
    catalogs[(locale === 'es' || locale === 'pt' ? locale : 'en') as 'en'];
  const template = catalog[key] ?? en[key];
  return template.replace(/\{(\w+)\}/gu, (_, name: string) => String(params[name] ?? ''));
}

/**
 * T64: a stored timestamp in the viewer's language and time ("Nov 23, 2026, 10:13 AM"),
 * never raw ISO UTC. A date-only value stays a calendar day; unreadable text is returned as is.
 */
export function billingDateTime(raw: unknown, locale: string | undefined): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  const tag = locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-BR' : 'en-US';
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) {
    return new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeZone: 'UTC' }).format(
      new Date(`${text}T00:00:00Z`),
    );
  }
  const date = new Date(text.includes('T') || text.endsWith('Z') ? text : `${text.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export type { BillingFixCopyKey };
