/**
 * Small, screen-owned copy primitives for the navigation and accounting UX pass.
 *
 * These labels live outside the global catalog because they belong to the
 * navigation pass. Keep all three supported portal locales here so a screen
 * does not accidentally send a new English-only label through `translate`.
 */
export const navigationUxCopy = {
  ledger: {
    reviewRegister: 'Review invoice register',
    recordsShown: 'Showing {visible} of {total} authorized ledger rows',
    activeFilters: 'Active filters',
    activeFilterCount: '{count} active',
    advancedFilters: 'More filters',
    allAuthorizedRows: 'All authorized rows',
    clearAll: 'Clear all',
    filterHint: 'Try removing one filter or return to the full authorized register.',
    noMatchingRows: 'No ledger rows match these filters.',
    reviewAllRows: 'Show all issued invoices',
    reviewBillingRecords: 'Review billing records',
    openInvoice: 'Open invoice {invoice}',
    openClient: 'Open client {client}',
    openProject: 'Open project {project}',
    removeFilter: 'Remove {filter} filter',
    agingBucket: '{bucket}: {amount}',
  },
  accounting: {
    showing: 'Showing',
    allPackStates: 'All pack states',
    viewRegister: 'View pack register',
    registerCount: '{count} accounting packs',
    clearRegisterFilter: 'Show all pack states',
    noMatchingPacks: 'No accounting packs match this status.',
    emptySourceGuide: 'Review source records before generating a pack.',
    openLedger: 'Review invoice and collection ledger',
    generatePack: 'Generate a period pack',
    auditorGuidance: 'Auditors can review finalized and in-progress artifacts here.',
  },
  login: {
    credentialError:
      'We could not verify these credentials. Review the email and password, then try again.',
    reviewCredentials: 'Review credentials',
    emailCorrection: 'Check your work email.',
    passwordCorrection: 'Check your password.',
    retrySignIn: 'Try sign-in again',
  },
  sectionNavigator: {
    currentSection: 'Current section: {section}',
    resultCount: '{count} matching destinations',
    searchHint:
      'Find authorized actions, settings and sections. Record search appears separately when available.',
    frequentSettings: 'Frequent settings',
    actions: 'Actions',
    configurations: 'Configuration',
    sections: 'Sections',
    records: 'Records',
    recordSearch: 'Search records for “{query}”',
    recordSearchHint: 'The workspace search will show records available to your account.',
    noMatches: 'No matching actions, settings or sections.',
  },
} as const;

export type NavigationUxLocale = 'en' | 'es' | 'pt';
type NavigationUxSection = keyof typeof navigationUxCopy;
type NavigationUxCatalog = {
  [section in NavigationUxSection]: Record<string, string>;
};

export const navigationUxCatalog: Record<NavigationUxLocale, NavigationUxCatalog> = {
  en: navigationUxCopy,
  es: {
    ledger: {
      reviewRegister: 'Revisar registro de facturas',
      recordsShown: 'Mostrando {visible} de {total} filas autorizadas del libro mayor',
      activeFilters: 'Filtros activos',
      activeFilterCount: '{count} activos',
      advancedFilters: 'Más filtros',
      allAuthorizedRows: 'Todas las filas autorizadas',
      clearAll: 'Borrar todos',
      filterHint: 'Quita un filtro o vuelve al registro autorizado completo.',
      noMatchingRows: 'Ninguna fila del libro mayor coincide con estos filtros.',
      reviewAllRows: 'Mostrar todas las facturas emitidas',
      reviewBillingRecords: 'Revisar registros de facturación',
      openInvoice: 'Abrir factura {invoice}',
      openClient: 'Abrir cliente {client}',
      openProject: 'Abrir proyecto {project}',
      removeFilter: 'Quitar filtro {filter}',
      agingBucket: '{bucket}: {amount}',
    },
    accounting: {
      showing: 'Mostrando',
      allPackStates: 'Todos los estados de paquetes',
      viewRegister: 'Ver registro de paquetes',
      registerCount: '{count} paquetes contables',
      clearRegisterFilter: 'Mostrar todos los estados de paquetes',
      noMatchingPacks: 'Ningún paquete contable coincide con este estado.',
      emptySourceGuide: 'Revisa los registros fuente antes de generar un paquete.',
      openLedger: 'Revisar libro mayor de facturas y cobros',
      generatePack: 'Generar paquete de un periodo',
      auditorGuidance: 'Los auditores pueden revisar aquí los artefactos finalizados y en curso.',
    },
    login: {
      credentialError:
        'No pudimos verificar estas credenciales. Revisa el correo y la contraseña e inténtalo de nuevo.',
      reviewCredentials: 'Revisar credenciales',
      emailCorrection: 'Comprueba tu correo de trabajo.',
      passwordCorrection: 'Comprueba tu contraseña.',
      retrySignIn: 'Intentar iniciar sesión de nuevo',
    },
    sectionNavigator: {
      currentSection: 'Sección actual: {section}',
      resultCount: '{count} destinos coincidentes',
      searchHint:
        'Busca acciones, ajustes y secciones autorizados. La búsqueda de registros aparece aparte cuando está disponible.',
      frequentSettings: 'Ajustes frecuentes',
      actions: 'Acciones',
      configurations: 'Configuración',
      sections: 'Secciones',
      records: 'Registros',
      recordSearch: 'Buscar registros para «{query}»',
      recordSearchHint:
        'La búsqueda del espacio mostrará los registros disponibles para tu cuenta.',
      noMatches: 'No hay acciones, ajustes ni secciones coincidentes.',
    },
  },
  pt: {
    ledger: {
      reviewRegister: 'Rever registro de faturas',
      recordsShown: 'Mostrando {visible} de {total} linhas autorizadas do livro razão',
      activeFilters: 'Filtros ativos',
      activeFilterCount: '{count} ativos',
      advancedFilters: 'Mais filtros',
      allAuthorizedRows: 'Todas as linhas autorizadas',
      clearAll: 'Limpar tudo',
      filterHint: 'Remova um filtro ou volte ao registro autorizado completo.',
      noMatchingRows: 'Nenhuma linha do livro razão corresponde a estes filtros.',
      reviewAllRows: 'Mostrar todas as faturas emitidas',
      reviewBillingRecords: 'Rever registros de faturamento',
      openInvoice: 'Abrir fatura {invoice}',
      openClient: 'Abrir cliente {client}',
      openProject: 'Abrir projeto {project}',
      removeFilter: 'Remover filtro {filter}',
      agingBucket: '{bucket}: {amount}',
    },
    accounting: {
      showing: 'Exibindo',
      allPackStates: 'Todos os estados de pacotes',
      viewRegister: 'Ver registro de pacotes',
      registerCount: '{count} pacotes contábeis',
      clearRegisterFilter: 'Mostrar todos os estados de pacotes',
      noMatchingPacks: 'Nenhum pacote contábil corresponde a este estado.',
      emptySourceGuide: 'Revise os registros de origem antes de gerar um pacote.',
      openLedger: 'Rever livro razão de faturas e cobranças',
      generatePack: 'Gerar pacote de um período',
      auditorGuidance: 'Auditores podem revisar aqui os artefatos finalizados e em andamento.',
    },
    login: {
      credentialError:
        'Não foi possível verificar estas credenciais. Revise o e-mail e a senha e tente novamente.',
      reviewCredentials: 'Revisar credenciais',
      emailCorrection: 'Confira seu e-mail corporativo.',
      passwordCorrection: 'Confira sua senha.',
      retrySignIn: 'Tentar entrar novamente',
    },
    sectionNavigator: {
      currentSection: 'Seção atual: {section}',
      resultCount: '{count} destinos correspondentes',
      searchHint:
        'Encontre ações, configurações e seções autorizadas. A busca por registros aparece à parte quando disponível.',
      frequentSettings: 'Configurações frequentes',
      actions: 'Ações',
      configurations: 'Configurações',
      sections: 'Seções',
      records: 'Registros',
      recordSearch: 'Pesquisar registros por “{query}”',
      recordSearchHint: 'A pesquisa da área mostrará os registros disponíveis para sua conta.',
      noMatches: 'Nenhuma ação, configuração ou seção correspondente.',
    },
  },
};

/** Resolve a screen-owned label and interpolate its small, visible parameters. */
export function navigationUxText(
  locale: NavigationUxLocale,
  section: NavigationUxSection,
  key: string,
  params: Readonly<Record<string, string | number>> = {},
): string {
  const value =
    navigationUxCatalog[locale]?.[section]?.[key] ?? navigationUxCatalog.en[section][key] ?? key;
  return value.replace(/\{([\w]+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}
