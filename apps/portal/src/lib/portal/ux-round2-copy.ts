import type { PortalLocale } from '$lib/portal-i18n';

const copy = {
  enterPeriod: [
    'Enter a period directly',
    'Introducir un período directamente',
    'Informar um período diretamente',
  ],
  readOnly: ['Read-only review', 'Consulta de solo lectura', 'Consulta somente leitura'],
  readOnlyHelp: [
    'Review and download the records available to your role. A finance administrator or owner can make changes.',
    'Consulta y descarga los registros disponibles para tu rol. Un administrador financiero o propietario puede modificarlos.',
    'Consulte e baixe os registros disponíveis para sua função. Um administrador financeiro ou proprietário pode alterá-los.',
  ],
  commercialSections: [
    'Commercial workspace sections',
    'Secciones del espacio comercial',
    'Seções do espaço comercial',
  ],
  expenseTreatment: ['Expense treatment', 'Tratamiento de gastos', 'Tratamento de despesas'],
  rulesAndIssuers: ['Rules and issuers', 'Reglas y emisores', 'Regras e emissores'],
} as const;

export function round2Text(locale: PortalLocale, key: keyof typeof copy): string {
  return copy[key][locale === 'es' ? 1 : locale === 'pt' ? 2 : 0];
}
