import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { Profile } from './types'

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.get<Profile>('/api/me'), staleTime: 60_000 })
}

export const OCCASIONS = [
  { id: 'everyday', label: 'Everyday' },
  { id: 'work', label: 'Work' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'date', label: 'Date' },
  { id: 'formal', label: 'Formal' },
  { id: 'weekend', label: 'Weekend' },
] as const

export function occasionLabel(id: string | null | undefined): string {
  return OCCASIONS.find((o) => o.id === id)?.label ?? 'Everyday'
}

export const CATEGORY_LABELS: Record<string, string> = {
  top: 'Top',
  bottom: 'Bottom',
  layer: 'Layer',
  dress: 'Dress',
  shoes: 'Shoes',
  accessory: 'Accessory',
}

export function formatTemp(c: number, units: 'c' | 'f' = 'c'): string {
  return units === 'f' ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`
}

export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
