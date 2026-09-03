export type InvoicePdfPollingStatus = 'queued' | 'running' | 'ready' | 'failed' | 'unavailable';

export const INVOICE_PDF_POLL_INTERVAL_MS = 2_500;

type Refresh = () => Promise<void>;

const isActiveStatus = (status: InvoicePdfPollingStatus): boolean =>
  status === 'queued' || status === 'running';

export type InvoicePdfPollingController = Readonly<{
  update: (status: InvoicePdfPollingStatus) => void;
  dispose: () => void;
}>;

export function createInvoicePdfPollingController(
  refresh: Refresh,
  intervalMs = INVOICE_PDF_POLL_INTERVAL_MS,
): InvoicePdfPollingController {
  let timer: ReturnType<typeof setInterval> | undefined;
  let status: InvoicePdfPollingStatus = 'unavailable';
  let generation = 0;
  let inFlightToken: symbol | undefined;
  let disposed = false;

  const stopTimer = (): void => {
    if (timer === undefined) return;
    clearInterval(timer);
    timer = undefined;
  };

  const startPoll = (pollGeneration: number): void => {
    if (
      disposed ||
      !isActiveStatus(status) ||
      pollGeneration !== generation ||
      inFlightToken !== undefined
    )
      return;

    const token = Symbol('invoice-pdf-poll');
    inFlightToken = token;
    void Promise.resolve()
      .then(refresh)
      .catch(() => undefined)
      .finally(() => {
        if (disposed || pollGeneration !== generation || inFlightToken !== token) return;
        inFlightToken = undefined;
      });
  };

  const update = (nextStatus: InvoicePdfPollingStatus): void => {
    if (disposed) return;

    const wasActive = isActiveStatus(status);
    status = nextStatus;
    if (!isActiveStatus(nextStatus)) {
      stopTimer();
      generation += 1;
      inFlightToken = undefined;
      return;
    }

    if (wasActive && timer !== undefined) return;

    const pollGeneration = generation;
    timer = setInterval(() => startPoll(pollGeneration), intervalMs);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    stopTimer();
    generation += 1;
    inFlightToken = undefined;
  };

  return { update, dispose };
}
