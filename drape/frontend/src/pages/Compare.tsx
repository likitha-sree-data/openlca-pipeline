import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Piece, SavedOutfit, SuggestedOutfit } from '@/lib/types'
import { OCCASIONS } from '@/lib/queries'
import { useToast } from '@/lib/toast'
import { ChipGroup, ErrorNote, Loading, PageHeader } from '@/components/ui'
import { FlatLay, GarmentImage } from '@/components/garment'
import { Reasons, SLOT_LABEL, outfitKey, piecesIn } from '@/components/outfit'

type Occasion = (typeof OCCASIONS)[number]['id']
interface Side { outfit: SuggestedOutfit | null; saved: boolean }

export default function Compare() {
  const location = useLocation()
  const [params] = useSearchParams()
  const state = location.state as { a?: SuggestedOutfit; occasion?: Occasion } | null
  const [occasion, setOccasion] = useState<Occasion>(state?.occasion ?? 'everyday')
  const ida = params.get('a')
  const idb = params.get('b')

  const init = useQuery({
    queryKey: ['compare-init', ida, idb, occasion, outfitKey(state?.a)],
    queryFn: async (): Promise<[SuggestedOutfit | null, SuggestedOutfit | null]> => {
      if (ida && idb) {
        const [a, b] = await Promise.all([api.get<SavedOutfit>(`/api/outfits/${ida}`), api.get<SavedOutfit>(`/api/outfits/${idb}`)])
        return [{ pieces: a.pieces, reasons: a.reasons, score: 0 }, { pieces: b.pieces, reasons: b.reasons, score: 0 }]
      }
      const a = state?.a ?? (await api.post<{ outfit: SuggestedOutfit | null }>('/api/outfits/suggest', { occasion, seed: 0 })).outfit
      if (!a) return [null, null]
      const b = await api.post<{ outfit: SuggestedOutfit | null }>('/api/outfits/suggest', { occasion, seed: 7, exclude: [a.pieces.map((p) => p.garment_id)], avoid: a.pieces.map((p) => p.garment_id) })
      return [a, b.outfit]
    },
    staleTime: Infinity,
  })
  const [sides, setSides] = useState<Side[]>([{ outfit: null, saved: false }, { outfit: null, saved: false }])
  useEffect(() => {
    if (init.data) setSides([{ outfit: init.data[0], saved: false }, { outfit: init.data[1], saved: false }])
  }, [init.data])

  const fromHistory = Boolean(ida && idb)
  return (
    <>
      <PageHeader title="Compare outfits." subtitle="Two outfits side by side. Swap any piece, then save the one you like, or both." />
      {!fromHistory && <div className="mb-6"><ChipGroup label="Occasion" options={OCCASIONS} value={occasion} onChange={setOccasion} /></div>}
      {init.isLoading ? (
        <Loading label="Putting two outfits together" />
      ) : init.error ? (
        <ErrorNote error={init.error} onRetry={() => init.refetch()} />
      ) : !init.data?.[0] ? (
        <ErrorNote error="Add a few more pieces to your closet to compare outfits." />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:gap-8">
          {sides.map((s, i) => (
            <OutfitSide key={i} label={i === 0 ? 'Outfit A' : 'Outfit B'} side={s} occasion={occasion} onChange={(next) => setSides((all) => all.map((x, j) => (j === i ? next : x)))} />
          ))}
        </div>
      )}
    </>
  )
}

function OutfitSide({ label, side, occasion, onChange }: { label: string; side: Side; occasion: string; onChange: (s: Side) => void }) {
  const [slot, setSlot] = useState<Piece['slot'] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const toast = useToast()
  const o = side.outfit
  const alts = useQuery({
    queryKey: ['alts', outfitKey(o), slot, occasion],
    queryFn: () => api.post<{ options: { garment_id: string; outfit: SuggestedOutfit }[] }>('/api/outfits/alternatives', { pieces: piecesIn(o!), slot, occasion }),
    enabled: Boolean(o && slot),
  })
  if (!o) return <div className="card flex aspect-[4/5] items-center justify-center p-4 text-center text-[15px] text-ink2">No second outfit fits yet. Add a few more pieces.</div>
  const save = async () => {
    setError(null)
    try {
      await api.post('/api/outfits', { pieces: piecesIn(o), occasion, reasons: o.reasons, source: 'compare', name: label })
      onChange({ ...side, saved: true })
      toast(`${label} saved`)
    } catch (e) {
      setError(e)
    }
  }
  return (
    <section aria-label={label}>
      <h2 className="section-title mb-3">{label}</h2>
      <FlatLay pieces={o.pieces} size="md" onPieceClick={(s) => setSlot((x) => (x === s ? null : s))} activeSlot={slot} />
      {slot && (
        <div className="mt-3">
          <p className="mb-2 text-[13px] text-ink2">Swap the {SLOT_LABEL[slot].toLowerCase()}</p>
          {alts.isLoading ? <Loading /> : alts.data?.options.length ? (
            <ul className="grid grid-cols-3 gap-1.5">
              {alts.data.options.slice(0, 6).map((op) => {
                const g = op.outfit.pieces.find((p) => p.slot === slot)?.garment
                return g ? (
                  <li key={op.garment_id}>
                    <button type="button" aria-label={`Use ${g.name} in ${label}`} className="card flex aspect-square w-full items-center justify-center p-1.5" onClick={() => { onChange({ outfit: op.outfit, saved: false }); setSlot(null) }}>
                      <GarmentImage garment={g} />
                    </button>
                  </li>
                ) : null
              })}
            </ul>
          ) : <p className="text-[13px] text-ink2">No other options go with the rest.</p>}
        </div>
      )}
      <div className="hidden md:block"><Reasons reasons={o.reasons} /></div>
      {error ? <div className="mt-2"><ErrorNote error={error} /></div> : null}
      <button type="button" className="btn-primary mt-4 w-full" onClick={save} disabled={side.saved}>{side.saved ? 'Saved' : 'Save outfit'}</button>
    </section>
  )
}
