import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errorText } from '@/lib/api'
import type { Draft } from '@/lib/types'
import { prepareUpload } from '@/lib/resize'
import { parseFibers } from '@/lib/fibers'
import { useUnsavedGuard } from '@/lib/guard'
import { useToast } from '@/lib/toast'
import { ErrorNote, Field, Loading, PageHeader } from '@/components/ui'
import { GarmentImage } from '@/components/garment'
import { GarmentFields, garmentSchema, type GarmentFormValues } from '@/components/GarmentForm'
import { CameraIcon, ChevronLeft, PlusIcon } from '@/components/icons'

const CHUNK = 6
const EDIT_KEY = (id: string) => `drape.draft-edit.${id}`

function readEdit(id: string): GarmentFormValues | null {
  try {
    const raw = localStorage.getItem(EDIT_KEY(id))
    return raw ? (JSON.parse(raw) as GarmentFormValues) : null
  } catch {
    return null
  }
}
function writeEdit(id: string, v: GarmentFormValues) {
  try {
    localStorage.setItem(EDIT_KEY(id), JSON.stringify(v))
  } catch {
    /* storage full or blocked */
  }
}
function clearEdit(id: string) {
  try {
    localStorage.removeItem(EDIT_KEY(id))
  } catch {
    /* ignore */
  }
}

function defaults(d: Draft): GarmentFormValues {
  return {
    name: d.name ?? '',
    category: d.category ?? 'top',
    color_name: d.color_name ?? 'grey',
    formality: d.formality ?? 1,
    warmth: d.warmth ?? 2,
    seasons: (d.seasons ?? []) as GarmentFormValues['seasons'],
    fibers: d.fiber_guess ?? '',
    price: '',
    purchased_on: '',
  }
}

function toBody(d: Draft, v: GarmentFormValues, reviewed: boolean) {
  return {
    draft_id: d.id,
    name: v.name.trim(),
    category: v.category,
    color_name: v.color_name,
    formality: Number(v.formality),
    warmth: Number(v.warmth),
    seasons: v.seasons,
    fiber_content: parseFibers(v.fibers ?? ''),
    price: v.price ? Number(v.price.replace(',', '.')) : null,
    purchased_on: v.purchased_on || null,
    reviewed,
  }
}

const HINTS = [
  { id: '', label: 'Mixed, let Drape sort them' },
  { id: 'top', label: 'These are all tops' },
  { id: 'bottom', label: 'These are all bottoms' },
  { id: 'layer', label: 'These are all layers' },
  { id: 'dress', label: 'These are all dresses' },
  { id: 'shoes', label: 'These are all shoes' },
  { id: 'accessory', label: 'These are all accessories' },
]

export default function AddGarment() {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const drafts = useQuery({ queryKey: ['drafts'], queryFn: () => api.get<Draft[]>('/api/drafts') })
  const [hint, setHint] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [notices, setNotices] = useState<Draft[]>([])
  const [scanError, setScanError] = useState<unknown>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const cameraRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<HTMLInputElement>(null)

  const list = useMemo(() => drafts.data ?? [], [drafts.data])
  const current = list.find((d) => d.id === currentId) ?? list[0] ?? null
  const guard = useUnsavedGuard(list.length > 0 || progress !== null)

  const scanFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const all = Array.from(files)
    setScanError(null)
    setNotices([])
    setProgress({ done: 0, total: all.length })
    const skipped: Draft[] = []
    let firstNew: string | null = null
    try {
      for (let i = 0; i < all.length; i += CHUNK) {
        const chunk = all.slice(i, i + CHUNK)
        const prepared = await Promise.all(chunk.map(prepareUpload))
        const fd = new FormData()
        prepared.forEach((f) => fd.append('files', f, f.name))
        if (hint) fd.append('hint', hint)
        const res = await api.post<{ results: Draft[] }>('/api/scan', fd)
        for (const r of res.results) {
          if (r.status !== 'ready') skipped.push(r)
          else if (!firstNew) firstNew = r.id
        }
        setProgress({ done: Math.min(all.length, i + chunk.length), total: all.length })
        await qc.invalidateQueries({ queryKey: ['drafts'] })
      }
    } catch (e) {
      setScanError(e)
    } finally {
      setProgress(null)
      setNotices(skipped)
      if (firstNew) setCurrentId(firstNew)
      if (cameraRef.current) cameraRef.current.value = ''
      if (filesRef.current) filesRef.current.value = ''
    }
  }

  const afterRemove = useCallback(
    async (id: string) => {
      clearEdit(id)
      const idx = list.findIndex((d) => d.id === id)
      const next = list[idx + 1] ?? list[idx - 1] ?? null
      setCurrentId(next?.id ?? null)
      await qc.invalidateQueries({ queryKey: ['drafts'] })
      await qc.invalidateQueries({ queryKey: ['garments'] })
    },
    [list, qc],
  )

  const saveAll = async () => {
    setBusy(true)
    setScanError(null)
    try {
      for (const d of list) {
        const edit = readEdit(d.id)
        await api.post('/api/garments', toBody(d, edit ?? defaults(d), Boolean(edit)))
        clearEdit(d.id)
        setSavedCount((n) => n + 1)
      }
      toast(`Saved ${list.length} ${list.length === 1 ? 'garment' : 'garments'}`)
    } catch (e) {
      setScanError(e)
    } finally {
      setBusy(false)
      setCurrentId(null)
      await qc.invalidateQueries({ queryKey: ['drafts'] })
      await qc.invalidateQueries({ queryKey: ['garments'] })
    }
  }

  return (
    <>
      {guard}
      <PageHeader
        title="Add garment."
        subtitle="Save a photo and review its details. Nothing is added to your closet until you press Save."
        back={
          <Link to="/closet" className="mb-3 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink">
            <ChevronLeft width={18} height={18} />
            My wardrobe
          </Link>
        }
      />

      <section aria-labelledby="pick-title" className="card mb-8 p-5 md:p-6">
        <h2 id="pick-title" className="section-title">
          {list.length ? 'Add more photos' : 'Take or choose photos'}
        </h2>
        <p className="mt-1 text-[15px] text-ink2">Lay each piece flat on a plain bed or floor in good light. You can choose many photos at once.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <Field label="Sorting" htmlFor="hint" hint="Optional. Pick a category when every photo is the same kind of piece.">
            <select id="hint" className="input" value={hint} onChange={(e) => setHint(e.target.value)}>
              {HINTS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="md:pb-6">
            <input ref={cameraRef} id="camera-input" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => scanFiles(e.target.files)} disabled={progress !== null} />
            <label htmlFor="camera-input" className={`btn-secondary w-full cursor-pointer ${progress ? 'pointer-events-none opacity-50' : ''}`}>
              <CameraIcon width={18} height={18} />
              Take a photo
            </label>
          </div>
          <div className="md:pb-6">
            <input ref={filesRef} id="files-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="sr-only" onChange={(e) => scanFiles(e.target.files)} disabled={progress !== null} aria-describedby="files-help" />
            <label htmlFor="files-input" className={`btn-primary w-full cursor-pointer ${progress ? 'pointer-events-none opacity-50' : ''}`}>
              <PlusIcon width={18} height={18} />
              Choose photos
            </label>
            <span id="files-help" className="sr-only">Choose one or more photos of garments</span>
          </div>
        </div>
        {progress && (
          <div className="mt-4" role="status" aria-live="polite">
            <div className="mb-1.5 flex justify-between text-sm text-ink2">
              <span>
                Scanning {progress.done} of {progress.total} {progress.total === 1 ? 'photo' : 'photos'}
              </span>
              <span>{Math.round((progress.done / progress.total) * 100)}%</span>
            </div>
            <progress className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-accent [&::-moz-progress-bar]:bg-accent" max={progress.total} value={progress.done} aria-label="Scan progress" />
          </div>
        )}
        {scanError ? <div className="mt-4"><ErrorNote error={scanError} /></div> : null}
        {notices.length > 0 && (
          <ul className="mt-4 space-y-1 text-[15px] text-ink2" aria-label="Photos that were not added">
            {notices.map((n, i) => (
              <li key={i}>
                <span className="font-medium text-ink">{n.filename}</span>: {n.error}
              </li>
            ))}
          </ul>
        )}
      </section>

      {drafts.isLoading ? (
        <Loading label="Loading your photos" />
      ) : drafts.error ? (
        <ErrorNote error={drafts.error} onRetry={() => drafts.refetch()} />
      ) : current ? (
        <section aria-labelledby="review-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="review-title" className="section-title">
              Review details
            </h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-ink2">
                {list.indexOf(current) + 1} of {list.length} to review
              </span>
              {list.length > 1 && (
                <button type="button" className="btn-quiet btn-sm" onClick={saveAll} disabled={busy}>
                  Save all {list.length}
                </button>
              )}
            </div>
          </div>
          {list.length > 1 && (
            <ul className="scrollbar-none -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Photos to review">
              {list.map((d, i) => (
                <li key={d.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setCurrentId(d.id)}
                    aria-label={`Review photo ${i + 1}: ${d.name}`}
                    aria-current={d.id === current.id}
                    className={`card relative flex h-16 w-16 items-center justify-center p-1.5 ${d.id === current.id ? 'ring-2 ring-accent' : ''}`}
                  >
                    <GarmentImage garment={{ name: d.name ?? '', category: d.category ?? 'top', cutout_ok: d.cutout_ok ?? true, thumb_url: d.thumb_url }} />
                    {d.needs_review && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-warn" aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <DraftEditor
            key={current.id}
            draft={current}
            busy={busy}
            onSaved={async (name) => {
              setSavedCount((n) => n + 1)
              toast(`Saved ${name}`)
              await afterRemove(current.id)
            }}
            onDiscarded={async () => {
              toast('Photo discarded')
              await afterRemove(current.id)
            }}
          />
        </section>
      ) : savedCount > 0 ? (
        <div className="card flex flex-col items-start gap-3 p-6">
          <h2 className="section-title">All saved.</h2>
          <p className="text-[15px] text-ink2">
            {savedCount} {savedCount === 1 ? 'piece was' : 'pieces were'} added to your closet.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => navigate('/closet')}>
              See my wardrobe
            </button>
            <button type="button" className="btn-secondary" onClick={() => filesRef.current?.click()}>
              Add more
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}

function DraftEditor({ draft, busy, onSaved, onDiscarded }: { draft: Draft; busy: boolean; onSaved: (name: string) => void; onDiscarded: () => void }) {
  const stored = readEdit(draft.id)
  const form = useForm<GarmentFormValues>({ resolver: zodResolver(garmentSchema), defaultValues: stored ?? defaults(draft) })
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const sub = form.watch((v) => writeEdit(draft.id, v as GarmentFormValues))
    return () => sub.unsubscribe()
  }, [form, draft.id])

  const save = form.handleSubmit(async (v) => {
    setSaving(true)
    setError(null)
    try {
      await api.post('/api/garments', toBody(draft, v, true))
      onSaved(v.name)
    } catch (e) {
      setError(e)
    } finally {
      setSaving(false)
    }
  })

  const discard = async () => {
    setSaving(true)
    try {
      await api.del(`/api/drafts/${draft.id}`)
      onDiscarded()
    } catch (e) {
      setError(e)
    } finally {
      setSaving(false)
    }
  }

  const unsure = draft.needs_review && draft.cutout_ok
  return (
    <form onSubmit={save} className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" noValidate aria-label={`Details for ${draft.name}`}>
      <div>
        <div className="card flex aspect-square items-center justify-center p-6">
          <GarmentImage large garment={{ name: draft.name ?? '', category: (form.watch('category') ?? draft.category) as Draft['category'] & string, cutout_ok: draft.cutout_ok ?? true, image_url: draft.image_url, thumb_url: draft.thumb_url }} />
        </div>
        <div className="mt-3 space-y-2 text-[15px]">
          {!draft.cutout_ok && (
            <p className="rounded-card border border-line bg-raised p-3 text-ink2" role="note">
              The background could not be removed, so the photo is kept as a card. Tip: {draft.tips?.[0] ?? 'Lay it flat on a plain bed or floor.'}
            </p>
          )}
          {unsure && (
            <p className="flex items-start gap-2 rounded-card border border-line bg-raised p-3 text-ink2" role="note">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warn" aria-hidden />
              Drape was not sure about the category. Please check it.
            </p>
          )}
          {draft.near_duplicate && (
            <p className="rounded-card border border-line bg-raised p-3 text-ink2" role="note">
              This looks a lot like your <Link className="underline" to={`/closet/${draft.near_duplicate.id}`}>{draft.near_duplicate.name}</Link>. If it is a second one, save it anyway.
            </p>
          )}
        </div>
      </div>
      <div>
        <GarmentFields form={form} />
        {error ? <div className="mt-4"><ErrorNote error={errorText(error)} /></div> : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="submit" className="btn-primary" disabled={saving || busy}>
            Save
          </button>
          <button type="button" className="btn-secondary" onClick={discard} disabled={saving || busy}>
            Discard photo
          </button>
        </div>
      </div>
    </form>
  )
}
