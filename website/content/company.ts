import type { ContactConfig, TeamRole } from './types';

export const contact: ContactConfig = {
  primaryName: 'Antonny Nascimento',
  primaryTitle: 'Chief Executive Officer',
  email: 'antonny.luty@j-aautomation.com',
  usPhone: '+1 (864) 208-4684',
  linkedinUrl: 'https://www.linkedin.com/in/antonny-nascimento-32b87127/',
  offices: [
    {
      label: 'United States',
      country: 'US',
    },
    {
      label: 'Brazil',
      country: 'BR',
    },
  ],
};

export const teamRoles: TeamRole[] = [
  { count: 16, labelKey: 'team.plcEngineers' },
  { count: 7, labelKey: 'team.robotEngineers' },
  { count: 3, labelKey: 'team.electricalDesigners' },
  { count: 2, labelKey: 'team.planningSpecialists' },
  { count: 3, labelKey: 'team.siteManagers' },
  { count: 2, labelKey: 'team.instructors' },
];

export const company = {
  name: 'J&A Automation LLC',
  founded: 2008,
  officeCount: 2,
  operationCountries: ['United States', 'Brazil'],
} as const;
