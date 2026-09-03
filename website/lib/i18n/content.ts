import type { Capability, Industry, Project } from '@/content/types';

export type MessageTranslator = (key: string, values?: Record<string, string | number>) => string;

export const projectIndustryKeys: Record<Industry, string> = {
  automotive: 'automotive',
  'food-beverage': 'foodBeverage',
  'energy-process': 'energyProcess',
  'cosmetics-packaging': 'cosmeticsPackaging',
  'general-industry': 'generalIndustry',
  'warehouse-logistics': 'warehouseLogistics',
};

export const projectCapabilityKeys: Record<Capability, string> = {
  'plc-hmi-scada': 'plcHmi',
  robotics: 'robotics',
  'electrical-controls': 'electrical',
  simulation: 'simulation',
  'motion-process': 'motion',
  commissioning: 'commissioning',
  installation: 'installation',
  support: 'support',
  'training-consulting': 'trainingConsulting',
};

export const serviceTagKeys: Record<string, string> = {
  Siemens: 'siemens',
  Rockwell: 'rockwell',
  WinCC: 'wincc',
  FactoryTalk: 'factoryTalk',
  FANUC: 'fanuc',
  KUKA: 'kuka',
  ABB: 'abb',
  Yaskawa: 'yaskawa',
  'Process Simulate': 'processSimulate',
  RobotStudio: 'robotStudio',
  'Offline engineering': 'offlineEngineering',
  EPLAN: 'eplan',
  'AutoCAD Electrical': 'autoCadElectrical',
  Panels: 'panels',
  'Safety interfaces': 'safetyInterfaces',
  VFD: 'vfd',
  Servo: 'servo',
  Motion: 'motion',
  PID: 'pid',
  FAT: 'fat',
  SAT: 'sat',
  Startup: 'startup',
  'Ramp-up': 'rampUp',
  'Remote support': 'remoteSupport',
  Troubleshooting: 'troubleshooting',
  Training: 'training',
  Consulting: 'consulting',
};

export function translateServiceTags(tags: readonly string[], t: MessageTranslator) {
  return tags.map((tag) => t(serviceTagKeys[tag] ?? tag));
}

export function translateProject(project: Project, t: MessageTranslator) {
  const key = project.id;

  return {
    ...project,
    title: t(`${key}.title`),
    scope: t(`${key}.scope`),
    outcome: project.outcome ? t(`${key}.outcome`) : undefined,
    displayDate: t(`${key}.displayDate`),
  };
}
