import type { openPortalRepository } from '$lib/server/portal-repository';
import { projectVisibility } from '$lib/portal/project-visibility';
import { clientCalendarWindow, normalizeCalendarMonth } from '$lib/portal/client-work-calendar';
import {
  CLIENT_PAGE_SIZE,
  foldSearchText,
  type ClientDirectoryPage,
  type ClientDirectoryRow,
} from '$lib/portal/client-directory';

type Row = Record<string, unknown>;
type Context = ReturnType<typeof openPortalRepository>;

/** Same rule as the client page: these states carry no outstanding balance. */
const noBalanceStates = new Set([
  'draft',
  'approved',
  'void',
  'credited',
  'cancelled',
  'superseded',
  'paid',
]);
const openProjectStates = new Set(['active', 'planned', 'paused', 'closing']);

const text = (row: Row, ...keys: string[]) => {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return '';
};

/**
 * Clients directory at scale. The list mode returns one page of compact rows
 * (25) filtered on the server; the focus mode (?client= or ?focus=) returns
 * only the requested client with its contacts, projects and work calendar so
 * contact management keeps working. Authorization mirrors the full Projects
 * loader: finance roles read every client, a project manager only clients
 * owning one of their visible projects; contacts come from the authorized
 * repository projection.
 */
export function buildClientDirectory(
  context: Context,
  url: URL,
  includeArchived: boolean,
): {
  clientDirectory: ClientDirectoryPage;
  clients: Row[];
  contacts: Row[];
  projects: Row[];
  calendarEntries: unknown[];
  calendarMonth: string;
  canViewWorkCalendar: boolean;
} {
  const { principal, repository, sqlite } = context;
  const role = principal.role;
  const financeVisible =
    role === 'owner_admin' || role === 'finance_admin' || role === 'auditor_read_only';
  const scope = projectVisibility(repository.listAssignedProjects(principal), includeArchived);
  const projectIds = [...scope.projectIds];
  const projects = (
    projectIds.length
      ? sqlite
          .prepare(
            `SELECT p.id,p.client_id,p.project_number,p.name,p.status,p.site_name,p.country
               FROM project p WHERE p.id IN (${projectIds.map(() => '?').join(',')})
              ORDER BY p.project_number`,
          )
          .all(...projectIds)
      : []
  ) as Row[];
  const readableClients = (
    financeVisible
      ? (repository.listClients(principal) as Row[])
      : (projectIds.length
          ? sqlite
              .prepare(
                `SELECT c.id,c.client_number,c.client_code,c.display_name,c.legal_name,c.status
                   FROM client c
                  WHERE EXISTS (SELECT 1 FROM project p WHERE p.client_id=c.id
                    AND p.id IN (${projectIds.map(() => '?').join(',')}))
                  ORDER BY c.client_number`,
              )
              .all(...projectIds)
          : []) as Row[]
  );
  const archivedClients = readableClients.filter((client) => client.status === 'archived').length;
  const allClients = readableClients.filter(
    (client) => includeArchived || client.status !== 'archived',
  );
  const contacts = (role === 'worker' ? [] : repository.listAllClientContacts(principal)) as Row[];
  const byClient = <T extends Row>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const key = text(row, 'client_id', 'clientId');
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return map;
  };
  const projectsByClient = byClient(projects);
  const contactsByClient = byClient(contacts);

  const calendarMonth = normalizeCalendarMonth(url.searchParams.get('calendarMonth'));
  const canViewWorkCalendar = ['owner_admin', 'finance_admin', 'project_manager'].includes(role);
  const requested = [url.searchParams.get('client'), url.searchParams.get('focus')]
    .map((value) => (value ?? '').trim())
    .find(Boolean);
  const focused = requested
    ? allClients.find((client) => String(client.id) === requested)
    : undefined;
  const find = (url.searchParams.get('find') ?? '').trim().slice(0, 120);

  if (focused) {
    const clientId = String(focused.id);
    const window = clientCalendarWindow(calendarMonth);
    const clientProjectIds = new Set(
      (projectsByClient.get(clientId) ?? []).map((project) => String(project.id)),
    );
    return {
      clientDirectory: {
        mode: 'focus',
        rows: [],
        total: allClients.length,
        page: 1,
        pages: 1,
        pageSize: CLIENT_PAGE_SIZE,
        find,
        includeArchived,
        archivedClients,
      },
      clients: [focused],
      contacts: contactsByClient.get(clientId) ?? [],
      projects: projectsByClient.get(clientId) ?? [],
      calendarEntries: canViewWorkCalendar
        ? (
            repository.listClientCalendarEntries(principal, window.from, window.to) as Array<{
              client_id?: string;
              project_id?: string;
            }>
          ).filter(
            (entry) =>
              String(entry.client_id) === clientId && clientProjectIds.has(String(entry.project_id)),
          )
        : [],
      calendarMonth,
      canViewWorkCalendar,
    };
  }

  const needle = foldSearchText(find);
  const matching = needle
    ? allClients.filter((client) => {
        const id = String(client.id);
        const haystack = [
          text(client, 'display_name'),
          text(client, 'legal_name'),
          text(client, 'client_number'),
          text(client, 'client_code'),
          text(client, 'billing_email'),
          ...(contactsByClient.get(id) ?? []).flatMap((contact) => [
            text(contact, 'name'),
            text(contact, 'email'),
            text(contact, 'phone'),
            text(contact, 'company'),
          ]),
          ...(projectsByClient.get(id) ?? []).flatMap((project) => [
            text(project, 'project_number'),
            text(project, 'name'),
            text(project, 'site_name'),
          ]),
        ].join(' ');
        return foldSearchText(haystack).includes(needle);
      })
    : allClients;
  const sorted = [...matching].sort((left, right) =>
    (text(left, 'display_name', 'legal_name') || '').localeCompare(
      text(right, 'display_name', 'legal_name') || '',
    ),
  );
  const pages = Math.max(1, Math.ceil(sorted.length / CLIENT_PAGE_SIZE));
  const page = Math.min(
    pages,
    Math.max(1, Math.trunc(Number(url.searchParams.get('page'))) || 1),
  );
  const pageClients = sorted.slice((page - 1) * CLIENT_PAGE_SIZE, page * CLIENT_PAGE_SIZE);

  // Outstanding per client and currency (finance roles only), from the same
  // authorized invoice list the client page uses. Exact bigint arithmetic.
  let owedByClient: Map<string, Map<string, bigint>> | null = null;
  if (financeVisible && pageClients.length) {
    const projectClient = new Map<string, string>();
    for (const project of sqlite
      .prepare('SELECT id,client_id FROM project')
      .all() as Array<{ id: string; client_id: string | null }>)
      if (project.client_id) projectClient.set(String(project.id), String(project.client_id));
    const wanted = new Set(pageClients.map((client) => String(client.id)));
    owedByClient = new Map();
    for (const invoice of repository.listInvoices(principal) as unknown as Row[]) {
      const clientId = projectClient.get(String(invoice.project_id));
      if (!clientId || !wanted.has(clientId)) continue;
      if (noBalanceStates.has(String(invoice.state))) continue;
      const outstanding =
        BigInt(String(invoice.total_minor ?? 0)) - BigInt(String(invoice.paid_minor ?? 0));
      if (outstanding <= 0n) continue;
      const perCurrency = owedByClient.get(clientId) ?? new Map<string, bigint>();
      const currency = String(invoice.currency);
      perCurrency.set(currency, (perCurrency.get(currency) ?? 0n) + outstanding);
      owedByClient.set(clientId, perCurrency);
    }
  }

  const rows: ClientDirectoryRow[] = pageClients.map((client) => {
    const id = String(client.id);
    const clientProjects = projectsByClient.get(id) ?? [];
    const clientContacts = contactsByClient.get(id) ?? [];
    const primary =
      clientContacts.find((contact) => Number(contact.is_primary) === 1) ??
      clientContacts.find((contact) => Number(contact.is_billing_contact) === 1) ??
      clientContacts[0];
    return {
      id,
      name: text(client, 'display_name', 'legal_name', 'name'),
      code: [text(client, 'client_code'), text(client, 'client_number')].filter(Boolean).join(' · '),
      legalName: text(client, 'legal_name'),
      status: text(client, 'status') || 'active',
      openProjects: clientProjects.filter((project) => openProjectStates.has(String(project.status)))
        .length,
      projects: clientProjects.length,
      contacts: clientContacts.length,
      primaryContact: primary
        ? { name: text(primary, 'name'), email: text(primary, 'email'), phone: text(primary, 'phone') }
        : null,
      owed: owedByClient
        ? [...(owedByClient.get(id) ?? new Map<string, bigint>())]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([currency, minor]) => ({ currency, minor: minor.toString() }))
        : null,
    };
  });

  return {
    clientDirectory: {
      mode: 'list',
      rows,
      total: sorted.length,
      page,
      pages,
      pageSize: CLIENT_PAGE_SIZE,
      find,
      includeArchived,
      archivedClients,
    },
    clients: [],
    contacts: [],
    projects: [],
    calendarEntries: [],
    calendarMonth,
    canViewWorkCalendar,
  };
}
