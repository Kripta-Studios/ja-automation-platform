import type { PortalLocale } from '$lib/portal-i18n';

type CopyValue = readonly [string, string, string];

const copy: Record<string, CopyValue> = {
  focusedClient: [
    'Focused client: {name}',
    'Cliente seleccionado: {name}',
    'Cliente em foco: {name}',
  ],
  allClients: ['Show all clients', 'Mostrar todos los clientes', 'Mostrar todos os clientes'],
  showingClients: [
    'Showing {shown} of {total} matching clients',
    'Mostrando {shown} de {total} clientes coincidentes',
    'Mostrando {shown} de {total} clientes correspondentes',
  ],
  noClientMatches: [
    'No clients match this search.',
    'Ningún cliente coincide con esta búsqueda.',
    'Nenhum cliente corresponde a esta busca.',
  ],
  noAuthorizedClients: [
    'No authorized clients are available.',
    'No hay clientes autorizados disponibles.',
    'Nenhum cliente autorizado está disponível.',
  ],
  clearClientSearch: [
    'Clear client search',
    'Borrar búsqueda de clientes',
    'Limpar busca de clientes',
  ],
  noClientProjects: [
    'No projects are linked to this client yet.',
    'Todavía no hay proyectos vinculados a este cliente.',
    'Ainda não há projetos vinculados a este cliente.',
  ],
  clientProjectRegister: [
    'View this client’s projects',
    'Ver los proyectos de este cliente',
    'Ver os projetos deste cliente',
  ],
  newProjectForClient: [
    'Create a project for this client',
    'Crear un proyecto para este cliente',
    'Criar um projeto para este cliente',
  ],
  actualWorkCalendar: [
    'Actual work calendar · {count} projects',
    'Calendario de trabajo real · {count} proyectos',
    'Calendário de trabalho real · {count} projetos',
  ],
  primaryContact: ['Primary contact', 'Contacto principal', 'Contato principal'],
  billingContact: ['Billing contact', 'Contacto de facturación', 'Contato de faturamento'],
  projectDateContext: [
    'Project counts reflect the current search and client filters.',
    'Los recuentos reflejan la búsqueda y los filtros de cliente actuales.',
    'As contagens refletem a busca e os filtros de cliente atuais.',
  ],
  projectsHaveCalendarStart: [
    '{scheduled} projects have a start date; {unscheduled} do not yet appear on the calendar.',
    '{scheduled} proyectos tienen fecha de inicio; {unscheduled} todavía no aparecen en el calendario.',
    '{scheduled} projetos têm data de início; {unscheduled} ainda não aparecem no calendário.',
  ],
  activeTeam: ['Active team', 'Equipo activo', 'Equipe ativa'],
  assignmentResults: [
    'Showing {shown} of {total} active assignments',
    'Mostrando {shown} de {total} asignaciones activas',
    'Mostrando {shown} de {total} atribuições ativas',
  ],
  editAssignmentDates: [
    'Edit assignment dates',
    'Editar fechas de asignación',
    'Editar datas da atribuição',
  ],
  manageAssignment: ['Manage assignment', 'Gestionar asignación', 'Gerenciar atribuição'],
  monday: ['Monday', 'Lunes', 'Segunda-feira'],
  tuesday: ['Tuesday', 'Martes', 'Terça-feira'],
  wednesday: ['Wednesday', 'Miércoles', 'Quarta-feira'],
  thursday: ['Thursday', 'Jueves', 'Quinta-feira'],
  friday: ['Friday', 'Viernes', 'Sexta-feira'],
  utc: ['UTC', 'UTC', 'UTC'],
};

export type ProjectUxRound2CopyKey = keyof typeof copy;

export function projectUxRound2Text(
  locale: PortalLocale | string | undefined,
  key: ProjectUxRound2CopyKey,
  params: Record<string, string | number> = {},
): string {
  const index = locale === 'es' ? 1 : locale === 'pt' ? 2 : 0;
  let value = copy[key]?.[index] ?? copy[key]?.[0] ?? key;
  for (const [name, replacement] of Object.entries(params))
    value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}
