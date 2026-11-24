/** Copy for the 2026-11 billing/finance fixes (G3): invoices, credit notes, settlements, pay (EN/ES/PT). */
const en = {
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
  classifyAll: 'Apply to all {count}',
  ledgerExportOwnerOnly: 'Exports are available to finance and the owner.',
};

type BillingFixCopyKey = keyof typeof en;

const es: Record<BillingFixCopyKey, string> = {
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
  classifyAll: 'Aplicar a los {count}',
  ledgerExportOwnerOnly: 'Las exportaciones están disponibles para finanzas y el propietario.',
};

const pt: Record<BillingFixCopyKey, string> = {
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
  classifyAll: 'Aplicar a todas as {count}',
  ledgerExportOwnerOnly: 'As exportações estão disponíveis para o financeiro e o proprietário.',
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

export type { BillingFixCopyKey };
