import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Markdown } from '@/lib/markdown'
import { useToast } from '@/lib/toast'
import { ConfirmDialog, ErrorNote, Loading, PageHeader } from '@/components/ui'

export interface StudyStatus {
  consent_version: string
  consent_text: string
  enrolled: boolean
  withdrawn: boolean
  participant_code: string | null
  reasons: { id: string; label: string }[]
  confidence_scale: [number, number]
  still_want_scale: [number, number]
  tasks: string[]
}

export function useStudy(enabled = true) {
  return useQuery({ queryKey: ['study'], queryFn: () => api.get<StudyStatus>('/api/study'), enabled, staleTime: 60_000 })
}

const TASK_LABEL: Record<string, string> = { setup: 'Setup', outfit_choice: 'Outfit choices', purchase_review: 'Purchase review', photo_matching: 'Photo matching' }

export default function Study() {
  const q = useStudy()
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [leaving, setLeaving] = useState(false)
  const [deleteData, setDeleteData] = useState(false)
  const qc = useQueryClient()
  const toast = useToast()
  if (q.isLoading) return <Loading />
  if (q.error || !q.data) return <ErrorNote error={q.error} />
  const s = q.data

  const join = async () => {
    setError(null)
    try {
      await api.post('/api/study/consent', { version: s.consent_version, agree })
      await qc.invalidateQueries({ queryKey: ['study'] })
      await qc.invalidateQueries({ queryKey: ['consents'] })
      toast('Thank you for joining the study')
    } catch (e) {
      setError(e)
    }
  }
  const leave = async () => {
    setLeaving(false)
    try {
      await api.post('/api/study/withdraw', { delete_data: deleteData })
      await qc.invalidateQueries({ queryKey: ['study'] })
      toast(deleteData ? 'You left the study and your study data was deleted' : 'You left the study')
    } catch (e) {
      setError(e)
    }
  }

  return (
    <>
      <PageHeader title="Study participation." subtitle={s.enrolled ? `You are taking part. Your participant code is ${s.participant_code}.` : undefined} />
      <div className="max-w-2xl space-y-6">
        {!s.enrolled && (
          <>
            <div className="card p-5"><Markdown source={s.consent_text} /></div>
            <p className="text-[13px] text-ink2">Consent version {s.consent_version}.</p>
            {s.withdrawn ? (
              <p className="text-[15px]">You left the study earlier. Nothing more is recorded.</p>
            ) : (
              <>
                <label className="flex min-h-[44px] items-start gap-3 text-[15px]">
                  <input type="checkbox" className="mt-1 h-5 w-5 accent-[rgb(var(--primary))]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  I have read this and I agree to take part.
                </label>
                <button type="button" className="btn-primary" disabled={!agree} onClick={join}>Join the study</button>
              </>
            )}
          </>
        )}
        {s.enrolled && (
          <>
            <p className="text-[15px] text-ink2">Use Drape as you normally would. When you check an item before buying, Drape asks a few short questions, and again two days later.</p>
            <Timers tasks={s.tasks} />
            <div className="border-t border-line pt-6">
              <button type="button" className="btn-danger" onClick={() => setLeaving(true)}>Leave the study</button>
            </div>
          </>
        )}
        {error ? <ErrorNote error={error} /> : null}
      </div>
      <ConfirmDialog
        open={leaving}
        title="Leave the study?"
        body={
          <div className="space-y-3">
            <p>Nothing more will be recorded. Drape keeps working the same way.</p>
            <label className="flex items-start gap-3 text-ink">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[rgb(var(--primary))]" checked={deleteData} onChange={(e) => setDeleteData(e.target.checked)} />
              Also delete the study data recorded so far
            </label>
          </div>
        }
        confirmLabel="Leave the study"
        danger
        onCancel={() => setLeaving(false)}
        onConfirm={leave}
      />
    </>
  )
}

/** Optional timers for observed usability sessions. */
function Timers({ tasks }: { tasks: string[] }) {
  const [running, setRunning] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState<Record<string, number>>({})
  const [error, setError] = useState<unknown>(null)
  const act = async (task: string, action: 'start' | 'stop', completed?: boolean) => {
    setError(null)
    try {
      const r = await api.post<{ running: boolean; seconds: number }>('/api/study/timers', { task, action, completed })
      setRunning((x) => ({ ...x, [task]: r.running }))
      if (!r.running) setDone((x) => ({ ...x, [task]: r.seconds }))
    } catch (e) {
      setError(e)
    }
  }
  return (
    <section aria-labelledby="timers-title" className="card p-5">
      <h2 id="timers-title" className="font-serif text-[19px]">Session timers</h2>
      <p className="mt-1 text-[13px] text-ink2">For observed sessions only. The researcher starts and stops each task.</p>
      <ul className="mt-4 divide-y divide-line">
        {tasks.map((t) => (
          <li key={t} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className="text-[15px]">{TASK_LABEL[t] ?? t}{done[t] != null && !running[t] ? <span className="text-ink2">: {done[t]} s</span> : null}</span>
            {running[t] ? (
              <span className="flex gap-2">
                <button type="button" className="btn-secondary btn-sm" onClick={() => act(t, 'stop', true)}>Done</button>
                <button type="button" className="btn-quiet btn-sm" onClick={() => act(t, 'stop', false)}>Gave up</button>
              </span>
            ) : (
              <button type="button" className="btn-secondary btn-sm" onClick={() => act(t, 'start')}>Start</button>
            )}
          </li>
        ))}
      </ul>
      {error ? <div className="mt-3"><ErrorNote error={error} /></div> : null}
    </section>
  )
}
