'use server';

import { after } from 'next/server';
import { allow } from '@/lib/rate-limit';
import { notifyNewRequest } from '@/lib/notify-requests';
import { callerKey } from '@/lib/http';
import { contact, fieldErrors, funding, intro, submit } from '@/lib/public-validation';
import {
  createFundingRequest, createInquiry, createIntroductionRequest, createProjectSubmission,
} from '@/lib/submissions';

export type FormState = { ok?: boolean; ref?: string; error?: string; fieldErrors?: Record<string, string> };

function flatten(e: import('zod').ZodError): FormState {
  return { error: 'Please fix the highlighted fields.', fieldErrors: fieldErrors(e) };
}

async function gate(form: FormData, bucket: string, limit = 6): Promise<FormState | null> {
  if (form.get('website_url')) return { ok: true, ref: 'TS-RECEIVED' }; // honeypot: pretend success, store nothing
  const started = Number(form.get('t0'));
  if (Number.isFinite(started) && Date.now() - started < 2500) return { error: 'That was very fast. Please check your answers and send again.' };
  if (!await allow(`${bucket}:${await callerKey()}`, limit, 3600)) return { error: 'Too many submissions from this connection. Please try again later or email us.' };
  return null;
}

export async function submitFundingRequest(_prev: FormState, form: FormData): Promise<FormState> {
  const blocked = await gate(form, 'funding');
  if (blocked) return blocked;
  const p = funding.safeParse(Object.fromEntries(form));
  if (!p.success) return flatten(p.error);
  const d = p.data;
  try {
    const { ref } = await createFundingRequest({
      person: { name: d.name, email: d.email, phone: d.phone, org: d.org, role: d.role },
      existingProjectId: d.projectChoice === 'existing' && d.existingProjectId ? Number(d.existingProjectId) : null,
      projectName: d.projectName, description: d.description, state: d.state, county: d.county, category: d.category, orgType: d.orgType,
      needs: form.getAll('needs').map(String).filter((n) => ['Funding', 'A crew', 'Planning help', 'A partner'].includes(n)),
      amount: d.amount, homes: d.homes, timeline: d.timeline,
    });
    after(() => notifyNewRequest(ref));
    return { ok: true, ref };
  } catch {
    return { error: 'We could not save your request. Please try again.' };
  }
}

export async function submitProject(_prev: FormState, form: FormData): Promise<FormState> {
  const blocked = await gate(form, 'submit');
  if (blocked) return blocked;
  const p = submit.safeParse(Object.fromEntries(form));
  if (!p.success) return flatten(p.error);
  const d = p.data;
  try {
    const { ref } = await createProjectSubmission({ person: { name: d.name, email: d.email, phone: d.phone, org: d.org, role: d.role }, projectName: d.projectName, description: d.description, state: d.state, county: d.county, category: d.category, sourceUrl: d.sourceUrl });
    after(() => notifyNewRequest(ref));
    return { ok: true, ref };
  } catch {
    return { error: 'We could not save your project. Please try again.' };
  }
}

export async function submitContact(_prev: FormState, form: FormData): Promise<FormState> {
  const blocked = await gate(form, 'contact');
  if (blocked) return blocked;
  const p = contact.safeParse(Object.fromEntries(form));
  if (!p.success) return flatten(p.error);
  const d = p.data;
  try {
    const { ref } = await createInquiry({ person: { name: d.name, email: d.email, phone: d.phone, org: d.org, role: d.role }, topic: d.topic, message: d.message });
    after(() => notifyNewRequest(ref));
    return { ok: true, ref };
  } catch {
    return { error: 'We could not send your message. Please try again.' };
  }
}

export async function submitIntroduction(_prev: FormState, form: FormData): Promise<FormState> {
  const blocked = await gate(form, 'intro');
  if (blocked) return blocked;
  const p = intro.safeParse(Object.fromEntries(form));
  if (!p.success) return flatten(p.error);
  const d = p.data;
  try {
    const { ref } = await createIntroductionRequest({ person: { name: d.name, email: d.email, phone: d.phone, org: d.org, role: d.role }, projectId: Number(d.projectId), side: d.side, message: d.message });
    after(() => notifyNewRequest(ref));
    return { ok: true, ref };
  } catch {
    return { error: 'We could not send your request. Please try again.' };
  }
}
