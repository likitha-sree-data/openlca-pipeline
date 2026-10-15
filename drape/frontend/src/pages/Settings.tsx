import { forwardRef, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Profile } from '@/lib/types'
import { useAuth } from '@/lib/auth'
import { useMe } from '@/lib/queries'
import { useUnsavedGuard } from '@/lib/guard'
import { useToast } from '@/lib/toast'
import { Dialog, ErrorNote, Field, Loading, PageHeader, Segmented } from '@/components/ui'

const schema = z.object({
  display_name: z.string().max(80, 'Keep it under 80 characters.'),
  units: z.enum(['c', 'f']),
  nudge_days: z.coerce.number().int().min(14, 'Use at least 14 days.').max(730, 'Use at most 730 days.'),
  notify_in_app: z.boolean(),
  notify_email: z.boolean(),
  keep_original_photos: z.boolean(),
})
type Values = z.infer<typeof schema>

interface ConsentRow { id: string; kind: string; version: string; granted_at: string; withdrawn_at: string | null }

function values(p: Profile): Values {
  return {
    display_name: p.display_name ?? '',
    units: p.units,
    nudge_days: p.nudge_days,
    notify_in_app: p.notify_in_app,
    notify_email: p.notify_email,
    keep_original_photos: p.keep_original_photos,
  }
}

export default function Settings() {
  const me = useMe()
  if (me.isLoading) return <Loading />
  if (me.error || !me.data) return <ErrorNote error={me.error} onRetry={() => me.refetch()} />
  return <SettingsForm p={me.data} />
}

function SettingsForm({ p }: { p: Profile }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: values(p) })
  const { register, handleSubmit, formState, watch, setValue, reset } = form
  const guard = useUnsavedGuard(formState.isDirty && !formState.isSubmitting)
  const [error, setError] = useState<unknown>(null)
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const qc = useQueryClient()
  const toast = useToast()
  const { config } = useAuth()
  const consents = useQuery({ queryKey: ['consents'], queryFn: () => api.get<ConsentRow[]>('/api/account/consents') })

  useEffect(() => reset(values(p)), [p, reset])

  const save = handleSubmit(async (v) => {
    setError(null)
    try {
      const updated = await api.patch<Profile>('/api/me', { ...v, display_name: v.display_name.trim() || null })
      qc.setQueryData(['me'], updated)
      reset(values(updated))
      toast('Settings saved')
    } catch (e) {
      setError(e)
    }
  })

  const exportData = async () => {
    setExporting(true)
    setError(null)
    try {
      const blob = await api.blob('/api/account/export')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `drape-export-${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      toast('Your export is downloading')
    } catch (e) {
      setError(e)
    } finally {
      setExporting(false)
    }
  }

  const used = Math.round(p.storage_bytes / 1024 / 1024)
  const quota = Math.round(p.storage_quota_bytes / 1024 / 1024)
  return (
    <>
      {guard}
      <PageHeader title="Account and settings." subtitle={p.is_demo ? 'This is a demo account. It is deleted after 24 hours.' : p.email ?? undefined} />
      <form onSubmit={save} noValidate className="space-y-10">
        <section aria-labelledby="profile-title" className="max-w-xl space-y-5">
          <h2 id="profile-title" className="section-title">Preferences</h2>
          <Field label="Display name" htmlFor="display_name" hint="Optional." error={formState.errors.display_name?.message}>
            <input id="display_name" className="input" {...register('display_name')} />
          </Field>
          <Segmented label="Temperature" name="units" options={[{ id: 'c', label: '°C' }, { id: 'f', label: '°F' }] as const} value={watch('units')} onChange={(v) => setValue('units', v, { shouldDirty: true })} />
          <Field label="Nudge me about pieces not worn for" htmlFor="nudge_days" hint="Days. Default 90." error={formState.errors.nudge_days?.message}>
            <input id="nudge_days" type="number" min={14} max={730} className="input w-32" {...register('nudge_days')} />
          </Field>
          <p className="text-[15px]">
            <Link to="/settings/colors" className="text-accent underline underline-offset-2">Color preferences</Link>
          </p>
        </section>

        <section aria-labelledby="notif-title" className="max-w-xl space-y-3">
          <h2 id="notif-title" className="section-title">Notifications</h2>
          <Check label="Show reminders in Drape" hint="For items on your waiting list." {...register('notify_in_app')} />
          <Check
            label="Also email me reminders"
            hint={p.email_available ? 'Sent to the address you sign in with.' : 'Email is not set up on this server, so reminders stay in Drape.'}
            disabled={!p.email_available || p.is_demo}
            {...register('notify_email')}
          />
        </section>

        <section aria-labelledby="privacy-title" className="max-w-xl space-y-3">
          <h2 id="privacy-title" className="section-title">Photos and privacy</h2>
          <Check
            label="Keep original outfit photos by default"
            hint="Off by default. When off, the full photo is deleted after you confirm the garments, and only garment crops are kept."
            {...register('keep_original_photos')}
          />
          <p className="text-[15px] text-ink2">Photo storage used: {used} MB of {quota} MB.</p>
        </section>

        {error ? <ErrorNote error={error} /> : null}
        <div className="flex gap-2">
          <button type="submit" className="btn-primary" disabled={!formState.isDirty || formState.isSubmitting}>Save settings</button>
          {formState.isDirty && <button type="button" className="btn-secondary" onClick={() => reset(values(p))}>Undo changes</button>}
        </div>
      </form>

      <section aria-labelledby="consent-title" className="mt-12 max-w-xl">
        <h2 id="consent-title" className="section-title mb-3">Consents</h2>
        {consents.data?.length ? (
          <ul className="divide-y divide-line rounded-card border border-line text-[15px]">
            {consents.data.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 px-4 py-3">
                <span>{CONSENT_LABEL[c.kind] ?? c.kind} <span className="text-ink2">({c.version})</span></span>
                <span className="text-ink2">{c.withdrawn_at ? `Withdrawn ${new Date(c.withdrawn_at).toLocaleDateString()}` : `Given ${new Date(c.granted_at).toLocaleDateString()}`}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-ink2">You have not given any optional consents.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {config?.study_mode && <Link to="/study" className="btn-secondary btn-sm">Study participation</Link>}
          {config?.feature_color_profile && <Link to="/settings/colors" className="btn-secondary btn-sm">Color-profile photos</Link>}
        </div>
      </section>

      <section aria-labelledby="data-title" className="mt-12 max-w-xl space-y-4 border-t border-line pt-8">
        <h2 id="data-title" className="section-title">Your data</h2>
        <div>
          <button type="button" className="btn-secondary" onClick={exportData} disabled={exporting}>{exporting ? 'Preparing your export' : 'Export my data'}</button>
          <p className="hint">A zip with every record as JSON and all your photos.</p>
        </div>
        <div>
          <button type="button" className="btn-danger" onClick={() => setDeleting(true)}>Delete my account</button>
          <p className="hint">Removes every record and photo. This cannot be undone.</p>
        </div>
      </section>
      {deleting && <DeleteDialog onClose={() => setDeleting(false)} />}
    </>
  )
}

const CONSENT_LABEL: Record<string, string> = { study: 'Study participation', color_profile: 'Color-profile photos', email: 'Email reminders', chat_photos: 'Photos in chat' }

const Check = forwardRef<HTMLInputElement, { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>>(
  function Check({ label, hint, ...rest }, ref) {
    return (
      <label className={`flex min-h-[44px] items-start gap-3 text-[15px] ${rest.disabled ? 'opacity-60' : ''}`}>
        <input ref={ref} type="checkbox" className="mt-1 h-5 w-5 accent-[rgb(var(--primary))]" {...rest} />
        <span>
          {label}
          {hint && <span className="block text-[13px] text-ink2">{hint}</span>}
        </span>
      </label>
    )
  },
)

function DeleteDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const { signOut } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const ok = text.trim().toLowerCase() === 'delete my account'
  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      await api.post('/api/account/delete', { confirm: text })
      await signOut()
      qc.clear()
      navigate('/signin', { replace: true })
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      title="Delete your account?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Keep my account</button>
          <button type="button" className="btn bg-danger text-white hover:bg-danger/90" disabled={!ok || busy} onClick={go}>Delete everything</button>
        </>
      }
    >
      <div className="space-y-4 text-[15px]">
        <p className="text-ink2">This deletes your closet, outfits, history, reviews, chat, study records and every photo. Export your data first if you want a copy.</p>
        <Field label="Type delete my account to confirm" htmlFor="confirm-delete">
          <input id="confirm-delete" className="input" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </Field>
        {error ? <ErrorNote error={error} /> : null}
      </div>
    </Dialog>
  )
}
