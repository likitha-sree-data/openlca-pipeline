const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d);
}

export function fmtDateTime(iso: string | null | undefined, tz = 'America/Los_Angeles'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const s = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz, timeZoneName: 'short' }).format(d);
  return s.replace(',', '');
}

export function fmtInt(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : new Intl.NumberFormat('en-US').format(Math.round(n));
}

export function fmtMoney(n: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  if (opts.compact) {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `$${trim(n / 1e9)}B`;
    if (abs >= 1e6) return `$${trim(n / 1e6)}M`;
    if (abs >= 1e3) return `$${trim(n / 1e3)}K`;
  }
  return '$' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
}
const trim = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1)).replace(/\.0$/, '');

export function fmtRange(min: number | null, max: number | null, text?: string | null): string {
  if (text) return text;
  if (min != null && max != null) return min === max ? fmtMoney(max) : `${fmtMoney(min)} to ${fmtMoney(max)}`;
  if (max != null) return `Up to ${fmtMoney(max)}`;
  if (min != null) return `From ${fmtMoney(min)}`;
  return 'Not stated';
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso.length === 10 ? fromIso + 'T00:00:00Z' : fromIso);
  const b = Date.parse(toIso.length === 10 ? toIso + 'T00:00:00Z' : toIso);
  return Math.floor((b - a) / 86_400_000);
}

export function relativeDays(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '';
  const d = daysBetween(iso, now.toISOString());
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d}d ago`;
  if (d < 60) return `${Math.round(d / 7)}w ago`;
  return fmtDate(iso);
}

/** True only for a real calendar date written YYYY-MM-DD. Date.parse alone accepts 2026-02-31. */
export function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function plural(n: number, one: string, many = one + 's'): string {
  return `${fmtInt(n)} ${n === 1 ? one : many}`;
}
