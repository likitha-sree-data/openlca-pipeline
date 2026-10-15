import { useState } from 'react'
import type { Piece, SuggestedOutfit } from '@/lib/types'
import { OCCASIONS, isoDate } from '@/lib/queries'
import { Dialog, Field } from './ui'
import { FlatLay, GarmentImage } from './garment'

export const SLOT_LABEL: Record<string, string> = { layer: 'Layer', top: 'Top', dress: 'Dress', bottom: 'Bottom', shoes: 'Shoes', accessory: 'Accessory' }

export function piecesIn(o: { pieces: Piece[] }) {
  return o.pieces.map((p) => ({ slot: p.slot, garment_id: p.garment_id }))
}

export function outfitKey(o: { pieces: Piece[] } | null | undefined): string {
  return o ? o.pieces.map((p) => p.garment_id).sort().join(',') : ''
}

export function PieceList({ outfit, activeSlot, onPick, title = 'From your wardrobe.' }: {
  outfit: SuggestedOutfit
  activeSlot?: string | null
  onPick?: (slot: Piece['slot']) => void
  title?: string
}) {
  return (
    <div>
      <h2 className="section-title mb-3">{title}</h2>
      <ul className="space-y-2">
        {outfit.pieces.map((p) =>
          p.garment ? (
            <li key={p.slot}>
              {onPick ? (
                <button
                  type="button"
                  onClick={() => onPick(p.slot)}
                  aria-expanded={activeSlot === p.slot}
                  className={`flex w-full items-center gap-3 rounded-card border p-2 text-left transition-colors ${activeSlot === p.slot ? 'border-accent bg-surface' : 'border-line hover:bg-surface'}`}
                >
                  <span className="card flex h-14 w-14 shrink-0 items-center justify-center p-1.5">
                    <GarmentImage garment={p.garment} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-ink2">{SLOT_LABEL[p.slot]}</span>
                    <span className="block truncate text-[15px]">{p.garment.name}</span>
                  </span>
                  <span className="pr-2 text-[13px] text-accent">{activeSlot === p.slot ? 'Close' : 'Swap'}</span>
                </button>
              ) : (
                <div className="flex items-center gap-3 rounded-card border border-line p-2">
                  <span className="card flex h-14 w-14 shrink-0 items-center justify-center p-1.5">
                    <GarmentImage garment={p.garment} />
                  </span>
                  <span>
                    <span className="block text-[13px] text-ink2">{SLOT_LABEL[p.slot]}</span>
                    <span className="block text-[15px]">{p.garment.name}</span>
                  </span>
                </div>
              )}
            </li>
          ) : null,
        )}
      </ul>
    </div>
  )
}

export function Reasons({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return null
  return (
    <ul className="mt-4 space-y-1.5" aria-label="Why this outfit">
      {reasons.map((r) => (
        <li key={r} className="flex gap-2 text-[15px] text-ink2">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          {r}
        </li>
      ))}
    </ul>
  )
}

export function MiniOutfit({ outfit, label, onClick }: { outfit: { pieces: Piece[] }; label: string; onClick?: () => void }) {
  const body = (
    <>
      <FlatLay pieces={outfit.pieces} size="sm" label={label} />
      <span className="mt-1.5 block text-tile text-ink2">{label}</span>
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className="block w-full rounded-card text-left" aria-label={`Use this outfit: ${label}`}>
      {body}
    </button>
  ) : (
    <div>{body}</div>
  )
}

export function PlanDialog({ open, onClose, onSave, initialDate, initialOccasion, busy }: {
  open: boolean
  onClose: () => void
  onSave: (date: string, occasion: string) => void
  initialDate?: string
  initialOccasion: string
  busy?: boolean
}) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const [date, setDate] = useState(initialDate ?? isoDate(tomorrow))
  const [occasion, setOccasion] = useState(initialOccasion)
  const min = isoDate(new Date())
  const maxD = new Date()
  maxD.setDate(maxD.getDate() + 60)
  return (
    <Dialog
      open={open}
      title="Plan another day."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy || !date} onClick={() => onSave(date, occasion)}>Plan this outfit</button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[15px] text-ink2">Keep this outfit for a day ahead. Planning the same day again replaces it.</p>
        <Field label="Day" htmlFor="plan-date">
          <input id="plan-date" type="date" className="input" min={min} max={isoDate(maxD)} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Occasion" htmlFor="plan-occasion">
          <select id="plan-occasion" className="input" value={occasion} onChange={(e) => setOccasion(e.target.value)}>
            {OCCASIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
      </div>
    </Dialog>
  )
}
