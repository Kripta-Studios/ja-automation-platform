import { lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type OwnerTutorialAsset = 'video.mp4' | 'captions.vtt' | 'poster.webp';

export type OwnerTutorialChapter = Readonly<{
  id: string;
  title: string;
  startSeconds: number;
}>;

export type OwnerTutorialMetadata = Readonly<{
  title: 'Owner tutorial';
  durationSeconds: 5253.7;
  audioLanguage: 'en';
  captionsLanguage: 'en';
  chapters: readonly OwnerTutorialChapter[];
}>;

export type OwnerTutorialAssetInfo = Readonly<{
  path: string;
  filename: string;
  contentType: string;
  size: number;
}>;

const defaultOwnerTutorialDirectory = '/var/lib/jaautomation/tutorials/owner-20261011';
const assetDefinitions: Readonly<
  Record<OwnerTutorialAsset, Omit<OwnerTutorialAssetInfo, 'path' | 'size'>>
> = {
  'video.mp4': { filename: 'owner-tutorial.mp4', contentType: 'video/mp4' },
  'captions.vtt': { filename: 'owner-tutorial.vtt', contentType: 'text/vtt; charset=utf-8' },
  'poster.webp': { filename: 'poster.webp', contentType: 'image/webp' },
};

// Chapter offsets come from the production render manifest at 30 frames per second.
const chapterMetadata: readonly OwnerTutorialChapter[] = [
  { id: '01-intro', title: 'Training case and tutorial scope', startSeconds: 0 },
  { id: '02-access', title: 'Access the training workspace', startSeconds: 26.3 },
  { id: '03-navigation', title: 'Navigate the owner workspace', startSeconds: 68.63333333333334 },
  { id: '04-team', title: 'Create and invite the internal team', startSeconds: 127.1 },
  { id: '05-client', title: 'Create the customer', startSeconds: 270.6333333333333 },
  { id: '06-project', title: 'Create the project', startSeconds: 374.8666666666667 },
  {
    id: '07-defaults',
    title: 'Configure project commercial defaults',
    startSeconds: 564.9333333333333,
  },
  {
    id: '08-team',
    title: 'Assign people and review dated commercial controls',
    startSeconds: 670.2333333333333,
  },
  {
    id: '09-planning',
    title: 'Plan the crew and distinguish plans from actual hours',
    startSeconds: 1106.3666666666666,
  },
  { id: '10-time', title: 'Record actual time and use digital capture', startSeconds: 1239.7 },
  {
    id: '11-expenses',
    title: 'Record expenses, attach receipts, and allocate a shared cost',
    startSeconds: 1466,
  },
  { id: '12-reports', title: 'Daily and technical reports', startSeconds: 1613.9333333333334 },
  {
    id: '13-operations',
    title: 'Operational review and expense classification',
    startSeconds: 1834.6333333333334,
  },
  {
    id: '14-customer-period',
    title: 'Documents, customer reports, correction, and versioned signoff',
    startSeconds: 2217.266666666667,
  },
  {
    id: '15-follow-up',
    title: 'Digital follow-up, evidence, and handover',
    startSeconds: 2607.266666666667,
  },
  {
    id: '16-policy',
    title: 'Policy proposals and automation boundaries',
    startSeconds: 2930.3333333333335,
  },
  {
    id: '17-billing-setup',
    title: 'Invoice issuer, authority, and billing streams',
    startSeconds: 3084.233333333333,
  },
  {
    id: '18-finance-case',
    title: 'Finance cases, selected-source draft, and reconciliation',
    startSeconds: 3471.0333333333333,
  },
  {
    id: '19-invoice-delivery',
    title: 'Approve, issue, download, and attempt controlled delivery',
    startSeconds: 3789.9666666666667,
  },
  {
    id: '20-collections',
    title: 'Record synthetic collections and understand credits and voids',
    startSeconds: 4087.1,
  },
  {
    id: '21-compensation',
    title: 'Finalize compensation and record reimbursements carefully',
    startSeconds: 4304.966666666667,
  },
  {
    id: '22-finance-exports',
    title: 'Reconcile project economics and export native workbooks',
    startSeconds: 4702,
  },
  {
    id: '23-closeout-accounting',
    title: 'Close a billing period, inspect Accounting, and review populated project closeout',
    startSeconds: 4799.666666666667,
  },
  {
    id: '24-owner-checklist',
    title: 'Owner completion checklist and handoff',
    startSeconds: 5130.166666666667,
  },
];

export const ownerTutorialMetadata: OwnerTutorialMetadata = Object.freeze({
  title: 'Owner tutorial',
  durationSeconds: 5253.7,
  audioLanguage: 'en',
  captionsLanguage: 'en',
  chapters: Object.freeze(chapterMetadata),
});

function tutorialDirectory(): string {
  const configured = process.env.JA_OWNER_TUTORIAL_DIR?.trim();
  return resolve(configured || defaultOwnerTutorialDirectory);
}

/** Return a path only for a fixed allowlisted asset that is already a regular file. */
export function ownerTutorialAssetInfo(asset: string | undefined): OwnerTutorialAssetInfo | null {
  if (!asset || !Object.hasOwn(assetDefinitions, asset)) return null;

  const definition = assetDefinitions[asset as OwnerTutorialAsset];
  const root = tutorialDirectory();
  const path = join(root, definition.filename);
  try {
    const stat = lstatSync(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      !Number.isSafeInteger(stat.size) ||
      stat.size <= 0
    )
      return null;
    return { path, ...definition, size: stat.size };
  } catch {
    return null;
  }
}

/** Help receives metadata only after every protected asset has been published. */
export function availableOwnerTutorial(): OwnerTutorialMetadata | null {
  if (
    !ownerTutorialAssetInfo('video.mp4') ||
    !ownerTutorialAssetInfo('captions.vtt') ||
    !ownerTutorialAssetInfo('poster.webp')
  )
    return null;
  return ownerTutorialMetadata;
}

export type ParsedByteRange = Readonly<{ start: number; end: number }>;
export type ByteRangeResult = ParsedByteRange | 'unsatisfiable' | null;

/** Parse one RFC-style byte range; unsupported units are ignored by the caller. */
export function parseOwnerTutorialByteRange(
  rangeHeader: string | null,
  size: number,
): ByteRangeResult {
  if (!rangeHeader) return null;
  const trimmed = rangeHeader.trim();
  const equals = trimmed.indexOf('=');
  if (equals < 0) return null;
  if (trimmed.slice(0, equals).trim().toLowerCase() !== 'bytes') return null;

  const value = trimmed.slice(equals + 1).trim();
  if (!/^\d*-\d*$/u.test(value) || value === '-' || size <= 0) return 'unsatisfiable';
  const [startText = '', endText = ''] = value.split('-', 2);
  const max = BigInt(size);

  if (startText === '') {
    const suffixLength = BigInt(endText);
    if (suffixLength === 0n) return 'unsatisfiable';
    const start = suffixLength >= max ? 0 : size - Number(suffixLength);
    return { start, end: size - 1 };
  }

  const startValue = BigInt(startText);
  if (startValue >= max) return 'unsatisfiable';
  const endValue = endText === '' ? max - 1n : BigInt(endText);
  if (endValue < startValue) return 'unsatisfiable';
  return { start: Number(startValue), end: Number(endValue >= max ? max - 1n : endValue) };
}
