/** Browser-safe shape of one server page of the Clients directory. */
export type ClientDirectoryRow = {
  id: string;
  name: string;
  code: string;
  legalName: string;
  status: string;
  openProjects: number;
  projects: number;
  contacts: number;
  primaryContact: { name: string; email: string; phone: string } | null;
  /** Finance roles only: outstanding balance per currency (exact minor units as strings). */
  owed: Array<{ currency: string; minor: string }> | null;
};

export type ClientDirectoryPage = {
  mode: 'list' | 'focus';
  rows: ClientDirectoryRow[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  find: string;
  includeArchived: boolean;
  /** Archived clients this person may see (drives the "Include archived" counter). */
  archivedClients?: number;
};

export const CLIENT_PAGE_SIZE = 25;

/** Accent- and case-insensitive text for matching. */
export function foldSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .trim();
}
