import type { PortalLocale } from '../portal-i18n';
type Topic = { title: string; body: string; route: string };
const topics: Record<
  string,
  {
    roles: string[];
    route: string;
    en: [string, string];
    es: [string, string];
    pt: [string, string];
  }
> = {
  time: {
    roles: ['worker', 'project_manager', 'owner_admin'],
    route: 'time',
    en: [
      'Record and submit time',
      'Choose Log time, the assigned project and the actual date and hours. Save draft lets you check or edit it. Submit sends the record to the project reviewer; it does not approve or pay it. Open the record to inspect its history.',
    ],
    es: [
      'Registrar y enviar horas',
      'En Log time elige el proyecto asignado y la fecha y horas reales. Save draft guarda un borrador editable. Submit lo envía al responsable del proyecto; no lo aprueba ni lo paga. Abre el registro para consultar su historial.',
    ],
    pt: [
      'Registrar e enviar horas',
      'Em Log time selecione o projeto atribuído, a data e as horas reais. Save draft salva um rascunho editável. Submit envia ao responsável do projeto; não aprova nem paga. Abra o registro para consultar o histórico.',
    ],
  },
  expenses: {
    roles: ['worker', 'project_manager', 'owner_admin', 'finance_admin'],
    route: 'expenses',
    en: [
      'Expenses and reimbursement',
      'Record expense saves the receipt, vendor, date, currency, amount and who paid. Submit sends it for operational approval. Approved means the expense was accepted, not that the worker was repaid. Finance records the repayment date, amount and reference in Worker reimbursement queue.',
    ],
    es: [
      'Gastos y reembolsos',
      'Record expense guarda el recibo, proveedor, fecha, moneda, importe y quién pagó. Submit lo envía a aprobación operativa. Approved significa aceptado, no reembolsado. Finanzas registra fecha, importe y referencia del pago al trabajador en Worker reimbursement queue.',
    ],
    pt: [
      'Despesas e reembolsos',
      'Record expense salva comprovante, fornecedor, data, moeda, valor e pagador. Submit envia para aprovação operacional. Approved significa aceito, não reembolsado. Finanças registra data, valor e referência do pagamento em Worker reimbursement queue.',
    ],
  },
  reports: {
    roles: ['worker', 'project_manager', 'owner_admin'],
    route: 'reports',
    en: [
      'Daily, technical and customer reports',
      'Daily records completed work, blockers and next steps. Technical / PLC records the problem, diagnosis, change, validation and backup evidence, with its author. Save and submit your report. Client Sign-off is a separate reviewed period of approved hours and activities for customer acceptance; Finance prepares its file and the customer signs it.',
    ],
    es: [
      'Informes diarios, técnicos y del cliente',
      'Daily recoge trabajo realizado, bloqueos y próximos pasos. Technical / PLC registra problema, diagnóstico, cambio, validación y backups, con su autor. Guarda y envía tu informe. Client Sign-off es un periodo revisado de horas aprobadas y actividades para la conformidad del cliente: Finanzas prepara el archivo y el cliente firma.',
    ],
    pt: [
      'Relatórios diários, técnicos e do cliente',
      'Daily registra trabalho, impedimentos e próximos passos. Technical / PLC registra problema, diagnóstico, alteração, validação e backups, com o autor. Salve e envie seu relatório. Client Sign-off reúne horas aprovadas e atividades do período: Finanças prepara o arquivo e o cliente assina.',
    ],
  },
  approvals: {
    roles: ['project_manager', 'owner_admin', 'finance_admin'],
    route: 'approvals',
    en: [
      'What the Project Manager reviews',
      'The Project Manager coordinates assigned projects, plans the team, checks submitted hours, receipts and reports, and approves or requests changes. The queue shows pending records before completed ones, oldest first. Project approvals reviews project milestones; Finance review decides the commercial treatment after operational approval.',
    ],
    es: [
      'Qué revisa el Project Manager',
      'El Project Manager coordina proyectos asignados, planifica el equipo, revisa horas, recibos e informes enviados y aprueba o solicita cambios. La cola prioriza pendientes antiguos. Project approvals revisa hitos del proyecto; Finance review decide el tratamiento comercial tras la aprobación operativa.',
    ],
    pt: [
      'O que o Project Manager revisa',
      'O Project Manager coordena projetos atribuídos, planeja a equipe, revisa horas, comprovantes e relatórios enviados e aprova ou solicita correções. A fila prioriza pendências antigas. Project approvals revisa marcos; Finance review define o tratamento comercial após aprovação operacional.',
    ],
  },
  projects: {
    roles: ['owner_admin', 'project_manager', 'finance_admin'],
    route: 'projects',
    en: [
      'Clients, projects and access',
      'Create the client with its billing identity, then create its project. Team assigns people for specific dates; Planning schedules expected work. A schedule never creates actual hours. Edit or end an assignment when access changes, keeping its history.',
    ],
    es: [
      'Clientes, proyectos y acceso',
      'Crea el cliente con sus datos de facturación y después su proyecto. Team asigna personas para fechas concretas; Planning programa trabajo previsto. La planificación nunca crea horas reales. Edita o finaliza asignaciones para cambiar acceso conservando su historial.',
    ],
    pt: [
      'Clientes, projetos e acesso',
      'Crie o cliente com os dados de cobrança e depois o projeto. Team atribui pessoas por datas; Planning programa o trabalho previsto. O planejamento nunca cria horas reais. Edite ou encerre atribuições para alterar o acesso preservando o histórico.',
    ],
  },
  economics: {
    roles: ['owner_admin', 'finance_admin'],
    route: 'finance?view=economic',
    en: [
      'Economics and expected worker payment',
      'Economic Review compares invoiced revenue with direct labor and expense costs. Source records opens the contributing entries. Compensation settlements groups approved worker compensation for a period. Expected worker payment is a planned amount or date, not proof of payment. Finalize only after reviewing the source hours and rules; record the actual payment separately.',
    ],
    es: [
      'Economía y pago previsto al trabajador',
      'Economic Review compara ingresos facturados con costes directos de personal y gastos. Source records muestra los registros que los forman. Compensation settlements agrupa compensación aprobada por periodo. Expected worker payment es una previsión, no un pago realizado. Finaliza tras revisar horas y reglas; registra el pago real por separado.',
    ],
    pt: [
      'Economia e pagamento previsto',
      'Economic Review compara receita faturada com custos diretos de pessoal e despesas. Source records mostra os registros de origem. Compensation settlements agrupa remuneração aprovada por período. Expected worker payment é uma previsão, não um pagamento realizado. Finalize após revisar horas e regras; registre o pagamento real separadamente.',
    ],
  },
  billing: {
    roles: ['owner_admin', 'finance_admin'],
    route: 'billing',
    en: [
      'Prepare, review and issue an invoice',
      'Billing streams defines what is billed, how often, by which legal entity and with which tax profile. Create an invoice draft for a project and service period after approving its source records. Review the lines and PDF, edit the draft billing and bank details, then approve and issue explicitly. Issued invoices keep their historical values; use void or credit/adjustment to correct them.',
    ],
    es: [
      'Preparar, revisar y emitir una factura',
      'Billing streams define qué se factura, cada cuánto, con qué entidad emisora e impuestos. Crea un borrador para el proyecto y periodo tras aprobar los registros de origen. Revisa líneas y PDF, edita datos de facturación y bancarios del borrador y aprueba y emite expresamente. Las facturas emitidas conservan su histórico; se corrigen mediante anulación o abono/ajuste.',
    ],
    pt: [
      'Preparar, revisar e emitir uma fatura',
      'Billing streams define o que faturar, frequência, entidade emissora e impostos. Crie um rascunho por projeto e período após aprovar os registros de origem. Revise linhas e PDF, edite dados bancários e de cobrança, depois aprove e emita explicitamente. Faturas emitidas preservam o histórico; corrija por anulação ou crédito/ajuste.',
    ],
  },
  cash: {
    roles: ['owner_admin', 'finance_admin'],
    route: 'ledger',
    en: [
      'Collections, ledger and cash calendar',
      'Collections / Ledger links each issued invoice to receipts and its outstanding balance. Record each full or partial receipt with its date and reference. Cash calendar groups planned receipts and payments by date. Planned cash is separate from money actually received or paid.',
    ],
    es: [
      'Cobros, ledger y calendario de caja',
      'Collections / Ledger vincula cada factura emitida con cobros y saldo pendiente. Registra cobros completos o parciales con fecha y referencia. Cash calendar agrupa cobros y pagos previstos por fecha. Las previsiones están separadas del dinero realmente recibido o pagado.',
    ],
    pt: [
      'Recebimentos, ledger e calendário de caixa',
      'Collections / Ledger vincula cada fatura emitida aos recebimentos e saldo em aberto. Registre recebimentos totais ou parciais com data e referência. Cash calendar agrupa previsões por data, separadas do dinheiro efetivamente recebido ou pago.',
    ],
  },
  accounting: {
    roles: ['owner_admin', 'finance_admin'],
    route: 'accounting',
    en: [
      'Generate and finalize a monthly pack',
      'Generate pack assembles invoices, collections, labor costs and expenses for the chosen period in PDF and spreadsheets. Queued means automatic processing is pending; Ready enables download, and Failed offers retry. Finalize freezes the reviewed figures as a historical version. Later corrections require a new version.',
    ],
    es: [
      'Generar y finalizar el paquete mensual',
      'Generate pack reúne facturas, cobros, costes de personal y gastos del periodo en PDF y hojas de cálculo. Queued indica procesamiento pendiente; Ready permite descargar y Failed reintentar. Finalize fija las cifras revisadas como versión histórica. Las correcciones posteriores requieren otra versión.',
    ],
    pt: [
      'Gerar e finalizar o pacote mensal',
      'Generate pack reúne faturas, recebimentos, custos de pessoal e despesas em PDF e planilhas. Queued indica processamento pendente; Ready permite baixar e Failed tentar novamente. Finalize fixa os valores revisados como versão histórica. Correções posteriores exigem outra versão.',
    ],
  },
  supplier: {
    roles: ['supplier_coordinator', 'external_technician', 'owner_admin'],
    route: 'supplier/report',
    en: [
      'Supplier coordination and operational report',
      'The Owner authorizes a supplier and coordinator for a project and date range. The coordinator assigns existing technicians and records team work within that authorization; an external technician records their own work. Operational report is a filtered view of those time records. Edit the source draft or request an audited correction to update the report; download CSV or print it as PDF.',
    ],
    es: [
      'Coordinación de proveedores e informe operativo',
      'Owner autoriza al proveedor y coordinador para un proyecto y fechas. El coordinador asigna técnicos existentes y registra trabajo del equipo dentro de esa autorización; el técnico externo registra su propio trabajo. Operational report es una vista filtrada de esas horas. Edita el borrador de origen o solicita una corrección auditada para actualizarla; descarga CSV o imprime en PDF.',
    ],
    pt: [
      'Coordenação de fornecedores e relatório operacional',
      'Owner autoriza fornecedor e coordenador por projeto e datas. O coordenador atribui técnicos e registra trabalho da equipe nesse escopo; o técnico externo registra seu trabalho. Operational report é uma visão filtrada dessas horas. Edite o rascunho ou solicite correção auditada para atualizar; baixe CSV ou imprima em PDF.',
    ],
  },
};
export function helpWorkflows(
  role: string,
  profile: string | undefined,
  locale: PortalLocale,
): Topic[] {
  const effectiveRole = profile || role;
  return Object.values(topics)
    .filter(
      (topic) =>
        topic.roles.includes(effectiveRole) ||
        (profile && ['time', 'reports'].includes(topic.route)),
    )
    .map((topic) => ({ title: topic[locale][0], body: topic[locale][1], route: topic.route }));
}
