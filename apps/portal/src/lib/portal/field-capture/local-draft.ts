import { openDB } from 'idb';

export type LocalCaptureDraft = Readonly<{
  userId: string;
  projectId: string;
  workDate: string;
  values: Record<string, string | boolean>;
  savedAt: string;
}>;

const database = () =>
  openDB('ja-field-capture-v1', 1, {
    upgrade(db) {
      db.createObjectStore('drafts');
    },
  });
export const localDraftKey = (userId: string, projectId: string, workDate: string) =>
  JSON.stringify([userId, projectId, workDate]);

export async function saveLocalCaptureDraft(draft: LocalCaptureDraft): Promise<void> {
  const db = await database();
  await db.put('drafts', draft, localDraftKey(draft.userId, draft.projectId, draft.workDate));
  db.close();
}

export async function readLocalCaptureDraft(
  userId: string,
  projectId: string,
  workDate: string,
): Promise<LocalCaptureDraft | undefined> {
  const db = await database();
  const row = (await db.get('drafts', localDraftKey(userId, projectId, workDate))) as
    | LocalCaptureDraft
    | undefined;
  db.close();
  return row?.userId === userId && row.projectId === projectId && row.workDate === workDate
    ? row
    : undefined;
}

export async function clearLocalCaptureDraft(
  userId: string,
  projectId: string,
  workDate: string,
): Promise<void> {
  const db = await database();
  await db.delete('drafts', localDraftKey(userId, projectId, workDate));
  db.close();
}

/** Every draft this person saved on this device, newest first (survives reloads, T24). */
export async function listLocalCaptureDrafts(userId: string): Promise<LocalCaptureDraft[]> {
  const db = await database();
  const rows = (await db.getAll('drafts')) as LocalCaptureDraft[];
  db.close();
  return rows
    .filter((row) => row?.userId === userId && row.projectId && row.workDate)
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}
