import { z } from 'zod';

const shortText = z.string().trim().min(1).max(160);
const message = z.string().trim().min(20).max(5_000);
const honeypot = z.string().max(0).optional().default('');

export const contactSchema = z.object({
  name: shortText,
  company: shortText,
  email: z.email().max(254),
  phone: z.string().trim().max(40).optional().default(''),
  site: shortText,
  industry: shortText,
  projectType: shortText,
  platform: z.string().trim().max(160).optional().default(''),
  preferredContact: z.enum(['email', 'phone']),
  message,
  website: honeypot,
});

export const aquarexInquirySchema = contactSchema.pick({
  name: true,
  company: true,
  email: true,
  phone: true,
  site: true,
  message: true,
  website: true,
});

export const careerInterestSchema = z.object({
  name: shortText,
  email: z.email().max(254),
  location: shortText,
  profile: shortText,
  platforms: z.string().trim().max(500),
  travel: z.enum(['yes', 'limited', 'no']),
  message,
  website: honeypot,
});

export const supportSchema = z.object({
  name: shortText,
  company: shortText,
  email: z.email().max(254),
  phone: shortText,
  site: shortText,
  platform: shortText,
  urgency: z.enum(['production_stopped', 'degraded', 'planned']),
  message,
  website: honeypot,
});

export const offlineMutationSchema = z.object({
  mutationId: z.uuid(),
  entityType: shortText,
  entityId: z.uuid(),
  baseVersion: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
  payload: z.record(z.string(), z.unknown()),
  attachments: z.array(z.uuid()).max(20),
});
