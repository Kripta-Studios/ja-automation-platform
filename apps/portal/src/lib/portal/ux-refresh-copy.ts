import type { PortalLocale } from '$lib/portal-i18n';

const copy = {
  projectWorkspace: ['Project workspace', 'Espacio del proyecto', 'Espaço do projeto'],
  prepareInvoice: ['Prepare an invoice', 'Preparar una factura', 'Preparar uma fatura'],
  conditions: [
    'Team and billing conditions',
    'Equipo y condiciones de facturación',
    'Equipe e condições de faturamento',
  ],
  invoices: ['Invoices', 'Facturas', 'Faturas'],
  collections: ['Collections', 'Cobros', 'Recebimentos'],
  calculation: [
    'Explain recent-period totals',
    'Explicar totales del período reciente',
    'Explicar totais do período recente',
  ],
  openProject: ['Open project', 'Abrir proyecto', 'Abrir projeto'],
  clearSearch: ['Clear search', 'Borrar búsqueda', 'Limpar busca'],
  home: ['Workspace home', 'Inicio del espacio', 'Início do espaço'],
  relatedWork: [
    'Continue in this project',
    'Continuar en este proyecto',
    'Continuar neste projeto',
  ],
  time: ['Time entries', 'Registros de horas', 'Registros de horas'],
  expenses: ['Expenses', 'Gastos', 'Despesas'],
  reports: ['Reports', 'Reportes', 'Relatórios'],
} as const;

export function uxText(locale: PortalLocale, key: keyof typeof copy): string {
  return copy[key][locale === 'es' ? 1 : locale === 'pt' ? 2 : 0];
}
