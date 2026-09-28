export type CorrectionField = Readonly<{
  name: string;
  column: string;
  label: string;
  kind: 'text' | 'textarea' | 'date' | 'number' | 'checkbox';
  required?: boolean;
}>;

export const dailyCorrectionFields: readonly CorrectionField[] = [
  { name: 'workDate', column: 'work_date', label: 'Work date', kind: 'date', required: true },
  { name: 'siteShift', column: 'site_shift', label: 'Site / shift', kind: 'text' },
  { name: 'summary', column: 'summary', label: 'Shift summary', kind: 'textarea', required: true },
  {
    name: 'tasksCompleted',
    column: 'tasks_completed',
    label: 'Tasks completed',
    kind: 'textarea',
    required: true,
  },
  { name: 'problemsFound', column: 'problems_found', label: 'Problems found', kind: 'textarea' },
  {
    name: 'correctiveActions',
    column: 'corrective_actions',
    label: 'Corrective actions',
    kind: 'textarea',
  },
  {
    name: 'clientDecisions',
    column: 'client_decisions',
    label: 'Client decisions',
    kind: 'textarea',
  },
  {
    name: 'downtimeMinutes',
    column: 'downtime_minutes',
    label: 'Downtime minutes',
    kind: 'number',
  },
  { name: 'standbyReason', column: 'standby_reason', label: 'Standby reason', kind: 'text' },
  { name: 'blockers', column: 'blockers', label: 'Blockers', kind: 'textarea' },
  { name: 'openItems', column: 'open_items', label: 'Open items', kind: 'textarea' },
  { name: 'nextDayPlan', column: 'next_day_plan', label: 'Next-day plan', kind: 'textarea' },
  { name: 'safetyRelated', column: 'safety_related', label: 'Safety-related', kind: 'checkbox' },
  { name: 'customerContact', column: 'customer_contact', label: 'Customer contact', kind: 'text' },
];

export const technicalCorrectionFields: readonly CorrectionField[] = [
  { name: 'reportDate', column: 'report_date', label: 'Report date', kind: 'date', required: true },
  { name: 'systemName', column: 'system_name', label: 'System name', kind: 'text', required: true },
  { name: 'plantSite', column: 'plant_site', label: 'Plant / site', kind: 'text' },
  { name: 'areaLine', column: 'area_line', label: 'Area / line', kind: 'text' },
  { name: 'stationMachine', column: 'station_machine', label: 'Station / machine', kind: 'text' },
  { name: 'systemType', column: 'system_type', label: 'System type', kind: 'text' },
  { name: 'plcPlatform', column: 'plc_platform', label: 'PLC platform', kind: 'text' },
  { name: 'controller', column: 'controller', label: 'Controller', kind: 'text' },
  { name: 'hmiScada', column: 'hmi_scada', label: 'HMI / SCADA', kind: 'text' },
  { name: 'networkProtocol', column: 'network_protocol', label: 'Network protocol', kind: 'text' },
  { name: 'softwareVersion', column: 'software_version', label: 'Software version', kind: 'text' },
  {
    name: 'programReference',
    column: 'program_reference',
    label: 'Program reference',
    kind: 'text',
  },
  {
    name: 'problemSymptom',
    column: 'problem_symptom',
    label: 'Problem / symptom',
    kind: 'textarea',
    required: true,
  },
  {
    name: 'diagnosisRootCause',
    column: 'diagnosis_root_cause',
    label: 'Diagnosis / root cause',
    kind: 'textarea',
    required: true,
  },
  {
    name: 'changePerformed',
    column: 'change_performed',
    label: 'Change performed',
    kind: 'textarea',
    required: true,
  },
  {
    name: 'productionImpact',
    column: 'production_impact',
    label: 'Production impact',
    kind: 'textarea',
  },
  { name: 'validation', column: 'validation', label: 'Validation', kind: 'textarea' },
  {
    name: 'validationResult',
    column: 'validation_result',
    label: 'Validation result',
    kind: 'textarea',
  },
  { name: 'openRisk', column: 'open_risk', label: 'Open risk / issue', kind: 'textarea' },
  { name: 'rollbackPlan', column: 'rollback_plan', label: 'Rollback plan', kind: 'textarea' },
  { name: 'safetyRelated', column: 'safety_related', label: 'Safety impact', kind: 'checkbox' },
];
