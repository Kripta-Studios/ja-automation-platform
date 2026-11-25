/**
 * Copy for the simplified Projects/Clients screens (2026-11-16 owner round):
 * optional expected hours, free-text cost centers, editable references,
 * project PO, time zone picker and permanent deletion.
 */
type CopyValue = readonly [string, string, string];

const copy = {
  timezoneSearch: ['Search time zone', 'Buscar zona horaria', 'Buscar fuso horário'],
  timezoneChoose: ['Choose a time zone', 'Elige una zona horaria', 'Escolha um fuso horário'],
  timezoneCommon: ['Most used', 'Más usadas', 'Mais usados'],
  timezoneAll: ['All time zones', 'Todas las zonas horarias', 'Todos os fusos horários'],
  timezoneHint: [
    'Dates and hours on this project follow this time zone. It starts with the client time zone.',
    'Las fechas y horas del proyecto siguen esta zona horaria. Empieza con la del cliente.',
    'As datas e horas do projeto seguem este fuso horário. Começa com o fuso do cliente.',
  ],
  createTitle: ['New project', 'Nuevo proyecto', 'Novo projeto'],
  createIntro: [
    'Only the essentials. Everything else can be added later from the project page.',
    'Solo lo esencial. Todo lo demás se puede añadir después desde la página del proyecto.',
    'Somente o essencial. Todo o resto pode ser adicionado depois na página do projeto.',
  ],
  client: ['Client', 'Cliente', 'Cliente'],
  chooseClient: ['Choose a client', 'Elige un cliente', 'Escolha um cliente'],
  name: ['Project name', 'Nombre del proyecto', 'Nome do projeto'],
  costCenter: ['Cost center code', 'Código de centro de coste', 'Código do centro de custo'],
  costCenterHint: [
    'Any text, for example 001. Codes may repeat: the project reference adds the client code.',
    'Cualquier texto, por ejemplo 001. Puede repetirse: la referencia del proyecto añade el código del cliente.',
    'Qualquer texto, por exemplo 001. Pode se repetir: a referência do projeto adiciona o código do cliente.',
  ],
  costCenterAuto: [
    'Leave blank to number it automatically (001, 002…).',
    'Déjalo vacío para numerarlo automáticamente (001, 002…).',
    'Deixe em branco para numerar automaticamente (001, 002…).',
  ],
  clientRate: [
    'Client hourly rate ({currency}, optional)',
    'Tarifa por hora al cliente ({currency}, opcional)',
    'Tarifa horária do cliente ({currency}, opcional)',
  ],
  clientRateHint: [
    'Used to price approved hours on invoices. Rates per worker can be added later.',
    'Se usa para valorar las horas aprobadas en las facturas. Luego puedes añadir tarifas por trabajador.',
    'Usada para valorar as horas aprovadas nas faturas. Tarifas por trabalhador podem ser adicionadas depois.',
  ],
  referencePreview: [
    'Project reference: {reference}',
    'Referencia del proyecto: {reference}',
    'Referência do projeto: {reference}',
  ],
  referencePreviewSuffix: [
    'A number is added automatically if this reference already exists.',
    'Si esta referencia ya existe se añade un número automáticamente.',
    'Se esta referência já existir, um número é adicionado automaticamente.',
  ],
  referenceLabel: ['Project reference', 'Referencia del proyecto', 'Referência do projeto'],
  referenceHint: [
    'Shown everywhere the project is picked. Leave blank to rebuild it from client code and cost center.',
    'Se muestra donde se elige el proyecto. Déjala vacía para generarla con el código del cliente y el centro de coste.',
    'Aparece onde o projeto é escolhido. Deixe em branco para gerá-la com o código do cliente e o centro de custo.',
  ],
  invoicedReferenceWarning: [
    'This project already has invoices. Issued invoices keep the reference they were issued with; new drafts use the new one.',
    'Este proyecto ya tiene facturas. Las facturas emitidas conservan la referencia con la que se emitieron; los borradores nuevos usan la nueva.',
    'Este projeto já tem faturas. As faturas emitidas mantêm a referência com que foram emitidas; os novos rascunhos usam a nova.',
  ],
  poLabel: ['PO number (this project)', 'Número de PO (este proyecto)', 'Número de PO (este projeto)'],
  poHint: [
    "Printed on this project's invoices. Leave blank to use the client's default PO, if any.",
    'Se imprime en las facturas de este proyecto. Déjalo vacío para usar el PO por defecto del cliente, si existe.',
    'Impresso nas faturas deste projeto. Deixe em branco para usar o PO padrão do cliente, se houver.',
  ],
  siteLocation: ['Site / location', 'Planta / ubicación', 'Planta / local'],
  siteLocationHint: [
    'City or plant where the work happens.',
    'Ciudad o planta donde se trabaja.',
    'Cidade ou planta onde o trabalho acontece.',
  ],
  timezone: ['Site time zone', 'Zona horaria de la planta', 'Fuso horário do local'],
  projectManager: ['Project manager', 'Jefe de proyecto', 'Gerente de projeto'],
  unassigned: ['Not assigned', 'Sin asignar', 'Não atribuído'],
  startDate: ['Start date', 'Fecha de inicio', 'Data de início'],
  startDateHint: [
    'Blank = today in the site time zone.',
    'Vacío = hoy en la zona horaria de la planta.',
    'Em branco = hoje no fuso horário do local.',
  ],
  workers: ['Workers', 'Trabajadores', 'Trabalhadores'],
  moreSettings: ['More settings', 'Más ajustes', 'Mais configurações'],
  moreSettingsHint: [
    'End date, billing model, expected hours, budgets, site contact and reporting rules',
    'Fecha de fin, modelo de facturación, horas previstas, presupuestos, contacto en planta y reglas de informes',
    'Data de término, modelo de faturamento, horas previstas, orçamentos, contato no local e regras de relatórios',
  ],
  expectedHours: [
    'Expected hours per day (optional)',
    'Horas previstas por día (opcional)',
    'Horas previstas por dia (opcional)',
  ],
  expectedHint: [
    'Leave blank when there is no expectation. Time screens then show no expected or difference values.',
    'Déjalo vacío si no hay una previsión. Las pantallas de horas no mostrarán valores previstos ni diferencias.',
    'Deixe em branco se não houver previsão. As telas de horas não mostrarão valores previstos nem diferenças.',
  ],
  editIdentityNote: [
    'Client, currency, lifecycle status and close date stay read-only. Issued invoices keep the reference and PO they were issued with.',
    'El cliente, la moneda, el estado y la fecha de cierre no se pueden editar aquí. Las facturas emitidas conservan la referencia y el PO con los que se emitieron.',
    'Cliente, moeda, status e data de encerramento não podem ser editados aqui. As faturas emitidas mantêm a referência e o PO com que foram emitidas.',
  ],
  noExpectation: ['No expected hours', 'Sin horas previstas', 'Sem horas previstas'],
  create: ['Create project', 'Crear proyecto', 'Criar projeto'],
  saving: ['Saving…', 'Guardando…', 'Salvando…'],
  reviewErrors: [
    'Please correct {count} field(s):',
    'Corrige {count} campo(s):',
    'Corrija {count} campo(s):',
  ],
  searchProjects: ['Search projects', 'Buscar proyectos', 'Buscar projetos'],
  searchProjectsHint: [
    'Reference, name, client, site or PO',
    'Referencia, nombre, cliente, planta o PO',
    'Referência, nome, cliente, planta ou PO',
  ],
  newProject: ['New project', 'Nuevo proyecto', 'Novo projeto'],
  newClient: ['New client', 'Nuevo cliente', 'Novo cliente'],
  clients: ['Clients', 'Clientes', 'Clientes'],
  showArchived: ['Show archived', 'Mostrar archivados', 'Mostrar arquivados'],
  hideArchived: ['Hide archived', 'Ocultar archivados', 'Ocultar arquivados'],
  noProjects: ['No projects yet.', 'Todavía no hay proyectos.', 'Ainda não há projetos.'],
  noMatches: [
    'No project matches this search.',
    'Ningún proyecto coincide con la búsqueda.',
    'Nenhum projeto corresponde à busca.',
  ],
  projectCount: ['{count} projects', '{count} proyectos', '{count} projetos'],
  open: ['Open', 'Abrir', 'Abrir'],
  rowActions: ['Close, archive or delete', 'Cerrar, archivar o eliminar', 'Encerrar, arquivar ou excluir'],
  moreTools: ['More tools', 'Más herramientas', 'Mais ferramentas'],
  moreToolsHint: [
    'Calendar, assignments, milestones, schedules and contacts',
    'Calendario, asignaciones, hitos, horarios y contactos',
    'Calendário, atribuições, marcos, horários e contatos',
  ],
  closeForm: ['Close', 'Cerrar', 'Fechar'],
  // Lifecycle: reactivate / close date (B5)
  reactivateProject: ['Reactivate project', 'Reactivar proyecto', 'Reativar projeto'],
  reactivateHint: [
    'Back to Active: people can log hours and expenses again.',
    'Vuelve a Activo: se pueden registrar horas y gastos otra vez.',
    'Volta para Ativo: é possível lançar horas e despesas de novo.',
  ],
  reactivateReason: [
    'Why reactivate? (required)',
    '¿Por qué reactivar? (obligatorio)',
    'Por que reativar? (obrigatório)',
  ],
  closeDate: ['Close date', 'Fecha de cierre', 'Data de encerramento'],
  issuerOnlyForInvoices: [
    'You can still continue and set each person’s rates and pay now; the issuer is only needed to save the invoice setup.',
    'Puedes continuar y fijar ya las tarifas y el pago de cada persona; el emisor solo hace falta para guardar la configuración de facturas.',
    'Você pode continuar e definir já as tarifas e o pagamento de cada pessoa; o emissor só é necessário para salvar a configuração de faturas.',
  ],
  // Archived documents (B8)
  archivedDocuments: ['Archived documents', 'Documentos archivados', 'Documentos arquivados'],
  archivedDocumentsEmpty: [
    'No archived documents.',
    'No hay documentos archivados.',
    'Não há documentos arquivados.',
  ],
  archivedOn: ['Archived {date} by {name}', 'Archivado el {date} por {name}', 'Arquivado em {date} por {name}'],
  restoreDocument: ['Restore document', 'Restaurar documento', 'Restaurar documento'],
  restoreReason: ['Why restore? (required)', '¿Por qué restaurar? (obligatorio)', 'Por que restaurar? (obrigatório)'],
  // Permanent deletion
  dangerTitle: ['Delete permanently', 'Eliminar definitivamente', 'Excluir definitivamente'],
  dangerProjectBody: [
    'Removes this project and everything recorded in it: time, expenses, reports, invoices, payments and files. This cannot be undone. Archive it instead if you may need the history.',
    'Elimina este proyecto y todo lo registrado en él: horas, gastos, informes, facturas, pagos y archivos. No se puede deshacer. Archívalo si puedes necesitar el historial.',
    'Remove este projeto e tudo o que foi registrado nele: horas, despesas, relatórios, faturas, pagamentos e arquivos. Não pode ser desfeito. Arquive-o se puder precisar do histórico.',
  ],
  dangerClientBody: [
    'Removes this client, all its projects and everything recorded in them. This cannot be undone.',
    'Elimina este cliente, todos sus proyectos y todo lo registrado en ellos. No se puede deshacer.',
    'Remove este cliente, todos os seus projetos e tudo o que foi registrado neles. Não pode ser desfeito.',
  ],
  deleteProjectButton: [
    'Delete project permanently',
    'Eliminar proyecto definitivamente',
    'Excluir projeto definitivamente',
  ],
  deleteClientButton: [
    'Delete client permanently',
    'Eliminar cliente definitivamente',
    'Excluir cliente definitivamente',
  ],
  dialogTitle: [
    'Delete {label} permanently?',
    '¿Eliminar {label} definitivamente?',
    'Excluir {label} definitivamente?',
  ],
  willDelete: ['This will delete:', 'Se eliminará:', 'Será excluído:'],
  nothingElse: [
    'No other records are linked.',
    'No hay otros registros vinculados.',
    'Não há outros registros vinculados.',
  ],
  financeWarning: [
    'Issued invoices and payments are deleted too. Copies already sent to clients or accountants are not affected.',
    'También se eliminan las facturas emitidas y los pagos. Las copias ya enviadas a clientes o contables no se ven afectadas.',
    'Faturas emitidas e pagamentos também são excluídos. Cópias já enviadas a clientes ou contadores não são afetadas.',
  ],
  auditNote: [
    'The audit log keeps a record of who deleted it and when.',
    'El registro de auditoría guarda quién lo eliminó y cuándo.',
    'O registro de auditoria guarda quem excluiu e quando.',
  ],
  typeToConfirm: [
    'Type {reference} to confirm',
    'Escribe {reference} para confirmar',
    'Digite {reference} para confirmar',
  ],
  cancel: ['Cancel', 'Cancelar', 'Cancelar'],
  confirmDelete: ['Delete permanently', 'Eliminar definitivamente', 'Excluir definitivamente'],
  deleting: ['Deleting…', 'Eliminando…', 'Excluindo…'],
  loadingCounts: ['Counting records…', 'Contando registros…', 'Contando registros…'],
  countsFailed: [
    'Could not count the linked records. Close and try again.',
    'No se pudieron contar los registros vinculados. Cierra e inténtalo de nuevo.',
    'Não foi possível contar os registros vinculados. Feche e tente novamente.',
  ],
  count_projects: ['Projects', 'Proyectos', 'Projetos'],
  count_timeEntries: ['Time entries', 'Registros de horas', 'Registros de horas'],
  count_expenses: ['Expenses', 'Gastos', 'Despesas'],
  count_dailyReports: ['Daily reports', 'Informes diarios', 'Relatórios diários'],
  count_technicalReports: ['Technical reports', 'Informes técnicos', 'Relatórios técnicos'],
  count_periodReports: ['Period reports', 'Informes de periodo', 'Relatórios de período'],
  count_invoices: ['Invoices', 'Facturas', 'Faturas'],
  count_payments: ['Payment records', 'Registros de pago', 'Registros de pagamento'],
  count_documents: ['Documents', 'Documentos', 'Documentos'],
  count_files: ['Stored files', 'Archivos guardados', 'Arquivos armazenados'],
  count_assignments: ['Worker assignments', 'Asignaciones de trabajadores', 'Atribuições de trabalhadores'],
  count_planning: ['Planning entries', 'Entradas de planificación', 'Entradas de planejamento'],
  count_milestones: ['Milestones', 'Hitos', 'Marcos'],
  count_contacts: ['Client contacts', 'Contactos del cliente', 'Contatos do cliente'],
  count_totalRows: [
    'Database records in total',
    'Registros de base de datos en total',
    'Registros de banco de dados no total',
  ],
  // Clients
  clientCode: ['Client code', 'Código del cliente', 'Código do cliente'],
  clientCodeHint: [
    'Short code used in project references, for example IMPC. Changing it does not rename existing projects.',
    'Código corto usado en las referencias de proyecto, por ejemplo IMPC. Cambiarlo no renombra los proyectos existentes.',
    'Código curto usado nas referências de projeto, por exemplo IMPC. Alterá-lo não renomeia os projetos existentes.',
  ],
  clientPo: ['Default PO (optional)', 'PO por defecto (opcional)', 'PO padrão (opcional)'],
  clientPoHint: [
    'Used on invoices only when a project has no PO of its own.',
    'Se usa en las facturas solo cuando un proyecto no tiene su propio PO.',
    'Usado nas faturas somente quando um projeto não tem PO próprio.',
  ],
  clientTimezone: ['Client time zone', 'Zona horaria del cliente', 'Fuso horário do cliente'],
} satisfies Record<string, CopyValue>;

export type ProjectCopyKey = keyof typeof copy;

export function projectCopy(
  locale: string | undefined,
  key: ProjectCopyKey,
  params: Record<string, string | number> = {},
): string {
  const index = locale?.startsWith('es') ? 1 : locale?.startsWith('pt') ? 2 : 0;
  let value: string = copy[key]?.[index] ?? copy[key]?.[0] ?? key;
  for (const [name, replacement] of Object.entries(params))
    value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}

/** Client-side preview of the reference the server will build (without suffix). */
export function previewProjectReference(
  clientCode: string | null | undefined,
  clientNumber: string | null | undefined,
  costCenter: string,
): string {
  const part = (value: string) =>
    value
      .normalize('NFKC')
      .trim()
      .replace(/\s*[-–—_/·|,;:]+\s*/gu, '-')
      .replace(/\s+/gu, '-')
      .replace(/[^\p{L}\p{N}.-]/gu, '')
      .replace(/-{2,}/gu, '-')
      .replace(/^-+|-+$/gu, '');
  const code = part(clientCode ?? '');
  const digits = /(\d+)$/u.exec(costCenter.trim())?.[1];
  if (!code && digits && clientNumber) return `${clientNumber}-P-${digits.padStart(3, '0')}`;
  const prefix = code || part(clientNumber ?? '') || 'P';
  const center = part(costCenter) || 'P';
  return `${prefix}-${center}`.slice(0, 100).replace(/-+$/u, '');
}

/**
 * Project page header reference: "<clientCode>-<costCenter>", e.g. "022-001".
 * Falls back to the client number when the client has no code, and to the
 * project number when the project has no cost center.
 */
export function projectHeaderReference(project: {
  client_code?: unknown;
  client_number?: unknown;
  cost_center_code?: unknown;
  project_number?: unknown;
}): string {
  const clientPart =
    String(project.client_code ?? '').trim() || String(project.client_number ?? '').trim();
  const costCenter = String(project.cost_center_code ?? '').trim();
  if (clientPart && costCenter) return `${clientPart}-${costCenter}`;
  return String(project.project_number ?? '').trim() || costCenter || clientPart;
}

/** "IMPC-001 · BBS Mexico" — how a project is shown wherever it is picked. */
export function projectPickLabel(project: {
  project_number?: unknown;
  name?: unknown;
}): string {
  const reference = String(project.project_number ?? '').trim();
  const name = String(project.name ?? '').trim();
  return reference && name ? `${reference} · ${name}` : reference || name;
}
