import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { ErrorNote, Loading, PageHeader } from '@/components/ui'

interface CondStats { decisions: number; save_rate: number | null; mean_confidence: number | null; followups: number; bought_rate: number | null }
interface Summary {
  design: string
  target_sample_size: number
  participants: number
  active: number
  participants_by_arm: Record<string, number>
  by_condition: Record<'control' | 'treatment', CondStats>
}

const pct = (v: number | null) => (v == null ? 'No data' : `${Math.round(v * 100)}%`)

export default function Admin() {
  const q = useQuery({ queryKey: ['admin-summary'], queryFn: () => api.get<Summary>('/api/admin/study/summary') })
  const [error, setError] = useState<unknown>(null)
  const download = async (kind: 'wide' | 'long') => {
    setError(null)
    try {
      const blob = await api.blob(`/api/admin/study/export?kind=${kind}`)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `drape-study-${kind}-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (e) {
      setError(e)
    }
  }
  if (q.isLoading) return <Loading />
  if (q.error || !q.data) return <ErrorNote error={q.error} />
  const s = q.data
  const rows: [string, (c: CondStats) => string][] = [
    ['Decisions', (c) => String(c.decisions)],
    ['Saved for 48 hours', (c) => pct(c.save_rate)],
    ['Mean confidence (1 to 7)', (c) => (c.mean_confidence == null ? 'No data' : c.mean_confidence.toFixed(2))],
    ['Follow-ups answered', (c) => String(c.followups)],
    ['Bought at follow-up', (c) => pct(c.bought_rate)],
  ]
  return (
    <>
      <PageHeader title="Study admin." subtitle={`Design: ${s.design.replace(/_/g, ' ')}. ${s.participants} of ${s.target_sample_size} planned participants, ${s.active} active.`} />
      <section aria-labelledby="arms-title" className="mb-8">
        <h2 id="arms-title" className="section-title mb-3">Participants by arm</h2>
        <ul className="flex flex-wrap gap-3">
          {Object.entries(s.participants_by_arm).map(([arm, n]) => (
            <li key={arm} className="card px-4 py-3"><span className="text-[13px] text-ink2">{arm}</span><span className="block text-[22px] font-medium">{n}</span></li>
          ))}
          {Object.keys(s.participants_by_arm).length === 0 && <li className="text-[15px] text-ink2">No participants yet.</li>}
        </ul>
      </section>
      <section aria-labelledby="cond-title" className="mb-8 max-w-2xl">
        <h2 id="cond-title" className="section-title mb-3">By condition</h2>
        <table className="w-full text-left text-[15px]">
          <caption className="sr-only">Study outcomes by condition</caption>
          <thead>
            <tr className="border-b border-line text-[13px] text-ink2"><th className="py-2 font-normal">Measure</th><th className="py-2 text-right font-normal">Control</th><th className="py-2 text-right font-normal">Treatment</th></tr>
          </thead>
          <tbody>
            {rows.map(([label, f]) => (
              <tr key={label} className="border-b border-line">
                <th scope="row" className="py-2 font-normal">{label}</th>
                <td className="py-2 text-right tabular-nums">{f(s.by_condition.control)}</td>
                <td className="py-2 text-right tabular-nums">{f(s.by_condition.treatment)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section aria-labelledby="dl-title" className="space-y-3">
        <h2 id="dl-title" className="section-title">Download</h2>
        <p className="text-[15px] text-ink2">Pseudonymous participant codes only. No names, emails or images. Column meanings are in docs/codebook.md.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => download('wide')}>Download CSV, one row per decision</button>
          <button type="button" className="btn-secondary" onClick={() => download('long')}>Download CSV, tidy long format</button>
        </div>
        {error ? <ErrorNote error={error} /> : null}
      </section>
    </>
  )
}
