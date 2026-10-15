import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api, errorText } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { ErrorNote, Field, Loading } from '@/components/ui'

const schema = z.object({ email: z.string().trim().email('Enter an email address like name@example.com.') })
type Form = z.infer<typeof schema>

export default function SignIn() {
  const { ready, config, supabase, signedIn, signInWithToken } = useAuth()
  const navigate = useNavigate()
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [demoBusy, setDemoBusy] = useState(false)
  const { register, handleSubmit, formState } = useForm<Form>({ resolver: zodResolver(schema) })

  if (!ready) return <div className="mx-auto max-w-md px-4 pt-16"><Loading /></div>
  if (signedIn) return <Navigate to="/" replace />

  const onSubmit = async ({ email }: Form) => {
    setError(null)
    try {
      if (supabase) {
        const { error: err } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
        if (err) throw new Error(`The sign-in link could not be sent: ${err.message}`)
        setSent(email)
      } else if (config?.dev_login) {
        const r = await api.post<{ access_token: string }>('/api/auth/dev-login', { email })
        signInWithToken(r.access_token)
        navigate('/')
      }
    } catch (e) {
      setError(e)
    }
  }

  const startDemo = async () => {
    setDemoBusy(true)
    setError(null)
    try {
      const r = await api.post<{ access_token: string }>('/api/demo/start')
      signInWithToken(r.access_token)
      navigate('/')
    } catch (e) {
      setError(e)
    } finally {
      setDemoBusy(false)
    }
  }

  const canSignIn = Boolean(supabase || config?.dev_login)
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <p className="font-serif text-[44px] leading-none tracking-tight">Drape</p>
      <p className="mt-3 text-[17px] text-ink2">A styling prototype built around clothes people already own.</p>
      <div className="card mt-10 p-6">
        <h1 className="section-title">Sign in.</h1>
        {sent ? (
          <p className="mt-3 text-[15px] text-ink2" role="status">
            Check {sent} for a sign-in link. You can close this tab once you have opened it.
          </p>
        ) : canSignIn ? (
          <form className="mt-4 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Field label="Email" htmlFor="email" error={formState.errors.email?.message} hint={supabase ? 'We will email you a link. No password needed.' : 'Developer sign-in for local and test use.'}>
              <input id="email" type="email" autoComplete="email" className="input" {...register('email')} />
            </Field>
            <button type="submit" className="btn-primary w-full" disabled={formState.isSubmitting}>
              {supabase ? 'Email me a sign-in link' : 'Continue'}
            </button>
          </form>
        ) : (
          <p className="mt-3 text-[15px] text-ink2">
            Sign-in is not set up yet. Add SUPABASE_URL and SUPABASE_ANON_KEY to the server environment, or turn on DEMO_MODE.
          </p>
        )}
        {config?.demo_mode && (
          <div className="mt-6 border-t border-line pt-6">
            <button type="button" className="btn-secondary w-full" onClick={startDemo} disabled={demoBusy}>
              {demoBusy ? 'Setting up the demo' : 'Try the demo'}
            </button>
            <p className="hint">A sandbox with fictional, illustrated clothes. No photos needed. It is deleted after 24 hours.</p>
          </div>
        )}
        {error ? <div className="mt-4"><ErrorNote error={errorText(error)} /></div> : null}
      </div>
    </main>
  )
}
