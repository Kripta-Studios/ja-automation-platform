import { AccessDeniedError, V3AccessDeniedError, assertLiveSession } from '@ja/database';
import { error } from '@sveltejs/kit';
import { openPortalRepository } from '$lib/server/portal-repository';
import {
  overviewEntries,
  overviewFilters,
  overviewPeriod,
  sortedOverviewEntries,
} from '$lib/server/time-overview';
import {
  includesArchivedProjectHistory,
  normalizeVisibleProjectSelection,
  projectVisibility,
  visibleProjectRecords,
} from '$lib/portal/project-visibility';
import { normalizePortalLocale } from '$lib/portal-i18n';
import { timeWeekText } from '$lib/portal/sections/time-week-copy';
import { decimalHoursFromMinutes } from '$lib/portal/minute-hours';
import type { RequestHandler } from './$types';

/**
 * Full CSV of the Hours overview for the current filters. The page only shows
 * aggregates and one page of entries; the export covers every matching entry,
 * read through the same authorized repository scope as the page.
 */
const reviewRoles = ['owner_admin', 'project_manager', 'finance_admin', 'auditor_read_only'];

const csvCell = (value: unknown) => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return /[",\n;]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
};

export const GET: RequestHandler = ({ locals, url }) => {
  if (!locals.user || !locals.session) error(401, 'Sign in again before downloading hours.');
  if (!reviewRoles.includes(locals.user.role ?? '')) error(403, 'Hours overview access required');
  const context = openPortalRepository(locals);
  try {
    assertLiveSession(context.sqlite, context.principal, AccessDeniedError);
    if (!reviewRoles.includes(context.principal.role)) error(403, 'Hours overview access required');
    const scope = projectVisibility(
      context.repository.listAssignedProjects(context.principal),
      includesArchivedProjectHistory(url.searchParams),
    );
    const project = normalizeVisibleProjectSelection(url.searchParams.get('project'), scope.projectIds);
    const period = overviewPeriod(url.searchParams);
    const { entries } = overviewEntries(
      visibleProjectRecords(
        context.repository.listTimeForScope(context.principal, {
          projectId: project || undefined,
          from: period.from,
          to: period.to,
        }),
        scope.projectIds,
      ),
      overviewFilters(url.searchParams),
    );
    const locale = normalizePortalLocale(url.searchParams.get('lang') ?? 'en');
    const t = (key: Parameters<typeof timeWeekText>[1]) => timeWeekText(locale, key);
    const status = (state: string) =>
      state === 'approved' || state === 'locked'
        ? t('statusApproved')
        : state === 'submitted'
          ? t('statusSubmitted')
          : state === 'needs_changes'
            ? t('statusNeedsChanges')
            : t('statusDraft');
    const category = (value: string) =>
      value === 'regular' ? t('work') : value === 'travel' ? t('travel') : value === 'overtime' ? t('overtime') : value;
    const header = [
      t('date'),
      t('ovWorker'),
      t('project'),
      t('type'),
      t('hours'),
      t('status'),
      t('detailStart'),
      t('detailEnd'),
      t('detailBreak'),
      t('detailNote'),
    ];
    const lines = sortedOverviewEntries(entries).map((entry) =>
      [
        entry.work_date,
        entry.worker_name,
        [entry.project_number, entry.project_name].filter(Boolean).join(' · '),
        category(entry.category),
        decimalHoursFromMinutes(entry.minutes),
        status(entry.approval_state),
        entry.start_time ?? '',
        entry.end_time ?? '',
        entry.start_time ? String(entry.break_minutes ?? 0) : '',
        entry.note ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
    return new Response(`\uFEFF${[header.map(csvCell).join(','), ...lines].join('\r\n')}`, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="hours-${period.from}-to-${period.to}.csv"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (caught) {
    if (caught instanceof AccessDeniedError || caught instanceof V3AccessDeniedError)
      error(403, 'You cannot download these hours.');
    throw caught;
  } finally {
    context.sqlite.close();
  }
};
