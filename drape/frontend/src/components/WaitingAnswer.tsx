import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ReviewItem } from '@/lib/types'
import { useToast } from '@/lib/toast'
import { ErrorNote, Field } from './ui'
import { Scale } from '@/pages/StudyQuestions'

const LABEL = { bought: 'You bought it.', skipped: 'You skipped it.', thinking: 'Still thinking.', waiting: '' }

export function countdown(seconds: number): string {
  if (seconds <= 0) return 'Ready for your answer'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h} h ${m} min left` : `${m} min left`
}

/** "Still want it?" with Bought it, Skipped it, Still thinking and an optional note. */
export function WaitingAnswer({ review, onAnswered, askStillWant }: { review: ReviewItem; onAnswered?: (r: ReviewItem) => void; askStillWant?: boolean }) {
  const w = review.waiting!
  const [note, setNote] = useState(w.note ?? '')
  const [still, setStill] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const toast = useToast()
  const answer = async (status: 'bought' | 'skipped' | 'thinking') => {
    setBusy(true)
    setError(null)
    try {
      const r = await api.post<ReviewItem>(`/api/waiting/${w.id}/answer`, { status, note: note.trim() || null, still_want: still })
      await qc.invalidateQueries({ queryKey: ['reviews'] })
      await qc.invalidateQueries({ queryKey: ['review', review.id] })
      toast('Answer saved')
      onAnswered?.(r)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3">
      <p className="font-serif text-[19px]">Still want it?</p>
      {w.status !== 'waiting' && <p className="text-[15px] text-ink2">Your last answer: {LABEL[w.status]} You can change it.</p>}
      {askStillWant && <Scale name={`still-${w.id}`} label="How much do you still want it?" low="not at all" high="very much" value={still} onChange={setStill} />}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => answer('bought')}>Bought it</button>
        <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => answer('skipped')}>Skipped it</button>
        <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => answer('thinking')}>Still thinking</button>
      </div>
      <Field label="Note" htmlFor={`note-${w.id}`} hint="Optional. Anything you want to remember about this choice.">
        <input id={`note-${w.id}`} className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error ? <ErrorNote error={error} /> : null}
    </div>
  )
}

export function outcomeLabel(status: string): string {
  return LABEL[status as keyof typeof LABEL] || 'Waiting'
}
