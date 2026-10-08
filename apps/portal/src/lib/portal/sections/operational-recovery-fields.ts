/** Map a weekly JSON row back to the named, visible controls for its calendar day. */
export function weeklyRecoveryFields(
  errors: Readonly<Record<string, readonly string[] | undefined>>,
  workDate: string,
  dates: readonly string[],
  kind: 'time' | 'expense',
): Record<string, string[]> {
  const day = dates.indexOf(workDate);
  const rowFields: Record<string, string> =
    kind === 'time'
      ? { minutes: 'hours', summary: 'summary', category: 'category' }
      : {
          amount: 'amount',
          amountMinor: 'amount',
          description: 'description',
          category: 'category',
          vendor: 'vendor',
        };
  return Object.fromEntries(
    Object.entries(errors).flatMap(([field, messages]) => {
      if (!messages?.length) return [];
      const name = day >= 0 && rowFields[field] ? `${rowFields[field]}_${day}` : field;
      const visibleMessages =
        kind === 'time' && field === 'minutes' && day >= 0
          ? messages.map((message) =>
              message === 'problem.time.minutesInvalid'
                ? 'Enter a valid number of hours from 0 to 24.'
                : message,
            )
          : [...messages];
      return [[name, visibleMessages]];
    }),
  );
}
