import { beforeEach, describe, expect, it } from 'vitest';
import { signSession, verifySession } from '../src/lib/session';
import { allow } from '../src/lib/rate-limit';
import { freshDb } from './helpers';

describe('session tokens', () => {
  it('round-trips and rejects tampering and expiry', async () => {
    const t = await signSession(7, 1_000_000);
    expect(await verifySession(t, 1_000_500)).toEqual({ uid: 7 });
    const [p, s] = t.split('.');
    expect(await verifySession(`${p}.${s.slice(0, -2)}xx`)).toBeNull();
    const forged = Buffer.from(JSON.stringify({ uid: 1, exp: 9_999_999_999 })).toString('base64url');
    expect(await verifySession(`${forged}.${s}`)).toBeNull();
    expect(await verifySession(t, 1_000_000 + 13 * 3600 * 1000)).toBeNull();
    expect(await verifySession('garbage')).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });
});

describe('rate limiter', () => {
  beforeEach(async () => { await freshDb(); });
  it('allows up to the limit per window then blocks, per bucket', async () => {
    const now = 1_700_000_000_000;
    for (let i = 0; i < 3; i++) expect(await allow('a', 3, 60, now)).toBe(true);
    expect(await allow('a', 3, 60, now)).toBe(false);
    expect(await allow('b', 3, 60, now)).toBe(true);
    expect(await allow('a', 3, 60, now + 61_000)).toBe(true);
  });
});
