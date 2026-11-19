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
 * Small or low-resolution photos/screenshots make the local OCR misread digits
 * (a 10 px "45.00" was read as "46.00"). Before reading, enlarge such images in
 * the browser so the text is ~3x taller. Only the copy sent to the reader is
 * enlarged; the receipt that is saved is always the original file.
 */
async function enlargedForReading(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > 0 && longest < 1600 ? Math.min(3, 2400 / longest) : 1;
    if (scale <= 1.2) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob || blob.size > 8 * 1024 * 1024) return file;
    return new File([blob], 'receipt.png', { type: 'image/png' });
  } catch {
    return file;
  }
}

export type ReceiptReading = ReceiptFacts & {
  /** No amount could be suggested (reader failed, was unavailable or found none): ask to type it. */
  unread: boolean;
};

/** One read at a time per tab: a second receipt waits its turn instead of hitting 429. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Receipt-first capture: suggest amount and date from the file name and the
 * existing on-server local text reader (no external AI). Suggestions are only
 * prefilled for the person to confirm; nothing is saved automatically.
 * Reads are queued and paced to the reader's limit (one file every ~10 s), and
 * a "busy" answer is retried quietly. Any failure returns what the file name
 * gave, flagged `unread` so the screen can say "type the amount".
 */
export function readReceipt(
  file: File,
  locale: 'en' | 'es' | 'pt',
  options: { stillNeeded?: () => boolean } = {},
): Promise<ReceiptReading> {
  const run = queue.then(() => readNow(file, locale, options));
  queue = run.catch(() => undefined);
  return run;
}

async function readNow(
  file: File,
  locale: 'en' | 'es' | 'pt',
  options: { stillNeeded?: () => boolean },
): Promise<ReceiptReading> {
  const today = localToday();
  const fromName = receiptFactsFromFileName(file.name, today);
  const done = (facts: ReceiptFacts): ReceiptReading => ({ ...facts, unread: !facts.amount });
  if (!readable.has(file.type) || file.size > 8 * 1024 * 1024) return done(fromName);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const since = Date.now() - lastRead;
    if (since < 10_500) await wait(10_500 - since);
    // The form was closed or the file replaced while waiting: skip the read.
    if (options.stillNeeded && !options.stillNeeded()) return done(fromName);
    lastRead = Date.now();
    try {
      const form = new FormData();
      form.set('file', await enlargedForReading(file));
      form.set('locale', locale);
      const response = await fetch(`${base}/app/api/workflow/extract`, {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      });
      // Busy (another tab, or two reads at once on the server): wait and retry quietly.
      if (response.status === 429) continue;
      if (!response.ok) return done(fromName);
      const result = (await response.json()) as { text?: unknown };
      const facts =
        typeof result.text === 'string' ? receiptFactsFromText(result.text, { locale, today }) : {};
      // A deliberate file name ("2026-11-14_89.90.jpg") wins over OCR guesses.
      return done({ amount: fromName.amount ?? facts.amount, date: fromName.date ?? facts.date });
    } catch {
      return done(fromName);
    }
  }
  return done(fromName);
}
