import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Garment, SavedOutfit } from '@/lib/types'
import { OCCASIONS, WEEKDAYS, isoDate, occasionLabel, parseIso, useMe } from '@/lib/queries'
import { prepareUpload } from '@/lib/resize'
import { useToast } from '@/lib/toast'
import { ConfirmDialog, Dialog, EmptyState, ErrorNote, Field, Loading, PageHeader } from '@/components/ui'
import { FlatLay } from '@/components/garment'
import { GarmentPicker } from '@/components/GarmentPicker'
import { Insights } from '@/components/Insights'
import { CameraIcon } from '@/components/icons'

interface HistoryData { entries: SavedOutfit[]; months: string[] }
interface PhotoEntry { photo?: { id: string; status: string; crops: (string | null)[] } | null }
type Entry = SavedOutfit & PhotoEntry

export function entryLabel(e: { worn_on: string | null; name: string | null; occasion: string | null }) {
  const day = e.worn_on ? WEEKDAYS[parseIso(e.worn_on).getDay()] : ''
  return `${day} ${e.name && !e.name.startsWith('Plan for') ? e.name : occasionLabel(e.occasion)}`.trim()
}

function monthLabel(m: string) {
  return parseIso(`${m}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export default function History() {
  const [month, setMonth] = useState('')
  const q = useQuery({ queryKey: ['history', month], queryFn: () => api.get<HistoryData>(`/api/history${month ? `?month=${month}` : ''}`) })
  const [photoOpen, setPhotoOpen] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const [openEntry, setOpenEntry] = useState<Entry | null>(null)
  const [comparePick, setComparePick] = useState<string[] | null>(null)
  const navigate = useNavigate()

  const entries = (q.data?.entries ?? []) as Entry[]
  return (
    <>
      <PageHeader
        title="Outfit history."
        subtitle="What you wore, confirmed by you. Wear counts change only after you confirm."
        actions={
          <>
            <button type="button" className="btn-primary" onClick={() => setPhotoOpen(true)}><CameraIcon width={18} height={18} />Save an outfit photo</button>
            <button type="button" className="btn-secondary" onClick={() => setLogOpen(true)}>Log without a photo</button>
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:w-64">
          <Field label="Month" htmlFor="month">
            <select id="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">All months</option>
              {q.data?.months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </Field>
        </div>
        {entries.length > 1 && (
          <button type="button" className="btn-quiet" onClick={() => setComparePick([])}>Compare two looks</button>
        )}
      </div>
      {q.isLoading ? (
        <Loading label="Loading your history" />
      ) : q.error ? (
        <ErrorNote error={q.error} onRetry={() => q.refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState
          title={month ? 'Nothing logged this month.' : 'No outfits logged yet.'}
          body="Save a photo of what you wore and confirm the pieces, or pick them from your closet. Drape never counts a wear from a guess."
          action={<button type="button" className="btn-primary" onClick={() => setPhotoOpen(true)}>Save an outfit photo</button>}
        />
      ) : (
        <ul tabIndex={0} className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0" aria-label="Outfit history">
          {entries.map((e) => (
            <li key={e.id} className="w-[200px] shrink-0 snap-start md:w-auto">
              {comparePick ? (
                <button type="button" aria-pressed={comparePick.includes(e.id)} onClick={() => setComparePick((p) => (p!.includes(e.id) ? p!.filter((x) => x !== e.id) : [...p!, e.id].slice(-2)))} className={`block w-full rounded-card text-left ${comparePick.includes(e.id) ? 'ring-2 ring-accent' : ''}`} disabled={!e.pieces.length}>
                  <HistoryCard e={e} />
                </button>
              ) : (
                <button type="button" onClick={() => setOpenEntry(e)} className="block w-full rounded-card text-left" aria-label={`Open ${entryLabel(e)}`}>
                  <HistoryCard e={e} />
                </button>
              )}
              {e.status === 'needs_review' && e.photo && !comparePick && (
                <Link to={`/history/photos/${e.photo.id}`} className="btn-primary btn-sm mt-2 w-full">Review garment matches</Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {comparePick && (
        <div className="sticky bottom-20 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-card border border-line bg-bg p-3 md:bottom-4">
          <span className="text-[15px]">{comparePick.length} of 2 looks picked.</span>
          <button type="button" className="btn-primary btn-sm" disabled={comparePick.length !== 2} onClick={() => navigate(`/compare?a=${comparePick[0]}&b=${comparePick[1]}`)}>Compare</button>
          <button type="button" className="btn-quiet btn-sm" onClick={() => setComparePick(null)}>Cancel</button>
        </div>
      )}

      <section aria-labelledby="insights-title" className="mt-12">
        <h2 id="insights-title" className="section-title mb-4">Insights</h2>
        <Insights />
      </section>

      {photoOpen && <PhotoDialog onClose={() => setPhotoOpen(false)} onUploaded={(id) => navigate(`/history/photos/${id}`)} />}
      {logOpen && <ManualLog onClose={() => setLogOpen(false)} />}
      {openEntry && <EntryDialog entry={openEntry} onClose={() => setOpenEntry(null)} />}
    </>
  )
}

function HistoryCard({ e }: { e: Entry }) {
  return (
    <>
      {e.pieces.length ? (
        <FlatLay pieces={e.pieces} size="md" label={`${entryLabel(e)}: ${e.pieces.map((p) => p.garment?.name).join(', ')}`} />
      ) : (
        <div className="card grid aspect-[4/5] grid-cols-2 gap-2 p-3" aria-label="Garment crops from the photo" role="img">
          {e.photo?.crops.filter(Boolean).slice(0, 4).map((src, i) => (
            <span key={i} className="flex items-center justify-center rounded-btn bg-bg/60 p-1">
              <img src={src!} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
            </span>
          ))}
        </div>
      )}
      <span className="mt-2 block font-medium">{entryLabel(e)}</span>
      <span className={`flex items-center gap-1.5 text-[13px] ${e.status === 'needs_review' ? 'text-warn' : 'text-accent'}`}>
        <span aria-hidden className={`h-2 w-2 rounded-full ${e.status === 'needs_review' ? 'bg-warn' : 'bg-accent'}`} />
        {e.status === 'needs_review' ? 'Needs review' : 'Garments confirmed.'}
      </span>
    </>
  )
}

function PhotoDialog({ onClose, onUploaded }: { onClose: () => void; onUploaded: (photoId: string) => void }) {
  const { data: me } = useMe()
  const [file, setFile] = useState<File | null>(null)
  const [date, setDate] = useState(isoDate(new Date()))
  const [occasion, setOccasion] = useState('everyday')
  const [keep, setKeep] = useState<boolean>(me?.keep_original_photos ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const upload = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', await prepareUpload(file))
      fd.append('worn_on', date)
      fd.append('occasion', occasion)
      fd.append('keep_original', String(keep))
      const r = await api.post<{ id: string }>('/api/history/photos', fd)
      onUploaded(r.id)
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      title="Save an outfit photo."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary" onClick={upload} disabled={!file || busy}>{busy ? 'Finding your garments' : 'Find my garments'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[15px] text-ink2">Drape finds the clothes in the photo and suggests matches from your closet. You confirm each one before anything is counted.</p>
        <Field label="Photo" htmlFor="outfit-photo" hint="A full-length photo works best.">
          <input id="outfit-photo" type="file" accept="image/*" className="input py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day worn" htmlFor="worn-on">
            <input id="worn-on" type="date" className="input" max={isoDate(new Date())} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Occasion" htmlFor="photo-occasion">
            <select id="photo-occasion" className="input" value={occasion} onChange={(e) => setOccasion(e.target.value)}>
              {OCCASIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
        </div>
        <label className="flex min-h-[44px] items-start gap-3 text-[15px]">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-[rgb(var(--primary))]" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          <span>
            Keep my original photo
            <span className="block text-[13px] text-ink2">Off by default. Without it, the full photo is deleted after you confirm and only the garment crops are kept. Location data is always removed.</span>
          </span>
        </label>
        {error ? <ErrorNote error={error} /> : null}
      </div>
    </Dialog>
  )
}

function ManualLog({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(isoDate(new Date()))
  const [occasion, setOccasion] = useState('everyday')
  const [picked, setPicked] = useState<Garment[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const toast = useToast()
  if (picked === null)
    return <GarmentPicker open multiple title="What did you wear?" confirmLabel="Next" onClose={onClose} onDone={setPicked} />
  const slots = picked.map((g) => (g.category === 'accessory' ? 'accessory' : g.category))
  const clash = new Set(slots).size !== slots.length
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/outfits/wear', { pieces: picked.map((g) => ({ slot: g.category, garment_id: g.id })), occasion, worn_on: date, confirmed: true })
      await qc.invalidateQueries({ queryKey: ['history'] })
      await qc.invalidateQueries({ queryKey: ['insights'] })
      await qc.invalidateQueries({ queryKey: ['garments'] })
      toast('Outfit logged')
      onClose()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      title="Log what you wore."
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={() => setPicked(null)}>Change pieces</button>
          <button type="button" className="btn-primary" disabled={busy || clash} onClick={save}>Log these pieces as worn</button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[15px] text-ink2">{picked.map((g) => g.name).join(', ')}.</p>
        {clash && <p className="text-[15px] text-danger" role="alert">Pick one piece per kind, for example one top and one pair of shoes.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day worn" htmlFor="log-date">
            <input id="log-date" type="date" className="input" max={isoDate(new Date())} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Occasion" htmlFor="log-occasion">
            <select id="log-occasion" className="input" value={occasion} onChange={(e) => setOccasion(e.target.value)}>
              {OCCASIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
        </div>
        {error ? <ErrorNote error={error} /> : null}
      </div>
    </Dialog>
  )
}

function EntryDialog({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const resave = async () => {
    try {
      await api.post(`/api/history/${entry.id}/resave`)
      toast('Saved as a look')
      await qc.invalidateQueries({ queryKey: ['looks'] })
    } catch (e) {
      setError(e)
    }
  }
  const remove = async () => {
    try {
      await api.del(`/api/history/${entry.id}`)
      toast('Entry deleted')
      await qc.invalidateQueries({ queryKey: ['history'] })
      await qc.invalidateQueries({ queryKey: ['insights'] })
      await qc.invalidateQueries({ queryKey: ['garments'] })
      onClose()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog open title={entryLabel(entry) + '.'} onClose={onClose}>
      <p className="mb-4 text-[15px] text-ink2">
        {entry.worn_on && parseIso(entry.worn_on).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
      {entry.pieces.length > 0 && <FlatLay pieces={entry.pieces} size="md" />}
      <ul className="mt-4 space-y-1 text-[15px]">
        {entry.pieces.map((p) => <li key={p.garment_id}>{p.garment?.name}</li>)}
      </ul>
      {error ? <div className="mt-3"><ErrorNote error={error} /></div> : null}
      <div className="mt-6 flex flex-wrap gap-2">
        {entry.pieces.length > 0 && <button type="button" className="btn-primary" onClick={resave}>Save as a look</button>}
        {entry.status === 'needs_review' && entry.photo && <Link className="btn-primary" to={`/history/photos/${entry.photo.id}`}>Review garment matches</Link>}
        <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>Delete entry</button>
      </div>
      <ConfirmDialog open={confirmDelete} title="Delete this entry?" body="Its wear logs are removed too, so wear counts go down. Photos and crops for it are deleted." confirmLabel="Delete entry" danger onCancel={() => setConfirmDelete(false)} onConfirm={remove} />
    </Dialog>
  )
}
