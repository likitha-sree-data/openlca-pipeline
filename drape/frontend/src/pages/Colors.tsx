import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PALETTE, cap } from '@/lib/colors'
import { useUnsavedGuard } from '@/lib/guard'
import { useToast } from '@/lib/toast'
import { useAuth } from '@/lib/auth'
import { ErrorNote, Loading, PageHeader } from '@/components/ui'
import { ChevronLeft } from '@/components/icons'
import ColorProfilePhotos from './ColorProfilePhotos'

interface Prefs { favorites: string[]; avoid: string[] }

export default function Colors() {
  const q = useQuery({ queryKey: ['colors'], queryFn: () => api.get<Prefs>('/api/prefs/colors') })
  const { config } = useAuth()
  const [fav, setFav] = useState<string[]>([])
  const [avoid, setAvoid] = useState<string[]>([])
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const qc = useQueryClient()
  const toast = useToast()

  useEffect(() => {
    if (q.data) {
      setFav(q.data.favorites)
      setAvoid(q.data.avoid)
    }
  }, [q.data])
  const dirty = Boolean(q.data) && (JSON.stringify([...fav].sort()) !== JSON.stringify([...q.data!.favorites].sort()) || JSON.stringify([...avoid].sort()) !== JSON.stringify([...q.data!.avoid].sort()))
  const guard = useUnsavedGuard(dirty && !saving)

  const toggle = (list: 'fav' | 'avoid', name: string) => {
    const [mine, setMine, other, setOther] = list === 'fav' ? [fav, setFav, avoid, setAvoid] : [avoid, setAvoid, fav, setFav]
    if (mine.includes(name)) setMine(mine.filter((x) => x !== name))
    else {
      setMine([...mine, name])
      if (other.includes(name)) setOther(other.filter((x) => x !== name))
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.put('/api/prefs/colors', { favorites: fav, avoid })
      await qc.invalidateQueries({ queryKey: ['colors'] })
      await qc.invalidateQueries({ queryKey: ['suggest'] })
      toast('Color preferences saved')
    } catch (e) {
      setError(e)
    } finally {
      setSaving(false)
    }
  }

  const grid = (list: 'fav' | 'avoid', selected: string[], label: string) => (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8" aria-label={label}>
      {PALETTE.map((p) => {
        const on = selected.includes(p.name)
        return (
          <li key={p.name}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => toggle(list, p.name)}
              className={`flex w-full min-h-[44px] items-center gap-2 rounded-btn border px-2.5 py-2 text-left text-[13px] ${on ? 'border-primary bg-surface font-medium' : 'border-line hover:bg-surface'}`}
            >
              <span aria-hidden className="h-5 w-5 shrink-0 rounded-full border border-ink/15" style={{ background: p.hex }} />
              {cap(p.name)}
            </button>
          </li>
        )
      })}
    </ul>
  )

  return (
    <>
      {guard}
      <PageHeader
        title="Choose colors."
        subtitle="Suggestions lean a little toward colors you like and away from colors you avoid. They are a gentle nudge, never a rule."
        back={<Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-ink2 hover:text-ink"><ChevronLeft width={18} height={18} />Today's outfit</Link>}
      />
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorNote error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="fav-title">
            <h2 id="fav-title" className="section-title mb-3">Colors you like</h2>
            {grid('fav', fav, 'Colors you like')}
          </section>
          <section aria-labelledby="avoid-title">
            <h2 id="avoid-title" className="section-title mb-3">Colors to avoid</h2>
            {grid('avoid', avoid, 'Colors to avoid')}
          </section>
          {error ? <ErrorNote error={error} /> : null}
          <div className="flex gap-2">
            <button type="button" className="btn-primary" onClick={save} disabled={!dirty || saving}>Save colors</button>
            {dirty && <button type="button" className="btn-secondary" onClick={() => { setFav(q.data!.favorites); setAvoid(q.data!.avoid) }}>Undo changes</button>}
          </div>
          {config?.feature_color_profile && <ColorProfilePhotos onUseColors={(names) => setFav((f) => Array.from(new Set([...f, ...names])).filter((n) => !avoid.includes(n)).slice(0, 12))} />}
        </div>
      )}
    </>
  )
}
