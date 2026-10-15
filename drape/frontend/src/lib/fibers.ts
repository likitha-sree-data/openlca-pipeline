import type { Fiber } from './types'

/** "80% wool, 20% nylon" -> [{fiber: 'wool', percent: 80}, {fiber: 'nylon', percent: 20}] */
export function parseFibers(text: string): Fiber[] {
  return text
    .split(/[,;/]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(\d{1,3})\s*%?\s*(.+)$/) ?? part.match(/^(.+?)\s+(\d{1,3})\s*%$/)
      if (!m) return { fiber: part.toLowerCase().slice(0, 40), percent: null }
      const [a, b] = [m[1], m[2]]
      const percent = /^\d+$/.test(a) ? Number(a) : Number(b)
      const fiber = (/^\d+$/.test(a) ? b : a).toLowerCase().trim().slice(0, 40)
      return { fiber, percent: Math.min(100, percent) }
    })
    .slice(0, 6)
}

export function formatFibers(f: Fiber[] | undefined | null): string {
  return (f ?? []).map((x) => (x.percent != null ? `${x.percent}% ${x.fiber}` : x.fiber)).join(', ')
}
