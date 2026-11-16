import { describe, expect, it } from 'vitest';
import { contact, fieldErrors, funding, intro, submit, TOPICS } from '../src/lib/public-validation';

const person = { name: 'Pat Lee', email: 'Pat@Example.org', phone: '', org: 'Ridge HOA', role: '', consent: 'on' };
const goodFunding = { projectChoice: 'new', projectName: 'Ridge fuels break', description: 'Thin forty acres around the community.', state: 'OR', county: 'Deschutes', category: 'fuels_reduction', orgType: '', amount: '$75,000', homes: '300', timeline: '', existingProjectId: '', ...person };

describe('public form validation', () => {
  it('accepts a good funding request and normalises it', () => {
    const r = funding.safeParse(goodFunding);
    expect(r.success).toBe(true);
    if (r.success) { expect(r.data.email).toBe('pat@example.org'); expect(r.data.amount).toBe(75000); expect(r.data.phone).toBeNull(); expect(r.data.orgType).toBeNull(); }
  });

  it('explains problems in plain words, one per field', () => {
    const r = funding.safeParse({ ...goodFunding, email: 'nope', description: 'short', consent: '', amount: 'lots', category: 'hacking', projectName: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const e = fieldErrors(r.error);
      expect(e.email).toBe('Enter a valid email address');
      expect(e.description).toMatch(/at least 20 characters/);
      expect(e.consent).toBe('Please confirm so we can reply to you');
      expect(e.amount).toBe('Enter a number');
      expect(e.category).toBe('Choose one of the options');
      expect(e.projectName).toMatch(/at least 3 characters/);
    }
  });

  it('rejects oversized input rather than storing it', () => {
    expect(contact.safeParse({ topic: TOPICS[0], message: 'x'.repeat(4001), ...person }).success).toBe(false);
    expect(submit.safeParse({ projectName: 'P'.repeat(201), description: 'Thin forty acres around the community.', category: 'fuels_reduction', ...person }).success).toBe(false);
  });

  it('limits choices to known values and numeric ids', () => {
    expect(contact.safeParse({ topic: 'Sell me something', message: 'Hello there team', ...person }).success).toBe(false);
    expect(intro.safeParse({ projectId: '12; DROP TABLE', side: 'Funder', message: '', ...person }).success).toBe(false);
    expect(intro.safeParse({ projectId: '12', side: 'Funder', message: '', ...person }).success).toBe(true);
    expect(submit.safeParse({ projectName: 'Okay name', description: 'Thin forty acres around the community.', category: 'fuels_reduction', sourceUrl: 'javascript:alert(1)', ...person }).success).toBe(false);
  });
});

import { safeHref } from '../src/lib/safe-url';
describe('safeHref', () => {
  it('allows only http(s) links', () => {
    expect(safeHref('https://example.org/a?b=1')).toBe('https://example.org/a?b=1');
    expect(safeHref('http://example.org')).toBe('http://example.org/');
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'ftp://x.org', '//evil.org', 'not a url', '', null, undefined]) expect(safeHref(bad as string)).toBeNull();
  });
});
