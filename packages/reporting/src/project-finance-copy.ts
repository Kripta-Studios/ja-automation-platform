import type { ReportLocale } from './report-i18n.ts';

/** Only controlled reader captions from the project-finance workbook.
 * Source records, column keys, identifiers and financial values never pass here.
 */
const captions: Readonly<Record<string, readonly [string, string]>> = {
  Section: ['Sección', 'Seção'],
  'What this measures': ['Qué mide', 'O que mede'],
  'Formatted value': ['Valor formateado', 'Valor formatado'],
  'Amount in project currency': ['Importe en la moneda del proyecto', 'Valor na moeda do projeto'],
  Hours: ['Horas', 'Horas'],
  Percent: ['Porcentaje', 'Percentual'],
  'Exact amount in minor units': [
    'Importe exacto en unidades menores',
    'Valor exato em unidades menores',
  ],
  Worker: ['Trabajador', 'Colaborador'],
  'Work date': ['Fecha de trabajo', 'Data do trabalho'],
  'Time category': ['Categoría de tiempo', 'Categoria de tempo'],
  'Hours recorded': ['Horas registradas', 'Horas registradas'],
  'Minutes recorded': ['Minutos registrados', 'Minutos registrados'],
  'Hours eligible to charge client': [
    'Horas elegibles para facturar al cliente',
    'Horas elegíveis para cobrança ao cliente',
  ],
  'Minutes eligible to charge client': [
    'Minutos elegibles para facturar al cliente',
    'Minutos elegíveis para cobrança ao cliente',
  ],
  'Potential amount to charge client': [
    'Posible importe a facturar al cliente',
    'Possível valor a cobrar do cliente',
  ],
  'Calculated internal labor cost': [
    'Coste interno de mano de obra calculado',
    'Custo interno de mão de obra calculado',
  ],
  'Calculated worker compensation': [
    'Remuneración del trabajador calculada',
    'Remuneração do colaborador calculada',
  ],
  'Client billing eligibility': [
    'Elegibilidad para facturación al cliente',
    'Elegibilidade para faturamento ao cliente',
  ],
  'Time approval status': ['Estado de aprobación del tiempo', 'Status de aprovação do tempo'],
  'Billing status': ['Estado de facturación', 'Status de faturamento'],
  'Linked invoice ID': ['ID de factura vinculada', 'ID da fatura vinculada'],
  'Potential client charge (minor units)': [
    'Posible cargo al cliente (unidades menores)',
    'Possível cobrança ao cliente (unidades menores)',
  ],
  'Internal labor cost (minor units)': [
    'Coste interno de mano de obra (unidades menores)',
    'Custo interno de mão de obra (unidades menores)',
  ],
  'Worker compensation (minor units)': [
    'Remuneración del trabajador (unidades menores)',
    'Remuneração do colaborador (unidades menores)',
  ],
  'Expense record ID': ['ID del registro de gasto', 'ID do registro de despesa'],
  'Expense date': ['Fecha del gasto', 'Data da despesa'],
  'Expense category': ['Categoría del gasto', 'Categoria da despesa'],
  'Expense description': ['Descripción del gasto', 'Descrição da despesa'],
  'Who paid at purchase': ['Quién pagó la compra', 'Quem pagou a compra'],
  'Currency of receipt': ['Moneda del recibo', 'Moeda do recibo'],
  'Amount entered from receipt': ['Importe registrado del recibo', 'Valor registrado do recibo'],
  'Calculated worker reimbursement': [
    'Reembolso del trabajador calculado',
    'Reembolso do colaborador calculado',
  ],
  'Amount actually reimbursed': [
    'Importe reembolsado efectivamente',
    'Valor efetivamente reembolsado',
  ],
  'Reimbursement status': ['Estado del reembolso', 'Status do reembolso'],
  'Client charge treatment': [
    'Tratamiento del cargo al cliente',
    'Tratamento da cobrança ao cliente',
  ],
  'Finance classification status': [
    'Estado de clasificación financiera',
    'Status da classificação financeira',
  ],
  'Approved company cost': ['Coste de empresa aprobado', 'Custo da empresa aprovado'],
  'Calculated company cost': ['Coste de empresa calculado', 'Custo da empresa calculado'],
  'Finance-approved client charge': [
    'Cargo al cliente aprobado por Finanzas',
    'Cobrança ao cliente aprovada pelo Financeiro',
  ],
  'Client charge awaiting finance approval': [
    'Cargo al cliente pendiente de aprobación financiera',
    'Cobrança ao cliente aguardando aprovação financeira',
  ],
  'Expense approval status': ['Estado de aprobación del gasto', 'Status de aprovação da despesa'],
  'Finance approval status': ['Estado de aprobación financiera', 'Status de aprovação financeira'],
  'Finance calculation status': ['Estado del cálculo financiero', 'Status do cálculo financeiro'],
  'Receipt amount (minor units)': [
    'Importe del recibo (unidades menores)',
    'Valor do recibo (unidades menores)',
  ],
  'Calculated reimbursement (minor units)': [
    'Reembolso calculado (unidades menores)',
    'Reembolso calculado (unidades menores)',
  ],
  'Paid reimbursement (minor units)': [
    'Reembolso pagado (unidades menores)',
    'Reembolso pago (unidades menores)',
  ],
  'Approved company cost (minor units)': [
    'Coste de empresa aprobado (unidades menores)',
    'Custo da empresa aprovado (unidades menores)',
  ],
  'Calculated company cost (minor units)': [
    'Coste de empresa calculado (unidades menores)',
    'Custo da empresa calculado (unidades menores)',
  ],
  'Finance-approved client charge (minor units)': [
    'Cargo al cliente aprobado por Finanzas (unidades menores)',
    'Cobrança ao cliente aprovada pelo Financeiro (unidades menores)',
  ],
  'Pending client charge (minor units)': [
    'Cargo al cliente pendiente (unidades menores)',
    'Cobrança ao cliente pendente (unidades menores)',
  ],
  'Record type': ['Tipo de registro', 'Tipo de registro'],
  'Record ID': ['ID del registro', 'ID do registro'],
  'Work or expense date': ['Fecha de trabajo o gasto', 'Data do trabalho ou da despesa'],
  'Worker ID': ['ID del trabajador', 'ID do colaborador'],
  'Approved amount not yet invoiced': [
    'Importe aprobado aún no facturado',
    'Valor aprovado ainda não faturado',
  ],
  'Unbilled amount (minor units)': [
    'Importe no facturado (unidades menores)',
    'Valor não faturado (unidades menores)',
  ],
  'Extra billable hours from daily minimum': [
    'Horas facturables adicionales del mínimo diario',
    'Horas faturáveis adicionais do mínimo diário',
  ],
  'Extra billable minutes from daily minimum': [
    'Minutos facturables adicionales del mínimo diario',
    'Minutos faturáveis adicionais do mínimo diário',
  ],
  'Potential client charge from daily minimum': [
    'Posible cargo al cliente por mínimo diario',
    'Possível cobrança ao cliente pelo mínimo diário',
  ],
  'Daily minimum charge (minor units)': [
    'Cargo por mínimo diario (unidades menores)',
    'Cobrança pelo mínimo diário (unidades menores)',
  ],
  'Invoice number': ['Número de factura', 'Número da fatura'],
  'Billing stream': ['Flujo de facturación', 'Fluxo de faturamento'],
  'Invoice status': ['Estado de la factura', 'Status da fatura'],
  'Service period start': ['Inicio del período de servicio', 'Início do período de serviço'],
  'Service period end': ['Fin del período de servicio', 'Fim do período de serviço'],
  'Invoice currency': ['Moneda de la factura', 'Moeda da fatura'],
  'Invoice total including tax': ['Total de factura con impuestos', 'Total da fatura com impostos'],
  'Expense lines on invoice': ['Líneas de gastos en la factura', 'Itens de despesas na fatura'],
  'Expense lines charged to client': [
    'Líneas de gastos facturadas al cliente',
    'Itens de despesas cobrados do cliente',
  ],
  'Payments collected': ['Pagos cobrados', 'Pagamentos recebidos'],
  'Issued date': ['Fecha de emisión', 'Data de emissão'],
  'Due date': ['Fecha de vencimiento', 'Data de vencimento'],
  'Invoice total (minor units)': [
    'Total de factura (unidades menores)',
    'Total da fatura (unidades menores)',
  ],
  'Invoiced expense lines (minor units)': [
    'Líneas de gastos facturadas (unidades menores)',
    'Itens de despesas faturadas (unidades menores)',
  ],
  'Collected payments (minor units)': [
    'Pagos cobrados (unidades menores)',
    'Pagamentos recebidos (unidades menores)',
  ],
  'Invoice ID': ['ID de la factura', 'ID da fatura'],
  'Source expense ID': ['ID del gasto de origen', 'ID da despesa de origem'],
  'Line charged to client': ['Línea facturada al cliente', 'Item cobrado do cliente'],
  'Expense amount on invoice': ['Importe del gasto en la factura', 'Valor da despesa na fatura'],
  'Invoiced expense (minor units)': [
    'Gasto facturado (unidades menores)',
    'Despesa faturada (unidades menores)',
  ],
  Milestone: ['Hito', 'Marco'],
  'Approval status': ['Estado de aprobación', 'Status de aprovação'],
  'Milestone amount to charge client': [
    'Importe del hito a facturar al cliente',
    'Valor do marco a cobrar do cliente',
  ],
  'Milestone amount (minor units)': [
    'Importe del hito (unidades menores)',
    'Valor do marco (unidades menores)',
  ],
  'Finance alert code': ['Código de alerta financiera', 'Código do alerta financeiro'],
  'Affected record ID': ['ID del registro afectado', 'ID do registro afetado'],
  'Project number': ['Número de proyecto', 'Número do projeto'],
  'Project name': ['Nombre del proyecto', 'Nome do projeto'],
  'Client number': ['Número de cliente', 'Número do cliente'],
  'Client name': ['Nombre del cliente', 'Nome do cliente'],
  Currency: ['Moneda', 'Moeda'],
  'Period start': ['Inicio del período', 'Início do período'],
  'Period end': ['Fin del período', 'Fim do período'],
  'Billing model': ['Modelo de facturación', 'Modelo de faturamento'],
  'Projection state': ['Estado de la proyección', 'Status da projeção'],
  'Potential labor charges to client': [
    'Posibles cargos de mano de obra al cliente',
    'Possíveis cobranças de mão de obra ao cliente',
  ],
  'Finance-approved expense charges to client': [
    'Cargos de gastos al cliente aprobados por Finanzas',
    'Cobranças de despesas ao cliente aprovadas pelo Financeiro',
  ],
  'Approved milestone charges to client': [
    'Cargos de hitos al cliente aprobados',
    'Cobranças de marcos ao cliente aprovadas',
  ],
  'Potential total charges to client': [
    'Posibles cargos totales al cliente',
    'Possíveis cobranças totais ao cliente',
  ],
  'Internal labor cost': ['Coste interno de mano de obra', 'Custo interno de mão de obra'],
  'Travel cost': ['Coste de viajes', 'Custo de viagens'],
  'Other direct cost': ['Otro coste directo', 'Outro custo direto'],
  'Approved direct company cost': [
    'Coste directo de empresa aprobado',
    'Custo direto da empresa aprovado',
  ],
  'Worker compensation': ['Remuneración del trabajador', 'Remuneração do colaborador'],
  Contribution: ['Contribución', 'Contribuição'],
  'Contribution margin': ['Margen de contribución', 'Margem de contribuição'],
  'Actual hours': ['Horas reales', 'Horas efetivas'],
  'Approved hours': ['Horas aprobadas', 'Horas aprovadas'],
  'Billable hours': ['Horas facturables', 'Horas faturáveis'],
  'Invoiced to client before tax': [
    'Facturado al cliente antes de impuestos',
    'Faturado ao cliente antes dos impostos',
  ],
  'Invoiced to client including tax': [
    'Facturado al cliente con impuestos',
    'Faturado ao cliente com impostos',
  ],
  'Payments collected from client': [
    'Pagos cobrados del cliente',
    'Pagamentos recebidos do cliente',
  ],
  'Outstanding client balance': ['Saldo pendiente del cliente', 'Saldo pendente do cliente'],
  'Approved charges not yet invoiced': [
    'Cargos aprobados aún no facturados',
    'Cobranças aprovadas ainda não faturadas',
  ],
  'Potential charges awaiting approval': [
    'Posibles cargos pendientes de aprobación',
    'Possíveis cobranças aguardando aprovação',
  ],
  Budget: ['Presupuesto', 'Orçamento'],
  'Remaining cap': ['Límite restante', 'Limite restante'],
  'Budget consumed': ['Presupuesto consumido', 'Orçamento consumido'],
  'Travel budget': ['Presupuesto de viajes', 'Orçamento de viagens'],
  'Expense budget': ['Presupuesto de gastos', 'Orçamento de despesas'],
  'Expense budget consumed': ['Presupuesto de gastos consumido', 'Orçamento de despesas consumido'],
  'Estimate to complete': ['Estimación para completar', 'Estimativa para concluir'],
  'Estimate at completion cost': ['Coste estimado al finalizar', 'Custo estimado na conclusão'],
  'Estimate at completion revenue': [
    'Ingresos estimados al finalizar',
    'Receita estimada na conclusão',
  ],
  'Expected final margin': ['Margen final previsto', 'Margem final prevista'],
  'Forecast basis': ['Base de la previsión', 'Base da previsão'],
  'How to read this file': ['Cómo leer este archivo', 'Como ler este arquivo'],
  'Potential client charge': ['Posible cargo al cliente', 'Possível cobrança ao cliente'],
  'Zero versus blank': ['Cero frente a vacío', 'Zero versus vazio'],
  'The source expense amount, even when approval, reimbursement or client billing is not configured.':
    [
      'El importe del gasto original, incluso cuando no se ha configurado la aprobación, el reembolso o la facturación al cliente.',
      'O valor da despesa original, mesmo quando a aprovação, o reembolso ou o faturamento ao cliente não estão configurados.',
    ],
  'Blank until a reimbursement amount is configured; it is not proof of payment.': [
    'Vacío hasta que se configure un importe de reembolso; no es prueba de pago.',
    'Vazio até que um valor de reembolso seja configurado; não é comprovante de pagamento.',
  ],
  'Shown only when the reimbursement is marked reimbursed.': [
    'Se muestra solo cuando el reembolso está marcado como reembolsado.',
    'Exibido somente quando o reembolso está marcado como reembolsado.',
  ],
  'An estimate from the rate or billing rule; check Invoices and Invoice expenses for amounts actually placed on an invoice.':
    [
      'Una estimación basada en la tarifa o regla de facturación; consulta Facturas y Gastos facturados para ver los importes realmente incluidos en una factura.',
      'Uma estimativa baseada na tarifa ou regra de faturamento; consulte Faturas e Despesas faturadas para ver os valores efetivamente incluídos em uma fatura.',
    ],
  'Zero is a calculated value. Blank means the amount is not configured or not yet available.': [
    'Cero es un valor calculado. Vacío significa que el importe no está configurado o aún no está disponible.',
    'Zero é um valor calculado. Vazio significa que o valor não está configurado ou ainda não está disponível.',
  ],
};

export function projectFinanceCaption(value: string, locale: ReportLocale): string {
  if (locale === 'en' || !Object.hasOwn(captions, value)) return value;
  return captions[value]?.[locale === 'es' ? 0 : 1] ?? value;
}
