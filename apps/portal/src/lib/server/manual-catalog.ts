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
  audience: ManualPersona | 'quick-start';
  locales: readonly ManualLocale[];
  revision: string;
}>;
export type ManualDefinition = ManualSummary &
  Readonly<{
    allowedPersonas: readonly ManualPersona[];
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
  persona: ManualPersona,
  name: [string, string, string],
  description: [string, string, string],
  sourceName: string,
): ManualDefinition => ({
  id,
  title: { en: name[0], es: name[1], pt: name[2] },
  description: { en: description[0], es: description[1], pt: description[2] },
  audience: persona,
  locales: ['en', 'pt'],
  revision: manualRevision,
  allowedPersonas: [persona],
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
    'worker-reference',
    'worker',
    ['Worker user guide', 'Guía del trabajador', 'Guia do colaborador'],
    [
      'Own work, reports, availability and pay.',
      'Trabajo propio, informes, disponibilidad y pago.',
      'Trabalho próprio, relatórios, disponibilidade e pagamento.',
    ],
    'Worker_User_Guide',
  ),
  guide(
    'project-manager-reference',
    'manager',
    ['Project manager guide', 'Guía del gestor de proyectos', 'Guia do gerente de projetos'],
    [
      'Assigned projects, planning and operational review.',
      'Proyectos asignados, planificación y revisión operativa.',
      'Projetos atribuídos, planejamento e revisão operacional.',
    ],
    'Project_Manager_User_Guide',
  ),
  guide(
    'finance-reference',
    'finance',
    [
      'Finance administrator guide',
      'Guía de administración financiera',
      'Guia de administração financeira',
    ],
    [
      'Commercial configuration, billing, settlements and records.',
      'Configuración comercial, facturación, liquidaciones y registros.',
      'Configuração comercial, faturamento, liquidações e registros.',
    ],
    'Finance_User_Guide',
  ),
  guide(
    'owner-reference',
    'owner',
    [
      'Owner administrator guide',
      'Guía del administrador propietario',
      'Guia do administrador proprietário',
    ],
    [
      'Administration, planning, approvals and oversight.',
      'Administración, planificación, aprobaciones y supervisión.',
      'Administração, planejamento, aprovações e supervisão.',
    ],
    'Owner_User_Guide',
  ),
  guide(
    'auditor-reference',
    'auditor',
    [
      'Read-only auditor guide',
      'Guía del auditor de solo lectura',
      'Guia do auditor somente leitura',
    ],
    [
      'Read-only evidence, finance and audit review.',
      'Consulta de evidencias, finanzas y auditoría.',
      'Consulta de evidências, finanças e auditoria.',
    ],
    'Auditor_User_Guide',
  ),
  guide(
    'supplier-coordinator-reference',
    'supplier-coordinator',
    [
      'Supplier coordinator guide',
      'Guía del coordinador de proveedores',
      'Guia do coordenador de fornecedores',
    ],
    [
      'Authorized installations, technicians and team hours.',
      'Instalaciones autorizadas, técnicos y horas del equipo.',
      'Instalações autorizadas, técnicos e horas da equipe.',
    ],
    'Supplier_Coordinator_User_Guide',
  ),
  guide(
    'external-technician-reference',
    'external-technician',
    ['External technician guide', 'Guía del técnico externo', 'Guia do técnico externo'],
    [
      'Your own authorized operational records.',
      'Tus registros operativos autorizados.',
      'Seus registros operacionais autorizados.',
    ],
    'External_Technician_User_Guide',
  ),
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
export function manualForPersona(
  id: string | null | undefined,
  persona: ManualPersona | null,
): ManualDefinition | null {
  if (!id || !persona) return null;
  return (
    manualCatalog.find(
      (manual) =>
        manual.id === id &&
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
    available.sort((a, b) => Number(b.audience === 'owner') - Number(a.audience === 'owner'));
  return available.map(({ id, title, description, audience, locales, revision }) => ({
    id,
    title,
    description,
    audience,
    locales,
    revision,
  }));
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
