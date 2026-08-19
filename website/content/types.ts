// ─── Industry ──────────────────────────────────────────────────────────────
export type Industry =
  | 'automotive'
  | 'food-beverage'
  | 'energy-process'
  | 'cosmetics-packaging'
  | 'general-industry';

// ─── Capability ────────────────────────────────────────────────────────────
export type Capability =
  | 'plc-hmi-scada'
  | 'robotics'
  | 'electrical-controls'
  | 'simulation'
  | 'motion-process'
  | 'commissioning'
  | 'support'
  | 'training-consulting';

// ─── Project ───────────────────────────────────────────────────────────────
export type Project = {
  id: string;
  slug: string;
  title: string;
  client?: string;
  location?: string;
  startYear?: number;
  endYear?: number;
  displayDate?: string;
  industry: Industry;
  capabilities: Capability[];
  technologies: string[];
  scope: string;
  outcome?: string;
  featured?: boolean;
  detailPage?: boolean;
  imageKey?: string;
  imageIsRepresentative?: boolean;
  source: 'legacy-site' | 'new-ja-data';
  sortWeight?: number;
};

// ─── Technology ────────────────────────────────────────────────────────────
export type Technology = {
  id: string;
  name: string;
  category: 'controls' | 'scada' | 'robotics' | 'engineering' | 'motion' | 'field';
  currentStrategic: boolean;
  historical: boolean;
  logoAsset?: string;
};

// ─── Contact Configuration ─────────────────────────────────────────────────
export type ContactConfig = {
  primaryName: string;
  primaryTitle: string;
  email: string;
  usPhone: string;
  whatsappUrl?: string;
  linkedinUrl: string;
  careersEmail?: string;
  offices: Array<{
    label: string;
    city?: string;
    region?: string;
    country: string;
    address?: string;
  }>;
};

// ─── Service / Capability Card ─────────────────────────────────────────────
export type ServiceCard = {
  id: Capability;
  slug: string;
  icon: string;
  tags: string[];
};

// ─── Industry Card ─────────────────────────────────────────────────────────
export type IndustryCard = {
  id: Industry;
  slug: string;
  imageKey: string;
};

// ─── Team Role ─────────────────────────────────────────────────────────────
export type TeamRole = {
  count: number;
  labelKey: string;
};
