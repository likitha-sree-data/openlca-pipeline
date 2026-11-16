import { daysBetween, fmtDate } from './format';

export type WindowStatus = 'open' | 'rolling' | 'upcoming' | 'past';

type W = { rolling?: number | null; window_start?: string | null; window_end?: string | null };

export function windowStatus(p: W, today: string): WindowStatus {
  if (p.window_end && p.window_end < today) return 'past';
  if (p.window_start && p.window_start > today) return 'upcoming';
  if (p.window_start || p.window_end) return 'open';
  return 'rolling';
}

export function windowLabel(p: W): string {
  if (p.window_start && p.window_end) return `${fmtDate(p.window_start)} to ${fmtDate(p.window_end)}`;
  if (p.window_end) return `Deadline ${fmtDate(p.window_end)}`;
  if (p.window_start) return `Opens ${fmtDate(p.window_start)}`;
  return 'Rolling, no dates listed';
}

/** "Closed", "75 days left" or "Rolling" for list views. */
export function deadlineNote(p: W, today: string): string {
  const s = windowStatus(p, today);
  if (s === 'past') return 'Closed';
  if (p.window_end) {
    const d = daysBetween(today, p.window_end);
    return d === 0 ? 'Closes today' : `${d} day${d === 1 ? '' : 's'} left`;
  }
  if (s === 'upcoming') return 'Upcoming';
  return '';
}

export const normCounty = (c: string | null | undefined) => (c ?? '').toLowerCase().replace(/\s+county$/, '').trim();

export function programCoversCounty(
  p: { scope: string; state: string | null; counties: string | null },
  county: string | null | undefined,
  state: string | null | undefined,
): boolean {
  if (p.scope === 'national') return true;
  if (p.scope === 'state') return !!p.state && (!state || p.state === state);
  const list = (p.counties ?? '').split(',').map(normCounty).filter(Boolean);
  return (!state || !p.state || p.state === state) && list.includes(normCounty(county));
}

export const WINDOW_ORDER: WindowStatus[] = ['open', 'rolling', 'upcoming', 'past'];
export const WINDOW_HEADINGS: Record<WindowStatus, { title: string; sub: string }> = {
  open: { title: 'Open now', sub: 'Accepting applications today, by the dates on the program page.' },
  rolling: { title: 'Apply any time', sub: 'The program page lists no window. Ask the administrator before you plan around it.' },
  upcoming: { title: 'Upcoming', sub: 'A window is announced but has not opened yet.' },
  past: { title: 'Past windows', sub: 'The last window has passed. Most of these programs run again; the next window is not announced yet.' },
};
