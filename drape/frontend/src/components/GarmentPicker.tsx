import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Category, Garment } from '@/lib/types'
import { CATEGORY_LABELS } from '@/lib/queries'
import { Dialog, ErrorNote, Loading } from './ui'
import { GarmentImage } from './garment'

/** Pick one or more garments from the closet, grouped by category. */
export function GarmentPicker({ open, title, categories, multiple, initial = [], onClose, onDone, confirmLabel = 'Done' }: {
  open: boolean
  title: string
  categories?: Category[]
  multiple?: boolean
  initial?: string[]
  onClose: () => void
  onDone: (garments: Garment[]) => void
  confirmLabel?: string
}) {
  const q = useQuery({ queryKey: ['garments', 'all', 'recent', ''], queryFn: () => api.get<{ items: Garment[] }>('/api/garments'), enabled: open })
  const [picked, setPicked] = useState<string[]>(initial)
  const groups = useMemo(() => {
    const items = (q.data?.items ?? []).filter((g) => (!categories || categories.includes(g.category)) && g.status !== 'archived')
    const order: Category[] = ['top', 'layer', 'dress', 'bottom', 'shoes', 'accessory']
    return order.map((c) => ({ c, items: items.filter((g) => g.category === c) })).filter((x) => x.items.length)
  }, [q.data, categories])
  const toggle = (id: string) => setPicked((p) => (multiple ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]))
  const chosen = (q.data?.items ?? []).filter((g) => picked.includes(g.id))
  return (
    <Dialog
      open={open}
      wide
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!picked.length} onClick={() => onDone(chosen)}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : groups.length === 0 ? (
        <p className="text-[15px] text-ink2">No pieces of this kind in your closet yet.</p>
      ) : (
        <div className="space-y-5">
          {groups.map(({ c, items }) => (
            <fieldset key={c}>
              <legend className="mb-2 text-[15px] font-medium">{CATEGORY_LABELS[c]}</legend>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {items.map((g) => {
                  const on = picked.includes(g.id)
                  return (
                    <li key={g.id}>
                      <button type="button" aria-pressed={on} onClick={() => toggle(g.id)} className="block w-full text-left">
                        <span className={`card flex aspect-square items-center justify-center p-2 ${on ? 'ring-2 ring-accent' : ''}`}>
                          <GarmentImage garment={g} />
                        </span>
                        <span className="mt-1 block text-tile">{g.name}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          ))}
        </div>
      )}
    </Dialog>
  )
}
