import type { PortalLocale } from '$lib/portal-i18n';

type CopyValue = readonly [string, string, string];

const copy: Record<string, CopyValue> = {
  chooseClient: ['Choose a client', 'Elige un cliente', 'Escolha um cliente'],
  optionalStart: [
    'Start date (optional)',
    'Fecha de inicio (opcional)',
    'Data de início (opcional)',
  ],
  timezoneHint: [
    'Choose a suggested city or enter any valid site timezone. Dates follow the site timezone.',
    'Elige una ciudad sugerida o escribe una zona horaria válida. Las fechas siguen la zona de la planta.',
    'Escolha uma cidade sugerida ou digite um fuso horário válido. As datas seguem o fuso do local.',
  ],
  required: ['Required', 'Obligatorio', 'Obrigatório'],
  optional: ['Optional', 'Opcional', 'Opcional'],
  requiredHint: ['Complete before saving', 'Completa antes de guardar', 'Complete antes de salvar'],
  optionalHint: [
    'Add when agreed',
    'Añade cuando esté acordado',
    'Adicione quando estiver acordado',
  ],
  startHere: [
    'Start with the essentials. Add details when needed.',
    'Empieza por lo esencial. Añade detalles cuando los necesites.',
    'Comece pelo essencial. Adicione detalhes quando precisar.',
  ],
  contextSummary: [
    'Description, alias, site and contact details',
    'Descripción, alias, planta y contactos',
    'Descrição, alias, planta e contatos',
  ],
  stepContext: [
    '2 · Project context (optional)',
    '2 · Contexto del proyecto (opcional)',
    '2 · Contexto do projeto (opcional)',
  ],
  peopleSummary: [
    'Assignments, defaults and individual rates',
    'Asignaciones, valores y tarifas individuales',
    'Atribuições, padrões e tarifas individuais',
  ],
  commercialSummary: [
    'Billing model and hour expectations',
    'Modelo de facturación y horas previstas',
    'Modelo de faturamento e horas previstas',
  ],
  optionalSummary: [
    'Budgets, close rules and reporting requirements',
    'Presupuestos, cierres y requisitos de informes',
    'Orçamentos, fechamentos e requisitos de relatórios',
  ],
  inheritedFromClient: [
    'Inherited from the selected client. Change it only when this project has a different commercial or site context.',
    'Heredado del cliente seleccionado. Cámbialo solo si este proyecto tiene un contexto comercial o de planta distinto.',
    'Herdado do cliente selecionado. Altere apenas se este projeto tiver um contexto comercial ou de planta diferente.',
  ],
  currencyGuidance: [
    'Use the project currency for budgets, rates and expense limits. It does not change the client record.',
    'Usa la moneda del proyecto para presupuestos, tarifas y límites de gastos. No cambia el registro del cliente.',
    'Use a moeda do projeto para orçamentos, tarifas e limites de despesas. Isso não altera o cadastro do cliente.',
  ],
  stepBasics: ['1 · Basics', '1 · Datos básicos', '1 · Dados básicos'],
  stepPeople: ['3 · People', '3 · Personas', '3 · Pessoas'],
  stepCommercial: ['4 · Commercial defaults', '4 · Valores comerciales', '4 · Padrões comerciais'],
  stepOptional: [
    '5 · Optional planning and budget',
    '5 · Planificación y presupuesto opcionales',
    '5 · Planejamento e orçamento opcionais',
  ],
  peopleGuidance: [
    'People and rates are optional at creation. Save the project first when assignments are not ready.',
    'Las personas y tarifas son opcionales al crear. Guarda primero el proyecto si las asignaciones aún no están listas.',
    'Pessoas e tarifas são opcionais na criação. Salve primeiro o projeto se as atribuições ainda não estiverem prontas.',
  ],
  optionalGuidance: [
    'Add targets only when they are agreed. Blank planning fields do not limit actual work or billing.',
    'Añade objetivos solo cuando estén acordados. Los campos de planificación vacíos no limitan el trabajo real ni la facturación.',
    'Adicione metas apenas quando estiverem acordadas. Campos de planejamento vazios não limitam o trabalho real nem o faturamento.',
  ],
  reviewBeforeCreate: [
    'Review the highlighted fields before creating the project.',
    'Revisa los campos destacados antes de crear el proyecto.',
    'Revise os campos destacados antes de criar o projeto.',
  ],
  createReady: [
    'Ready to create when the required basics are complete.',
    'Listo para crear cuando completes los datos básicos obligatorios.',
    'Pronto para criar quando os dados básicos obrigatórios estiverem completos.',
  ],
  preserveValues: [
    'Corrections keep your entered values.',
    'Las correcciones conservan tus datos.',
    'As correções preservam seus dados.',
  ],
  projectShortcuts: ['Project shortcuts', 'Accesos del proyecto', 'Atalhos do projeto'],
  work: ['Work', 'Trabajo', 'Trabalho'],
  team: ['Team', 'Equipo', 'Equipe'],
  invoices: ['Invoices', 'Facturas', 'Faturas'],
  noMatches: [
    'No projects match the current filters.',
    'Ningún proyecto coincide con los filtros actuales.',
    'Nenhum projeto corresponde aos filtros atuais.',
  ],
  resetFilters: ['Reset filters', 'Restablecer filtros', 'Redefinir filtros'],
  showing: [
    'Showing {count} projects',
    'Mostrando {count} proyectos',
    'Mostrando {count} projetos',
  ],
  clientContext: ['Open client context', 'Abrir contexto del cliente', 'Abrir contexto do cliente'],
  emptyNextStep: [
    'Create a project to start recording work, assignments and invoices.',
    'Crea un proyecto para empezar a registrar trabajo, asignaciones y facturas.',
    'Crie um projeto para começar a registrar trabalho, atribuições e faturas.',
  ],
  detailShortcuts: ['Next actions', 'Siguientes acciones', 'Próximas ações'],
  logTime: ['Log time', 'Registrar horas', 'Registar horas'],
  recordExpense: ['Record expense', 'Registrar gasto', 'Registar despesa'],
  createWorkReport: [
    'Create work report',
    'Crear informe de trabajo',
    'Criar relatório de trabalho',
  ],
  prepareInvoice: ['Prepare invoice', 'Preparar factura', 'Preparar fatura'],
  viewInvoices: ['View invoices', 'Ver facturas', 'Ver faturas'],
  noRecordsNext: [
    'There are no records here yet. Use a project shortcut to add the next operational item.',
    'Todavía no hay registros. Usa un acceso del proyecto para añadir el siguiente elemento operativo.',
    'Ainda não há registros. Use um atalho do projeto para adicionar o próximo item operacional.',
  ],
};

export const projectTimezoneSuggestions = [
  'UTC',
  'Europe/Madrid',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
] as const;

export type ProjectUxCopyKey = keyof typeof copy;

export function projectUxText(
  locale: PortalLocale | string | undefined,
  key: ProjectUxCopyKey,
  params: Record<string, string | number> = {},
): string {
  const index = locale === 'es' ? 1 : locale === 'pt' ? 2 : 0;
  let value = copy[key]?.[index] ?? copy[key]?.[0] ?? key;
  for (const [name, replacement] of Object.entries(params))
    value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}
