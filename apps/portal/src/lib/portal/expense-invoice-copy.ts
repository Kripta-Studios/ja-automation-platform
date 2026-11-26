import type { PortalLocale } from '$lib/portal-i18n';

/**
 * Expenses on the same invoice or on a separate invoice (owner request 2026-11-26): the
 * plain words used on the client page, the project billing tab and New invoice.
 */
type Triple = readonly [en: string, es: string, pt: string];

const copy = {
  title: ['Expenses', 'Gastos', 'Despesas'],
  same: ['On the same invoice', 'En la misma factura', 'Na mesma fatura'],
  separate: ['On a separate invoice', 'En una factura aparte', 'Em uma fatura separada'],
  notSet: ['Not set (on the same invoice)', 'Sin definir (en la misma factura)', 'Não definido (na mesma fatura)'],
  sameHelp: [
    'Hours, extras and expenses go on one invoice.',
    'Horas, extras y gastos van en una sola factura.',
    'Horas, extras e despesas vão em uma só fatura.',
  ],
  separateHelp: [
    'Hours and extras on one invoice, expenses on their own invoice.',
    'Horas y extras en una factura; los gastos en su propia factura.',
    'Horas e extras em uma fatura; as despesas em uma fatura própria.',
  ],
  clientHelp: [
    'Default for this client’s projects. A project can choose otherwise on its Billing tab.',
    'Valor por defecto para los proyectos de este cliente. Cada proyecto puede elegir otra cosa en su pestaña Facturación.',
    'Padrão para os projetos deste cliente. Cada projeto pode escolher outra opção na aba Faturamento.',
  ],
  sourceProject: ['this project', 'este proyecto', 'este projeto'],
  sourceClient: ['client default', 'valor del cliente', 'padrão do cliente'],
  sourceDefault: ['not set', 'sin definir', 'não definido'],
  change: ['Change', 'Cambiar', 'Alterar'],
  save: ['Save', 'Guardar', 'Salvar'],
  saving: ['Saving…', 'Guardando…', 'Salvando…'],
  cancel: ['Cancel', 'Cancelar', 'Cancelar'],
  saved: ['Saved.', 'Guardado.', 'Salvo.'],
  saveFailed: ['Could not save. Reload and try again.', 'No se pudo guardar. Recarga e inténtalo de nuevo.', 'Não foi possível salvar. Recarregue e tente de novo.'],
  appliesFrom: ['Applies from {date}.', 'Se aplica desde el {date}.', 'Vale a partir de {date}.'],
  projectNeedsSetup: [
    'Set up how this project is invoiced first; it will start with this choice.',
    'Primero configura cómo se factura este proyecto; empezará con esta opción.',
    'Primeiro configure como este projeto é faturado; ele começará com esta opção.',
  ],
  // New invoice
  choiceLabel: ['Put expenses on a separate invoice', 'Poner los gastos en una factura aparte', 'Colocar as despesas em uma fatura separada'],
  choiceSaved: [
    'Also saved for this project from {date}: next invoices do the same.',
    'También se guarda para este proyecto desde el {date}: las próximas facturas harán lo mismo.',
    'Também fica salvo para este projeto a partir de {date}: as próximas faturas farão o mesmo.',
  ],
  choiceBlocked: [
    'For these dates this can’t change (earlier invoices exist). It can from {date}.',
    'Para estas fechas no se puede cambiar (hay facturas anteriores). Se puede desde el {date}.',
    'Para estas datas não pode mudar (há faturas anteriores). Pode a partir de {date}.',
  ],
  choiceOpen: [
    '{count} expenses of these dates stay open: this project’s billing does not include expenses yet.',
    '{count} gastos de estas fechas quedan abiertos: la facturación de este proyecto aún no incluye gastos.',
    '{count} despesas destas datas ficam em aberto: o faturamento deste projeto ainda não inclui despesas.',
  ],
  companionTitle: ['Second invoice: expenses', 'Segunda factura: gastos', 'Segunda fatura: despesas'],
  companionReady: ['{count} expenses', '{count} gastos', '{count} despesas'],
  companionNone: [
    'No expenses ready to invoice for these dates.',
    'No hay gastos listos para facturar en estas fechas.',
    'Não há despesas prontas para faturar nestas datas.',
  ],
  companionBlocked: [
    'The expense invoice can’t be made for these dates yet. The expenses stay open.',
    'La factura de gastos aún no se puede hacer para estas fechas. Los gastos quedan abiertos.',
    'A fatura de despesas ainda não pode ser feita para estas datas. As despesas ficam em aberto.',
  ],
  companionExisting: [
    'The expenses of these dates are already on an invoice.',
    'Los gastos de estas fechas ya están en una factura.',
    'As despesas destas datas já estão em uma fatura.',
  ],
  companionLeftOut: [
    '{count} expenses left out stay open for a later invoice.',
    '{count} gastos que quedan fuera siguen abiertos para otra factura.',
    '{count} despesas deixadas de fora ficam em aberto para outra fatura.',
  ],
  companionReview: ['Review expenses', 'Revisar gastos', 'Revisar despesas'],
  hoursInvoice: ['Hours and extras', 'Horas y extras', 'Horas e extras'],
  expenseInvoice: ['Expenses', 'Gastos', 'Despesas'],
  twoTotal: ['2 invoices', '2 facturas', '2 faturas'],
  saveTwo: ['Save 2 drafts', 'Guardar 2 borradores', 'Salvar 2 rascunhos'],
  issueTwo: ['Issue 2 invoices', 'Emitir 2 facturas', 'Emitir 2 faturas'],
  issueTwoConfirm: [
    'Issue 2 invoices for {amount}?',
    '¿Emitir 2 facturas por {amount}?',
    'Emitir 2 faturas por {amount}?',
  ],
  doneDrafts: [
    '2 draft invoices saved: hours and extras, and expenses.',
    '2 borradores guardados: horas y extras, y gastos.',
    '2 rascunhos salvos: horas e extras, e despesas.',
  ],
  doneIssued: [
    '2 invoices issued: hours and extras, and expenses.',
    '2 facturas emitidas: horas y extras, y gastos.',
    '2 faturas emitidas: horas e extras, e despesas.',
  ],
  // Composer
  composerSeparate: [
    'Expenses of this project go on a separate invoice. Choose “Expenses” above to invoice them.',
    'Los gastos de este proyecto van en una factura aparte. Elige «Gastos» arriba para facturarlos.',
    'As despesas deste projeto vão em uma fatura separada. Escolha “Despesas” acima para faturá-las.',
  ],
  composerSame: [
    'Expenses of this project go on the same invoice as the hours.',
    'Los gastos de este proyecto van en la misma factura que las horas.',
    'As despesas deste projeto vão na mesma fatura que as horas.',
  ],
  composerChange: [
    'Change in the project’s Billing tab',
    'Cambiar en la pestaña Facturación del proyecto',
    'Alterar na aba Faturamento do projeto',
  ],
} satisfies Record<string, Triple>;

export type ExpenseInvoiceCopyKey = keyof typeof copy;

export function expenseInvoiceText(
  locale: PortalLocale,
  key: ExpenseInvoiceCopyKey,
  params: Record<string, string | number> = {},
): string {
  const index = locale === 'es' ? 1 : locale === 'pt' ? 2 : 0;
  return Object.entries(params).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    copy[key][index],
  );
}

/** "On a separate invoice (client default)" — the setting in plain words with its source. */
export function expenseInvoiceSummary(
  locale: PortalLocale,
  mode: 'same' | 'separate',
  source: 'project' | 'client' | 'default',
): string {
  if (source === 'default') return expenseInvoiceText(locale, 'notSet');
  const where = expenseInvoiceText(locale, mode);
  const from = expenseInvoiceText(locale, source === 'project' ? 'sourceProject' : 'sourceClient');
  return `${where} (${from})`;
}
