import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Principal } from '@ja/domain';
import { readSupplierProfile } from '@ja/database';

export const manualRevision = '2026-09-22';
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

/** Current role courses remain separate from the historical grouped references. */
const bbsRoleGuide = (
  persona: ManualPersona,
  title: string,
  stem: string,
  audience: Exclude<ManualAudience, 'quick-start'>,
  description: string,
): ManualDefinition => ({
  id: `bbs-${persona}-manual`,
  title: { en: title, es: `${title} (en inglés)`, pt: `${title} (em inglês)` },
  description: {
    en: description,
    es: 'Manual ilustrado en inglés para este perfil: procedimientos BBS, capturas, verificaciones y resolución de problemas.',
    pt: 'Manual ilustrado em inglês para este perfil: procedimentos BBS, capturas, verificações e resolução de problemas.',
  },
  audience,
  locales: ['en'],
  revision: '2026-10-06',
  allowedPersonas: [persona],
  assets: { en: { sourceName: `BBS_${stem}_Manual_EN.pdf` } },
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
  {
    id: 'bbs-project-invoices-guide',
    title: {
      en: 'BBS: Project to client invoices',
      es: 'BBS: Project to client invoices (English)',
      pt: 'BBS: Project to client invoices (English)',
    },
    description: {
      en: 'Illustrated BBS lab and Owner operating reference: setup, approvals, final training invoices, worker settlements and landscape spreadsheet exports.',
      es: 'Guía ilustrada en inglés: ejemplo BBS, operación del propietario, facturas finales de formación, liquidaciones y hojas de cálculo.',
      pt: 'Guia ilustrado em inglês: exemplo BBS, operação do proprietário, faturas finais de treinamento, acertos e planilhas.',
    },
    audience: 'administration-finance',
    locales: ['en'],
    revision: '2026-10-05',
    allowedPersonas: ['owner', 'finance'],
    assets: { en: { sourceName: 'BBS_Project_to_Client_Invoices_Guide_EN.pdf' } },
  },
  bbsRoleGuide(
    'worker',
    'Worker: BBS field operations',
    'Worker',
    'work-projects',
    'Illustrated English course: own hours, expenses, reports, corrections and My Pay in the BBS training project.',
  ),
  {
    ...bbsRoleGuide(
      'worker',
      'Crew chief: BBS team operations',
      'Crew_Chief',
      'work-projects',
      'Illustrated English course for a Worker with dated crew delegation; team entry, review boundaries and handoffs.',
    ),
    id: 'bbs-chief-manual',
  },
  bbsRoleGuide(
    'manager',
    'Project manager: BBS operations',
    'Project_Manager',
    'work-projects',
    'Illustrated English course: assigned project oversight, operational review, reporting and role handoffs.',
  ),
  bbsRoleGuide(
    'finance',
    'Finance: BBS financial operations',
    'Finance',
    'administration-finance',
    'Illustrated English course: commercial review, invoices, collections, compensation and reconciliation.',
  ),
  bbsRoleGuide(
    'owner',
    'Owner: BBS operating manual',
    'Owner',
    'administration-finance',
    'Owner role handoffs and the full illustrated BBS course, including issued training invoices and landscape exports.',
  ),
  bbsRoleGuide(
    'auditor',
    'Auditor: BBS read-only review',
    'Auditor',
    'administration-finance',
    'Illustrated English course: read-only financial and audit review, evidence and access boundaries.',
  ),
  bbsRoleGuide(
    'supplier-coordinator',
    'Supplier coordinator: BBS operations',
    'Supplier_Coordinator',
    'supplier-operations',
    'Illustrated English course: authorized supplier project scope, personnel, team work and operational reporting.',
  ),
  bbsRoleGuide(
    'external-technician',
    'External technician: BBS field work',
    'External_Technician',
    'supplier-operations',
    'Illustrated English course: assigned supplier work, own actual time, expenses, reports and corrections.',
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
  // Put the account's current course before older references and other-role courses.
  const primary = `bbs-${persona}-manual`;
  available.sort(
    (a, b) =>
      Number(b.id === primary) - Number(a.id === primary) ||
      b.revision.localeCompare(a.revision) ||
      (persona === 'owner'
        ? Number(b.audience === 'administration-finance') -
          Number(a.audience === 'administration-finance')
        : 0),
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
