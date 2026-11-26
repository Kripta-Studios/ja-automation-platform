/**
 * Copy for decision D4 (2026-11-26): who pays an external (supplier) technician's expenses.
 * Used on the project Team tab, the Extras block, Money → Subcontractors, the technician's
 * Expenses page and the supplier coordinator's team page. [en, es, pt-BR].
 */
type CopyValue = readonly [string, string, string];

const copy = {
  title: [
    'External technicians’ expenses',
    'Gastos de los técnicos externos',
    'Despesas dos técnicos externos',
  ],
  intro: [
    'Who pays the expenses that a supplier’s technicians log on this project. A choice on a person (Extras) wins over this one.',
    'Quién paga los gastos que registran los técnicos de un proveedor en este proyecto. Lo elegido en una persona (Extras) prevalece sobre esto.',
    'Quem paga as despesas que os técnicos de um fornecedor lançam neste projeto. O que for escolhido numa pessoa (Extras) prevalece sobre isto.',
  ],
  ja: ['J&A reimburses the technician', 'J&A reembolsa al técnico', 'A J&A reembolsa o técnico'],
  supplier: ['Recharged to the supplier', 'Se cargan al proveedor', 'Cobradas do fornecedor'],
  notSet: [
    'Not set: J&A reimburses the technician (as before)',
    'Sin definir: J&A reembolsa al técnico (como hasta ahora)',
    'Não definido: a J&A reembolsa o técnico (como antes)',
  ],
  jaHelp: [
    'What the technician pays himself is owed to him by J&A (Reimbursements).',
    'Lo que el técnico paga de su bolsillo se lo debe J&A (Reembolsos).',
    'O que o técnico paga do próprio bolso é devido a ele pela J&A (Reembolsos).',
  ],
  supplierHelp: [
    'J&A does not reimburse the technician; his own company does. What J&A paid for him is deducted from the supplier’s settlement (or invoiced to the supplier).',
    'J&A no reembolsa al técnico; lo hace su propia empresa. Lo que J&A pagó por él se descuenta de la liquidación del proveedor (o se le factura).',
    'A J&A não reembolsa o técnico; a própria empresa dele reembolsa. O que a J&A pagou por ele é descontado do acerto do fornecedor (ou cobrado dele).',
  ],
  clientIndependent: [
    'Billing these expenses to the client is set separately and does not change.',
    'Facturar estos gastos al cliente se define aparte y no cambia.',
    'Faturar estas despesas ao cliente é definido à parte e não muda.',
  ],
  followProject: [
    'Project rule ({value})',
    'Regla del proyecto ({value})',
    'Regra do projeto ({value})',
  ],
  fromPerson: ['set for this person', 'definido para esta persona', 'definido para esta pessoa'],
  fromProject: ['project rule', 'regla del proyecto', 'regra do projeto'],
  fromDefault: ['not set', 'sin definir', 'não definido'],
  since: ['since {date}', 'desde el {date}', 'desde {date}'],
  next: ['From {date}: {value}', 'Desde el {date}: {value}', 'A partir de {date}: {value}'],
  appliesFrom: ['Applies from', 'Se aplica desde', 'Vale a partir de'],
  appliesFromHelp: [
    'Expenses dated before this day keep the previous rule.',
    'Los gastos con fecha anterior mantienen la regla anterior.',
    'Despesas com data anterior mantêm a regra anterior.',
  ],
  change: ['Change', 'Cambiar', 'Alterar'],
  save: ['Save', 'Guardar', 'Salvar'],
  saving: ['Saving…', 'Guardando…', 'Salvando…'],
  cancel: ['Cancel', 'Cancelar', 'Cancelar'],
  saved: ['Saved.', 'Guardado.', 'Salvo.'],
  saveFailed: [
    'Could not save. Try again.',
    'No se pudo guardar. Inténtalo de nuevo.',
    'Não foi possível salvar. Tente de novo.',
  ],
  noTechnicians: [
    'No supplier technicians on this project yet. The rule applies when one is added.',
    'Aún no hay técnicos de proveedor en este proyecto. La regla se aplica cuando se añada uno.',
    'Ainda não há técnicos de fornecedor neste projeto. A regra vale quando um for adicionado.',
  ],
  person: [
    '{name}: {value} ({source})',
    '{name}: {value} ({source})',
    '{name}: {value} ({source})',
  ],
  extrasLabel: [
    'Who pays this technician’s expenses',
    'Quién paga los gastos de este técnico',
    'Quem paga as despesas deste técnico',
  ],
  extrasHelp: [
    'Only for a supplier’s technician. It decides what J&A owes him; billing the client stays as chosen above.',
    'Solo para un técnico de proveedor. Decide qué le debe J&A; la factura al cliente sigue como se eligió arriba.',
    'Só para técnico de fornecedor. Decide o que a J&A deve a ele; a cobrança do cliente continua como escolhido acima.',
  ],
  summary: ['Expenses: {value}', 'Gastos: {value}', 'Despesas: {value}'],
  // Money → Subcontractors
  sectionTitle: ['Expenses of the technicians', 'Gastos de los técnicos', 'Despesas dos técnicos'],
  sectionIntro: [
    'Who pays each approved expense of this period. Expenses J&A paid for a technician whose supplier carries his expenses are deducted when you mark the settlement as paid.',
    'Quién paga cada gasto aprobado del periodo. Los gastos que J&A pagó por un técnico cuyos gastos asume su proveedor se descuentan al marcar la liquidación como pagada.',
    'Quem paga cada despesa aprovada do período. Despesas que a J&A pagou por um técnico cujas despesas o fornecedor assume são descontadas ao marcar o acerto como pago.',
  ],
  noExpenses: [
    'No approved expenses of these technicians in this period.',
    'No hay gastos aprobados de estos técnicos en este periodo.',
    'Não há despesas aprovadas destes técnicos neste período.',
  ],
  treat_ja_reimburses: [
    'Paid by the technician · J&A reimburses him (Reimbursements)',
    'Pagado por el técnico · J&A se lo reembolsa (Reembolsos)',
    'Pago pelo técnico · a J&A reembolsa (Reembolsos)',
  ],
  treat_ja_cost: [
    'Paid by J&A · J&A’s cost',
    'Pagado por J&A · coste de J&A',
    'Pago pela J&A · custo da J&A',
  ],
  treat_supplier_pays_technician: [
    'Paid by the technician · refunded by the supplier, not by J&A',
    'Pagado por el técnico · lo reembolsa el proveedor, no J&A',
    'Pago pelo técnico · reembolsado pelo fornecedor, não pela J&A',
  ],
  treat_recharge: [
    'Paid by J&A · recharged to the supplier',
    'Pagado por J&A · se carga al proveedor',
    'Pago pela J&A · cobrado do fornecedor',
  ],
  treat_not_ours: [
    'Paid by the client or others',
    'Pagado por el cliente u otros',
    'Pago pelo cliente ou outros',
  ],
  deductNow: ['deducted on payment', 'se descuenta al pagar', 'descontado no pagamento'],
  deductedTag: ['deducted', 'descontado', 'descontado'],
  toRecoverTag: [
    'still to recover from the supplier',
    'pendiente de cobrar al proveedor',
    'a cobrar do fornecedor',
  ],
  needsConversion: [
    'needs a currency conversion first',
    'necesita antes una conversión de moneda',
    'precisa antes de uma conversão de moeda',
  ],
  toDeduct: ['Recharged expenses to deduct', 'Gastos a descontar', 'Despesas a descontar'],
  deducted: ['Recharged expenses deducted', 'Gastos descontados', 'Despesas descontadas'],
  toRecover: [
    'Still to recover from the supplier (invoice it)',
    'Pendiente de cobrar al proveedor (facturar)',
    'A cobrar do fornecedor (faturar)',
  ],
  netToPay: ['Net to pay', 'Neto a pagar', 'Líquido a pagar'],
  colDate: ['Day', 'Día', 'Dia'],
  colWho: ['Technician', 'Técnico', 'Técnico'],
  colWhat: ['Expense', 'Gasto', 'Despesa'],
  colPays: ['Who pays', 'Quién paga', 'Quem paga'],
  colAmount: ['Amount', 'Importe', 'Valor'],
  // Invoice to the supplier for what is still to recover (D4 follow-up)
  invoicedTag: [
    'on invoice {number} to the supplier',
    'en la factura {number} al proveedor',
    'na fatura {number} ao fornecedor',
  ],
  invoicedDraftTag: [
    'on a draft invoice to the supplier',
    'en un borrador de factura al proveedor',
    'num rascunho de fatura ao fornecedor',
  ],
  invoiced: ['Invoiced to the supplier', 'Facturado al proveedor', 'Faturado ao fornecedor'],
  recoverTitle: [
    'Invoice the supplier for what is still to recover',
    'Facturar al proveedor lo pendiente de cobrar',
    'Faturar ao fornecedor o que falta cobrar',
  ],
  recoverIntro: [
    'J&A paid these expenses for the supplier’s technicians and could not deduct them from what J&A owes the supplier. Create an invoice to the supplier for them: it opens as a draft that you check, approve and issue in Billing.',
    'J&A pagó estos gastos por los técnicos del proveedor y no pudo descontarlos de lo que J&A le debe. Crea una factura al proveedor por ellos: se abre como borrador que revisas, apruebas y emites en Facturación.',
    'A J&A pagou estas despesas pelos técnicos do fornecedor e não conseguiu descontá-las do que a J&A deve a ele. Crie uma fatura ao fornecedor por elas: ela abre como rascunho que você revisa, aprova e emite em Faturamento.',
  ],
  recoverRules: [
    'One line per expense. Numbered like every invoice when issued ({example}). Once an expense is on an invoice it is no longer “still to recover” and it is never deducted or invoiced again. Voiding the invoice brings it back here.',
    'Una línea por gasto. Se numera como cualquier factura al emitirla ({example}). Cuando un gasto está en una factura deja de estar “pendiente de cobrar” y nunca se descuenta ni se factura otra vez. Si anulas la factura, vuelve aquí.',
    'Uma linha por despesa. Numerada como qualquer fatura ao ser emitida ({example}). Quando uma despesa está numa fatura, deixa de estar “a cobrar” e nunca é descontada nem faturada de novo. Se anular a fatura, ela volta para cá.',
  ],
  recoverBillsTo: ['Bills to', 'Se factura a', 'Faturado para'],
  recoverNeedDetails: [
    'This supplier has no billing details yet. Enter them once; they are kept for its next invoices.',
    'Este proveedor aún no tiene datos de facturación. Escríbelos una vez; se guardan para sus próximas facturas.',
    'Este fornecedor ainda não tem dados de faturamento. Preencha uma vez; eles ficam guardados para as próximas faturas.',
  ],
  recoverLegalName: ['Company name', 'Nombre de la empresa', 'Nome da empresa'],
  recoverAddress: ['Billing address', 'Dirección de facturación', 'Endereço de faturamento'],
  recoverEmail: [
    'Billing email (optional)',
    'Email de facturación (opcional)',
    'E-mail de faturamento (opcional)',
  ],
  recoverTaxId: [
    'Tax ID (VAT / NIF / CNPJ, optional)',
    'NIF / CIF / VAT (opcional)',
    'CNPJ / NIF / VAT (opcional)',
  ],
  recoverCode: [
    'Short code for invoice numbers (optional)',
    'Código corto para el número de factura (opcional)',
    'Código curto para o número da fatura (opcional)',
  ],
  recoverCodeHelp: [
    'e.g. ACME gives CP-ACME-001. Left empty, the client number is used.',
    'p. ej. ACME da CP-ACME-001. Si lo dejas vacío, se usa el número de cliente.',
    'ex.: ACME gera CP-ACME-001. Vazio, usa o número do cliente.',
  ],
  recoverCreate: [
    'Create invoice to the supplier (draft)',
    'Crear factura al proveedor (borrador)',
    'Criar fatura ao fornecedor (rascunho)',
  ],
  recoverCreated: [
    'Draft invoice to the supplier created. Check it, approve it and issue it in Billing.',
    'Borrador de factura al proveedor creado. Revísalo, apruébalo y emítelo en Facturación.',
    'Rascunho de fatura ao fornecedor criado. Revise, aprove e emita em Faturamento.',
  ],
  recoverOpen: ['Open invoice', 'Abrir factura', 'Abrir fatura'],
  recoverDraft: ['Draft', 'Borrador', 'Rascunho'],
  recoverInvoices: [
    'Invoices to the supplier for this period',
    'Facturas al proveedor de este periodo',
    'Faturas ao fornecedor deste período',
  ],
  recoverCount: ['{count} expense(s)', '{count} gasto(s)', '{count} despesa(s)'],
  // Technician (Expenses page) and coordinator (My team)
  techJa: [
    '{project}: J&A reimburses the expenses you pay yourself.',
    '{project}: J&A te reembolsa los gastos que pagues tú.',
    '{project}: a J&A reembolsa as despesas que você pagar.',
  ],
  techSupplier: [
    '{project}: your expenses are paid by your company ({supplier}), not by J&A. Ask your coordinator how to claim them.',
    '{project}: tus gastos los paga tu empresa ({supplier}), no J&A. Pregunta a tu coordinador cómo reclamarlos.',
    '{project}: suas despesas são pagas pela sua empresa ({supplier}), não pela J&A. Pergunte ao seu coordenador como pedir o reembolso.',
  ],
  coordTitle: [
    'Who pays your technicians’ expenses',
    'Quién paga los gastos de tus técnicos',
    'Quem paga as despesas dos seus técnicos',
  ],
  coordJa: [
    '{name} · {project}: J&A reimburses the technician',
    '{name} · {project}: J&A reembolsa al técnico',
    '{name} · {project}: a J&A reembolsa o técnico',
  ],
  coordSupplier: [
    '{name} · {project}: your company refunds the technician; what J&A paid for him is deducted from your settlement',
    '{name} · {project}: tu empresa reembolsa al técnico; lo que J&A pagó por él se descuenta de vuestra liquidación',
    '{name} · {project}: sua empresa reembolsa o técnico; o que a J&A pagou por ele é descontado do seu acerto',
  ],
} satisfies Record<string, CopyValue>;

export type SupplierExpenseCopyKey = keyof typeof copy;

export function supplierExpenseText(
  locale: string | undefined,
  key: SupplierExpenseCopyKey,
  params: Record<string, string | number> = {},
): string {
  const index = locale?.startsWith('es') ? 1 : locale?.startsWith('pt') ? 2 : 0;
  let value: string = copy[key]?.[index] ?? copy[key]?.[0] ?? key;
  for (const [name, replacement] of Object.entries(params))
    value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}

export function supplierCarrierLabel(locale: string | undefined, carrier: string | null): string {
  return supplierExpenseText(
    locale,
    carrier === 'supplier' ? 'supplier' : carrier === 'ja' ? 'ja' : 'notSet',
  );
}

export function supplierSourceLabel(locale: string | undefined, source: string): string {
  return supplierExpenseText(
    locale,
    source === 'person' ? 'fromPerson' : source === 'project' ? 'fromProject' : 'fromDefault',
  );
}

/** Plain status of a technician's expense in a supplier settlement (page, CSV and PDF). */
export function supplierExpenseStatusLabel(
  locale: string | undefined,
  item: Readonly<{
    treatment: string;
    rechargedSettlementId: string | null;
    recoveryInvoiceId?: string | null;
    recoveryInvoiceNumber?: string | null;
    amountMinor: string | null;
    deductNow?: boolean;
  }>,
): string {
  if (item.treatment !== 'recharge') return '';
  if (item.rechargedSettlementId) return supplierExpenseText(locale, 'deductedTag');
  if (item.recoveryInvoiceId)
    return item.recoveryInvoiceNumber
      ? supplierExpenseText(locale, 'invoicedTag', { number: item.recoveryInvoiceNumber })
      : supplierExpenseText(locale, 'invoicedDraftTag');
  if (item.amountMinor === null) return supplierExpenseText(locale, 'needsConversion');
  return supplierExpenseText(locale, item.deductNow ? 'deductNow' : 'toRecoverTag');
}
