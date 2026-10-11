import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const LOCAL_TEXT_MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 20_000;
let running = 0;

export class LocalTextError extends Error {
  constructor(public readonly code: 'invalid_file' | 'busy' | 'unavailable' | 'failed') {
    super(code);
  }
}

export type LocalTextResult = {
  text: string;
  sourceSha256: string;
  method: 'pdf_text' | 'image_ocr' | 'plain_text';
  truncated: boolean;
  pageLimit: number | null;
};

function runLocal(program: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // No shell, URLs, user paths or executable arguments. Each child has hard
    // address-space/CPU limits in addition to the wall-clock and output limits.
    execFile(
      '/usr/bin/prlimit',
      ['--as=536870912', '--cpu=20', '--', program, ...args],
      {
        timeout: 25_000,
        killSignal: 'SIGKILL',
        maxBuffer: 256 * 1024,
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin', OMP_THREAD_LIMIT: '1', LANG: 'C.UTF-8' },
      },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);
        // Never return tool stderr: it may contain private document fragments.
        reject(
          new LocalTextError(
            (error as NodeJS.ErrnoException).code === 'ENOENT' ||
              /No such file|Error opening data file/.test(stderr)
              ? 'unavailable'
              : 'failed',
          ),
        );
      },
    );
  });
}

/** Extraction is a draft aid. It never stores an artifact, creates a fact or applies policy. */
export async function extractLocalDocumentText(
  bytes: Uint8Array,
  mime: string,
  locale: 'en' | 'es' | 'pt',
): Promise<LocalTextResult> {
  if (!bytes.length || bytes.length > LOCAL_TEXT_MAX_BYTES)
    throw new LocalTextError('invalid_file');
  const buffer = Buffer.from(bytes);
  const pdf = mime === 'application/pdf' && buffer.subarray(0, 5).toString() === '%PDF-';
  const png =
    mime === 'image/png' &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = mime === 'image/jpeg' && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const plain = mime === 'text/plain';
  if (!pdf && !png && !jpeg && !plain) throw new LocalTextError('invalid_file');
  if (running >= 2) throw new LocalTextError('busy');
  running += 1;
  let directory: string | undefined;
  try {
    let value: string;
    if (plain) {
      try {
        value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        throw new LocalTextError('invalid_file');
      }
      if (value.includes('\0')) throw new LocalTextError('invalid_file');
    } else {
      directory = await mkdtemp(join(tmpdir(), 'ja-local-text-'));
      const file = join(directory, pdf ? 'input.pdf' : png ? 'input.png' : 'input.jpg');
      await writeFile(file, bytes, { mode: 0o600 });
      value = pdf
        ? await runLocal('/usr/bin/pdftotext', [
            '-f',
            '1',
            '-l',
            '20',
            '-enc',
            'UTF-8',
            '-nopgbrk',
            file,
            '-',
          ])
        : await runLocal('/usr/bin/tesseract', [
            file,
            'stdout',
            '-l',
            { en: 'eng', es: 'spa', pt: 'por' }[locale],
            '--psm',
            '6',
          ]);
    }
    const text = value.replace(/\r\n/g, '\n').trim();
    return {
      text: text.slice(0, MAX_TEXT),
      sourceSha256: createHash('sha256').update(bytes).digest('hex'),
      method: pdf ? 'pdf_text' : plain ? 'plain_text' : 'image_ocr',
      truncated: text.length > MAX_TEXT,
      pageLimit: pdf ? 20 : null,
    };
  } finally {
    running -= 1;
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
