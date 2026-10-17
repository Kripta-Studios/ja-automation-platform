import { searchAssistantTasks } from '../assistant/matcher';
import type { AssistantContext, AssistantLocale, AssistantTask } from '../assistant/types';
import { portalLandingForRole, type NavItem, type NavShortcut } from '../../portal-navigation';

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

function containsEveryQueryToken(queryTokens: readonly string[], candidate: string): boolean {
  const candidateTokens = new Set(sectionSearchTokens(candidate));
  return queryTokens.every((token) => candidateTokens.has(token));
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
    if (!containsEveryQueryToken(queryTokens, `${label} ${parentLabel ?? ''}`)) continue;

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
