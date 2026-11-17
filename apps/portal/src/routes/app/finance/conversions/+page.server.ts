import { error, redirect } from '@sveltejs/kit';
import { assertLiveSession, AccessDeniedError, latestStoredRateDate } from '@ja/database';
import { foldSearchText } from '$lib/portal/client-directory';
import { openPortalRepository } from '$lib/server/portal-repository';
import type { PageServerLoad } from './$types';

const PAGE = 25;
type Row = {
  id: string;
  spent_on: string;
  currency: string;
  amount_minor: string;
  vendor: string;
  description: string;
  category: string;
  approval_state: string;
  project_id: string;
  project_number: string;
  project_name: string;
  project_currency: string;
  worker_name: string;
  converted_minor: string | null;
  converted_rate_source: string | null;
};

/**
 * Money → Conversions: expenses recorded in another currency than their
 * project. Default scope: not yet converted and not invoiced. Owner / finance.
 */
export const load: PageServerLoad = ({ locals, url }) => {
  if (!locals.user || !locals.session) redirect(303, '/j-aautomation/app/login');
  const context = openPortalRepository(locals);
  try {
    try {
      assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    } catch {
      error(401, 'Live authenticated session required');
    }
    if (!['owner_admin', 'finance_admin'].includes(context.principal.role))
      error(403, 'Finance access required');
    const status = ['open', 'converted', 'all'].includes(url.searchParams.get('status') ?? '')
      ? (url.searchParams.get('status') as 'open' | 'converted' | 'all')
      : 'open';
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    const limit = Math.min(500, Math.max(PAGE, Number(url.searchParams.get('show') ?? PAGE) || PAGE));
    const selectedId = url.searchParams.get('expense') ?? '';
    const rows = context.sqlite
      .prepare(
        `SELECT e.id,e.spent_on,e.currency,CAST(e.amount_minor AS TEXT) amount_minor,e.vendor,e.description,
                e.category,e.approval_state,p.id project_id,p.project_number,p.name project_name,
                p.currency project_currency,u.name worker_name,
                (SELECT CAST(c.target_amount_minor AS TEXT) FROM currency_conversion c
                  WHERE c.source_kind='expense' AND c.source_id=e.id AND c.target_currency=p.currency
                    AND NOT EXISTS(SELECT 1 FROM currency_conversion n WHERE n.supersedes_id=c.id)
                  ORDER BY c.confirmed_at DESC LIMIT 1) converted_minor,
                (SELECT c.rate_source FROM currency_conversion c
                  WHERE c.source_kind='expense' AND c.source_id=e.id AND c.target_currency=p.currency
                    AND NOT EXISTS(SELECT 1 FROM currency_conversion n WHERE n.supersedes_id=c.id)
                  ORDER BY c.confirmed_at DESC LIMIT 1) converted_rate_source
           FROM expense e
           JOIN project p ON p.id=e.project_id
           JOIN user u ON u.id=e.worker_id
          WHERE e.currency<>p.currency AND e.approval_state NOT IN ('void','rejected')
            AND (e.invoice_id IS NULL OR ?='all')
            AND NOT EXISTS(SELECT 1 FROM record_correction_link l WHERE l.record_type='expense' AND l.original_id=e.id)
          ORDER BY e.spent_on DESC,e.id DESC
          LIMIT 2000`,
      )
      .all(status) as Row[];
    const needle = foldSearchText(q);
    const filtered = rows.filter(
      (row) =>
        (status === 'all' ||
          (status === 'open' ? row.converted_minor === null : row.converted_minor !== null)) &&
        (!needle ||
          foldSearchText(
            [row.worker_name, row.project_number, row.project_name, row.vendor, row.description, row.currency, row.category].join(' '),
          ).includes(needle)),
    );
    const openCount = rows.filter((row) => row.converted_minor === null).length;
    const selected = rows.find((row) => row.id === selectedId) ?? null;
    return {
      status,
      q,
      total: filtered.length,
      openCount,
      rows: filtered.slice(0, limit),
      limit,
      selected,
      latestRateDate: latestStoredRateDate(context.sqlite),
    };
  } finally {
    context.sqlite.close();
  }
};
