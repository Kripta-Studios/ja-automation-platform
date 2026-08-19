import type { Technology } from './types';

export const technologies: Technology[] = [
  // Controls / PLC / SCADA
  {
    id: 'siemens-tia',
    name: 'Siemens TIA Portal',
    category: 'controls',
    currentStrategic: true,
    historical: true,
  },
  {
    id: 'siemens-s7',
    name: 'Siemens S7',
    category: 'controls',
    currentStrategic: true,
    historical: true,
  },
  {
    id: 'siemens-wincc',
    name: 'Siemens WinCC',
    category: 'scada',
    currentStrategic: true,
    historical: true,
  },
  {
    id: 'rockwell',
    name: 'Rockwell Automation / Allen-Bradley',
    category: 'controls',
    currentStrategic: true,
    historical: true,
  },
  {
    id: 'factorytalk',
    name: 'FactoryTalk',
    category: 'scada',
    currentStrategic: true,
    historical: true,
  },
  {
    id: 'mitsubishi',
    name: 'Mitsubishi Electric',
    category: 'controls',
    currentStrategic: true,
    historical: false,
  },
  { id: 'omron', name: 'Omron', category: 'controls', currentStrategic: true, historical: false },
  {
    id: 'beckhoff',
    name: 'Beckhoff',
    category: 'controls',
    currentStrategic: true,
    historical: false,
  },
  {
    id: 'ignition',
    name: 'Ignition',
    category: 'scada',
    currentStrategic: true,
    historical: false,
  },
  { id: 'altus', name: 'Altus', category: 'controls', currentStrategic: false, historical: true },
  {
    id: 'wonderware',
    name: 'Wonderware InTouch',
    category: 'scada',
    currentStrategic: false,
    historical: true,
  },

  // Robotics
  { id: 'fanuc', name: 'FANUC', category: 'robotics', currentStrategic: true, historical: true },
  { id: 'kuka', name: 'KUKA', category: 'robotics', currentStrategic: true, historical: false },
  { id: 'abb', name: 'ABB', category: 'robotics', currentStrategic: true, historical: false },
  {
    id: 'yaskawa',
    name: 'Yaskawa',
    category: 'robotics',
    currentStrategic: true,
    historical: false,
  },

  // Engineering / Simulation
  {
    id: 'eplan',
    name: 'EPLAN',
    category: 'engineering',
    currentStrategic: true,
    historical: false,
  },
  {
    id: 'autocad-electrical',
    name: 'AutoCAD Electrical',
    category: 'engineering',
    currentStrategic: true,
    historical: false,
  },
  {
    id: 'process-simulate',
    name: 'Siemens Process Simulate',
    category: 'engineering',
    currentStrategic: true,
    historical: false,
  },
  {
    id: 'robotstudio',
    name: 'ABB RobotStudio',
    category: 'engineering',
    currentStrategic: true,
    historical: false,
  },

  // Motion / Field
  {
    id: 'sew',
    name: 'SEW-EURODRIVE',
    category: 'motion',
    currentStrategic: true,
    historical: true,
  },
  { id: 'danfoss', name: 'Danfoss', category: 'motion', currentStrategic: true, historical: false },
  { id: 'emerson', name: 'Emerson', category: 'motion', currentStrategic: true, historical: false },
  { id: 'festo', name: 'Festo', category: 'field', currentStrategic: true, historical: true },
  {
    id: 'siemens-motion',
    name: 'Siemens Drives / Simotion',
    category: 'motion',
    currentStrategic: true,
    historical: true,
  },
  {
    id: 'rockwell-motion',
    name: 'Rockwell Motion',
    category: 'motion',
    currentStrategic: true,
    historical: true,
  },
  {
    id: 'simotion',
    name: 'Simotion',
    category: 'motion',
    currentStrategic: false,
    historical: true,
  },
  {
    id: 'movidrive',
    name: 'Movidrive',
    category: 'motion',
    currentStrategic: false,
    historical: true,
  },
];

export const technologyGroups = [
  {
    labelKey: 'tech.plcScada',
    ids: [
      'siemens-tia',
      'siemens-s7',
      'siemens-wincc',
      'rockwell',
      'factorytalk',
      'mitsubishi',
      'omron',
      'beckhoff',
      'ignition',
    ],
  },
  {
    labelKey: 'tech.robotics',
    ids: ['fanuc', 'kuka', 'abb', 'yaskawa'],
  },
  {
    labelKey: 'tech.engineering',
    ids: ['eplan', 'autocad-electrical', 'process-simulate', 'robotstudio'],
  },
  {
    labelKey: 'tech.motion',
    ids: ['sew', 'danfoss', 'emerson', 'festo', 'siemens-motion', 'rockwell-motion'],
  },
] as const;
