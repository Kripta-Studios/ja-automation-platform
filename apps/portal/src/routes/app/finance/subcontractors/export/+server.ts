import { error, type RequestHandler } from '@sveltejs/kit';
import { assertLiveSession, AccessDeniedError } from '@ja/database';
import { renderHtmlToPdf, toCsv } from '@ja/reporting';
import { decimalHoursFromMinutes } from '$lib/portal/minute-hours';
import { minorToInputText, paymentMoney } from '$lib/portal/payment-money';
import { openPortalRepository } from '$lib/server/portal-repository';
import { parsePayeeKey, settlementDetail, settlementWeek } from '$lib/server/subcontractor-settlement';
import { settlementText } from '../copy';

const escape = (value: string) =>
  value.replace(/[&<>"']/gu, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in required');
  const payee = parsePayeeKey(url.searchParams.get('payee'));
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'csv';
  const lang = url.searchParams.get('lang') ?? 'en';
  const locale = lang === 'es' || lang === 'pt' ? lang : 'en';
  const tag = locale === 'es' ? 'es-ES' : locale === 'pt' ? 'pt-BR' : 'en-US';
  if (!payee) error(400, 'Choose a subcontractor');
  const week = settlementWeek(url.searchParams.get('week'));
  const context = openPortalRepository(locals);
  try {
    try {
      assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    } catch {
      error(401, 'Live authenticated session required');
    }
    if (!['owner_admin', 'finance_admin'].includes(context.principal.role)) error(403, 'Finance access required');
    const detail = settlementDetail(context, { payee, start: week.start, end: week.end });
    if (!detail) error(404, 'Subcontractor not found');
    const t = (key: Parameters<typeof settlementText>[1], params: Record<string, string | number> = {}) =>
      settlementText(locale, key, params);
    const slug = detail.payee.name.normalize('NFD').replace(/[^\w]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 60) || 'subcontractor';
    const filename = `subcontractor-settlement-${week.year}-CW${String(week.week).padStart(2, '0')}-${slug}`;
    const headers = {
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    };
    if (format === 'csv') {
      // Round 2 (T49): readable, localized headers and words; display names, no raw codes.
      const basis = (value: string | null | undefined) =>
        value === 'hourly' ? t('perHour') : value === 'daily' ? t('perDay') : (value ?? '');
      const columns = {
        week: t('week'),
        subcontractor: t('supplier'),
        worker: t('person'),
        date: t('day'),
        project: t('project'),
        hours: t('hoursCol'),
        currency: 'Currency',
        rate: t('rate'),
        basis: `${t('rate')} (${t('perHour')} / ${t('perDay')})`,
        amount: t('amount'),
        status: t('status'),
      };
      const rows = detail.entries.map((entry) => ({
        [columns.week]: `${week.year}-W${String(week.week).padStart(2, '0')}`,
        [columns.subcontractor]: detail.payee.name,
        [columns.worker]: entry.workerName,
        [columns.date]: entry.workDate,
        [columns.project]: `${entry.projectNumber} ${entry.projectName}`,
        [columns.hours]: decimalHoursFromMinutes(entry.minutes),
        [columns.currency]: entry.currency,
        [columns.rate]: entry.rateMinor === null ? '' : minorToInputText(entry.rateMinor, entry.currency),
        [columns.basis]: basis(entry.rateBasis),
        [columns.amount]: entry.amountMinor === null ? '' : minorToInputText(entry.amountMinor, entry.currency),
        [columns.status]: t(detail.status as 'draft' | 'approved' | 'paid'),
      }));
      return new Response(`\uFEFF${toCsv(rows, undefined, { numericColumns: [columns.hours, columns.rate, columns.amount] })}`, {
        headers: {
          ...headers,
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${filename}.csv"`,
        },
      });
    }
    const money = (minor: string | null, currency: string) => (minor === null ? '—' : paymentMoney(minor, currency, tag));
    const date = (iso: string) =>
      new Intl.DateTimeFormat(tag, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
    const body = detail.workers
      .map(
        (worker) => `<h2>${escape(worker.name)} · ${decimalHoursFromMinutes(worker.minutes)} h</h2>
<table><thead><tr><th>${t('day')}</th><th>${t('project')}</th><th class="amount">${t('hoursCol')}</th><th class="amount">${t('rate')}</th><th class="amount">${t('amount')}</th></tr></thead><tbody>
${worker.entries
  .map(
    (entry) =>
      `<tr><td>${escape(date(entry.workDate))}</td><td>${escape(`${entry.projectNumber} · ${entry.projectName}`)}</td><td class="amount">${decimalHoursFromMinutes(entry.minutes)}</td><td class="amount">${entry.rateMinor === null ? '—' : escape(money(entry.rateMinor, entry.currency))}</td><td class="amount">${escape(entry.amountMinor === null ? t('notHourly') : money(entry.amountMinor, entry.currency))}</td></tr>`,
  )
  .join('')}
</tbody></table>`,
      )
      .join('\n');
    const totals = detail.totals
      .map((total) => `<div><span>${t('totalFor', { currency: total.currency })}</span><strong>${escape(money(total.minor, total.currency))}</strong></div>`)
      .join('');
    const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${escape(filename)}</title>
<style>@page{size:A4;margin:14mm}body{font:10pt Arial,sans-serif;color:#17212b}h1{font-size:18pt;margin:0 0 2mm}h2{font-size:11pt;margin:6mm 0 1mm;border-bottom:1px solid #d9e1e7}
.muted{color:#64748b}table{width:100%;border-collapse:collapse}th{background:#0f2d3d;color:#fff;text-align:left;font-size:8pt;padding:2mm}td{border-bottom:1px solid #d9e1e7;padding:2mm}
.amount{text-align:right;white-space:nowrap}.totals{margin-top:6mm;display:flex;gap:6mm;justify-content:flex-end}.totals div{border-top:3px solid #e23d2d;padding-top:2mm;display:grid}.totals strong{font-size:14pt}</style></head>
<body><h1>${escape(t('title'))}</h1><p><strong>${escape(detail.payee.name)}</strong> · ${escape(t('weekLabel', { week: week.week, range: `${week.start} – ${week.end}` }))} · ${escape(t(detail.status))}</p>
${body}<div class="totals">${totals}</div>
${detail.status === 'paid' && detail.paidOn ? `<p class="muted">${escape(t('paidInfo', { date: detail.paidOn, reference: detail.reference ?? '' }))}</p>` : ''}
</body></html>`;
    const pdf = renderHtmlToPdf(html);
    return new Response(Buffer.from(pdf), {
      headers: {
        ...headers,
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}.pdf"`,
      },
    });
  } finally {
    context.sqlite.close();
  }
};
