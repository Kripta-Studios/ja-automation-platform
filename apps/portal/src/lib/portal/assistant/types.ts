export type AssistantLocale = 'en' | 'es' | 'pt';
export type AssistantRole =
  | 'owner_admin'
  | 'finance_admin'
  | 'project_manager'
  | 'worker'
  | 'auditor_read_only';
export type AssistantContext = Readonly<{
  role?: string | null;
  workforceProfile?: string | null;
  canonicalOwner?: boolean;
}>;
export type AssistantSurface =
  | 'time-create'
  | 'expense-create'
  | 'report-daily'
  | 'report-technical'
  | 'report-generate'
  | 'invoice-create';
export type AssistantRecordKind = 'project' | 'invoice' | 'time' | 'expense' | 'report';
export type AssistantTask = Readonly<{
  id: string;
  title: Readonly<Record<AssistantLocale, string>>;
  description: Readonly<Record<AssistantLocale, string>>;
  phrases: Readonly<Record<AssistantLocale, readonly string[]>>;
  category: string;
  roles: readonly AssistantRole[];
  profiles?: readonly string[];
  requiresCanonicalOwner?: boolean;
  href: string;
  surface?: AssistantSurface;
  focusSelector?: string;
  recordKind?: AssistantRecordKind;
  recordHref?: string;
  actionNames: readonly string[];
}>;
export type AssistantMatch = Readonly<{ task: AssistantTask; score: number }>;
export type AssistantSearchResult = Readonly<{
  kind: 'matches' | 'empty' | 'unsupported';
  matches: readonly AssistantMatch[];
}>;
export type AssistantRecord = Readonly<{
  id: string;
  label: string;
  kind: AssistantRecordKind;
}>;
