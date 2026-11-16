import type { PortalLocale } from '../portal-i18n';

/** Plain-language "My pay" summary for workers. */
const en = {
  title: 'Your pay at a glance',
  period: '{start} to {end}',
  earned: 'Earned (approved)',
  earnedHint: 'For {hours} of approved hours.',
  waiting: 'Waiting for approval',
  waitingHint: 'Hours and expenses you sent that are not approved yet.',
  toReceive: 'Still to be paid to you',
  toReceiveHint: 'Pay {pay} · Expense refunds {refunds}',
  nothingOwed: 'Nothing is waiting to be paid.',
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
  toReceive: 'Pendiente de pagarte',
  toReceiveHint: 'Pago {pay} · Reembolso de gastos {refunds}',
  nothingOwed: 'No hay nada pendiente de pago.',
  details: 'Detalles, extracto e historial',
};
const pt: Record<Key, string> = {
  title: 'Seu pagamento em resumo',
  period: '{start} a {end}',
  earned: 'Ganho (aprovado)',
  earnedHint: 'Por {hours} de horas aprovadas.',
  waiting: 'Aguardando aprovação',
  waitingHint: 'Horas e despesas que você enviou e ainda não foram aprovadas.',
  toReceive: 'Ainda a receber',
  toReceiveHint: 'Pagamento {pay} · Reembolso de despesas {refunds}',
  nothingOwed: 'Nada aguardando pagamento.',
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
