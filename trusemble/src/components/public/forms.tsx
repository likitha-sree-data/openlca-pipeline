'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormAction } from '@/components/useFormAction';
import { Field, StatusMessage } from '@/components/FormBits';
import {
  submitContact, submitFundingRequest, submitIntroduction, submitProject, type FormState,
} from '@/app/actions/public';

type Opt = [string, string];
const init: FormState = {};

function Guard() {
  const [t0, setT0] = useState('');
  useEffect(() => setT0(String(Date.now())), []);
  return (
    <>
      <input type="hidden" name="t0" value={t0} />
      <div className="honey" aria-hidden="true">
        <label>Leave this empty<input type="text" name="website_url" tabIndex={-1} autoComplete="off" /></label>
      </div>
    </>
  );
}

function Person({ errors, orgRequired }: { errors?: Record<string, string>; orgRequired?: boolean }) {
  const e = errors ?? {};
  return (
    <div className="form-grid">
      <Field label="Your name" name="name" error={e.name}><input id="name" name="name" className="input" required minLength={2} maxLength={120} autoComplete="name" aria-invalid={!!e.name} /></Field>
      <Field label="Email" name="email" error={e.email}><input id="email" name="email" type="email" className="input" required maxLength={200} autoComplete="email" aria-invalid={!!e.email} /></Field>
      <Field label="Phone (optional)" name="phone" error={e.phone}><input id="phone" name="phone" type="tel" className="input" maxLength={40} autoComplete="tel" /></Field>
      <Field label={orgRequired ? 'Organization' : 'Organization (optional)'} name="org" error={e.org}><input id="org" name="org" className="input" maxLength={160} required={orgRequired} autoComplete="organization" /></Field>
      <Field label="Your role (optional)" name="role" error={e.role}><input id="role" name="role" className="input" maxLength={120} /></Field>
      <div className="field wide">
        <label className="check"><input type="checkbox" name="consent" required /> You may email me about this. My name, email and phone stay private and never appear on the public map.</label>
        {e.consent && <span className="err" role="alert">{e.consent}</span>}
      </div>
    </div>
  );
}

function Done({ ref_, what }: { ref_?: string; what: string }) {
  return (
    <div className="card" role="status">
      <h2>Thank you. {what} was received.</h2>
      <p className="card-sub" style={{ marginTop: 8 }}>
        Your reference is <b>{ref_}</b>. A person reads every submission and nothing is published automatically. We reply by email within two business days.
      </p>
      <p style={{ marginTop: 16 }}><a className="btn" href="/projects">Back to the map</a></p>
    </div>
  );
}

// ---------------- contact ----------------
export function ContactForm({ topics, defaultTopic }: { topics: string[]; defaultTopic?: string }) {
  const [s, onSubmit, pending] = useFormAction(submitContact, init);
  if (s.ok) return <Done ref_={s.ref} what="Your message" />;
  return (
    <form onSubmit={onSubmit} method="post" className="card">
      <Guard />
      <StatusMessage error={s.error} />
      <div className="form-grid" style={{ marginTop: s.error ? 12 : 0 }}>
        <Field label="What is this about?" name="topic" error={s.fieldErrors?.topic}>
          <select id="topic" name="topic" className="select" defaultValue={defaultTopic ?? topics[0]}>{topics.map((t) => <option key={t}>{t}</option>)}</select>
        </Field>
        <Field label="Message" name="message" error={s.fieldErrors?.message} wide>
          <textarea id="message" name="message" className="textarea" required minLength={10} maxLength={4000} aria-invalid={!!s.fieldErrors?.message} />
        </Field>
      </div>
      <div className="form-group"><Person errors={s.fieldErrors} /></div>
      <div className="form-actions"><button className="btn primary" disabled={pending}>{pending ? 'Sending…' : 'Send message'}</button></div>
    </form>
  );
}

// ---------------- introduction ----------------
export function IntroForm({ projectId }: { projectId: number }) {
  const [s, onSubmit, pending] = useFormAction(submitIntroduction, init);
  if (s.ok) return <Done ref_={s.ref} what="Your introduction request" />;
  return (
    <form onSubmit={onSubmit} method="post" className="stack">
      <Guard />
      <input type="hidden" name="projectId" value={projectId} />
      <StatusMessage error={s.error} />
      <Field label="I am a" name="side" error={s.fieldErrors?.side}>
        <select id="side" name="side" className="select">{['Funder', 'Crew or contractor', 'Partner', 'Other'].map((x) => <option key={x}>{x}</option>)}</select>
      </Field>
      <Field label="What would you like to do? (optional)" name="message" error={s.fieldErrors?.message}>
        <textarea id="message" name="message" className="textarea" maxLength={3000} style={{ minHeight: 80 }} />
      </Field>
      <Person errors={s.fieldErrors} />
      <p className="tiny muted">We introduce you only after both sides say yes.</p>
      <div className="form-actions" style={{ marginTop: 0 }}><button className="btn primary" disabled={pending}>{pending ? 'Sending…' : 'Request an introduction'}</button></div>
    </form>
  );
}

// ---------------- submit a project ----------------
export function SubmitProjectForm({ categories, states }: { categories: Opt[]; states: Opt[] }) {
  const [s, onSubmit, pending] = useFormAction(submitProject, init);
  if (s.ok) return <Done ref_={s.ref} what="Your project" />;
  const e = s.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} method="post" className="card">
      <Guard />
      <StatusMessage error={s.error} />
      <div className="form-grid" style={{ marginTop: s.error ? 12 : 0 }}>
        <Field label="Project name" name="projectName" error={e.projectName} wide><input id="projectName" name="projectName" className="input" required minLength={3} maxLength={200} placeholder="Ridge Pines fuels break" aria-invalid={!!e.projectName} /></Field>
        <Field label="Describe the project" name="description" error={e.description} help="What the work is, how big, and who it protects." wide>
          <textarea id="description" name="description" className="textarea" required minLength={20} maxLength={4000} aria-invalid={!!e.description} />
        </Field>
        <Field label="Category" name="category" error={e.category}><select id="category" name="category" className="select">{categories.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="State" name="state" error={e.state}><select id="state" name="state" className="select"><option value="">Choose a state</option>{states.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="County" name="county" error={e.county}><input id="county" name="county" className="input" maxLength={100} /></Field>
        <Field label="Link to a plan or public record (optional)" name="sourceUrl" error={e.sourceUrl}><input id="sourceUrl" name="sourceUrl" type="url" className="input" placeholder="https://" /></Field>
      </div>
      <div className="form-group"><Person errors={e} /></div>
      <div className="form-actions"><button className="btn primary" disabled={pending}>{pending ? 'Sending…' : 'Submit project'}</button></div>
    </form>
  );
}

// ---------------- request funding wizard ----------------
// Must live at module scope: defining it inside the wizard would remount every field (and wipe uncontrolled inputs) on each step change.
function StepBox({ n, step, children }: { n: number; step: number; children: ReactNode }) {
  return <fieldset data-step={n} hidden={step !== n} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>{children}</fieldset>;
}

const STEPS = ['Your project', 'Place and type', 'What you need', 'About you', 'Review'];

export function RequestWizard({ categories, states, orgTypes, prefill }: { categories: Opt[]; states: Opt[]; orgTypes: Opt[]; prefill?: { amount?: string; homes?: string; projectId?: string; projectName?: string } }) {
  const [s, onSubmit, pending] = useFormAction(submitFundingRequest, init);
  const [step, setStep] = useState(0);
  const [choice, setChoice] = useState<'new' | 'existing'>(prefill?.projectId ? 'existing' : 'new');
  const [projectId, setProjectId] = useState(prefill?.projectId ?? '');
  const [name, setName] = useState(prefill?.projectName ?? '');
  const [hits, setHits] = useState<{ id: number; name: string; county: string | null }[]>([]);
  const [summary, setSummary] = useState<[string, string][]>([]);
  const form = useRef<HTMLFormElement>(null);
  const e = s.fieldErrors ?? {};

  useEffect(() => {
    if (choice !== 'existing' || name.trim().length < 3 || projectId) { setHits([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => fetch(`/api/public/projects?q=${encodeURIComponent(name.trim())}&limit=6`, { signal: ctl.signal }).then((r) => r.json()).then((d) => setHits(d.items ?? [])).catch(() => {}), 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [choice, name, projectId]);

  // jump to the step that holds the first server-side error
  useEffect(() => {
    if (!s.fieldErrors) return;
    const owner: Record<string, number> = { projectName: 0, description: 0, state: 1, county: 1, category: 1, orgType: 1, amount: 2, homes: 2, timeline: 2, name: 3, email: 3, phone: 3, org: 3, role: 3, consent: 3 };
    const first = Math.min(...Object.keys(s.fieldErrors).map((k) => owner[k] ?? 4));
    setStep(first);
  }, [s.fieldErrors]);

  if (s.ok) return <Done ref_={s.ref} what="Your funding request" />;

  const validateStep = (): boolean => {
    const fs = form.current?.querySelector<HTMLFieldSetElement>(`fieldset[data-step="${step}"]`);
    if (!fs) return true;
    for (const el of Array.from(fs.querySelectorAll<HTMLInputElement>('input,select,textarea'))) if (!el.reportValidity()) return false;
    return true;
  };
  const go = (n: number) => {
    if (n > step && !validateStep()) return;
    if (n === 4 && form.current) {
      const fd = new FormData(form.current);
      const label = (k: string) => String(fd.get(k) ?? '').trim() || 'Not given';
      const optLabel = (opts: Opt[], k: string) => opts.find((o) => o[0] === fd.get(k))?.[1] ?? 'Not given';
      setSummary([
        ['Project', label('projectName')], ['Place', [fd.get('county'), fd.get('state')].filter(Boolean).join(', ') || 'Not given'], ['Category', optLabel(categories, 'category')],
        ['Needs', fd.getAll('needs').join(', ') || 'Not given'], ['Amount', label('amount')], ['Contact', `${label('name')} · ${label('email')}`], ['Organization', label('org')],
      ]);
    }
    setStep(n);
  };

  return (
    <div className="wizard">
      <form ref={form} onSubmit={onSubmit} method="post" className="card" onKeyDown={(ev) => { if (ev.key === 'Enter' && (ev.target as HTMLElement).tagName === 'INPUT' && step < 4) { ev.preventDefault(); go(step + 1); } }}>
        <Guard />
        <ol className="steps" aria-label="Progress">
          {STEPS.map((l, i) => <li key={l} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}><i>{i + 1}</i>{l}</li>)}
        </ol>
        <StatusMessage error={s.error} />

        <StepBox n={0} step={step}>
          <h2>Which project needs funding?</h2>
          <p className="card-sub">Pick one that is already on the map, or tell us about a new one.</p>
          <div className="choice" style={{ margin: '16px 0' }} role="radiogroup" aria-label="The project is">
            <label><input type="radio" name="projectChoice" value="new" checked={choice === 'new'} onChange={() => { setChoice('new'); setProjectId(''); }} /><span><b>A new project</b><br /><span className="small muted">Not on the map yet</span></span></label>
            <label><input type="radio" name="projectChoice" value="existing" checked={choice === 'existing'} onChange={() => setChoice('existing')} /><span><b>A project on the map</b><br /><span className="small muted">Already published</span></span></label>
          </div>
          <input type="hidden" name="existingProjectId" value={projectId} />
          <div className="stack">
            <Field label="Project name" name="projectName" error={e.projectName}>
              <div className="picker">
                <input id="projectName" name="projectName" className="input" required minLength={3} maxLength={200} placeholder="Ridge Pines fuels break" value={name} onChange={(ev) => { setName(ev.target.value); setProjectId(''); }} autoComplete="off" aria-invalid={!!e.projectName} />
                {hits.length > 0 && (
                  <div className="picker-list" role="listbox">
                    {hits.map((h) => <button type="button" key={h.id} role="option" aria-selected={false} onClick={() => { setName(h.name); setProjectId(String(h.id)); setHits([]); }}>{h.name}<br /><span className="tiny muted">{h.county}</span></button>)}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Describe the project" name="description" error={e.description} help="What the work is, how big, and who it protects.">
              <textarea id="description" name="description" className="textarea" required minLength={20} maxLength={4000} aria-invalid={!!e.description} />
            </Field>
          </div>
        </StepBox>

        <StepBox n={1} step={step}>
          <h2>Where is it, and who are you?</h2>
          <div className="form-grid" style={{ marginTop: 16 }}>
            <Field label="State" name="state" error={e.state}><select id="state" name="state" className="select" required><option value="">Choose a state</option>{states.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="County" name="county" error={e.county}><input id="county" name="county" className="input" maxLength={100} required /></Field>
            <Field label="Type of work" name="category" error={e.category}><select id="category" name="category" className="select">{categories.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Your group is a" name="orgType" error={e.orgType}><select id="orgType" name="orgType" className="select"><option value="">Choose one</option>{orgTypes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          </div>
        </StepBox>

        <StepBox n={2} step={step}>
          <h2>What do you need?</h2>
          <div className="stack" style={{ marginTop: 16 }}>
            <div className="field"><span className="label">Select all that apply</span>
              <div className="choice">{['Funding', 'A crew', 'Planning help', 'A partner'].map((n) => <label key={n}><input type="checkbox" name="needs" value={n} defaultChecked={n === 'Funding'} /><span>{n}</span></label>)}</div>
            </div>
            <div className="form-grid">
              <Field label="Amount you are looking for ($)" name="amount" error={e.amount}><input id="amount" name="amount" inputMode="numeric" className="input" defaultValue={prefill?.amount} placeholder="75000" /></Field>
              <Field label="Homes in the area (optional)" name="homes" error={e.homes}><input id="homes" name="homes" inputMode="numeric" className="input" defaultValue={prefill?.homes} /></Field>
              <Field label="When do you need it? (optional)" name="timeline" error={e.timeline} wide><input id="timeline" name="timeline" className="input" maxLength={300} placeholder="Before the 2027 fire season" /></Field>
            </div>
          </div>
        </StepBox>

        <StepBox n={3} step={step}>
          <h2>About you</h2>
          <div style={{ marginTop: 16 }}><Person errors={e} orgRequired /></div>
        </StepBox>

        <StepBox n={4} step={step}>
          <h2>Review and send</h2>
          <div className="review card" style={{ marginTop: 14 }}><dl>{summary.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>
        </StepBox>

        <div className="form-actions">
          {step > 0 && <button type="button" className="btn" onClick={() => go(step - 1)}>Back</button>}
          {step < 4 && <button type="button" className="btn primary" onClick={() => go(step + 1)}>Continue</button>}
          {step === 4 && <button className="btn primary" disabled={pending}>{pending ? 'Sending…' : 'Send request'}</button>}
        </div>
      </form>
      <aside className="card" aria-label="What happens next">
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>What happens next</h3>
        <ul className="checklist">
          <li><span><b>A person reads it.</b> Every submission is reviewed by the TruSemble team. Nothing is published automatically.</span></li>
          <li><span><b>We reply by email.</b> Within two business days, with what we found or what we need from you.</span></li>
          <li><span><b>Your details stay private.</b> Names, emails and phone numbers never appear on the public map.</span></li>
        </ul>
      </aside>
    </div>
  );
}
