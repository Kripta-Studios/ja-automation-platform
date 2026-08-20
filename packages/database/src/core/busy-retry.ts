export function isDatabaseBusyError(error: unknown): boolean {
  return (
    error instanceof Error && /SQLITE_BUSY|SQLITE_LOCKED|database is locked/i.test(error.message)
  );
}

export function logDatabaseBusyRetry(repository: string, attempt: number): void {
  if (process.env.NODE_ENV === 'production' || process.env.JA_JSON_LOGS === 'true')
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'warn',
        event: 'database.busy_retry',
        repository,
        attempt,
      }),
    );
}
