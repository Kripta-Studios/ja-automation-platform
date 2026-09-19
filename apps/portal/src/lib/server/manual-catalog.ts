import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import { readSupplierProfile } from '@ja/database';

export const manualRevision = '2026-09-19';
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
export const manualPersonas = [
  'worker',
  'manager',
  'finance',
  'owner',
  'auditor',
  'supplier-coordinator',
  'external-technician',
] as const;
export type ManualPersona = (typeof manualPersonas)[number];
type LocalizedText = Readonly<Record<ManualLocale, string>>;
type ManualAsset = Readonly<{ sourceName: string }>;

export type ManualSummary = Readonly<{
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  audience: ManualAudience;
  allowedPersonas: readonly ManualPersona[];
  locales: readonly ManualLocale[];
  revision: string;
}>;
export const manualAudiences = [
  'work-projects',
  'supplier-operations',
  'administration-finance',
] as const;
export type ManualAudience = (typeof manualAudiences)[number] | 'quick-start';
export type ManualDefinition = ManualSummary &
  Readonly<{
    assets: Readonly<Partial<Record<ManualLocale, ManualAsset>>>;
  }>;

/** A restricted supplier profile takes precedence over the underlying Worker role. */
export function personaForRole(
  role: string | null | undefined,
  supplierProfile?: string | null,
): ManualPersona | null {
  if (!manualRoles.includes(role as ManualRole)) return null;
  if (supplierProfile === 'supplier_coordinator') return 'supplier-coordinator';
  if (supplierProfile === 'external_technician') return 'external-technician';
  return (
    {
      worker: 'worker',
      project_manager: 'manager',
      finance_admin: 'finance',
      owner_admin: 'owner',
      auditor_read_only: 'auditor',
    } as const
  )[role as ManualRole];
}

/** List and download use this same persisted audience decision. */
export function personaForPrincipal(
  sqlite: DatabaseSync,
  principal: Principal,
): ManualPersona | null {
  return personaForRole(principal.role, readSupplierProfile(sqlite, principal.userId)?.profile);
}

const guide = (
  id: string,
  audience: Exclude<ManualAudience, 'quick-start'>,
  allowedPersonas: readonly ManualPersona[],
  name: [string, string, string],
  description: [string, string, string],
  sourceName: string,
): ManualDefinition => ({
  id,
  title: { en: name[0], es: name[1], pt: name[2] },
  description: { en: description[0], es: description[1], pt: description[2] },
  audience,
  locales: ['en', 'pt'],
  revision: manualRevision,
  allowedPersonas,
  assets: {
    en: { sourceName: `${sourceName}.pdf` },
    pt: { sourceName: `${sourceName}_PT-BR.pdf` },
  },
});

export const manualCatalog: readonly ManualDefinition[] = [
  {
    id: 'employee-field-guide',
    title: {
      en: 'Employee field guide',
      es: 'Guía de campo para empleados',
      pt: 'Guia de campo para colaboradores',
    },
    description: {
      en: 'A short guide to your own field work and My Pay.',
      es: 'Guía breve para tu trabajo de campo y Mi pago.',
      pt: 'Guia breve do seu trabalho de campo e Meu pagamento.',
    },
    audience: 'quick-start',
    locales: manualLocales,
    revision: manualRevision,
    allowedPersonas: ['worker'],
    assets: {
      en: { sourceName: 'Employee_Field_Guide_EN.pdf' },
      es: { sourceName: 'Employee_Field_Guide_ES.pdf' },
      pt: { sourceName: 'Employee_Field_Guide_PT-BR.pdf' },
    },
  },
  guide(
    'work-projects-reference',
    'work-projects',
    ['worker', 'manager'],
    ['Work and projects guide', 'Guía de trabajo y proyectos', 'Guia de trabalho e projetos'],
    [
      'Shared chapters for field work and project management; follow the path for your role.',
      'Capítulos compartidos para trabajo de campo y gestión de proyectos; sigue la ruta de tu perfil.',
      'Capítulos compartilhados para trabalho de campo e gestão de projetos; siga o roteiro do seu perfil.',
    ],
    'Work_Projects_Guide',
  ),
  guide(
    'supplier-operations-reference',
    'supplier-operations',
    ['supplier-coordinator', 'external-technician'],
    [
      'Supplier operations guide',
      'Guía de operaciones de proveedores',
      'Guia de operações de fornecedores',
    ],
    [
      'Shared chapters for supplier coordinators and external technicians; follow the path for your role.',
      'Capítulos compartidos para coordinadores y técnicos externos; sigue la ruta de tu perfil.',
      'Capítulos compartilhados para coordenadores e técnicos externos; siga o roteiro do seu perfil.',
    ],
    'Supplier_Operations_Guide',
  ),
  guide(
    'administration-finance-reference',
    'administration-finance',
    ['owner', 'finance', 'auditor'],
    [
      'Administration, finance and audit guide',
      'Guía de administración, finanzas y auditoría',
      'Guia de administração, finanças e auditoria',
    ],
    [
      'Shared chapters for owners, finance administrators and auditors; follow the path for your role.',
      'Capítulos compartidos para propietarios, finanzas y auditores; sigue la ruta de tu perfil.',
      'Capítulos compartilhados para proprietários, finanças e auditores; siga o roteiro do seu perfil.',
    ],
    'Administration_Finance_Guide',
  ),
];

/** Legacy links resolve to a group, whose access is checked against the current persisted persona. */
export const manualAliases: Readonly<Record<string, string>> = {
  'worker-reference': 'work-projects-reference',
  'project-manager-reference': 'work-projects-reference',
  'supplier-coordinator-reference': 'supplier-operations-reference',
  'external-technician-reference': 'supplier-operations-reference',
  'owner-reference': 'administration-finance-reference',
  'finance-reference': 'administration-finance-reference',
  'auditor-reference': 'administration-finance-reference',
};

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
export function manualForPersona(
  id: string | null | undefined,
  persona: ManualPersona | null,
): ManualDefinition | null {
  if (!id || !persona) return null;
  const canonicalId = manualAliases[id] ?? id;
  return (
    manualCatalog.find(
      (manual) =>
        manual.id === canonicalId &&
        (manual.allowedPersonas.includes(persona) ||
          (persona === 'owner' && manual.audience !== 'quick-start')),
    ) ?? null
  );
}
export function manualsForPersona(persona: ManualPersona | null): readonly ManualSummary[] {
  if (!persona) return [];
  const available = manualCatalog.filter(
    (manual) =>
      manual.allowedPersonas.includes(persona) ||
      (persona === 'owner' && manual.audience !== 'quick-start'),
  );
  if (persona === 'owner')
    available.sort(
      (a, b) =>
        Number(b.audience === 'administration-finance') -
        Number(a.audience === 'administration-finance'),
    );
  return available.map(
    ({ id, title, description, audience, allowedPersonas, locales, revision }) => ({
      id,
      title,
      description,
      audience,
      allowedPersonas,
      locales,
      revision,
    }),
  );
}
export function manualForRole(
  id: string | null | undefined,
  role: string | null | undefined,
  supplierProfile?: string | null,
): ManualDefinition | null {
  return manualForPersona(id, personaForRole(role, supplierProfile));
}
export function manualsForRole(
  role: string | null | undefined,
  supplierProfile?: string | null,
): readonly ManualSummary[] {
  return manualsForPersona(personaForRole(role, supplierProfile));
}

function manualRoots(): readonly string[] {
  const configured = process.env.JA_MANUAL_ROOT?.trim();
  if (configured) return [resolve(configured)];
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
