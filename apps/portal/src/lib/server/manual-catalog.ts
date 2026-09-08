import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

export const manualRevision = '2026-09-08';
export const manualLocales = ['en', 'es', 'pt'] as const;
export type ManualLocale = (typeof manualLocales)[number];

export const manualRoles = [
  'worker',
  'project_manager',
  'finance_admin',
  'owner_admin',
  'auditor_read_only',
] as const;
export type ManualRole = (typeof manualRoles)[number];

type LocalizedText = Readonly<Record<ManualLocale, string>>;
type ManualAsset = Readonly<{ sourceName: string }>;

export type ManualSummary = Readonly<{
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  audience: 'worker' | 'owner';
  locales: readonly ManualLocale[];
  revision: string;
}>;

export type ManualDefinition = ManualSummary &
  Readonly<{
    allowedRoles: readonly ManualRole[];
    assets: Readonly<Partial<Record<ManualLocale, ManualAsset>>>;
  }>;

const allAuthenticatedRoles: readonly ManualRole[] = manualRoles;
const ownerRoles: readonly ManualRole[] = ['owner_admin', 'finance_admin'];
const detailedReferenceRevision = '2026-09-06';

const quickStart: ManualDefinition = {
  id: 'employee-field-guide',
  title: {
    en: 'Employee field guide',
    es: 'Guía de campo para empleados',
    pt: 'Guia de campo para colaboradores',
  },
  description: {
    en: 'A short, task-focused guide for a normal workday: sign in, record work, send receipts and understand My Pay.',
    es: 'Una guía breve y práctica para una jornada normal: iniciar sesión, registrar trabajo, enviar recibos y entender My Pay.',
    pt: 'Um guia curto e prático para um dia normal: entrar, registrar trabalho, enviar comprovantes e entender Meu pagamento.',
  },
  audience: 'worker',
  locales: manualLocales,
  revision: manualRevision,
  allowedRoles: allAuthenticatedRoles,
  assets: {
    en: { sourceName: 'Employee_Field_Guide_EN.pdf' },
    es: { sourceName: 'Employee_Field_Guide_ES.pdf' },
    pt: { sourceName: 'Employee_Field_Guide_PT-BR.pdf' },
  },
};

const workerReference: ManualDefinition = {
  id: 'worker-reference',
  title: {
    en: 'Worker user guide',
    es: 'Guía de usuario del trabajador',
    pt: 'Guia do usuário do colaborador',
  },
  description: {
    en: 'The detailed English reference for worker time, reports, expenses, documents and personal compensation.',
    es: 'La referencia detallada en inglés sobre tiempo, informes, gastos, documentos y compensación personal.',
    pt: 'A referência detalhada em inglês sobre tempo, relatórios, despesas, documentos e remuneração pessoal.',
  },
  audience: 'worker',
  locales: ['en'],
  revision: detailedReferenceRevision,
  allowedRoles: allAuthenticatedRoles,
  assets: {
    en: { sourceName: 'Worker_User_Guide.pdf' },
  },
};

const ownerReference: ManualDefinition = {
  id: 'owner-reference',
  title: {
    en: 'Owner and Finance user guide',
    es: 'Guía de usuario de Owner y Finanzas',
    pt: 'Guia do usuário de Owner e Finanças',
  },
  description: {
    en: 'The detailed English reference for administration, review, finance, billing, accounting and audit work.',
    es: 'La referencia detallada en inglés para administración, revisión, finanzas, facturación, contabilidad y auditoría.',
    pt: 'A referência detalhada em inglês para administração, análise, finanças, faturamento, contabilidade e auditoria.',
  },
  audience: 'owner',
  locales: ['en'],
  revision: detailedReferenceRevision,
  allowedRoles: ownerRoles,
  assets: {
    en: { sourceName: 'Owner_User_Guide.pdf' },
  },
};

export const manualCatalog: readonly ManualDefinition[] = [
  quickStart,
  workerReference,
  ownerReference,
];

export function isManualRole(value: string | null | undefined): value is ManualRole {
  return manualRoles.includes(value as ManualRole);
}

export function normalizeManualLocale(value: string | null | undefined): ManualLocale | null {
  if (!value) return 'en';
  const normalized = value.trim().toLowerCase().replace('_', '-');
  if (normalized === 'en' || normalized === 'en-us') return 'en';
  if (normalized === 'es' || normalized === 'es-es') return 'es';
  if (normalized === 'pt' || normalized === 'pt-br') return 'pt';
  return null;
}

export function manualForRole(
  id: string | null | undefined,
  role: string | null | undefined,
): ManualDefinition | null {
  if (!id || !isManualRole(role)) return null;
  return (
    manualCatalog.find((manual) => manual.id === id && manual.allowedRoles.includes(role)) ?? null
  );
}

export function manualsForRole(role: string | null | undefined): readonly ManualSummary[] {
  if (!isManualRole(role)) return [];
  return manualCatalog
    .filter((manual) => manual.allowedRoles.includes(role))
    .map(({ id, title, description, audience, locales, revision }) => ({
      id,
      title,
      description,
      audience,
      locales,
      revision,
    }));
}

function manualRoots(): readonly string[] {
  const configured = process.env.JA_MANUAL_ROOT?.trim();
  if (configured) return [resolve(configured)];

  // `pnpm --filter @ja/portal preview` runs with apps/portal as cwd while the
  // checked-in manuals remain at the workspace root. Production supplies the
  // explicit private container path above.
  const candidates = [
    resolve(process.cwd(), 'docs/manuals'),
    resolve(process.cwd(), '../../docs/manuals'),
  ];
  return candidates.filter((candidate, index) => index === 0 || existsSync(candidate));
}

export async function readManualPdf(
  manual: ManualDefinition,
  locale: ManualLocale,
): Promise<Buffer> {
  const asset = manual.assets[locale] ?? manual.assets.en;
  if (!asset) throw new Error(`Manual asset is not configured: ${manual.id}:${locale}`);
  if (basename(asset.sourceName) !== asset.sourceName)
    throw new Error(`Manual asset path is not allowlisted: ${manual.id}:${locale}`);
  let lastCause: unknown;
  for (const root of manualRoots()) {
    try {
      return await readFile(resolve(root, asset.sourceName));
    } catch (cause) {
      lastCause = cause;
    }
  }
  throw new Error(`Manual asset is unavailable: ${manual.id}:${locale}`, { cause: lastCause });
}
