import { error, redirect } from '@sveltejs/kit';
import { AccessDeniedError, ValidationError } from '@ja/database';
import { openPortalRepository } from '$lib/server/portal-repository';
import { invoiceOpenBalance, netOutstandingByInvoice } from '$lib/server/invoice-balance';
import type { PageServerLoad } from './$types';

/**
 * Client page (owner round 2026-11-16): one client's billing identity,
 * contacts, projects with quick figures, invoices and outstanding balance.
 *
 * Authorization: owner/finance/auditor read every client through the client
 * repository projection. A project manager reads only a client that owns one
 * of their projects, sees only those projects and receives no billing or
 * money fields. Workers have no client page. Writes are not handled here:
 * the page posts to the existing projects ?/updateClient and ?/deleteClient
 * actions, which re-check authorization.
 */
type Row = Record<string, unknown>;

const liveTime = `t.approval_state NOT IN ('rejected','void')
  AND NOT EXISTS (
    SELECT 1 FROM record_correction_link rcl
      JOIN time_entry correction ON correction.id=rcl.correction_id
     WHERE rcl.record_type='time_entry'
       AND ((rcl.original_id=t.id AND correction.approval_state='approved')
         OR (rcl.correction_id=t.id AND correction.approval_state<>'approved')))`;

const unpaidStates = new Set(['draft', 'approved', 'void', 'credited', 'cancelled', 'superseded', 'paid']);

export const load: PageServerLoad = ({ locals, params }) => {
  if (!locals.user) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    const { principal, sqlite, repository } = context;
    const role = principal.role;
    const financeVisible =
      role === 'owner_admin' || role === 'finance_admin' || role === 'auditor_read_only';
    if (!financeVisible && role !== 'project_manager') error(403, 'detail.client.forbidden');

    let client: Row | undefined;
    if (financeVisible) {
      client = repository.listClients(principal).find((row) => String(row.id) === params.id) as
        | Row
        | undefined;
    } else {
      client = sqlite
        .prepare(
          'SELECT id,client_number,client_code,display_name,legal_name,status,timezone FROM client WHERE id=?',
        )
        .get(params.id) as Row | undefined;
    }
    if (!client) error(404, 'detail.client.notFound');

    const allowedProjects = financeVisible ? null : new Set([...(principal.projectIds ?? [])].map(String));
    const projects = (
      sqlite
        .prepare(
          `SELECT p.id,p.project_number,p.name,p.status,p.currency,p.site_name,p.start_date,p.planned_end_date,p.po_number
             FROM project p WHERE p.client_id=? ORDER BY p.status='archived',p.project_number`,
        )
        .all(params.id) as Row[]
    ).filter((project) => !allowedProjects || allowedProjects.has(String(project.id)));
    if (allowedProjects && projects.length === 0) error(403, 'detail.client.forbidden');

    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const ids = projects.map((project) => String(project.id));
    const hours = new Map<string, { month: number; total: number; waiting: number }>();
    if (ids.length) {
      for (const row of sqlite
        .prepare(
          `SELECT t.project_id projectId,SUM(t.minutes) total,
                  SUM(CASE WHEN t.work_date BETWEEN ? AND ? THEN t.minutes ELSE 0 END) month,
                  SUM(CASE WHEN t.approval_state='submitted' THEN t.minutes ELSE 0 END) waiting
             FROM time_entry t WHERE t.project_id IN (${ids.map(() => '?').join(',')}) AND ${liveTime}
            GROUP BY t.project_id`,
        )
        .all(monthStart, today, ...ids) as Array<{
        projectId: string;
        total: number;
        month: number;
        waiting: number;
      }>)
        hours.set(row.projectId, {
          month: Number(row.month ?? 0),
          total: Number(row.total ?? 0),
          waiting: Number(row.waiting ?? 0),
        });
    }

    let invoices: Row[] | null = null;
    let balances: { currency: string; outstandingMinor: string; invoicedMinor: string }[] | null =
      null;
    if (financeVisible) {
      const projectIds = new Set(ids);
      const netOpen = netOutstandingByInvoice(context.v3, principal);
      invoices = repository
        .listInvoices(principal)
        .filter((invoice) => projectIds.has(String(invoice.project_id)))
        .map((invoice) => {
          const total = BigInt(String(invoice.total_minor ?? 0));
          const state = String(invoice.state);
          // Net of payments and credit notes (T12), the same rule as Money and Payments.
          const outstanding = unpaidStates.has(state) ? 0n : invoiceOpenBalance(invoice, netOpen);
          return {
            id: String(invoice.id),
            number: invoice.invoice_number ? String(invoice.invoice_number) : null,
            projectId: String(invoice.project_id),
            projectNumber: String(invoice.project_number ?? ''),
            state,
            currency: String(invoice.currency),
            totalMinor: total.toString(),
            outstandingMinor: outstanding.toString(),
            issuedAt: invoice.issued_at ? String(invoice.issued_at) : null,
            dueAt: invoice.due_at ? String(invoice.due_at) : null,
          };
        });
      const byCurrency = new Map<string, { outstanding: bigint; invoiced: bigint }>();
      for (const invoice of invoices) {
        const entry = byCurrency.get(String(invoice.currency)) ?? { outstanding: 0n, invoiced: 0n };
        entry.outstanding += BigInt(String(invoice.outstandingMinor));
        if (!['draft', 'approved', 'void', 'cancelled', 'superseded'].includes(String(invoice.state)))
          entry.invoiced += BigInt(String(invoice.totalMinor));
        byCurrency.set(String(invoice.currency), entry);
      }
      balances = [...byCurrency].map(([currency, value]) => ({
        currency,
        outstandingMinor: value.outstanding.toString(),
        invoicedMinor: value.invoiced.toString(),
      }));
    }

    let contacts: Row[] = [];
    try {
      contacts = repository.listClientContacts(principal, params.id) as Row[];
    } catch {
      contacts = [];
    }

    return {
      client,
      contacts,
      projects: projects.map((project) => ({
        ...project,
        monthMinutes: hours.get(String(project.id))?.month ?? 0,
        totalMinutes: hours.get(String(project.id))?.total ?? 0,
        waitingMinutes: hours.get(String(project.id))?.waiting ?? 0,
      })),
      invoices,
      balances,
      financeVisible,
      canEdit: role === 'owner_admin' || role === 'finance_admin',
      canDelete: role === 'owner_admin',
      canCreateProject: role === 'owner_admin' || role === 'finance_admin',
    };
  } catch (caught) {
    if (caught && typeof caught === 'object' && 'status' in caught) throw caught;
    if (caught instanceof AccessDeniedError) error(403, 'detail.client.forbidden');
    if (caught instanceof ValidationError) error(404, 'detail.client.notFound');
    error(500, 'detail.client.unavailable');
  } finally {
    context.sqlite.close();
  }
};
