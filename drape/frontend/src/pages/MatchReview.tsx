import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Category, Garment } from '@/lib/types'
import { parseIso, occasionLabel } from '@/lib/queries'
import { useUnsavedGuard } from '@/lib/guard'
import { useToast } from '@/lib/toast'
import { ErrorNote, Loading, PageHeader } from '@/components/ui'
import { GarmentImage } from '@/components/garment'
import { GarmentPicker } from '@/components/GarmentPicker'
import { ChevronLeft } from '@/components/icons'

interface Candidate { garment_id: string; confidence: number; reason: string; garment: Garment | null }
interface Detection {
  id: string
  kind: string
  label: string
  crop_url: string | null
  color_name: string
  candidates: Candidate[]
  confidence: number
  low_confidence: boolean
  confirmed_garment_id?: string | null
  not_in_wardrobe?: boolean
}
interface Photo { id: string; status: string; keep_original: boolean; has_original: boolean; segmenter: string; worn_on: string; occasion: string; detections: Detection[] }

const FAMILY: Record<string, Category[]> = { upper: ['top', 'layer'], lower: ['bottom'], pants: ['bottom'], skirt: ['bottom'], dress: ['dress'], shoes: ['shoes'] }
const NOT_MINE = 'not-mine'

export default function MatchReview() {
  const { id } = useParams()
  const q = useQuery({ queryKey: ['photo', id], queryFn: () => api.get<Photo>(`/api/history/photos/${id}`) })
  if (q.isLoading) return <Loading label="Loading the matches" />
  if (q.error || !q.data) return <ErrorNote error={q.error ?? 'Not found'} />
  return <Review photo={q.data} />
}

function Review({ photo }: { photo: Photo }) {
  const initial = useMemo(() => {
    const m: Record<string, string | null> = {}
    for (const d of photo.detections) m[d.id] = !d.low_confidence && d.candidates[0] ? d.candidates[0].garment_id : null
    return m
  }, [photo])
  const [choice, setChoice] = useState<Record<string, string | null>>(initial)
  const [extra, setExtra] = useState<Garment[]>([])
  const [manual, setManual] = useState<Record<string, Garment>>({})
  const [picker, setPicker] = useState<{ det?: Detection; extra?: boolean } | null>(null)
  const [keep, setKeep] = useState(photo.keep_original)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const confirmed = photo.status === 'confirmed'
  const dirty = !confirmed && (JSON.stringify(choice) !== JSON.stringify(initial) || extra.length > 0)
  const guard = useUnsavedGuard(dirty && !busy)
  const missing = photo.detections.filter((d) => choice[d.id] === null || choice[d.id] === undefined)

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.post(`/api/history/photos/${photo.id}/confirm`, {
        matches: photo.detections.map((d) => ({ detection_id: d.id, garment_id: choice[d.id] === NOT_MINE ? null : choice[d.id] })),
        extra_garment_ids: extra.map((g) => g.id),
        keep_original: keep,
      })
      await Promise.all(['history', 'insights', 'garments', 'photo'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
      toast('Garments confirmed')
      navigate('/history')
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <>
      {guard}
      <PageHeader
        title="Review garment matches."
        subtitle={<>Worn {parseIso(photo.worn_on).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}, {occasionLabel(photo.occasion).toLowerCase()}. Pick the piece you wore for each part of the photo. Nothing is counted until you confirm.</>}
        back={<Link to="/history" className="mb-3 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ChevronLeft width={18} height={18} />Outfit history</Link>}
      />
      {photo.segmenter === 'bands' && !confirmed && (
        <p className="mb-5 rounded-card border border-line bg-raised p-3 text-[15px] text-ink2" role="note">
          The detailed clothing model is not running on this server, so Drape split the photo into rough areas. Please check every match.
        </p>
      )}
      {confirmed && <p className="mb-5 rounded-card bg-surface p-3 text-[15px]" role="status">These matches are confirmed. Wear counts have been updated.</p>}
      <ol className="space-y-6">
        {photo.detections.map((d, i) => (
          <li key={d.id} className="card grid gap-4 p-4 md:grid-cols-[160px_1fr] md:p-5">
            <div>
              <div className="flex aspect-square items-center justify-center rounded-btn bg-bg p-2">
                {d.crop_url ? <img src={d.crop_url} alt={`Area ${i + 1} of the photo: ${d.label.toLowerCase()}`} className="max-h-full max-w-full object-contain" /> : null}
              </div>
              <p className="mt-2 text-[15px] font-medium">{d.label}</p>
              <p className="text-[13px] text-ink2">Mostly {d.color_name}</p>
            </div>
            <fieldset disabled={confirmed}>
              <legend className="mb-2 flex flex-wrap items-center gap-2 text-[15px]">
                Which piece is this?
                {d.low_confidence && !confirmed && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-bg px-2 py-0.5 text-[13px] text-warn"><span className="h-2 w-2 rounded-full bg-warn" aria-hidden />Please check</span>
                )}
              </legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[...d.candidates.filter((c) => c.garment), ...(manual[d.id] && !d.candidates.some((c) => c.garment_id === manual[d.id].id) ? [{ garment_id: manual[d.id].id, confidence: -1, reason: 'Picked from your closet', garment: manual[d.id] }] : [])].map((c) => {
                  const on = choice[d.id] === c.garment_id || d.confirmed_garment_id === c.garment_id
                  return (
                    <label key={c.garment_id} className={`flex cursor-pointer flex-col rounded-card border bg-bg p-2 ${on ? 'border-primary ring-1 ring-primary' : 'border-line'}`}>
                      <input type="radio" className="sr-only" name={`match-${d.id}`} checked={on} onChange={() => setChoice((x) => ({ ...x, [d.id]: c.garment_id }))} />
                      <span className="flex aspect-square items-center justify-center p-1"><GarmentImage garment={c.garment!} /></span>
                      <span className="mt-1 text-tile">{c.garment!.name}</span>
                      <span className="text-[12px] text-ink2">{c.confidence >= 0 ? `${Math.round(c.confidence * 100)}% match. ${c.reason}` : c.reason}</span>
                    </label>
                  )
                })}
              </div>
              {!confirmed && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setPicker({ det: d })}>Pick another from my closet</button>
                  <label className={`chip cursor-pointer ${choice[d.id] === NOT_MINE ? 'chip-active' : ''}`}>
                    <input type="radio" className="sr-only" name={`match-${d.id}`} checked={choice[d.id] === NOT_MINE} onChange={() => setChoice((x) => ({ ...x, [d.id]: NOT_MINE }))} />
                    Not in my wardrobe
                  </label>
                </div>
              )}
              {confirmed && d.not_in_wardrobe && <p className="mt-2 text-[15px] text-ink2">Marked as not in your wardrobe.</p>}
            </fieldset>
          </li>
        ))}
      </ol>
      {!confirmed && (
        <div className="mt-6 space-y-4">
          <div>
            <button type="button" className="btn-quiet -ml-3" onClick={() => setPicker({ extra: true })}>Add a piece the photo missed</button>
            {extra.length > 0 && <p className="text-[15px] text-ink2">Also worn: {extra.map((g) => g.name).join(', ')}.</p>}
          </div>
          <label className="flex min-h-[44px] items-start gap-3 text-[15px]">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-[rgb(var(--primary))]" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            <span>Keep my original photo<span className="block text-[13px] text-ink2">If this stays off, the full photo is deleted when you confirm. Only the garment crops are kept.</span></span>
          </label>
          {error ? <ErrorNote error={error} /> : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" disabled={busy || missing.length > 0} onClick={confirm}>Confirm and record wears</button>
            {missing.length > 0 && <span className="text-[15px] text-ink2" role="status">Choose a piece or Not in my wardrobe for {missing.length} more {missing.length === 1 ? 'area' : 'areas'}.</span>}
          </div>
        </div>
      )}
      {picker && (
        <GarmentPicker
          open
          multiple={picker.extra}
          title={picker.extra ? 'Add pieces you also wore' : `Pick the ${picker.det!.label.toLowerCase()}`}
          categories={picker.det ? FAMILY[picker.det.kind] : undefined}
          onClose={() => setPicker(null)}
          onDone={(gs) => {
            if (picker.extra) setExtra(gs)
            else if (gs[0]) {
              setManual((m) => ({ ...m, [picker.det!.id]: gs[0] }))
              setChoice((x) => ({ ...x, [picker.det!.id]: gs[0].id }))
            }
            setPicker(null)
          }}
        />
      )}
    </>
  )
}
