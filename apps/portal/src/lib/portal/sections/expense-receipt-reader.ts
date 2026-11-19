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
      form.set('file', await enlargedForReading(file));
      form.set('locale', locale);
      const response = await fetch(`${base}/app/api/workflow/extract`, {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
        // Busy (one file per person every 10 s): the server answers "wait N ms" instead of 429.
        headers: { 'x-ja-retry-when-busy': '1' },
      });
      // The reader allows one file per person every 10 seconds.
      if (response.status === 429 && options.retryWhenBusy) {
        await wait(10_500);
        continue;
      }
      if (!response.ok) return fromName;
      const result = (await response.json()) as { text?: unknown; busy?: unknown; retryAfterMs?: unknown };
      if (result.busy === true) {
        if (!options.retryWhenBusy) return fromName;
        const delay = Number(result.retryAfterMs);
        await wait(Number.isFinite(delay) && delay > 0 ? Math.min(delay, 10_000) + 300 : 10_500);
        continue;
      }
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
