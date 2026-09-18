export type ReportGuidanceLocale = 'en' | 'es' | 'pt';

export type ReportGuidance = {
  title: string;
  operational: string;
  audiences: string;
};

type ReportGuidanceRole =
  | 'worker'
  | 'restricted_worker'
  | 'project_manager'
  | 'finance_admin'
  | 'owner_admin'
  | 'auditor_read_only';

const guidance: Record<ReportGuidanceLocale, Record<ReportGuidanceRole, ReportGuidance>> = {
  en: {
    worker: {
      title: 'Your report workflow',
      operational:
        'Record daily work and technical changes, then submit them for operational review.',
      audiences:
        'Customer reports contain approved work details without money. Internal financial reports stay restricted; your own compensation is available separately in My Pay.',
    },
    restricted_worker: {
      title: 'Your report workflow',
      operational:
        'Record daily work and technical changes, then submit them for operational review.',
      audiences:
        'Customer reports contain approved work details without money. Internal financial reports and compensation information stay restricted.',
    },
    project_manager: {
      title: 'Project review workflow',
      operational:
        'Review the operational facts for assigned projects and return incomplete records for correction.',
      audiences:
        'Customer reports contain approved work details without money. Other workers’ compensation stays restricted; your own compensation is available separately in My Pay.',
    },
    finance_admin: {
      title: 'Finance report workflow',
      operational:
        'Generate traceable files for the chosen project and period. Customer reports include reviewed records only.',
      audiences:
        'The customer report never includes money. The separate internal report is restricted to authorized Finance and Owner users; each worker sees only their own compensation in My Pay.',
    },
    owner_admin: {
      title: 'Owner report workflow',
      operational:
        'Oversee operational review and generate traceable customer and internal period files.',
      audiences:
        'The customer report never includes money. The separate internal report is restricted to authorized Finance and Owner users; each worker sees only their own compensation in My Pay.',
    },
    auditor_read_only: {
      title: 'Read-only audit view',
      operational: 'Inspect the report history and immutable evidence without changing records.',
      audiences:
        'Customer reports contain no money. Internal financial reports remain access-controlled, and worker compensation remains private to the worker and authorized Finance or Owner users.',
    },
  },
  es: {
    worker: {
      title: 'Tu flujo de informes',
      operational:
        'Registra el trabajo diario y los cambios técnicos y envíalos para revisión operativa.',
      audiences:
        'Los informes para clientes incluyen trabajo aprobado sin importes. Los informes financieros internos están restringidos; tu propia remuneración aparece por separado en Mi pago.',
    },
    restricted_worker: {
      title: 'Tu flujo de informes',
      operational:
        'Registra el trabajo diario y los cambios técnicos y envíalos para revisión operativa.',
      audiences:
        'Los informes para clientes incluyen trabajo aprobado sin importes. Los informes financieros internos y la información de remuneración están restringidos.',
    },
    project_manager: {
      title: 'Flujo de revisión del proyecto',
      operational:
        'Revisa los hechos operativos de los proyectos asignados y devuelve los registros incompletos para su corrección.',
      audiences:
        'Los informes para clientes incluyen trabajo aprobado sin importes. La remuneración de otros trabajadores está restringida; tu propia remuneración aparece por separado en Mi pago.',
    },
    finance_admin: {
      title: 'Flujo de informes financieros',
      operational:
        'Genera archivos trazables del proyecto y período elegidos. Los informes para clientes solo incluyen registros revisados.',
      audiences:
        'El informe para el cliente nunca incluye importes. El informe interno separado está restringido a Finanzas y Propietario autorizados; cada trabajador solo ve su propia remuneración en Mi pago.',
    },
    owner_admin: {
      title: 'Flujo de informes del propietario',
      operational:
        'Supervisa la revisión operativa y genera archivos de período trazables para clientes y uso interno.',
      audiences:
        'El informe para el cliente nunca incluye importes. El informe interno separado está restringido a Finanzas y Propietario autorizados; cada trabajador solo ve su propia remuneración en Mi pago.',
    },
    auditor_read_only: {
      title: 'Vista de auditoría de solo lectura',
      operational: 'Revisa el historial y la evidencia inmutable sin modificar registros.',
      audiences:
        'Los informes para clientes no incluyen importes. Los informes financieros internos conservan el control de acceso y la remuneración solo es visible para el trabajador y Finanzas o Propietario autorizados.',
    },
  },
  pt: {
    worker: {
      title: 'Seu fluxo de relatórios',
      operational:
        'Registre o trabalho diário e as alterações técnicas e envie-os para revisão operacional.',
      audiences:
        'Os relatórios de clientes incluem trabalho aprovado sem valores. Os relatórios financeiros internos são restritos; sua própria remuneração fica separada em Meu pagamento.',
    },
    restricted_worker: {
      title: 'Seu fluxo de relatórios',
      operational:
        'Registre o trabalho diário e as alterações técnicas e envie-os para revisão operacional.',
      audiences:
        'Os relatórios de clientes incluem trabalho aprovado sem valores. Os relatórios financeiros internos e as informações de remuneração permanecem restritos.',
    },
    project_manager: {
      title: 'Fluxo de revisão do projeto',
      operational:
        'Revise os fatos operacionais dos projetos atribuídos e devolva registros incompletos para correção.',
      audiences:
        'Os relatórios de clientes incluem trabalho aprovado sem valores. A remuneração de outros trabalhadores permanece restrita; sua própria remuneração fica separada em Meu pagamento.',
    },
    finance_admin: {
      title: 'Fluxo de relatórios financeiros',
      operational:
        'Gere arquivos rastreáveis do projeto e período escolhidos. Os relatórios de clientes incluem somente registros revisados.',
      audiences:
        'O relatório do cliente nunca inclui valores. O relatório interno separado é restrito a Finanças e Proprietário autorizados; cada trabalhador vê somente a própria remuneração em Meu pagamento.',
    },
    owner_admin: {
      title: 'Fluxo de relatórios do proprietário',
      operational:
        'Supervisione a revisão operacional e gere arquivos de período rastreáveis para clientes e uso interno.',
      audiences:
        'O relatório do cliente nunca inclui valores. O relatório interno separado é restrito a Finanças e Proprietário autorizados; cada trabalhador vê somente a própria remuneração em Meu pagamento.',
    },
    auditor_read_only: {
      title: 'Visão de auditoria somente leitura',
      operational: 'Inspecione o histórico e as evidências imutáveis sem alterar registros.',
      audiences:
        'Os relatórios de clientes não incluem valores. Os relatórios financeiros internos mantêm controle de acesso, e a remuneração permanece privada para o trabalhador e para Finanças ou Proprietário autorizados.',
    },
  },
};

function normalizeRole(role: string, workforceProfile?: string): ReportGuidanceRole {
  if (role === 'owner_admin' || role === 'finance_admin' || role === 'project_manager') return role;
  if (role === 'auditor_read_only') return role;
  if (workforceProfile === 'supplier_coordinator' || workforceProfile === 'external_technician') {
    return 'restricted_worker';
  }
  return 'worker';
}

export function reportGuidanceFor(
  locale: ReportGuidanceLocale,
  role: string,
  workforceProfile?: string,
): ReportGuidance {
  return guidance[locale][normalizeRole(role, workforceProfile)];
}
