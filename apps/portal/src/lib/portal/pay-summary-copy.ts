import type { PortalLocale } from '../portal-i18n';

/** Plain-language "My pay" summary for workers. */
const en = {
  title: 'Your pay at a glance',
  period: '{start} to {end}',
  earned: 'Earned (approved)',
  earnedHint: 'For {hours} of approved hours.',
  waiting: 'Waiting for approval',
  waitingHint: 'Hours and expenses you sent that are not approved yet.',
  returned: '{hours} sent back to you: fix and send again. Not counted as waiting.',
  toReceive: 'Still to be paid to you',
  toReceiveHint: 'Pay {pay} · Expense refunds {refunds}',
  nothingOwed: 'Nothing is waiting to be paid.',
  payableWhen: 'Approved hours become payable when J&A closes the pay period. Until then they show under Earned.',
  currencyHeading: 'In {name} ({code})',
  details: 'Details, statement and history',
} as const;
type Key = keyof typeof en;
const es: Record<Key, string> = {
  title: 'Tu pago de un vistazo',
  period: '{start} a {end}',
  earned: 'Ganado (aprobado)',
  earnedHint: 'Por {hours} de horas aprobadas.',
  waiting: 'Pendiente de aprobación',
  waitingHint: 'Horas y gastos que enviaste y aún no están aprobados.',
  returned: '{hours} te devolvieron: corrígelas y envíalas otra vez. No cuentan como pendientes.',
  toReceive: 'Pendiente de pagarte',
  toReceiveHint: 'Pago {pay} · Reembolso de gastos {refunds}',
  nothingOwed: 'No hay nada pendiente de pago.',
  payableWhen: 'Las horas aprobadas pasan a pagarse cuando J&A cierra el periodo de pago. Hasta entonces aparecen en Ganado.',
  currencyHeading: 'En {name} ({code})',
  details: 'Detalles, extracto e historial',
};
const pt: Record<Key, string> = {
  title: 'Seu pagamento em resumo',
  period: '{start} a {end}',
  earned: 'Ganho (aprovado)',
  earnedHint: 'Por {hours} de horas aprovadas.',
  waiting: 'Aguardando aprovação',
  waitingHint: 'Horas e despesas que você enviou e ainda não foram aprovadas.',
  returned: '{hours} foram devolvidas a você: corrija e envie de novo. Não contam como aguardando.',
  toReceive: 'Ainda a receber',
  toReceiveHint: 'Pagamento {pay} · Reembolso de despesas {refunds}',
  nothingOwed: 'Nada aguardando pagamento.',
  payableWhen: 'As horas aprovadas passam a ser pagas quando a J&A fecha o período de pagamento. Até lá aparecem em Ganho.',
  currencyHeading: 'Em {name} ({code})',
  details: 'Detalhes, demonstrativo e histórico',
};
export function paySummaryText(
  locale: PortalLocale,
  key: Key,
  params: Record<string, string | number> = {},
): string {
  const table: Record<Key, string> = locale === 'es' ? es : locale === 'pt' ? pt : en;
  return (table[key] ?? en[key]).replace(/\{(\w+)\}/gu, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

/** "In Mexican pesos (MXN)": the localized currency name, falling back to the code. */
export function payCurrencyHeading(locale: PortalLocale, code: string): string {
  let name = code;
  try {
    name =
      new Intl.DisplayNames([locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-BR' : 'en-US'], {
        type: 'currency',
      }).of(code) ?? code;
  } catch {
    /* unknown code: keep it */
  }
  return paySummaryText(locale, 'currencyHeading', { name, code });
}
