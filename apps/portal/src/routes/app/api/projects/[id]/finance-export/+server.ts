import { error, type RequestHandler } from '@sveltejs/kit';
import { projectFinanceXlsx } from '@ja/reporting';
import { isRealIsoDate } from '$lib/server/iso-date';
import { openPortalRepository } from '$lib/server/portal-repository';

const financeRoles = new Set(['owner_admin', 'finance_admin']);

function strictPeriodDate(url: URL, name: 'periodStart' | 'periodEnd'): string | undefined {
  const values = url.searchParams.getAll(name);
  if (values.length === 0) return undefined;
  const value = values.length === 1 ? values[0] : undefined;
  if (!value || !isRealIsoDate(value)) error(400, `${name} must be a valid ISO calendar date`);
  return value;
}

function safeFilenamePart(value: unknown, fallback: string): string {
  const cleaned = String(value ?? '')
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._-]+/gu, '-')
    .replace(/^[.-]+|[.-]+$/gu, '')
    .slice(0, 80);
  return cleaned || fallback;
}

export const GET: RequestHandler = ({ locals, params, url }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in required');
  if (!financeRoles.has(String(locals.user.role ?? ''))) error(403, 'Finance role required');

  const projectId = params.id;
  if (!projectId) error(400, 'Project ID required');
  const periodStart = strictPeriodDate(url, 'periodStart');
  const periodEnd = strictPeriodDate(url, 'periodEnd');
  if ((periodStart && !periodEnd) || (!periodStart && periodEnd))
    error(400, 'Both period dates are required');
  if (periodStart && periodEnd && periodStart > periodEnd)
    error(400, 'Period start must not follow period end');

  const context = openPortalRepository(locals);
  try {
    const overview = context.repository.projectOverview(context.principal, projectId);
    const financial = context.v3.projectFinance(
      context.principal,
      projectId,
      periodStart,
      periodEnd,
    );
    const project = overview.project;
    const bytes = projectFinanceXlsx({
      project: {
        project_number: String(project.project_number ?? ''),
        project_name: String(project.name ?? ''),
        client_number: String(project.client_number ?? ''),
        client_name: String(project.client_name ?? ''),
        currency: String(project.currency ?? ''),
        period_start: periodStart ?? 'all-time',
        period_end: periodEnd ?? 'all-time',
      },
      financial: financial as unknown as Record<string, unknown>,
      timeEconomics: financial.timeEconomics as readonly Record<string, unknown>[],
      expenseEconomics: financial.expenseEconomics as readonly Record<string, unknown>[],
    });
    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    const number = safeFilenamePart(project.project_number, safeFilenamePart(projectId, 'project'));
    const period = periodStart && periodEnd ? `${periodStart}-${periodEnd}` : 'all-time';
    const filename = `ja-${number}-finance-${period}.xlsx`;
    return new Response(body, {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-length': String(bytes.byteLength),
        // All filename components are restricted to ASCII token characters,
        // making the quoted RFC 6266 fallback safe from CR/LF/control injection.
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } finally {
    context.sqlite.close();
  }
};
