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
  supplier: [
    'Recharged to the supplier',
    'Se cargan al proveedor',
    'Cobradas do fornecedor',
  ],
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
  person: ['{name}: {value} ({source})', '{name}: {value} ({source})', '{name}: {value} ({source})'],
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
  sectionTitle: [
    'Expenses of the technicians',
    'Gastos de los técnicos',
    'Despesas dos técnicos',
  ],
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
