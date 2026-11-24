/**
 * T18: copy of the in-app 403/404 page (EN / ES / PT-BR) and the section a
 * refused URL belongs to. Section names reuse the navigation labels, which the
 * portal catalog already translates.
 */
import type { PortalLocale } from '../portal-i18n';

type Tuple = readonly [string, string, string];
const index = (locale: PortalLocale): 0 | 1 | 2 => (locale === 'es' ? 1 : locale === 'pt' ? 2 : 0);

const COPY = {
  notFoundTitle: ['Page not found', 'Página no encontrada', 'Página não encontrada'],
  notFoundBody: [
    'This page does not exist, or it is not available under your access. Use the menu to continue.',
    'Esta página no existe o no está disponible con tu acceso. Usa el menú para continuar.',
    'Esta página não existe ou não está disponível com o seu acesso. Use o menu para continuar.',
  ],
  restrictedBody: [
    'This page is not part of your workspace. Use the menu to go back to your work.',
    'Esta página no forma parte de tu espacio de trabajo. Usa el menú para volver a tu trabajo.',
    'Esta página não faz parte do seu espaço de trabalho. Use o menu para voltar ao seu trabalho.',
  ],
  payTechnician: [
    'Your pay is handled by your own company, not in this portal. Ask your supplier coordinator about payments.',
    'Tu pago lo gestiona tu propia empresa, no este portal. Consulta los pagos con tu coordinador del proveedor.',
    'Seu pagamento é feito pela sua própria empresa, não por este portal. Fale com o coordenador do fornecedor sobre pagamentos.',
  ],
  payCoordinator: [
    "Your team's pay is agreed between your company and J&A, outside this portal. Record your team's hours and expenses in My supplier team.",
    'El pago de tu equipo se acuerda entre tu empresa y J&A, fuera de este portal. Registra las horas y los gastos de tu equipo en Mi equipo del proveedor.',
    'O pagamento da sua equipe é combinado entre a sua empresa e a J&A, fora deste portal. Registre as horas e despesas da sua equipe em Minha equipe do fornecedor.',
  ],
  crewChief: [
    'Crew hours is for crew chiefs. The owner makes someone crew chief for a project; until then, log your own hours in Time.',
    'Horas del equipo es para los jefes de cuadrilla. El propietario nombra al jefe de cuadrilla de cada proyecto; mientras tanto, registra tus propias horas en Horas.',
    'Horas da equipe é para os chefes de equipe. O proprietário define o chefe de equipe de cada projeto; até lá, registre suas próprias horas em Horas.',
  ],
  contact: ['Contact {name}', 'Escribir a {name}', 'Escrever para {name}'],
  contactSubject: [
    'Access to {page} in J&A Automation',
    'Acceso a {page} en J&A Automation',
    'Acesso a {page} no J&A Automation',
  ],
} as const satisfies Record<string, Tuple>;

export type ErrorPageCopyKey = keyof typeof COPY;

export function errorPageText(
  locale: PortalLocale,
  key: ErrorPageCopyKey,
  params: Record<string, string> = {},
): string {
  return COPY[key][index(locale)].replace(/\{(\w+)\}/gu, (match, name: string) =>
    Object.hasOwn(params, name) ? params[name]! : match,
  );
}

/** Navigation label (catalog key) of the section a portal path belongs to. */
const SECTION_LABELS: Record<string, string> = {
  '': 'Home',
  time: 'Time',
  expenses: 'Expenses',
  reports: 'Reports',
  crew: 'Crew hours',
  pay: 'My Pay',
  'my-pay': 'My Pay',
  profile: 'Profile',
  notifications: 'Notifications',
  help: 'Help',
  projects: 'Projects',
  team: 'Team',
  clients: 'Projects',
  planning: 'Planning',
  documents: 'Documents',
  approvals: 'Approvals',
  finance: 'Money',
  billing: 'Invoices',
  invoices: 'Invoices',
  ledger: 'Payments',
  accounting: 'Accounting',
  audit: 'Audit log',
  manage: 'Manage',
  supplier: 'Suppliers',
  workflow: 'Digital workers',
};

/** First path segment after `/app/` (or of a `from=` value) → section label key. */
export function sectionLabelKey(path: string): string | null {
  const segment = path.replace(/^.*?\/app(?=\/|$)/u, '').replace(/^\/+/u, '').split(/[/?#]/u)[0] ?? '';
  return Object.hasOwn(SECTION_LABELS, segment) ? SECTION_LABELS[segment]! : null;
}
