import {
  assertPortalCatalogParity as assertCanonicalCatalogParity,
  createTranslator as createCanonicalTranslator,
  INVARIANT_TRANSLATION_KEYS as canonicalInvariantTranslationKeys,
  isCoverageInvariantKey as canonicalIsCoverageInvariantKey,
  isExplicitCoverageTranslation as canonicalIsExplicitCoverageTranslation,
  normalizePortalLocale as normalizeCanonicalLocale,
  portalCatalog as canonicalPortalCatalog,
  portalCatalogKeys as canonicalPortalCatalogKeys,
  portalLocales as canonicalPortalLocales,
  renderPortalMessage as renderCanonicalPortalMessage,
  translate as translateCanonical,
} from './i18n/catalog';
export type {
  DocumentLanguage,
  PortalLocaleInput,
  PortalTranslationKey,
  TranslationParams,
} from './i18n/catalog';
import {
  createPortalLocaleController,
  documentLanguage,
  setDocumentLanguage,
} from './i18n/context';
export {
  isReportHistoryAction,
  translateReportHistoryAction,
  type ReportHistoryAction,
  type ReportHistoryRecord,
} from './i18n/report-history';

export const portalLocales = canonicalPortalLocales;
export type PortalLocale = (typeof portalLocales)[number];
export {
  assertCanonicalCatalogParity as assertPortalCatalogParity,
  canonicalPortalCatalog as portalCatalog,
  canonicalPortalCatalogKeys as portalCatalogKeys,
  createCanonicalTranslator as createTranslator,
  documentLanguage,
  createPortalLocaleController,
  canonicalInvariantTranslationKeys as INVARIANT_TRANSLATION_KEYS,
  canonicalIsCoverageInvariantKey as isCoverageInvariantKey,
  canonicalIsExplicitCoverageTranslation as isExplicitCoverageTranslation,
  renderCanonicalPortalMessage as renderPortalMessage,
  setDocumentLanguage,
  translateCanonical as translate,
};

// English is the canonical source. Static copy is translated at the DOM boundary so domain
// values (codes, tags, invoice numbers and structured records) remain language-neutral.
const en: Record<string, string> = {
  Today: 'Today',
  Time: 'Time',
  Reports: 'Reports',
  Expenses: 'Expenses',
  Projects: 'Projects',
  'My Pay': 'My Pay',
  Documents: 'Documents',
  Notifications: 'Notifications',
  Profile: 'Profile',
  Dashboard: 'Dashboard',
  Clients: 'Clients',
  Team: 'Team',
  Planning: 'Planning',
  'PLC / Technical': 'PLC / Technical',
  Approvals: 'Approvals',
  Billing: 'Billing',
  Invoices: 'Invoices',
  Finance: 'Finance',
  Settings: 'Settings',
  Audit: 'Audit',
  'Time entries': 'Time entries',
  'Daily and technical reports': 'Daily and technical reports',
  'Expenses and receipts': 'Expenses and receipts',
  'Profile and security': 'Profile and security',
  'Resource planning': 'Resource planning',
  'Approval queue': 'Approval queue',
  'Billing streams': 'Billing streams',
  'Project finance': 'Project finance',
  'Invoice / cost ledger': 'Invoice / cost ledger',
  'Monthly Accounting Pack': 'Monthly Accounting Pack',
  'Audit log': 'Audit log',
  Language: 'Language',
  'Save draft': 'Save draft',
  'Save changes': 'Save changes',
  Submit: 'Submit',
  Save: 'Save',
  Create: 'Create',
  Approve: 'Approve',
  Reject: 'Reject',
  Close: 'Close',
  Issue: 'Issue',
  Download: 'Download',
  Project: 'Project',
  Client: 'Client',
  Worker: 'Worker',
  Date: 'Date',
  Description: 'Description',
  Summary: 'Summary',
  Amount: 'Amount',
  Currency: 'Currency',
  Status: 'Status',
  Period: 'Period',
  'Period start': 'Period start',
  'Period end': 'Period end',
  Actual: 'Actual',
  Approved: 'Approved',
  Pending: 'Pending',
  Planned: 'Planned',
  Revenue: 'Revenue',
  'Revenue cap': 'Revenue cap',
  'Daily rate': 'Daily rate',
  'Fixed fee / milestones': 'Fixed fee / milestones',
  'Client paid directly': 'Client paid directly',
  'Project materials': 'Project materials',
  'Time & materials': 'Time & materials',
  'Billing contact': 'Billing contact',
  'Client contacts': 'Client contacts',
  'Team access': 'Team access',
  'All streams': 'All streams',
  Specialists: 'Specialists',
  'Other records': 'Other records',
  'PLC / technical reports': 'PLC / technical reports',
  'No email': 'No email',
  'No due date': 'No due date',
  'No tax profile': 'No tax profile',
  'No budget': 'No budget',
  'Registered device': 'Registered device',
  'Unnamed device': 'Unnamed device',
  Enabled: 'Enabled',
  'Not enabled': 'Not enabled',
  'No records match that search in your access scope.':
    'No records match that search in your access scope.',
  'No published assignment for today.': 'No published assignment for today.',
  'No time recorded.': 'No time recorded.',
  'No expenses recorded.': 'No expenses recorded.',
  'No field reports recorded.': 'No field reports recorded.',
  'No generated period summaries yet.': 'No generated period summaries yet.',
  'No notifications.': 'No notifications.',
  'No audit events recorded.': 'No audit events recorded.',
  'No availability windows recorded.': 'No availability windows recorded.',
  'No skills recorded.': 'No skills recorded.',
  'No settlements recorded for this project.': 'No settlements recorded for this project.',
  'No approved worker-paid expenses require reimbursement.':
    'No approved worker-paid expenses require reimbursement.',
  'No issued invoice records match the current authorization scope.':
    'No issued invoice records match the current authorization scope.',
  'No Accounting Packs have been generated.': 'No Accounting Packs have been generated.',
  'No project assignment budget context is configured.':
    'No project assignment budget context is configured.',
  'No client contacts recorded.': 'No client contacts recorded.',
  'No milestones await approval.': 'No milestones await approval.',
  'No approved expenses are available for this project.':
    'No approved expenses are available for this project.',
  'No time economics are available for this project.':
    'No time economics are available for this project.',
  'No detailed plan': 'No detailed plan',
  'Finance access required': 'Finance access required',
  'Finance-only finalization of approved compensation for the selected project.':
    'Finance-only finalization of approved compensation for the selected project.',
  'Save availability': 'Save availability',
  'Dashboard actions': 'Dashboard actions',
  'View pending reports': 'View pending reports',
  'Register time': 'Register time',
  More: 'More',
  'Open PDF': 'Open PDF',
  'Step-up authentication is active for the next 10 minutes.':
    'Step-up authentication is active for the next 10 minutes.',
  Verified: 'Verified',
  verified: 'Verified',
  'self-reported': 'Self-reported',
  'Company Webmail': 'Company Webmail',
  Webmail: 'Webmail',
  'Access Company Webmail': 'Access Company Webmail',
  'Open corporate webmail in a new tab': 'Open corporate webmail in a new tab',
};

const copy: Record<PortalLocale, Record<string, string>> = {
  en,
  pt: {
    ...en,
    'Company Webmail': 'Webmail corporativo',
    Webmail: 'Webmail',
    'Access Company Webmail': 'Acessar e-mail corporativo',
    'Open corporate webmail in a new tab': 'Abrir o e-mail corporativo em uma nova guia',
    Today: 'Hoje',
    Time: 'Tempo',
    Reports: 'Relatórios',
    Expenses: 'Despesas',
    Projects: 'Projetos',
    'My Pay': 'Meu pagamento',
    Documents: 'Documentos',
    Notifications: 'Notificações',
    Profile: 'Perfil',
    Dashboard: 'Painel',
    Clients: 'Clientes',
    Team: 'Equipe',
    Planning: 'Planejamento',
    'PLC / Technical': 'PLC / Técnico',
    Approvals: 'Aprovações',
    Billing: 'Faturamento',
    Invoices: 'Faturas',
    Finance: 'Finanças',
    Settings: 'Configurações',
    Audit: 'Auditoria',
    'Time entries': 'Registros de tempo',
    'Daily and technical reports': 'Relatórios diários e técnicos',
    'Expenses and receipts': 'Despesas e recibos',
    'Profile and security': 'Perfil e segurança',
    'Resource planning': 'Planejamento de recursos',
    'Approval queue': 'Fila de aprovação',
    'Billing streams': 'Fluxos de faturamento',
    'Project finance': 'Finanças do projeto',
    'Invoice / cost ledger': 'Livro de faturas e custos',
    'Monthly Accounting Pack': 'Pacote contábil mensal',
    'Audit log': 'Registro de auditoria',
    Language: 'Idioma',
    'Save draft': 'Salvar rascunho',
    'Save changes': 'Salvar alterações',
    Submit: 'Enviar',
    Save: 'Salvar',
    Create: 'Criar',
    Approve: 'Aprovar',
    Reject: 'Rejeitar',
    Close: 'Fechar',
    Issue: 'Emitir',
    Download: 'Baixar',
    Project: 'Projeto',
    Client: 'Cliente',
    Worker: 'Colaborador',
    Date: 'Data',
    Description: 'Descrição',
    Summary: 'Resumo',
    Amount: 'Valor',
    Currency: 'Moeda',
    Status: 'Status',
    Period: 'Período',
    'Period start': 'Início do período',
    'Period end': 'Fim do período',
    Actual: 'Real',
    Approved: 'Aprovado',
    Pending: 'Pendente',
    Planned: 'Planejado',
    Revenue: 'Receita',
    'Revenue cap': 'Limite de orçamento (Cap)',
    'Daily rate': 'Taxa diária',
    'Fixed fee / milestones': 'Preço fechado / Marcos',
    'Client paid directly': 'Cliente pagou diretamente',
    'Project materials': 'Materiais do projeto',
    'Time & materials': 'Tempo e materiais',
    'Billing contact': 'Contato de faturamento',
    'Client contacts': 'Contatos do cliente',
    'Team access': 'Acesso da equipe',
    'All streams': 'Todos os conceitos',
    Specialists: 'Especialistas',
    'Other records': 'Outros registros',
    'PLC / technical reports': 'Relatórios PLC / técnicos',
    'No email': 'Sem e-mail',
    'No due date': 'Sem data de vencimento',
    'No tax profile': 'Sem perfil fiscal',
    'No budget': 'Sem orçamento',
    'Registered device': 'Dispositivo registrado',
    'Unnamed device': 'Dispositivo sem nome',
    Enabled: 'Ativado',
    'Not enabled': 'Não ativado',
    'No records match that search in your access scope.':
      'Nenhum registro corresponde à busca no seu escopo de acesso.',
    'No published assignment for today.': 'Nenhuma atribuição publicada para hoje.',
    'No time recorded.': 'Nenhum tempo registrado.',
    'No expenses recorded.': 'Nenhuma despesa registrada.',
    'No field reports recorded.': 'Nenhum relatório de campo registrado.',
    'No generated period summaries yet.': 'Nenhum resumo de período foi gerado.',
    'No notifications.': 'Nenhuma notificação.',
    'No audit events recorded.': 'Nenhum evento de auditoria registrado.',
    'No availability windows recorded.': 'Nenhuma janela de disponibilidade registrada.',
    'No skills recorded.': 'Nenhuma competência registrada.',
    'No settlements recorded for this project.': 'Nenhum acerto registrado para este projeto.',
    'No approved worker-paid expenses require reimbursement.':
      'Nenhuma despesa aprovada paga pelo colaborador exige reembolso.',
    'No issued invoice records match the current authorization scope.':
      'Nenhuma fatura emitida corresponde ao escopo de autorização atual.',
    'No Accounting Packs have been generated.': 'Nenhum pacote contábil foi gerado.',
    'No project assignment budget context is configured.':
      'Nenhum contexto de orçamento da atribuição está configurado.',
    'No client contacts recorded.': 'Nenhum contato de cliente registrado.',
    'No milestones await approval.': 'Nenhum marco aguarda aprovação.',
    'No approved expenses are available for this project.':
      'Nenhuma despesa aprovada está disponível para este projeto.',
    'No time economics are available for this project.':
      'Nenhuma economia de tempo está disponível para este projeto.',
    'No detailed plan': 'Nenhum plano detalhado',
    'Finance access required': 'Acesso financeiro necessário',
    'Finance-only finalization of approved compensation for the selected project.':
      'Finalização financeira da remuneração aprovada para o projeto selecionado.',
    'Save availability': 'Salvar disponibilidade',
    'Dashboard actions': 'Ações do painel',
    'View pending reports': 'Ver relatórios pendentes',
    'Register time': 'Registrar tempo',
    More: 'Mais',
    'Open PDF': 'Abrir PDF',
    'Step-up authentication is active for the next 10 minutes.':
      'Autenticação reforçada ativa (10 min).',
    Verified: 'Verificada',
    verified: 'Verificada',
    'self-reported': 'Autodeclarada',
  },
  es: {
    ...en,
    Today: 'Hoy',
    Time: 'Tiempo',
    Reports: 'Informes',
    Expenses: 'Gastos',
    Projects: 'Proyectos',
    'My Pay': 'Mi pago',
    Documents: 'Documentos',
    Notifications: 'Notificaciones',
    Profile: 'Perfil',
    Dashboard: 'Panel',
    Clients: 'Clientes',
    Team: 'Equipo',
    Planning: 'Planificación',
    'PLC / Technical': 'PLC / Técnico',
    Approvals: 'Aprobaciones',
    Billing: 'Facturación',
    Invoices: 'Facturas',
    Finance: 'Finanzas',
    Settings: 'Configuración',
    Audit: 'Auditoría',
    'Time entries': 'Registros de tiempo',
    'Daily and technical reports': 'Informes diarios y técnicos',
    'Expenses and receipts': 'Gastos y recibos',
    'Profile and security': 'Perfil y seguridad',
    'Resource planning': 'Planificación de recursos',
    'Approval queue': 'Cola de aprobación',
    'Billing streams': 'Flujos de facturación',
    'Project finance': 'Finanzas del proyecto',
    'Invoice / cost ledger': 'Libro de facturas y costes',
    'Monthly Accounting Pack': 'Paquete contable mensual',
    'Audit log': 'Registro de auditoría',
    Language: 'Idioma',
    'Save draft': 'Guardar borrador',
    'Save changes': 'Guardar cambios',
    Submit: 'Enviar',
    Save: 'Guardar',
    Create: 'Crear',
    Approve: 'Aprobar',
    Reject: 'Rechazar',
    Close: 'Cerrar',
    Issue: 'Emitir',
    Download: 'Descargar',
    Project: 'Proyecto',
    Client: 'Cliente',
    Worker: 'Trabajador',
    Date: 'Fecha',
    Description: 'Descripción',
    Summary: 'Resumen',
    Amount: 'Importe',
    Currency: 'Moneda',
    Status: 'Estado',
    Period: 'Periodo',
    'Period start': 'Inicio del periodo',
    'Period end': 'Fin del periodo',
    Actual: 'Real',
    Approved: 'Aprobado',
    Pending: 'Pendiente',
    Planned: 'Planificado',
    Revenue: 'Ingresos',
    'Revenue cap': 'Límite de presupuesto (Cap)',
    'Daily rate': 'Tarifa diaria',
    'Fixed fee / milestones': 'Precio cerrado / Hitos',
    'Client paid directly': 'Pagado directamente por el cliente',
    'Project materials': 'Materiales del proyecto',
    'Time & materials': 'Tiempo y materiales',
    'Billing contact': 'Contacto de facturación',
    'Client contacts': 'Contactos del cliente',
    'Team access': 'Acceso del equipo',
    'All streams': 'Todos los conceptos',
    Specialists: 'Especialistas',
    'Other records': 'Otros registros',
    'PLC / technical reports': 'Informes PLC / técnicos',
    'No email': 'Sin correo electrónico',
    'No due date': 'Sin fecha de vencimiento',
    'No tax profile': 'Sin perfil fiscal',
    'No budget': 'Sin presupuesto',
    'Registered device': 'Dispositivo registrado',
    'Unnamed device': 'Dispositivo sin nombre',
    Enabled: 'Activado',
    'Not enabled': 'No activado',
    'No records match that search in your access scope.':
      'Ningún registro coincide con la búsqueda en su ámbito de acceso.',
    'No published assignment for today.': 'No hay asignación publicada para hoy.',
    'No time recorded.': 'No hay tiempo registrado.',
    'No expenses recorded.': 'No hay gastos registrados.',
    'No field reports recorded.': 'No hay informes de campo registrados.',
    'No generated period summaries yet.': 'Aún no hay resúmenes de periodo generados.',
    'No notifications.': 'No hay notificaciones.',
    'No audit events recorded.': 'No hay eventos de auditoría registrados.',
    'No availability windows recorded.': 'No hay ventanas de disponibilidad registradas.',
    'No skills recorded.': 'No hay competencias registradas.',
    'No settlements recorded for this project.':
      'No hay liquidaciones registradas para este proyecto.',
    'No approved worker-paid expenses require reimbursement.':
      'No hay gastos aprobados pagados por trabajadores que requieran reembolso.',
    'No issued invoice records match the current authorization scope.':
      'Ninguna factura emitida coincide con el ámbito de autorización actual.',
    'No Accounting Packs have been generated.': 'No se han generado paquetes contables.',
    'No project assignment budget context is configured.':
      'No hay contexto de presupuesto de asignación configurado.',
    'No client contacts recorded.': 'No hay contactos de cliente registrados.',
    'No milestones await approval.': 'No hay hitos pendientes de aprobación.',
    'No approved expenses are available for this project.':
      'No hay gastos aprobados disponibles para este proyecto.',
    'No time economics are available for this project.':
      'No hay economía de tiempo disponible para este proyecto.',
    'No detailed plan': 'No hay plan detallado',
    'Finance access required': 'Se requiere acceso financiero',
    'Finance-only finalization of approved compensation for the selected project.':
      'Finalización financiera de la compensación aprobada para el proyecto seleccionado.',
    'Save availability': 'Guardar disponibilidad',
    'Dashboard actions': 'Acciones del panel',
    'View pending reports': 'Ver informes pendientes',
    'Register time': 'Registrar tiempo',
    More: 'Más',
    'Open PDF': 'Abrir PDF',
    'Step-up authentication is active for the next 10 minutes.':
      'Autenticación reforzada activa (10 min).',
    Verified: 'Verificada',
    verified: 'Verificada',
    'self-reported': 'Auto-declarada',
    'Company Webmail': 'Correo corporativo',
    Webmail: 'Webmail',
    'Access Company Webmail': 'Acceder al correo corporativo',
    'Open corporate webmail in a new tab': 'Abrir el correo corporativo en una pestaña nueva',
  },
};

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Record<string, string>>();

/** Dynamic Svelte text must remain owned by Svelte instead of the DOM translator. */
export function isPortalLiveText(node: Node): boolean {
  return Boolean(node.parentElement?.closest('[data-portal-live-text]'));
}

/** Translate static portal copy while leaving codes, tags, invoice numbers and records untouched. */
export function translatePortalDom(root: ParentNode, locale: PortalLocale): void {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null;
  while ((current = walker.nextNode())) nodes.push(current as Text);
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE'].includes(parent.tagName))
      continue;
    if (isPortalLiveText(node)) continue;
    const source = originalText.get(node) ?? node.nodeValue ?? '';
    originalText.set(node, source);
    const key = source.trim();
    if (!key) continue;
    const translated =
      canonicalPortalCatalog[locale][key as keyof (typeof canonicalPortalCatalog)[typeof locale]] ??
      copy[locale][key] ??
      en[key];
    if (!translated) continue;
    const leading = source.match(/^\s*/)?.[0] ?? '';
    const trailing = source.match(/\s*$/)?.[0] ?? '';
    node.nodeValue = `${leading}${translated}${trailing}`;
  }
  const elements: Element[] = [];
  if (root instanceof Element) elements.push(root);
  elements.push(...Array.from(root.querySelectorAll('[aria-label],[placeholder],[title]')));
  for (const element of elements) {
    const saved = originalAttributes.get(element) ?? {};
    for (const attribute of ['aria-label', 'placeholder', 'title']) {
      const value = element.getAttribute(attribute);
      if (value === null) continue;
      saved[attribute] ??= value;
      element.setAttribute(
        attribute,
        canonicalPortalCatalog[locale][
          saved[attribute] as keyof (typeof canonicalPortalCatalog)[typeof locale]
        ] ??
          copy[locale][saved[attribute]] ??
          en[saved[attribute]] ??
          saved[attribute],
      );
    }
    originalAttributes.set(element, saved);
  }
}

export function normalizePortalLocale(value: string | null | undefined): PortalLocale {
  return normalizeCanonicalLocale(value);
}

export function portalText(
  locale: PortalLocale,
  key: string,
  params?: Readonly<Record<string, string | number>>,
): string {
  const canonical = translateCanonical(locale, key, params);
  if (
    canonical !== key ||
    canonicalPortalCatalog[locale][key as keyof (typeof canonicalPortalCatalog)[typeof locale]]
  ) {
    return canonical;
  }
  return copy[locale][key] ?? en[key] ?? key;
}
