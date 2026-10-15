import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ReviewItem } from '@/lib/types'
import { useAuth } from '@/lib/auth'
import { ErrorNote, Loading } from '@/components/ui'
import { GarmentImage } from '@/components/garment'
import { WaitingAnswer, countdown } from '@/components/WaitingAnswer'
import { ChevronLeft } from '@/components/icons'
import { StudyFollowup, StudyQuestions, type StudyAnswers } from './StudyQuestions'

export default function ReviewDetail() {
  const { id } = useParams()
  const q = useQuery({ queryKey: ['review', id], queryFn: () => api.get<ReviewItem>(`/api/reviews/${id}`) })
  if (q.isLoading) return <Loading label="Comparing with your wardrobe" />
  if (q.error || !q.data) return <ErrorNote error={q.error ?? 'Not found'} />
  return <View r={q.data} />
}

function View({ r }: { r: ReviewItem }) {
  const qc = useQueryClient()
  const { config } = useAuth()
  const shownAt = useRef(new Date().toISOString())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  const treatment = r.condition === 'treatment'
  const studyQuestions = Boolean(config?.study_mode && r.study?.needs_questions)
  const [asking, setAsking] = useState<'save' | 'keep_browsing' | null>(null)

  const choose = (decision: 'save' | 'keep_browsing') => (studyQuestions ? setAsking(decision) : decide(decision))

  const decide = async (decision: 'save' | 'keep_browsing', answers?: StudyAnswers) => {
    setBusy(true)
    setError(null)
    try {
      await api.post(`/api/reviews/${r.id}/decision`, { decision, shown_at: shownAt.current, ...(answers ?? {}) })
      setAsking(null)
      await qc.invalidateQueries({ queryKey: ['review', r.id] })
      await qc.invalidateQueries({ queryKey: ['reviews'] })
    } catch (e) {
      setError(e)
      if (answers) throw e
    } finally {
      setBusy(false)
    }
  }

  const leftSeconds = r.waiting ? Math.max(0, Math.floor((new Date(r.waiting.due_at).getTime() - Date.now()) / 1000)) : 0
  return (
    <>
      <Link to="/review" className="mb-3 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ChevronLeft width={18} height={18} />Before you buy</Link>
      <div className="grid gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <div className="card flex aspect-square items-center justify-center p-8">
            {r.image_url && <img src={r.image_url} alt={r.title ?? 'The item you are considering'} className={r.cutout_ok ? 'max-h-[86%] max-w-[86%] object-contain' : 'h-[90%] w-[90%] rounded-card object-cover'} />}
          </div>
        </div>
        <div>
          <h1 className="page-title">Considering: {r.title}</h1>
          <p className="mt-2 text-[15px] text-ink2">
            {r.price != null && <>Price {r.price.toFixed(2)}. </>}
            {r.source_url && <a href={r.source_url} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">Product page</a>}
          </p>

          {treatment && (
            <>
              <section aria-labelledby="similar-title" className="mt-8">
                <h2 id="similar-title" className="section-title">Already in your wardrobe</h2>
                {r.similar && r.similar.length > 0 ? (
                  <ul className="mt-3 grid grid-cols-3 gap-3">
                    {r.similar.map((s) => (
                      <li key={s.garment_id}>
                        <Link to={`/closet/${s.garment_id}`} className="block">
                          <span className="card flex aspect-square items-center justify-center p-2"><GarmentImage garment={s.garment} /></span>
                          <span className="mt-1.5 block text-tile">{s.garment.name}</span>
                          <span className="block text-[13px] text-ink2">{s.reason}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[15px] text-ink2">Nothing in your closet is similar to this.</p>
                )}
              </section>
              <section aria-labelledby="works-title" className="mt-8">
                <h2 id="works-title" className="section-title">Works with</h2>
                {r.works_with && r.works_with.length > 0 ? (
                  <>
                    <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
                      {r.works_with.map((g) => (
                        <li key={g.id}>
                          <Link to={`/closet/${g.id}`} className="block">
                            <span className="card flex aspect-square items-center justify-center p-2"><GarmentImage garment={g} /></span>
                            <span className="mt-1.5 block text-tile">{g.name}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-[15px]">
                      This would add {r.new_outfit_count} new {r.new_outfit_count === 1 ? 'outfit' : 'outfits'} to what you already own.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-[15px] text-ink2">It does not pair with anything you own yet under Drape's color and dress-code rules.</p>
                )}
              </section>
            </>
          )}

          <section aria-label="Your choice" className="mt-8">
            {r.decision === null ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => choose('save')}>Save for 48 hours</button>
                  <button type="button" className="btn-secondary" disabled={busy} onClick={() => choose('keep_browsing')}>Keep browsing</button>
                </div>
                <p className="mt-2 text-[13px] text-ink2">Both are good choices. Saving gives you two days to think it over.</p>
              </>
            ) : r.decision === 'save' && r.waiting ? (
              <div className="card p-4">
                <p className="font-medium">Saved to your waiting list.</p>
                <p className="text-[15px] text-ink2">{r.waiting.status === 'waiting' ? countdown(leftSeconds) : `Answered: ${r.waiting.status}.`}</p>
                {(r.waiting.due || r.waiting.status !== 'waiting') && <div className="mt-4"><WaitingAnswer review={r} askStillWant={Boolean(r.study)} /></div>}
              </div>
            ) : (
              <p className="card p-4 text-[15px]">You chose to keep browsing.</p>
            )}
            {error ? <div className="mt-3"><ErrorNote error={error} /></div> : null}
          </section>
          {r.study?.needs_followup && r.decision === 'keep_browsing' && <StudyFollowup review={r} />}
          {asking && (
            <StudyQuestions
              decision={asking}
              onClose={() => setAsking(null)}
              onSubmit={async (a) => {
                await decide(asking, a)
              }}
            />
          )}
        </div>
      </div>
    </>
  )
}
