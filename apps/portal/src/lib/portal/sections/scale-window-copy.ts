import type { PortalLocale } from '../../portal-i18n';

/** Copy for on-demand / windowed registers (Projects, Reports, Documents) at scale. */
const en = {
  showHistory: 'Show assignment history',
  historyHint: '{count} active assignments. Open the history to see every assignment.',
  loading: 'Loading…',
  windowShowing: 'Showing {shown} of {total}',
  showMore: 'Show more',
  docsFind: 'Find a document',
  docsFindHint: 'File name, project, type or reference',
  sortBy: 'Sort by',
  newest: 'Newest first',
  oldest: 'Oldest first',
  name: 'Name',
  search: 'Search',
  clear: 'Clear',
  docsShowing: 'Showing {from}–{to} of {total}',
  docsNone: 'No documents match this search.',
} as const;

type Copy = Record<keyof typeof en, string>;

const es: Copy = {
  showHistory: 'Ver historial de asignaciones',
  historyHint: '{count} asignaciones activas. Abre el historial para ver todas las asignaciones.',
  loading: 'Cargando…',
  windowShowing: 'Mostrando {shown} de {total}',
  showMore: 'Mostrar más',
  docsFind: 'Buscar un documento',
  docsFindHint: 'Nombre de archivo, proyecto, tipo o referencia',
  sortBy: 'Ordenar por',
  newest: 'Más recientes primero',
  oldest: 'Más antiguos primero',
  name: 'Nombre',
  search: 'Buscar',
  clear: 'Limpiar',
  docsShowing: 'Mostrando {from}–{to} de {total}',
  docsNone: 'Ningún documento coincide con esta búsqueda.',
};

const pt: Copy = {
  showHistory: 'Ver histórico de atribuições',
  historyHint: '{count} atribuições ativas. Abra o histórico para ver todas as atribuições.',
  loading: 'Carregando…',
  windowShowing: 'Mostrando {shown} de {total}',
  showMore: 'Mostrar mais',
  docsFind: 'Encontrar um documento',
  docsFindHint: 'Nome do arquivo, projeto, tipo ou referência',
  sortBy: 'Ordenar por',
  newest: 'Mais recentes primeiro',
  oldest: 'Mais antigos primeiro',
  name: 'Nome',
  search: 'Pesquisar',
  clear: 'Limpar',
  docsShowing: 'Mostrando {from}–{to} de {total}',
  docsNone: 'Nenhum documento corresponde a esta pesquisa.',
};

export type ScaleWindowCopyKey = keyof typeof en;

export function scaleWindowText(
  locale: PortalLocale | string,
  key: ScaleWindowCopyKey,
  params: Record<string, string | number> = {},
): string {
  const table = String(locale).startsWith('es') ? es : String(locale).startsWith('pt') ? pt : en;
  return table[key].replace(/\{(\w+)\}/gu, (_, name: string) => String(params[name] ?? `{${name}}`));
}
