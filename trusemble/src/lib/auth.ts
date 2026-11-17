import 'server-only';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { get } from './db';
import { SESSION_COOKIE, SESSION_TTL_S, signSession, verifySession } from './session';

export type User = { id: number; name: string; email: string; initials: string; role: string };

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function checkPassword(pw: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export async function startSession(userId: number) {
  const token = await signSession(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_S,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const s = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  return await get<User>('SELECT id, name, email, initials, role FROM users WHERE id = ?', s.uid) ?? null;
}

/** Call at the top of every operator page, action and route handler. */
export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect('/ops/login');
  return u;
}

export async function findUserByLogin(email: string, password: string): Promise<User | null> {
  const row = await get<User & { password_hash: string | null }>(
    'SELECT id, name, email, initials, role, password_hash FROM users WHERE lower(email) = lower(?)',
    email.trim(),
  );
  // Always run a hash comparison so response time does not reveal whether the email exists.
  const ok = checkPassword(password, row?.password_hash ?? 'scrypt$00$00');
  if (!row || !ok) return null;
  return { id: row.id, name: row.name, email: row.email, initials: row.initials, role: row.role };
}
