import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { GarmentDetail as Detail, Status } from '@/lib/types'
import { formatFibers, parseFibers } from '@/lib/fibers'
import { useUnsavedGuard } from '@/lib/guard'
import { useToast } from '@/lib/toast'
import { occasionLabel, parseIso } from '@/lib/queries'
import { useAuth } from '@/lib/auth'
import { prepareUpload } from '@/lib/resize'
import { ConfirmDialog, ErrorNote, Field, Loading } from '@/components/ui'
import { GarmentImage, STATUS_LABEL } from '@/components/garment'
import { GarmentFields, garmentSchema } from '@/components/GarmentForm'
import { ChevronLeft } from '@/components/icons'

const schema = garmentSchema.extend({
  status: z.enum(['active', 'for_sale', 'donate', 'keepsake', 'archived']),
  wash: z.string().optional().default(''),
  dry: z.string().optional().default(''),
  iron: z.string().optional().default(''),
  dry_clean: z.boolean().optional().default(false),
})
type Values = z.infer<typeof schema>

const WASH = [['', 'Not set'], ['cold', 'Wash cold'], ['30', '30°C'], ['40', '40°C'], ['60', '60°C'], ['hand', 'Hand wash'], ['no', 'Do not wash']]
const DRY = [['', 'Not set'], ['tumble_low', 'Tumble dry low'], ['tumble', 'Tumble dry'], ['line', 'Line dry'], ['flat', 'Dry flat'], ['no_tumble', 'Do not tumble dry']]
const IRON = [['', 'Not set'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['no', 'Do not iron']]
const STATUSES: { id: Status; label: string; hint: string }[] = [
  { id: 'active', label: 'Keep wearing', hint: 'Included in outfit suggestions.' },
  { id: 'for_sale', label: 'Mark for sale', hint: 'Left out of suggestions.' },
  { id: 'donate', label: 'Mark for donation', hint: 'Left out of suggestions.' },
  { id: 'keepsake', label: 'Keep as a keepsake', hint: 'Kept for what it means. Still suggested now and then.' },
]

function toValues(g: Detail): Values {
  return {
    name: g.name,
    category: g.category,
    color_name: g.color_name ?? 'grey',
    formality: g.formality,
    warmth: g.warmth,
    seasons: g.seasons as Values['seasons'],
    fibers: formatFibers(g.fiber_content),
    price: g.price != null ? String(g.price) : '',
    purchased_on: g.purchased_on ?? '',
    status: g.status,
    wash: g.care?.wash ?? '',
    dry: g.care?.dry ?? '',
    iron: g.care?.iron ?? '',
    dry_clean: Boolean(g.care?.dry_clean),
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'Never'
  return parseIso(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function GarmentDetail() {
  const { id } = useParams()
  const q = useQuery({ queryKey: ['garment', id], queryFn: () => api.get<Detail>(`/api/garments/${id}`) })
  if (q.isLoading) return <Loading label="Loading garment" />
  if (q.error || !q.data)
    return (
      <div className="space-y-4">
        <ErrorNote error={q.error ?? 'That garment was not found.'} />
        <Link to="/closet" className="btn-secondary">Back to my wardrobe</Link>
      </div>
    )
  return <DetailView key={q.data.id + q.dataUpdatedAt} g={q.data} />
}

function DetailView({ g }: { g: Detail }) {
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const { config } = useAuth()
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(g) })
  const [error, setError] = useState<unknown>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showResale, setShowResale] = useState(false)
  const [labelBusy, setLabelBusy] = useState(false)
  const [labelNote, setLabelNote] = useState<string | null>(null)
  const labelRef = useRef<HTMLInputElement>(null)
  const dirty = form.formState.isDirty
  const guard = useUnsavedGuard(dirty && !form.formState.isSubmitting)

  useEffect(() => {
    form.reset(toValues(g))
  }, [g, form])

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['garment', g.id] })
    await qc.invalidateQueries({ queryKey: ['garments'] })
  }

  const save = form.handleSubmit(async (v) => {
    setError(null)
    try {
      const care: Record<string, unknown> = { dry_clean: v.dry_clean }
      if (v.wash) care.wash = v.wash
      if (v.dry) care.dry = v.dry
      if (v.iron) care.iron = v.iron
      await api.patch(`/api/garments/${g.id}`, {
        name: v.name,
        category: v.category,
        color_name: v.color_name,
        formality: Number(v.formality),
        warmth: Number(v.warmth),
        seasons: v.seasons,
        fiber_content: parseFibers(v.fibers ?? ''),
        care,
        status: v.status,
        needs_review: false,
        ...(v.price ? { price: Number(v.price.replace(',', '.')) } : { clear_price: true }),
        ...(v.purchased_on ? { purchased_on: v.purchased_on } : { clear_purchased_on: true }),
      })
      form.reset(v)
      toast('Changes saved')
      await refresh()
    } catch (e) {
      setError(e)
    }
  })

  const patchNow = async (body: Record<string, unknown>, message: string) => {
    try {
      await api.patch(`/api/garments/${g.id}`, body)
      toast(message)
      await refresh()
    } catch (e) {
      setError(e)
    }
  }

  const scanLabel = async (file: File | undefined) => {
    if (!file) return
    setLabelBusy(true)
    setLabelNote(null)
    try {
      const fd = new FormData()
      fd.append('file', await prepareUpload(file))
      const r = await api.post<{ care: Record<string, string | boolean>; fiber_content: { fiber: string; percent: number | null }[] }>(`/api/garments/${g.id}/care-label`, fd)
      const opts = { shouldDirty: true }
      if (r.care.wash) form.setValue('wash', String(r.care.wash), opts)
      if (r.care.dry) form.setValue('dry', String(r.care.dry), opts)
      if (r.care.iron) form.setValue('iron', String(r.care.iron), opts)
      if (typeof r.care.dry_clean === 'boolean') form.setValue('dry_clean', r.care.dry_clean, opts)
      if (r.fiber_content.length) form.setValue('fibers', formatFibers(r.fiber_content), opts)
      setLabelNote('The label was read. Check the fields below, then save.')
    } catch (e) {
      setLabelNote((e as Error).message)
    } finally {
      setLabelBusy(false)
      if (labelRef.current) labelRef.current.value = ''
    }
  }

  const donate = () => {
    const open = (url: string) => window.open(url, '_blank', 'noopener')
    if (!navigator.geolocation) return open('https://www.google.com/maps/search/clothing+donation+near+me')
    navigator.geolocation.getCurrentPosition(
      (pos) => open(`https://www.google.com/maps/search/clothing+donation/@${pos.coords.latitude.toFixed(3)},${pos.coords.longitude.toFixed(3)},13z`),
      () => open('https://www.google.com/maps/search/clothing+donation+near+me'),
      { timeout: 8000, maximumAge: 600000 },
    )
  }

  const v = form.watch()
  const advice = previewAdvice(v)
  return (
    <>
      {guard}
      <Link to="/closet" className="mb-3 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink">
        <ChevronLeft width={18} height={18} />
        My wardrobe
      </Link>
      <div className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="md:sticky md:top-24 md:self-start">
          <div className="card flex aspect-square items-center justify-center p-8">
            <GarmentImage large garment={g} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <Stat label="Worn" value={`${g.wear_count} ${g.wear_count === 1 ? 'time' : 'times'}`} />
            <Stat label="Last worn" value={fmtDate(g.last_worn)} />
            <Stat label="Cost per wear" value={g.cost_per_wear != null ? g.cost_per_wear.toFixed(2) : g.price != null ? 'Not worn yet' : 'Add a price'} />
            <Stat label="Outfits it works in" value={String(g.versatility ?? 0)} />
          </dl>
          <p className="mt-2 text-[13px] text-ink2">
            Wear counts only change when you confirm what you wore. In {g.saved_outfit_count} saved {g.saved_outfit_count === 1 ? 'look' : 'looks'}.
          </p>
        </div>

        <div>
          <h1 className="page-title">{g.name}</h1>
          <p className="mt-1 text-[15px] text-ink2">{STATUS_LABEL[g.status]}</p>

          {g.nudge.due && (
            <section aria-labelledby="nudge-title" className="card mt-6 p-5">
              <h2 id="nudge-title" className="font-serif text-[19px]">
                {g.nudge.never_worn ? `Not worn since you added it ${g.nudge.idle_days} days ago.` : `Not worn in ${g.nudge.idle_days} days.`}
              </h2>
              <p className="mt-1 text-[15px] text-ink2">You could style it into an outfit, pass it on, or keep it as it is. All are fine choices.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-primary btn-sm" onClick={() => navigate(`/?pin=${g.id}`)}>
                  Style it
                </button>
                <button type="button" className="btn-secondary btn-sm" aria-expanded={showResale} onClick={() => setShowResale((s) => !s)}>
                  Sell
                </button>
                <button type="button" className="btn-secondary btn-sm" onClick={donate}>
                  Donate
                </button>
                <button type="button" className="btn-quiet btn-sm" onClick={() => patchNow({ snooze_nudge: true }, 'Got it. We will not ask again for a while.')}>
                  Keep it
                </button>
              </div>
            </section>
          )}
          {(showResale || (!g.nudge.due && g.status === 'for_sale')) && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Resale searches">
              {g.resale_links.map((l) => (
                <li key={l.url}>
                  <a className="btn-secondary btn-sm" href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={save} noValidate className="mt-8 space-y-10">
            <section aria-labelledby="details-title">
              <h2 id="details-title" className="section-title mb-4">Details</h2>
              <GarmentFields form={form} />
            </section>

            <section aria-labelledby="care-title">
              <h2 id="care-title" className="section-title">Care</h2>
              <p className="mb-4 mt-1 text-[15px] text-ink2">{advice ?? 'Add care details from the label to get plain care advice.'}</p>
              <div className="grid gap-5 md:grid-cols-3">
                <Field label="Wash" htmlFor="care-wash">
                  <select id="care-wash" className="input" {...form.register('wash')}>
                    {WASH.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Dry" htmlFor="care-dry">
                  <select id="care-dry" className="input" {...form.register('dry')}>
                    {DRY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Field>
                <Field label="Iron" htmlFor="care-iron">
                  <select id="care-iron" className="input" {...form.register('iron')}>
                    {IRON.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Field>
              </div>
              <label className="mt-4 flex min-h-[44px] items-center gap-3 text-[15px]">
                <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--primary))]" {...form.register('dry_clean')} />
                Dry clean
              </label>
              <div className="mt-3">
                {config?.llm_provider && config.llm_provider !== 'none' ? (
                  <>
                  <input ref={labelRef} id="care-label" type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Care label photo" onChange={(e) => scanLabel(e.target.files?.[0])} />
                  <label htmlFor="care-label" className={`btn-secondary btn-sm cursor-pointer ${labelBusy ? 'pointer-events-none opacity-50' : ''}`}>
                    {labelBusy ? 'Reading the label' : 'Scan care label'}
                  </label>
                  </>
                ) : (
                  <p className="text-[13px] text-ink2">Scanning care labels needs an AI provider, which is not set up. Fill in the fields by hand.</p>
                )}
                {labelNote && <p className="mt-2 text-[15px] text-ink2" role="status">{labelNote}</p>}
              </div>
            </section>

            <section aria-labelledby="next-title">
              <h2 id="next-title" className="section-title mb-4">Next use</h2>
              <fieldset>
                <legend className="sr-only">What happens to this piece next</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {STATUSES.map((s) => (
                    <label key={s.id} className={`flex min-h-[44px] cursor-pointer gap-3 rounded-card border p-3 ${v.status === s.id ? 'border-primary bg-surface' : 'border-line'}`}>
                      <input type="radio" value={s.id} className="mt-1 h-4 w-4 accent-[rgb(var(--primary))]" {...form.register('status')} />
                      <span>
                        <span className="block text-[15px] font-medium">{s.label}</span>
                        <span className="block text-[13px] text-ink2">{s.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>

            {error ? <ErrorNote error={error} /> : null}
            <div className={`${dirty ? 'sticky bottom-20 z-10 md:bottom-4' : ''} flex flex-wrap gap-2 rounded-card bg-bg py-3`}>
              <button type="submit" className="btn-primary" disabled={!dirty || form.formState.isSubmitting}>
                Save changes
              </button>
              {dirty && (
                <button type="button" className="btn-secondary" onClick={() => form.reset(toValues(g))}>
                  Undo changes
                </button>
              )}
            </div>
          </form>

          <section aria-labelledby="history-title" className="mt-10">
            <h2 id="history-title" className="section-title mb-3">Wear history</h2>
            {g.wear_history.length === 0 ? (
              <p className="text-[15px] text-ink2">Not worn yet. Log an outfit in History, or tap Wear this today on Home.</p>
            ) : (
              <ul className="divide-y divide-line rounded-card border border-line">
                {g.wear_history.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
                    <span>{fmtDate(w.worn_on)}</span>
                    <span className="text-ink2">
                      {w.occasion ? occasionLabel(w.occasion) : 'Logged'} · {w.source === 'photo_confirmed' ? 'from a confirmed photo' : 'logged by you'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10 border-t border-line pt-6">
            <button type="button" className="btn-danger" onClick={() => setConfirmDelete(true)}>
              Delete garment
            </button>
          </section>
        </div>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${g.name}?`}
        body="This removes the garment, its photos and its wear history from Drape. Saved looks that use it will lose this piece. This cannot be undone."
        confirmLabel="Delete garment"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            form.reset(form.getValues())
            await api.del(`/api/garments/${g.id}`)
            setConfirmDelete(false)
            await qc.invalidateQueries({ queryKey: ['garments'] })
            toast(`${g.name} deleted`)
            navigate('/closet')
          } catch (e) {
            setConfirmDelete(false)
            setError(e)
          }
        }}
      />
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <dt className="text-[13px] text-ink2">{label}</dt>
      <dd className="mt-0.5 text-[17px] font-medium">{value}</dd>
    </div>
  )
}

function previewAdvice(v: Partial<Values>): string | null {
  const wash: Record<string, string> = { cold: 'Wash cold', '30': 'Wash at 30°C', '40': 'Wash at 40°C', '60': 'Wash at 60°C', hand: 'Hand wash', no: 'Do not wash' }
  const dry: Record<string, string> = { tumble_low: 'tumble dry low', tumble: 'tumble dry', line: 'dry on a line', flat: 'dry flat', no_tumble: 'do not tumble dry' }
  const iron: Record<string, string> = { low: 'iron on low', medium: 'iron on medium', high: 'iron on high', no: 'do not iron' }
  const parts: string[] = []
  if (v.dry_clean) parts.push(!v.wash || v.wash === 'no' ? 'Dry clean only' : 'Dry clean recommended')
  if (v.wash && wash[v.wash]) parts.push(wash[v.wash])
  if (v.dry && dry[v.dry]) parts.push(dry[v.dry])
  if (v.iron && iron[v.iron]) parts.push(iron[v.iron])
  if (!parts.length) return null
  const text = parts.join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
