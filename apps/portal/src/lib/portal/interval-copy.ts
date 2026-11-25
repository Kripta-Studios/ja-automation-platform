/**
 * Plain words for pay and billing intervals (owner request 2026-11-25). [en-US, es-ES, pt-BR].
 * Shared by the person page, project team, client page, project billing, invoice composer,
 * My Pay, worker pay review and the subcontractor settlement.
 */
type PayIntervalValue = 'weekly' | 'every_14_days' | 'semi_monthly' | 'monthly';

/** Person page → Pay: the person's pay interval (Owner only). */
export type PersonPayIntervalView = {
  interval: PayIntervalValue | null;
  anchorDate: string | null;
  version: number;
  nextStart: string | null;
  nextEnd: string | null;
  overrides: Array<{
    projectMemberId: string;
    projectNumber: string;
    projectName: string;
    interval: PayIntervalValue;
  }>;
};

type CopyValue = readonly [string, string, string];

const copy = {
  weekly: ['Weekly', 'Semanal', 'Semanal'],
  every_14_days: ['Every 2 weeks', 'Cada 2 semanas', 'A cada 2 semanas'],
  semi_monthly: [
    'Twice a month (1–15 and 16–end)',
    'Dos veces al mes (1–15 y 16–fin)',
    'Duas vezes por mês (1–15 e 16–fim)',
  ],
  monthly: ['Monthly', 'Mensual', 'Mensal'],
  monthlyCutoff: [
    'Monthly, closing on day {day}',
    'Mensual, con cierre el día {day}',
    'Mensal, com fechamento no dia {day}',
  ],
  milestone: ['Per milestone', 'Por hito', 'Por marco'],
  manual: [
    'Manual (you choose the dates)',
    'Manual (eliges las fechas)',
    'Manual (você escolhe as datas)',
  ],
  custom: ['Custom dates', 'Fechas personalizadas', 'Datas personalizadas'],
  notSet: ['Not set', 'Sin definir', 'Não definido'],
  sameAsPerson: ['Same as the person', 'Igual que la persona', 'Igual à pessoa'],
  sameAsPersonWith: [
    'Same as the person ({interval})',
    'Igual que la persona ({interval})',
    'Igual à pessoa ({interval})',
  ],
  paid: ['Paid: {interval}', 'Pago: {interval}', 'Pagamento: {interval}'],
  invoiced: ['Invoice: {interval}', 'Factura: {interval}', 'Fatura: {interval}'],
  payIntervalLabel: ['How often paid', 'Frecuencia de pago', 'Frequência de pagamento'],
  invoiceIntervalLabel: [
    'How often invoiced',
    'Frecuencia de facturación',
    'Frequência de faturamento',
  ],
  nextPay: [
    'Next pay covers {range}',
    'El próximo pago cubre {range}',
    'O próximo pagamento cobre {range}',
  ],
  nextInvoice: [
    'Next invoice covers {range}',
    'La próxima factura cubre {range}',
    'A próxima fatura cobre {range}',
  ],
  thisStatement: [
    'This statement covers {range}',
    'Esta liquidación cubre {range}',
    'Este extrato cobre {range}',
  ],
  noPeriodMilestone: [
    'Invoices are made when a milestone is reached.',
    'Las facturas se hacen al alcanzar un hito.',
    'As faturas são feitas ao atingir um marco.',
  ],
  noPeriodManual: [
    'You choose the dates of each invoice.',
    'Eliges las fechas de cada factura.',
    'Você escolhe as datas de cada fatura.',
  ],
  firstDay: [
    'First day of a 2-week period',
    'Primer día de un período de 2 semanas',
    'Primeiro dia de um período de 2 semanas',
  ],
  firstDayHelp: [
    'Leave empty to count 2-week periods from Monday 5 Jan 2026.',
    'Déjalo vacío para contar períodos de 2 semanas desde el lunes 5 ene 2026.',
    'Deixe vazio para contar períodos de 2 semanas desde segunda 5 jan 2026.',
  ],
  cutoffDay: [
    'Closing day of the month (optional)',
    'Día de cierre del mes (opcional)',
    'Dia de fechamento do mês (opcional)',
  ],
  cutoffHelp: [
    'Empty = calendar month (1st to last day). 25 = from the 26th to the 25th.',
    'Vacío = mes natural (del 1 al último día). 25 = del 26 al 25.',
    'Vazio = mês civil (do dia 1 ao último). 25 = do dia 26 ao dia 25.',
  ],
  save: ['Save', 'Guardar', 'Salvar'],
  saved: ['Saved', 'Guardado', 'Salvo'],
  change: ['Change', 'Cambiar', 'Alterar'],
  cancel: ['Cancel', 'Cancelar', 'Cancelar'],
  failed: [
    'Could not save: {message}',
    'No se pudo guardar: {message}',
    'Não foi possível salvar: {message}',
  ],
  fromAssignment: [
    'set for this project',
    'definido para este proyecto',
    'definido para este projeto',
  ],
  fromPerson: ['person default', 'por defecto de la persona', 'padrão da pessoa'],
  fromClient: ['client default', 'por defecto del cliente', 'padrão do cliente'],
  fromProject: ['this project', 'este proyecto', 'este projeto'],
  payIntervalIntro: [
    'Used to pick the period of My Pay, the pay review and settlements. It does not change any amount.',
    'Sirve para elegir el período de Mi pago, la revisión de pago y las liquidaciones. No cambia ningún importe.',
    'Usado para escolher o período de Meu pagamento, da revisão de pagamento e dos acertos. Não altera nenhum valor.',
  ],
  overridesTitle: [
    'Projects with their own pay interval',
    'Proyectos con su propia frecuencia de pago',
    'Projetos com frequência de pagamento própria',
  ],
  clientIntervalIntro: [
    'Default for new project billing setups of this client. Each project can still use its own.',
    'Por defecto para las nuevas configuraciones de facturación de proyectos de este cliente. Cada proyecto puede usar la suya.',
    'Padrão para as novas configurações de faturamento dos projetos deste cliente. Cada projeto pode usar a sua.',
  ],
  previous: ['Previous', 'Anterior', 'Anterior'],
  next: ['Next', 'Siguiente', 'Próximo'],
  usePeriod: ['Use this period', 'Usar este período', 'Usar este período'],
  periodLabel: ['Period', 'Período', 'Período'],
} satisfies Record<string, CopyValue>;

export type IntervalCopyKey = keyof typeof copy;

function localeIndex(locale: string | undefined): 0 | 1 | 2 {
  return locale?.startsWith('es') ? 1 : locale?.startsWith('pt') ? 2 : 0;
}

export function intervalCopy(
  locale: string | undefined,
  key: IntervalCopyKey,
  params: Record<string, string | number> = {},
): string {
  let value: string = copy[key][localeIndex(locale)] ?? copy[key][0];
  for (const [name, replacement] of Object.entries(params))
    value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}

const CADENCES = [
  'weekly',
  'every_14_days',
  'semi_monthly',
  'monthly',
  'milestone',
  'manual',
  'custom',
] as const;

/** "Weekly", "Monthly, closing on day 25", "Per milestone"… */
export function intervalLabel(
  locale: string | undefined,
  cadence: string | null | undefined,
  monthlyCutoffDay?: number | string | null,
): string {
  const value = String(cadence ?? '');
  if (!value) return intervalCopy(locale, 'notSet');
  if (value === 'monthly' && monthlyCutoffDay != null && String(monthlyCutoffDay) !== '')
    return intervalCopy(locale, 'monthlyCutoff', { day: String(monthlyCutoffDay) });
  if ((CADENCES as readonly string[]).includes(value))
    return intervalCopy(locale, value as (typeof CADENCES)[number]);
  return value;
}

function intlLocale(locale: string | undefined): string {
  return localeIndex(locale) === 1 ? 'es-ES' : localeIndex(locale) === 2 ? 'pt-BR' : 'en-GB';
}

/** "1–30 Nov", "26 Oct – 25 Nov", "29 Dec 2026 – 11 Jan 2027". */
export function periodRange(
  locale: string | undefined,
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start || !end) return '';
  const parse = (value: string) => new Date(`${value}T00:00:00.000Z`);
  const from = parse(start);
  const to = parse(end);
  if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf())) return `${start} – ${end}`;
  const name = intlLocale(locale);
  const month = (date: Date) =>
    new Intl.DateTimeFormat(name, { month: 'short', timeZone: 'UTC' })
      .format(date)
      .replace('.', '');
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  const thisYear = new Date().getUTCFullYear();
  const year = (date: Date) =>
    sameYear && date.getUTCFullYear() === thisYear ? '' : ` ${date.getUTCFullYear()}`;
  if (sameYear && from.getUTCMonth() === to.getUTCMonth())
    return `${from.getUTCDate()}–${to.getUTCDate()} ${month(to)}${year(to)}`;
  return `${from.getUTCDate()} ${month(from)}${sameYear ? '' : year(from)} – ${to.getUTCDate()} ${month(to)}${year(to)}`;
}
