import type { PortalLocale } from '$lib/portal-i18n';

const copy = {
  artifactStatusAndDownloads: [
    'Export status and downloads',
    'Estado y descarga de exportaciones',
    'Status e download das exportações',
  ],
  finalPack: ['Final', 'Finalizado', 'Finalizado'],
  stalePack: ['Stale', 'Desactualizado', 'Desatualizado'],
  secondaryPackControls: [
    'Pack status and actions',
    'Estado y acciones del paquete',
    'Status e ações do pacote',
  ],
  auditorReadOnly: [
    'Read-only auditor access',
    'Acceso de auditoría de solo lectura',
    'Acesso de auditoria somente leitura',
  ],
  auditorReadOnlyHelp: [
    'You can review pack records and download available artifacts. Pack creation, retries and finalization are disabled for auditors.',
    'Puedes revisar los paquetes y descargar los artefactos disponibles. La creación, los reintentos y la finalización están desactivados para los auditores.',
    'Você pode revisar os pacotes e baixar os artefatos disponíveis. A criação, as novas tentativas e a finalização ficam desativadas para auditores.',
  ],
} as const satisfies Record<string, readonly [string, string, string]>;

export type AccountingUxRound2Key = keyof typeof copy;

export function accountingUxRound2Text(
  locale: PortalLocale | string | undefined,
  key: AccountingUxRound2Key,
): string {
  const index = locale === 'es' ? 1 : locale === 'pt' ? 2 : 0;
  return copy[key][index];
}
