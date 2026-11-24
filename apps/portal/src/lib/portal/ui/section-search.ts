import { searchAssistantTasks } from '../assistant/matcher';
import type { AssistantContext, AssistantLocale, AssistantTask } from '../assistant/types';
import { portalLandingForRole, type NavItem, type NavShortcut } from '../../portal-navigation';
import { portalText } from '../../portal-i18n';

export type SectionSearchKind = 'action' | 'configuration' | 'section';

export type SectionSearchEntry = Readonly<{
  id: string;
  kind: SectionSearchKind;
  label: string;
  parentLabel?: string;
  href?: string;
  task?: AssistantTask;
}>;

export type SectionSearchResults = Readonly<{
  actions: readonly SectionSearchEntry[];
  configurations: readonly SectionSearchEntry[];
  sections: readonly SectionSearchEntry[];
  count: number;
}>;

type SectionSearchOptions = Readonly<{
  items: readonly NavItem[];
  shortcuts?: readonly NavShortcut[];
  context: AssistantContext;
  locale: AssistantLocale;
  translate: (key: string) => string;
  itemHref: (item: NavItem) => string;
}>;

/** Normalize to whole words so a short term such as IVA cannot match "privado". */
export function sectionSearchTokens(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean);
}

/** Send record searches to the server-backed workspace landing for this role. */
export function workspaceRecordSearchHref(
  base: string,
  role: string | null | undefined,
  query: string,
  locale: AssistantLocale,
): string {
  const target = new URL(portalLandingForRole(base, role), 'https://portal.invalid');
  target.searchParams.set('q', query);
  target.searchParams.set('lang', locale);
  return `${target.pathname}${target.search}${target.hash}`;
}

/** Levenshtein distance capped at 2 (enough for a one-letter typo check). */
function editDistanceAtMost1(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (left.length - i) + (right.length - j) <= 1;
}

/**
 * A query word matches a label word when it is the start of it ("pay" →
 * "Payments", "inv" → "Invoices") or, for words of five letters or more, one
 * typo away ("invoce" → "invoice"). Matching stays word-anchored, so "iva"
 * never matches "privado".
 */
export function sectionTokenMatches(queryToken: string, candidateToken: string): boolean {
  if (candidateToken === queryToken) return true;
  if (queryToken.length >= 2 && candidateToken.startsWith(queryToken)) return true;
  if (queryToken.length < 5) return false;
  // One typo in the word or in the start of a longer word.
  return [
    candidateToken,
    candidateToken.slice(0, queryToken.length),
    candidateToken.slice(0, queryToken.length + 1),
  ].some((candidate) => editDistanceAtMost1(queryToken, candidate));
}

function containsEveryQueryToken(queryTokens: readonly string[], candidate: string): boolean {
  const candidateTokens = [...new Set(sectionSearchTokens(candidate))];
  return queryTokens.every((token) =>
    candidateTokens.some((candidateToken) => sectionTokenMatches(token, candidateToken)),
  );
}

/** A section is found by its name in any portal language (EN/ES/PT-BR). */
function labelInEveryLocale(label: string, translate: (key: string) => string): string {
  const names = new Set([translate(label), label]);
  for (const locale of ['en', 'es', 'pt'] as const) {
    try {
      names.add(portalText(locale, label));
    } catch {
      // Untranslated labels still match in the current language.
    }
  }
  return [...names].join(' ');
}

function isConfigurationTask(task: AssistantTask): boolean {
  const target = new URL(task.href, 'https://portal.invalid');
  return (
    target.searchParams.has('task') ||
    target.searchParams.has('setup') ||
    target.searchParams.get('view') === 'commercial'
  );
}

function destinationKey(href: string): string {
  const target = new URL(href, 'https://portal.invalid');
  const appPath = target.pathname.includes('/app')
    ? target.pathname.slice(target.pathname.indexOf('/app'))
    : target.pathname;
  const query = [...target.searchParams.entries()]
    .filter(([key]) => key !== 'lang')
    .sort(
      ([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue),
    )
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return `${appPath}${query ? `?${query}` : ''}`;
}

/**
 * Coordinate section/settings discovery with the role-gated task catalogue.
 * Entity records remain a separate, server-backed search handoff in the UI.
 */
export function searchSectionDestinations(
  query: string,
  { items, shortcuts = [], context, locale, translate, itemHref }: SectionSearchOptions,
): SectionSearchResults {
  const queryTokens = sectionSearchTokens(query);
  if (!queryTokens.length) return { actions: [], configurations: [], sections: [], count: 0 };

  const actions: SectionSearchEntry[] = [];
  const configurations: SectionSearchEntry[] = [];
  const sections: SectionSearchEntry[] = [];
  const taskDestinationKeys = new Set<string>();

  const taskMatches = searchAssistantTasks(query, context, locale).matches;
  for (const { task } of taskMatches) {
    const kind: SectionSearchKind = isConfigurationTask(task)
      ? 'configuration'
      : task.actionNames.length
        ? 'action'
        : 'section';
    const entry: SectionSearchEntry = {
      id: `task:${task.id}`,
      kind,
      label: task.title[locale],
      task,
    };
    if (kind === 'configuration') configurations.push(entry);
    else if (kind === 'action') actions.push(entry);
    else sections.push(entry);
    taskDestinationKeys.add(destinationKey(task.href));
  }

  const seenNavigationDestinations = new Set<string>();
  for (const item of [...shortcuts, ...items]) {
    const label = translate(item.label);
    const parentLabel =
      'parentLabel' in item && typeof item.parentLabel === 'string'
        ? translate(item.parentLabel)
        : undefined;
    const searchable = `${labelInEveryLocale(item.label, translate)} ${
      'parentLabel' in item && typeof item.parentLabel === 'string'
        ? labelInEveryLocale(item.parentLabel, translate)
        : ''
    }`;
    if (!containsEveryQueryToken(queryTokens, searchable)) continue;

    const href = itemHref(item);
    const key = destinationKey(href);
    if (seenNavigationDestinations.has(key) || taskDestinationKeys.has(key)) continue;
    seenNavigationDestinations.add(key);

    const kind: SectionSearchKind =
      'parentLabel' in item &&
      (new URL(href, 'https://portal.invalid').searchParams.has('task') ||
        new URL(href, 'https://portal.invalid').searchParams.get('view') === 'setup')
        ? 'configuration'
        : 'section';
    const entry: SectionSearchEntry = {
      id: `navigation:${item.section}:${item.label}`,
      kind,
      label,
      ...(parentLabel ? { parentLabel } : {}),
      href,
    };
    if (kind === 'configuration') configurations.push(entry);
    else sections.push(entry);
  }

  return {
    actions,
    configurations,
    sections,
    count: actions.length + configurations.length + sections.length,
  };
}

/** An already-authorized record suggestion offered by the search palette. */
export type PaletteRecord = Readonly<{
  id: string;
  label: string;
  detail?: string;
  group?: string;
  href: string;
}>;

/**
 * Whole-word prefix match on records the server already scoped to this user.
 * "jun ohio" finds "Junkers OHIO"; "iva" never matches "privado".
 */
export function searchPaletteRecords(
  query: string,
  records: readonly PaletteRecord[],
  limit = 6,
): PaletteRecord[] {
  const queryTokens = sectionSearchTokens(query);
  if (!queryTokens.length) return [];
  return records
    .filter((record) => {
      const tokens = sectionSearchTokens(`${record.label} ${record.detail ?? ''}`);
      return queryTokens.every((token) => tokens.some((candidate) => candidate.startsWith(token)));
    })
    .slice(0, limit);
}
