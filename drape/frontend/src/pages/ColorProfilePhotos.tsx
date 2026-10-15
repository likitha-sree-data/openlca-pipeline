import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { prepareUpload } from '@/lib/resize'
import { cap } from '@/lib/colors'
import { ConfirmDialog, ErrorNote, Loading } from '@/components/ui'

interface Photo { id: string; url: string; palette: { name: string; hex: string; share: number }[] }

/** Optional, behind a feature flag and explicit consent. Never needed for anything else. */
export default function ColorProfilePhotos({ onUseColors }: { onUseColors: (names: string[]) => void }) {
  const q = useQuery({ queryKey: ['color-photos'], queryFn: () => api.get<{ consented: boolean; photos: Photo[] }>('/api/account/color-photos') })
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [withdraw, setWithdraw] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: ['color-photos'] })
  const consent = async (granted: boolean) => {
    setError(null)
    try {
      await api.post('/api/account/consents', { kind: 'color_profile', granted })
      await qc.invalidateQueries({ queryKey: ['consents'] })
      await refresh()
    } catch (e) {
      setError(e)
    }
  }
  const upload = async (file?: File) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', await prepareUpload(file))
      await api.post('/api/account/color-photos', fd)
      await refresh()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  const remove = async (id: string) => {
    try {
      await api.del(`/api/account/color-photos/${id}`)
      await refresh()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <section aria-labelledby="cp-title" className="border-t border-line pt-8">
      <h2 id="cp-title" className="section-title">Color-profile photos</h2>
      <p className="mt-1 max-w-prose text-[15px] text-ink2">
        Optional. Add photos of outfits you feel good in. Drape picks out their main colors so you can add them to your favorites.
        Drape does not analyze faces, skin or hair. You can view and delete these photos at any time, and nothing else in Drape needs them.
      </p>
      {q.isLoading ? <Loading /> : !q.data?.consented ? (
        <button type="button" className="btn-secondary mt-4" onClick={() => consent(true)}>I agree, turn on color-profile photos</button>
      ) : (
        <div className="mt-4 space-y-4">
          <input id="cp-file" type="file" accept="image/*" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} aria-label="Color-profile photo" />
          <label htmlFor="cp-file" className={`btn-secondary cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>{busy ? 'Reading colors' : 'Add a photo'}</label>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {q.data.photos.map((p) => (
              <li key={p.id} className="card p-2">
                <img src={p.url} alt="Color-profile photo" className="aspect-square w-full rounded-btn object-cover" />
                <div className="mt-2 flex flex-wrap gap-1" aria-label="Colors found">
                  {p.palette.map((c) => <span key={c.hex} title={cap(c.name)} className="h-5 w-5 rounded-full border border-ink/15" style={{ background: c.hex }} />)}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button type="button" className="btn-quiet btn-sm px-2" onClick={() => onUseColors(p.palette.map((c) => c.name))}>Use these colors</button>
                  <button type="button" className="btn-quiet btn-sm px-2 text-danger" onClick={() => remove(p.id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn-quiet btn-sm -ml-3" onClick={() => setWithdraw(true)}>Withdraw consent and delete these photos</button>
        </div>
      )}
      {error ? <div className="mt-3"><ErrorNote error={error} /></div> : null}
      <ConfirmDialog open={withdraw} title="Withdraw consent?" body="All color-profile photos are deleted right away. Your color preferences stay as they are." confirmLabel="Withdraw and delete" danger onCancel={() => setWithdraw(false)} onConfirm={async () => { setWithdraw(false); await consent(false) }} />
    </section>
  )
}
