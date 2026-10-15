import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ReviewItem } from '@/lib/types'
import { prepareUpload } from '@/lib/resize'
import { ChipGroup, ErrorNote, Field, Loading, PageHeader } from '@/components/ui'
import { WaitingAnswer, countdown, outcomeLabel } from '@/components/WaitingAnswer'
import { CameraIcon } from '@/components/icons'

type Mode = 'photo' | 'link'

export default function Review() {
  const q = useQuery({ queryKey: ['reviews'], queryFn: () => api.get<ReviewItem[]>('/api/reviews'), refetchInterval: 60_000 })
  const [params] = useSearchParams()
  const focus = params.get('waiting')
  useEffect(() => {
    if (focus && q.data) document.getElementById(`waiting-${focus}`)?.scrollIntoView({ block: 'center' })
  }, [focus, q.data])

  const waiting = (q.data ?? []).filter((r) => r.waiting)
  const past = (q.data ?? []).filter((r) => !r.waiting)
  return (
    <>
      <PageHeader title="Before you buy." subtitle="Add a photo or paste a product link. Drape shows what you already own that is similar, and what it would go with. The choice is yours." />
      <NewReview />
      <section aria-labelledby="waiting-title" className="mt-12">
        <h2 id="waiting-title" className="section-title">Waiting list</h2>
        <p className="mt-1 text-[15px] text-ink2">Items you saved for 48 hours. When the time is up, Drape asks if you still want them.</p>
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <ErrorNote error={q.error} onRetry={() => q.refetch()} />
        ) : waiting.length === 0 ? (
          <p className="mt-4 text-[15px] text-ink2">Nothing saved yet. Saving for 48 hours gives you time to decide without pressure.</p>
        ) : (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {waiting.map((r) => (
              <li key={r.id} id={`waiting-${r.waiting!.id}`} className={`card flex gap-4 p-4 ${focus === r.waiting!.id ? 'ring-2 ring-accent' : ''}`}>
                <Link to={`/review/${r.id}`} className="flex h-24 w-24 shrink-0 items-center justify-center rounded-btn bg-bg p-2" aria-label={`Open ${r.title}`}>
                  {r.image_url && <img src={r.image_url} alt="" className={r.cutout_ok ? 'max-h-full max-w-full object-contain' : 'h-full w-full rounded-btn object-cover'} />}
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.title}</p>
                  <p className="text-[13px] text-ink2">
                    {r.waiting!.status === 'waiting' ? countdown(r.waiting!.seconds_left) : outcomeLabel(r.waiting!.status)}
                    {r.waiting!.note ? `. ${r.waiting!.note}` : ''}
                  </p>
                  {r.waiting!.due || r.waiting!.status !== 'waiting' ? (
                    <div className="mt-3"><WaitingAnswer review={r} /></div>
                  ) : (
                    <Link to={`/review/${r.id}`} className="mt-2 inline-block text-[15px] text-accent underline-offset-2 hover:underline">See the comparison</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {past.length > 0 && (
        <section aria-labelledby="past-title" className="mt-12">
          <h2 id="past-title" className="section-title">Earlier checks</h2>
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
            {past.map((r) => (
              <li key={r.id}>
                <Link to={`/review/${r.id}`} className="block">
                  <span className="card flex aspect-square items-center justify-center p-3">
                    {r.image_url && <img src={r.image_url} alt="" className={r.cutout_ok ? 'max-h-[82%] max-w-[82%] object-contain' : 'h-[86%] w-[86%] rounded-btn object-cover'} />}
                  </span>
                  <span className="mt-1.5 block text-tile">{r.title}</span>
                  <span className="block text-[13px] text-ink2">{r.decision === 'keep_browsing' ? 'You kept browsing' : 'Not decided yet'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function NewReview() {
  const [mode, setMode] = useState<Mode>('photo')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (mode === 'photo' && !file) return setError('Choose a photo or screenshot of the item.')
    if (mode === 'link' && !/^https?:\/\//i.test(url.trim())) return setError('Paste a full link that starts with https://')
    setBusy(true)
    try {
      const fd = new FormData()
      if (mode === 'photo' && file) fd.append('file', await prepareUpload(file))
      if (mode === 'link') fd.append('url', url.trim())
      if (title.trim()) fd.append('title', title.trim())
      if (price.trim()) fd.append('price', price.trim())
      const r = await api.post<ReviewItem>('/api/reviews', fd)
      await qc.invalidateQueries({ queryKey: ['reviews'] })
      navigate(`/review/${r.id}`)
    } catch (err) {
      setError(err)
      if (mode === 'link') setMode('link')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card p-5 md:p-6" aria-labelledby="new-title" noValidate>
      <h2 id="new-title" className="section-title mb-4">Check an item</h2>
      <ChipGroup label="How to add the item" options={[{ id: 'photo', label: 'Add a photo' }, { id: 'link', label: 'Paste a link' }] as const} value={mode} onChange={setMode} />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          {mode === 'photo' ? (
            <Field label="Photo or screenshot" htmlFor="review-photo" hint="A product photo on a plain background works best.">
              <input id="review-photo" type="file" accept="image/*" className="input py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
          ) : (
            <Field label="Product link" htmlFor="review-url" hint="Drape reads the page title and main image. Some shops block this; a screenshot always works.">
              <input id="review-url" type="url" inputMode="url" className="input" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
          )}
        </div>
        <Field label="Name" htmlFor="review-title" hint="Optional. Drape suggests one.">
          <input id="review-title" className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Price" htmlFor="review-price" hint="Optional.">
          <input id="review-price" className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>
      {error ? (
        <div className="mt-4 space-y-2">
          <ErrorNote error={error} />
          {mode === 'link' && (
            <button type="button" className="btn-quiet btn-sm" onClick={() => setMode('photo')}>Use a screenshot instead</button>
          )}
        </div>
      ) : null}
      <button type="submit" className="btn-primary mt-5" disabled={busy}>
        <CameraIcon width={18} height={18} />
        {busy ? 'Comparing with your wardrobe' : 'Compare with my wardrobe'}
      </button>
    </form>
  )
}

