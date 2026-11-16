import { z } from 'zod';
import { PROJECT_CATEGORIES, ORG_TYPES, STATE_OPTS } from './constants';

export type FieldErrors = Record<string, string>;

const cat = PROJECT_CATEGORIES.map((c) => c[0]);
const states = STATE_OPTS.map((s) => s[0]);
const text = (max: number, min = 0) => z.string().trim().min(min).max(max);
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const person = {
  name: text(120, 2),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: opt(40),
  org: opt(160),
  role: opt(120),
};
const consent = z.literal('on', { error: 'Please confirm so we can reply to you' });
const optNumber = z.string().trim().optional().transform((v) => {
  if (!v) return null;
  const n = Number(v.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}).refine((n) => n === null || !Number.isNaN(n), { message: 'Enter a number' });

export const funding = z.object({
  projectChoice: z.enum(['new', 'existing']),
  existingProjectId: z.string().regex(/^\d*$/).optional(),
  projectName: text(200, 3),
  description: text(4000, 20),
  state: z.enum(states as [string, ...string[]]).optional().or(z.literal('')).transform((v) => v || null),
  county: opt(100),
  category: z.enum(cat as [string, ...string[]]),
  orgType: z.enum(ORG_TYPES.map((o) => o[0]) as [string, ...string[]]).optional().or(z.literal('')).transform((v) => v || null),
  amount: optNumber,
  homes: optNumber,
  timeline: opt(300),
  ...person,
  consent,
});

export const submit = z.object({
  projectName: text(200, 3), description: text(4000, 20), category: z.enum(cat as [string, ...string[]]),
  state: z.enum(states as [string, ...string[]]).optional().or(z.literal('')).transform((v) => v || null), county: opt(100),
  sourceUrl: z.string().trim().max(500).refine((u) => u === '' || /^https?:\/\/[^\s]+$/i.test(u), { message: 'Enter a link that starts with http:// or https://' }).optional().transform((v) => v || null),
  ...person, consent,
});

export const TOPICS = ['Fund a project', 'Monthly brief or data license', 'Talk to the team about the data', 'Something else'];
export const contact = z.object({ topic: z.enum(TOPICS as [string, ...string[]]), message: text(4000, 10), ...person, consent });

export const intro = z.object({ projectId: z.string().regex(/^\d+$/), side: z.enum(['Funder', 'Crew or contractor', 'Partner', 'Other']), message: text(3000, 0), ...person, consent });


/** Friendly message for the first problem on each field. */
export function fieldErrors(e: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const i of e.issues) {
    const key = String(i.path[0] ?? 'form');
    if (out[key]) continue;
    let m = i.message;
    if (i.code === 'too_small') m = 'minimum' in i && typeof i.minimum === 'number' && i.minimum > 1 ? `Please enter at least ${i.minimum} characters` : 'This field is required';
    else if (i.code === 'too_big') m = 'maximum' in i ? `Please keep this under ${i.maximum} characters` : 'This is too long';
    else if (i.code === 'invalid_format') m = 'format' in i && i.format === 'email' ? 'Enter a valid email address' : 'Check this value';
    else if (i.code === 'invalid_type') m = 'This field is required';
    else if (i.code === 'invalid_value' && /^Invalid/.test(m)) m = 'Choose one of the options';
    out[key] = m;
  }
  return out;
}
