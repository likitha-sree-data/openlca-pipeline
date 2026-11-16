// Edge-safe session signing (Web Crypto only) so middleware and server code share one implementation.
const enc = new TextEncoder();

export const SESSION_COOKIE = 'ts_session';
export const SESSION_TTL_S = 60 * 60 * 12;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be set (16+ characters) in production');
  return 'dev-only-insecure-secret-change-me';
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(uid: number, now = Date.now()): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ uid, exp: Math.floor(now / 1000) + SESSION_TTL_S })));
  const sig = await crypto.subtle.sign('HMAC', await key(), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined | null, now = Date.now()): Promise<{ uid: number } | null> {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(), fromB64url(sig) as BufferSource, enc.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { uid: number; exp: number };
    if (typeof data.uid !== 'number' || data.exp * 1000 < now) return null;
    return { uid: data.uid };
  } catch {
    return null;
  }
}
