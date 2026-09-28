import type { ServiceCard } from './types';

export const services: ServiceCard[] = [
  {
    id: 'plc-hmi-scada',
    slug: 'plc-hmi-scada',
    icon: 'Cpu',
    tags: ['Siemens', 'Rockwell', 'WinCC', 'FactoryTalk'],
  },
  {
    id: 'robotics',
    slug: 'robotics-integration',
    icon: 'Bot',
    tags: ['FANUC', 'KUKA', 'ABB', 'Yaskawa'],
  },
  {
    id: 'simulation',
    slug: 'simulation-offline-engineering',
    icon: 'MonitorPlay',
    tags: ['Process Simulate', 'RobotStudio', 'Offline engineering'],
  },
  {
    id: 'electrical-controls',
    slug: 'electrical-controls',
    icon: 'Zap',
    tags: ['EPLAN', 'AutoCAD Electrical', 'Panels', 'Safety interfaces'],
  },
  {
    id: 'installation',
    slug: 'electromechanical-installation',
    icon: 'Wrench',
    tags: ['Panels', 'Safety interfaces', 'Startup', 'Ramp-up'],
  },
  {
    id: 'motion-process',
    slug: 'motion-process-control',
    icon: 'Gauge',
    tags: ['VFD', 'Servo', 'Motion', 'PID'],
  },
  {
    id: 'commissioning',
    slug: 'commissioning-support',
    icon: 'HardHat',
    tags: ['FAT', 'SAT', 'Startup', 'Ramp-up'],
  },
  {
    id: 'training-consulting',
    slug: 'training-consulting',
    icon: 'GraduationCap',
    tags: ['Remote support', 'Troubleshooting', 'Training', 'Consulting'],
  },
  {
    id: 'support',
    slug: 'technical-support',
    icon: 'Headphones',
    tags: ['Remote support', 'Troubleshooting', 'Startup', 'Ramp-up'],
  },
];
