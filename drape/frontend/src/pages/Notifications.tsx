import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { EmptyState, ErrorNote, Loading, PageHeader } from '@/components/ui'

interface Note { id: string; kind: string; title: string; body: string | null; link: string | null; read: boolean; emailed: boolean; created_at: string }

export default function Notifications() {
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<Note[]>('/api/notifications') })
  const qc = useQueryClient()
  useEffect(() => {
    if (q.data?.some((n) => !n.read)) {
      api.post('/api/notifications/read').then(() => qc.invalidateQueries({ queryKey: ['notifications', 'unread'] })).catch(() => {})
    }
  }, [q.data, qc])
  return (
    <>
      <PageHeader title="Notifications." subtitle="Reminders for items on your waiting list appear here. Email copies are optional, in settings." />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title="Nothing new." body="When an item you saved for 48 hours is ready, Drape asks here if you still want it." action={<Link to="/review" className="btn-secondary">Go to Review</Link>} />
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line">
          {q.data.map((n) => (
            <li key={n.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 font-medium">
                  {!n.read && <span className="h-2 w-2 rounded-full bg-primary" aria-label="New" />}
                  {n.title}
                </p>
                {n.body && <p className="text-[15px] text-ink2">{n.body}</p>}
                <p className="text-[13px] text-ink2">{new Date(n.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}{n.emailed ? '. Also sent by email.' : ''}</p>
              </div>
              {n.link && <Link to={n.link} className="btn-secondary btn-sm shrink-0">Answer</Link>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
