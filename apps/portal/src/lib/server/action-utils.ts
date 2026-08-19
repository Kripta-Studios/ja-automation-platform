import type { RequestEvent } from '@sveltejs/kit';

export type PortalActionEvent = RequestEvent<Record<string, string | undefined>>;

export const formObject = (request: Request): Promise<Record<string, unknown>> =>
  request.formData().then((data) => Object.fromEntries(data) as Record<string, unknown>);

export const decimalToMinor = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ''] = value.split('.');
  return `${whole}${fraction.padEnd(2, '0')}`.replace(/^0+(?=\d)/, '');
};

export const normalizeLocalDateTime = (value: unknown): unknown => {
  if (typeof value !== 'string' || !value) return value;
  if (value.endsWith('Z')) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toISOString();
};

export function receiptSignature(mediaType: string, bytes: Uint8Array): boolean {
  const startsWith = (...values: number[]) =>
    values.every((value, index) => bytes[index] === value);
  if (mediaType === 'application/pdf')
    return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  if (mediaType === 'image/jpeg') return startsWith(0xff, 0xd8, 0xff);
  if (mediaType === 'image/png') return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (mediaType === 'image/webp')
    return (
      new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
      new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
    );
  if (mediaType === 'image/heic' || mediaType === 'image/heif') {
    const brand = new TextDecoder().decode(bytes.slice(8, 16));
    return (
      new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp' &&
      /heic|heix|hevc|mif1|msf1/.test(brand)
    );
  }
  return false;
}

export function privateDocumentSignature(mediaType: string, bytes: Uint8Array): boolean {
  if (receiptSignature(mediaType, bytes)) return true;
  if (mediaType === 'application/zip' || mediaType === 'application/x-zip-compressed')
    return bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (mediaType === 'text/plain') {
    if (bytes.includes(0)) return false;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export const privateDocumentExtension = (mediaType: string): string =>
  mediaType === 'application/pdf'
    ? 'pdf'
    : mediaType === 'application/zip' || mediaType === 'application/x-zip-compressed'
      ? 'zip'
      : mediaType === 'text/plain'
        ? 'txt'
        : mediaType === 'image/png'
          ? 'png'
          : mediaType === 'image/webp'
            ? 'webp'
            : mediaType === 'image/heic'
              ? 'heic'
              : mediaType === 'image/heif'
                ? 'heif'
                : 'jpg';
