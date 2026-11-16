import { base } from '$app/paths';
import { localToday } from '../ui/time-entry-clock';
import {
  receiptFactsFromFileName,
  receiptFactsFromText,
  type ReceiptFacts,
} from '../expense-evidence';

const readable = new Set(['image/png', 'image/jpeg', 'application/pdf']);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// The reader accepts one file per person every 10 seconds; pace calls instead of hitting 429.
let lastRead = 0;

/**
 * Receipt-first capture: suggest amount and date from the file name and the
 * existing on-server local text reader (no external AI). Suggestions are only
 * prefilled for the person to confirm; nothing is saved automatically. Any
 * failure simply returns what the file name gave.
 */
export async function readReceipt(
  file: File,
  locale: 'en' | 'es' | 'pt',
  options: { retryWhenBusy?: boolean } = {},
): Promise<ReceiptFacts> {
  const today = localToday();
  const fromName = receiptFactsFromFileName(file.name, today);
  if (!readable.has(file.type) || file.size > 8 * 1024 * 1024) return fromName;
  for (let attempt = 0; attempt < (options.retryWhenBusy ? 3 : 1); attempt += 1) {
    try {
      const since = Date.now() - lastRead;
      if (since < 10_500) {
        if (!options.retryWhenBusy) return fromName;
        await wait(10_500 - since);
      }
      lastRead = Date.now();
      const form = new FormData();
      form.set('file', file);
      form.set('locale', locale);
      const response = await fetch(`${base}/app/api/workflow/extract`, {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      });
      // The reader allows one file per person every 10 seconds.
      if (response.status === 429 && options.retryWhenBusy) {
        await wait(10_500);
        continue;
      }
      if (!response.ok) return fromName;
      const result = (await response.json()) as { text?: unknown };
      const facts =
        typeof result.text === 'string' ? receiptFactsFromText(result.text, { locale, today }) : {};
      // A deliberate file name ("2026-11-14_89.90.jpg") wins over OCR guesses.
      return { amount: fromName.amount ?? facts.amount, date: fromName.date ?? facts.date };
    } catch {
      return fromName;
    }
  }
  return fromName;
}
