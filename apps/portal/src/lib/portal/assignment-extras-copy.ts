/**
 * Copy for the optional per-person "Extras" (per diem, safety allowance, overtime, expenses)
 * on Add people / assignment edit, and the invoice component switches (owner request
 * 2026-11-25). [en-US, es-ES, pt-BR].
 */
type CopyValue = readonly [string, string, string];

const copy = {
  extras: ['Extras (optional)', 'Extras (opcional)', 'Extras (opcional)'],
  extrasHelp: [
    'Only if this person has them. Leave a box empty when it does not apply. The client amount goes on invoices; the worker amount goes into their pay.',
    'Solo si esta persona los tiene. Deja vacío lo que no aplique. El importe del cliente va en las facturas; el del trabajador, en su pago.',
    'Só se esta pessoa tiver. Deixe vazio o que não se aplica. O valor do cliente vai nas faturas; o do trabalhador, no pagamento dele.',
  ],
  extrasNone: ['No extras', 'Sin extras', 'Sem extras'],
  extrasButton: ['Extras', 'Extras', 'Extras'],
  edit: ['Change', 'Cambiar', 'Alterar'],
  extrasFor: ['Extras for {name}', 'Extras de {name}', 'Extras de {name}'],
  clientSide: [
    'Client pays ({currency})',
    'Paga el cliente ({currency})',
    'Cliente paga ({currency})',
  ],
  workerSide: [
    'Worker gets ({currency})',
    'Recibe el trabajador ({currency})',
    'Trabalhador recebe ({currency})',
  ],
  expenses: ['Expenses', 'Gastos', 'Despesas'],
  expensesProject: [
    'Project rules (no change)',
    'Reglas del proyecto (sin cambios)',
    'Regras do projeto (sem mudança)',
  ],
  expensesNone: ['Not covered', 'No cubiertos', 'Não cobertas'],
  expensesWorker: [
    'Reimbursed to the worker',
    'Se reembolsan al trabajador',
    'Reembolsadas ao trabalhador',
  ],
  expensesClient: ['Recharged to the client', 'Se repercuten al cliente', 'Repassadas ao cliente'],
  expensesBoth: [
    'Reimbursed to the worker and recharged to the client',
    'Se reembolsan al trabajador y se repercuten al cliente',
    'Reembolsadas ao trabalhador e repassadas ao cliente',
  ],
  expensesHelp: [
    'For expenses this person pays. Applies from today.',
    'Para los gastos que paga esta persona. Se aplica desde hoy.',
    'Para as despesas que esta pessoa paga. Vale a partir de hoje.',
  ],
  perDiem: [
    'Per diem (per day worked)',
    'Viáticos (por día trabajado)',
    'Diária (por dia trabalhado)',
  ],
  perDiemHelp: [
    'Counted once for each day with approved hours on this project.',
    'Se cuenta una vez por cada día con horas aprobadas en este proyecto.',
    'Conta uma vez por cada dia com horas aprovadas neste projeto.',
  ],
  overtime: ['Overtime', 'Horas extra', 'Horas extras'],
  overtimeHow: ['How', 'Cómo', 'Como'],
  overtimeProject: ['Project rules', 'Reglas del proyecto', 'Regras do projeto'],
  overtimeMultiplier: ['Multiplier (×)', 'Multiplicador (×)', 'Multiplicador (×)'],
  overtimeRate: ['Fixed rate per hour', 'Tarifa fija por hora', 'Valor fixo por hora'],
  overtimeHelp: [
    'For hours marked as overtime (or above the daily limit). A multiplier such as 1.5 applies to the regular rate.',
    'Para horas marcadas como extra (o por encima del límite diario). Un multiplicador como 1.5 se aplica a la tarifa normal.',
    'Para horas marcadas como extras (ou acima do limite diário). Um multiplicador como 1.5 se aplica ao valor normal.',
  ],
  clientMultiplier: ['Client (×)', 'Cliente (×)', 'Cliente (×)'],
  workerMultiplier: ['Worker (×)', 'Trabajador (×)', 'Trabalhador (×)'],
  allowance: [
    'Safety / hazard allowance',
    'Plus de seguridad / peligrosidad',
    'Adicional de segurança / periculosidade',
  ],
  allowanceHelp: [
    'For example a job in Iraq. Per day: each day with approved hours. Per month: once for each month worked.',
    'Por ejemplo un trabajo en Irak. Por día: cada día con horas aprobadas. Por mes: una vez por cada mes trabajado.',
    'Por exemplo um trabalho no Iraque. Por dia: cada dia com horas aprovadas. Por mês: uma vez por cada mês trabalhado.',
  ],
  perDay: ['Per day', 'Por día', 'Por dia'],
  perMonth: ['Per month', 'Por mes', 'Por mês'],
  changesNote: [
    'Changes apply to days not invoiced or paid yet.',
    'Los cambios se aplican a los días aún no facturados ni pagados.',
    'As mudanças valem para os dias ainda não faturados nem pagos.',
  ],
  save: ['Save extras', 'Guardar extras', 'Salvar extras'],
  saved: ['{name}: extras saved', '{name}: extras guardados', '{name}: extras salvos'],
  cancel: ['Cancel', 'Cancelar', 'Cancelar'],
  saving: ['Saving…', 'Guardando…', 'Salvando…'],
  addedNoExtras: [
    '{name} was added, but the extras were not saved: {message}',
    '{name} se añadió, pero los extras no se guardaron: {message}',
    '{name} foi adicionado, mas os extras não foram salvos: {message}',
  ],
  summaryPerDiem: ['Per diem {client}/day', 'Viáticos {client}/día', 'Diária {client}/dia'],
  summaryOvertime: ['Overtime {value}', 'Horas extra {value}', 'Horas extras {value}'],
  summaryAllowance: [
    'Allowance {client}/{basis}',
    'Plus {client}/{basis}',
    'Adicional {client}/{basis}',
  ],
  summaryExpenses: ['Expenses: {value}', 'Gastos: {value}', 'Despesas: {value}'],
  shortNone: ['not covered', 'no cubiertos', 'não cobertas'],
  shortWorker: ['to worker', 'al trabajador', 'ao trabalhador'],
  shortClient: ['to client', 'al cliente', 'ao cliente'],
  shortBoth: ['worker + client', 'trabajador + cliente', 'trabalhador + cliente'],
  day: ['day', 'día', 'dia'],
  month: ['month', 'mes', 'mês'],
  // Invoice component switches
  includeTitle: [
    'What to bill for each person',
    'Qué facturar de cada persona',
    'O que faturar de cada pessoa',
  ],
  includeHelp: [
    'Untick what you want to leave out of this invoice. Hours, expenses, per diem and allowance left out stay open for a later invoice; overtime left out is not charged.',
    'Desmarca lo que quieras dejar fuera de esta factura. Las horas, gastos, viáticos y pluses que dejes fuera quedan pendientes para otra factura; las horas extra que dejes fuera no se cobran.',
    'Desmarque o que quiser deixar fora desta fatura. Horas, despesas, diárias e adicionais deixados fora ficam pendentes para outra fatura; horas extras deixadas fora não são cobradas.',
  ],
  componentHours: ['Hours', 'Horas', 'Horas'],
  componentOvertime: ['Overtime', 'Horas extra', 'Horas extras'],
  componentPerDiem: ['Per diem', 'Viáticos', 'Diárias'],
  componentAllowance: ['Safety allowance', 'Plus de seguridad', 'Adicional de segurança'],
  componentExpenses: ['Expenses', 'Gastos', 'Despesas'],
  leftOut: ['left out', 'fuera', 'fora'],
  previewTotal: ['Total of this invoice', 'Total de esta factura', 'Total desta fatura'],
  updating: ['Updating…', 'Actualizando…', 'Atualizando…'],
  // My Pay
  payExtras: ['Extras in this estimate', 'Extras en esta estimación', 'Extras nesta estimativa'],
  payPerDiem: [
    'Per diem · {count} {unit}',
    'Viáticos · {count} {unit}',
    'Diárias · {count} {unit}',
  ],
  payAllowance: [
    'Safety allowance · {count} {unit}',
    'Plus de seguridad · {count} {unit}',
    'Adicional de segurança · {count} {unit}',
  ],
  days: ['days', 'días', 'dias'],
  months: ['months', 'meses', 'meses'],
  waiting: ['waiting for approval', 'pendiente de aprobación', 'aguardando aprovação'],
} satisfies Record<string, CopyValue>;

export type AssignmentExtrasCopyKey = keyof typeof copy;

export function extrasText(
  locale: string | undefined,
  key: AssignmentExtrasCopyKey,
  params: Record<string, string | number> = {},
): string {
  const index = locale?.startsWith('es') ? 1 : locale?.startsWith('pt') ? 2 : 0;
  let value: string = copy[key]?.[index] ?? copy[key]?.[0] ?? key;
  for (const [name, replacement] of Object.entries(params))
    value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}

/** Form values of the Extras block (mirrors the server's ExtrasFormValues). */
export type ExtrasValues = {
  version: number;
  perDiemClient: string;
  perDiemWorker: string;
  allowanceBasis: '' | 'day' | 'month';
  allowanceClient: string;
  allowanceWorker: string;
  overtimeClientMethod: '' | 'multiplier' | 'rate';
  overtimeClient: string;
  overtimeWorkerMethod: '' | 'multiplier' | 'rate';
  overtimeWorker: string;
  expenses: '' | 'none' | 'worker' | 'client' | 'both';
};

export function emptyExtras(): ExtrasValues {
  return {
    version: 0,
    perDiemClient: '',
    perDiemWorker: '',
    allowanceBasis: '',
    allowanceClient: '',
    allowanceWorker: '',
    overtimeClientMethod: '',
    overtimeClient: '',
    overtimeWorkerMethod: '',
    overtimeWorker: '',
    expenses: '',
  };
}

/** Anything typed or chosen (a blank block is "no extras"). */
export function extrasChosen(values: ExtrasValues): boolean {
  return Boolean(
    values.perDiemClient.trim() ||
    values.perDiemWorker.trim() ||
    values.allowanceClient.trim() ||
    values.allowanceWorker.trim() ||
    values.overtimeClient.trim() ||
    values.overtimeWorker.trim() ||
    values.expenses,
  );
}

/** Short summary for a team row: "Per diem 50.00/day · Overtime ×1.5". */
export function extrasSummary(locale: string, values: ExtrasValues | undefined): string {
  if (!values) return '';
  const t = (key: AssignmentExtrasCopyKey, params: Record<string, string | number> = {}) =>
    extrasText(locale, key, params);
  const parts: string[] = [];
  if (values.perDiemClient || values.perDiemWorker)
    parts.push(t('summaryPerDiem', { client: values.perDiemClient || values.perDiemWorker }));
  if (values.overtimeClient || values.overtimeWorker) {
    const value = values.overtimeClient || values.overtimeWorker;
    const method = values.overtimeClient
      ? values.overtimeClientMethod
      : values.overtimeWorkerMethod;
    parts.push(
      t('summaryOvertime', { value: method === 'multiplier' ? `×${value}` : `${value}/h` }),
    );
  }
  if (values.allowanceClient || values.allowanceWorker)
    parts.push(
      t('summaryAllowance', {
        client: values.allowanceClient || values.allowanceWorker,
        basis: t(values.allowanceBasis === 'month' ? 'month' : 'day'),
      }),
    );
  if (values.expenses)
    parts.push(
      t('summaryExpenses', {
        value: t(
          values.expenses === 'none'
            ? 'shortNone'
            : values.expenses === 'worker'
              ? 'shortWorker'
              : values.expenses === 'client'
                ? 'shortClient'
                : 'shortBoth',
        ),
      }),
    );
  return parts.join(' · ');
}

/** Form fields posted to ?/setAssignmentExtras. */
export function extrasFields(values: ExtrasValues): Record<string, string> {
  const method = values.overtimeClientMethod || values.overtimeWorkerMethod;
  return {
    version: String(values.version),
    perDiemClient: values.perDiemClient,
    perDiemWorker: values.perDiemWorker,
    allowanceBasis:
      values.allowanceClient || values.allowanceWorker ? values.allowanceBasis || 'day' : '',
    allowanceClient: values.allowanceClient,
    allowanceWorker: values.allowanceWorker,
    overtimeClientMethod: values.overtimeClient ? method : '',
    overtimeClient: values.overtimeClient,
    overtimeWorkerMethod: values.overtimeWorker ? method : '',
    overtimeWorker: values.overtimeWorker,
    expenses: values.expenses,
  };
}
