type WorkerRecord = Readonly<Record<string, unknown>>;

/** Build filter choices only from records already projected for this role. */
export function recordWorkerOptions(
  records: readonly WorkerRecord[],
  projectId: string,
  nameFields: readonly string[],
): Array<[string, string]> {
  const names = new Map<string, string>();
  for (const row of records) {
    if (projectId && String(row.project_id ?? '') !== projectId) continue;
    const id = String(row.worker_id ?? '');
    if (!id) continue;
    const name = nameFields.map((field) => String(row[field] ?? '').trim()).find(Boolean) ?? id;
    if (!names.has(id) || names.get(id) === id) names.set(id, name);
  }
  return [...names].sort((a, b) => a[1].localeCompare(b[1]));
}

export function availableWorkerSelection(
  workerId: string,
  options: readonly (readonly [string, string])[],
): string {
  return workerId && options.some(([id]) => id === workerId) ? workerId : '';
}
