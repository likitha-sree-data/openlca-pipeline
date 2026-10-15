import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ReviewItem } from '@/lib/types'
import { useToast } from '@/lib/toast'
import { Dialog, ErrorNote, Field } from '@/components/ui'
import { useStudy } from './Study'

export interface StudyAnswers { reasons: string[]; reason_other: string | null; confidence: number }

export function Scale({ name, label, low, high, value, onChange }: { name: string; label: string; low: string; high: string; value: number | null; onChange: (n: number) => void }) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <label key={n} className={`chip min-w-[44px] cursor-pointer justify-center ${value === n ? 'chip-active' : ''}`}>
            <input type="radio" className="sr-only" name={name} checked={value === n} onChange={() => onChange(n)} />
            {n}
          </label>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[12px] text-ink2"><span>1 {low}</span><span>7 {high}</span></div>
    </fieldset>
  )
}

/** Asked right after the decision, for study participants only. */
export function StudyQuestions({ decision, onClose, onSubmit }: { decision: 'save' | 'keep_browsing'; onClose: () => void; onSubmit: (a: StudyAnswers) => Promise<void> }) {
  const s = useStudy()
  const [reasons, setReasons] = useState<string[]>([])
  const [other, setOther] = useState('')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const needsOther = reasons.includes('other') && !other.trim()
  const submit = async () => {
    if (!confidence) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ reasons, reason_other: reasons.includes('other') ? other.trim() : null, confidence })
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      title={decision === 'save' ? 'Saving for 48 hours.' : 'Keeping browsing.'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Back</button>
          <button type="button" className="btn-primary" disabled={!confidence || needsOther || busy} onClick={submit}>Confirm my choice</button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-[15px] text-ink2">Two quick questions for the study. There are no right answers.</p>
        <fieldset>
          <legend className="label">What were your reasons? Pick any that apply.</legend>
          <div className="space-y-1">
            {s.data?.reasons.map((r) => (
              <label key={r.id} className="flex min-h-[40px] items-center gap-3 text-[15px]">
                <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--primary))]" checked={reasons.includes(r.id)} onChange={() => setReasons((x) => (x.includes(r.id) ? x.filter((y) => y !== r.id) : [...x, r.id]))} />
                {r.label}
              </label>
            ))}
          </div>
          {reasons.includes('other') && (
            <div className="mt-2">
              <Field label="Other reason" htmlFor="reason-other" error={needsOther ? 'Say a few words, or untick Other.' : undefined}>
                <input id="reason-other" className="input" maxLength={300} value={other} onChange={(e) => setOther(e.target.value)} />
              </Field>
            </div>
          )}
        </fieldset>
        <Scale name="confidence" label="How sure do you feel about this choice?" low="not at all sure" high="completely sure" value={confidence} onChange={setConfidence} />
        {error ? <ErrorNote error={error} /> : null}
      </div>
    </Dialog>
  )
}

/** Later purchase check for a Keep browsing decision. */
export function StudyFollowup({ review }: { review: ReviewItem }) {
  const [bought, setBought] = useState<'yes' | 'no' | 'unsure' | null>(null)
  const [still, setStill] = useState<number | null>(null)
  const [error, setError] = useState<unknown>(null)
  const qc = useQueryClient()
  const toast = useToast()
  const send = async () => {
    try {
      await api.post(`/api/study/reviews/${review.id}/followup`, { bought, still_want: still })
      toast('Thank you')
      await qc.invalidateQueries({ queryKey: ['review', review.id] })
    } catch (e) {
      setError(e)
    }
  }
  return (
    <section className="card mt-6 space-y-4 p-5" aria-labelledby="fu-title">
      <h2 id="fu-title" className="font-serif text-[19px]">A quick question.</h2>
      <fieldset>
        <legend className="label">Did you end up buying it?</legend>
        <div className="flex gap-2">
          {(['yes', 'no', 'unsure'] as const).map((b) => (
            <label key={b} className={`chip cursor-pointer ${bought === b ? 'chip-active' : ''}`}>
              <input type="radio" className="sr-only" name="bought" checked={bought === b} onChange={() => setBought(b)} />
              {b === 'yes' ? 'Yes' : b === 'no' ? 'No' : 'Not sure'}
            </label>
          ))}
        </div>
      </fieldset>
      <Scale name="still-want" label="Do you still want it?" low="not at all" high="very much" value={still} onChange={setStill} />
      {error ? <ErrorNote error={error} /> : null}
      <button type="button" className="btn-primary" disabled={!bought} onClick={send}>Send answer</button>
    </section>
  )
}

export default StudyQuestions
